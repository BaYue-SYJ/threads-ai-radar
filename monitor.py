"""
实时监控调度器。

在服务进程内跑一个后台线程，按固定间隔循环采集全部关键词。
对外暴露状态供前端实时展示：

    running_cycle   当前是否正在采集
    progress        本轮进度（第几个关键词 / 总数 / 当前关键词）
    next_run_at     下次采集的时间戳，前端据此显示倒计时
    last_result     上一轮结果摘要
    logs            最近日志（环形缓冲）

事件通过订阅队列推给 SSE 连接，前端无需轮询。
"""
from __future__ import annotations

import queue
import threading
import time
from collections import deque
from datetime import datetime, timedelta

from config import COLLECT_ON_START, FAILURE_LIMIT, INTERVAL_MINUTES
import pipeline
import store


class Monitor:
    def __init__(self, interval_minutes: float = INTERVAL_MINUTES):
        self.interval = max(0.5, interval_minutes) * 60      # 秒
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._wake = threading.Event()
        self._lock = threading.RLock()

        self.paused = False
        self.running_cycle = False
        self.started_at: float | None = None
        self.next_run_at: float | None = None
        self.progress = {"index": 0, "total": 0, "keyword": "", "posts": 0}
        self.last_result: dict | None = None
        self.cycle_count = 0
        # 连续整轮颗粒无收的次数。达到上限就自动暂停，避免持续敲打被风控的出口。
        self.consecutive_failures = 0
        self.channel: dict | None = None

        self.logs: deque[dict] = deque(maxlen=300)
        self._subscribers: list[queue.Queue] = []

    # ---------------------------------------------------------- 日志与广播

    def log(self, message: str, level: str = "info") -> None:
        entry = {
            "ts": time.time(),
            "time": datetime.now().strftime("%H:%M:%S"),
            "level": level,
            "message": message,
        }
        with self._lock:
            self.logs.append(entry)
        self.broadcast({"type": "log", "entry": entry})

    def broadcast(self, event: dict) -> None:
        with self._lock:
            subs = list(self._subscribers)
        for q in subs:
            try:
                q.put_nowait(event)
            except queue.Full:
                pass

    def subscribe(self) -> queue.Queue:
        q: queue.Queue = queue.Queue(maxsize=500)
        with self._lock:
            self._subscribers.append(q)
        return q

    def unsubscribe(self, q: queue.Queue) -> None:
        with self._lock:
            if q in self._subscribers:
                self._subscribers.remove(q)

    # ---------------------------------------------------------- 状态快照

    def status(self) -> dict:
        with self._lock:
            s = store.stats()
            return {
                "paused": self.paused,
                "running_cycle": self.running_cycle,
                "started_at": self.started_at,
                "next_run_at": self.next_run_at,
                "seconds_to_next": (max(0, int(self.next_run_at - time.time()))
                                    if self.next_run_at else None),
                "interval_minutes": round(self.interval / 60, 2),
                "progress": dict(self.progress),
                "last_result": self.last_result,
                "cycle_count": self.cycle_count,
                "channel": self.channel,
                "consecutive_failures": self.consecutive_failures,
                "paused_auto": getattr(self, "paused_auto", False),
                "stats": s,
                "keywords": store.list_keywords(),
                "current_run": store.current_run(),
                "recent_runs": store.recent_runs(8),
                "logs": list(self.logs)[-40:],
            }

    # ---------------------------------------------------------- 采集执行

    def _do_cycle(self) -> None:
        with self._lock:
            self.running_cycle = True
            self.progress = {"index": 0, "total": 0, "keyword": "", "posts": 0}
        self.broadcast({"type": "cycle_start"})

        def on_progress(i, total, kw, n, health):
            with self._lock:
                self.progress = {"index": i, "total": total, "keyword": kw, "posts": n}
            self.broadcast({"type": "progress", "progress": dict(self.progress)})

        result = pipeline.run_cycle(on_progress=on_progress, on_log=self.log)

        with self._lock:
            self.running_cycle = False
            self.last_result = result
            self.cycle_count += 1

        self.broadcast({"type": "cycle_done", "result": result})

        unhealthy = result.get("unhealthy") or []
        if unhealthy:
            if result.get("all_failed"):
                # 整轮一条都没抓到 —— 不是策略问题，是通道不通，必须说清是哪一种
                self._handle_channel_failure(result)
            else:
                names = ", ".join(h["keyword"] for h in unhealthy[:3])
                self.log(f"⚠ {len(unhealthy)} 个关键词页面异常（{names}），"
                         f"抓取策略可能已失效，请留意", "warn")
        else:
            with self._lock:
                self.consecutive_failures = 0
                self.channel = {"ok": True, "reason": "ok", "hint": "通道正常"}

    def _handle_channel_failure(self, result: dict) -> None:
        """整轮零产出：累计失败次数，到达阈值自动熔断并给出可执行建议。"""
        reason = result.get("reason") or "unknown"
        hint = result.get("hint") or ""
        with self._lock:
            self.consecutive_failures += 1
            n = self.consecutive_failures
            self.channel = {"ok": False, "reason": reason, "hint": hint,
                            "failed_cycles": n}

        self.log(f"✕ 本轮 0 条：{reason}（连续第 {n} 次）", "err")
        if hint:
            self.log(f"   {hint}", "warn")

        if n >= FAILURE_LIMIT and not self.paused:
            self.log(f"连续 {n} 轮抓不到任何数据，已自动暂停监控。"
                     f"排查后点「恢复」继续（或缩小 serp_type 变体数降低压力）。", "err")
            self.pause(auto=True)

    def trigger(self) -> bool:
        """立即触发一轮采集。已在采集中的话返回 False。"""
        with self._lock:
            if self.running_cycle:
                return False
        self._wake.set()
        return True

    # ---------------------------------------------------------- 主循环

    def _loop(self) -> None:
        self.log(f"监控已启动，采集间隔 {self.interval / 60:.0f} 分钟")
        if COLLECT_ON_START:
            self._do_cycle()
        else:
            with self._lock:
                self.next_run_at = time.time() + self.interval

        while not self._stop.is_set():
            self._wake.clear()

            with self._lock:
                if self.paused:
                    self.next_run_at = None
                    wait = 1.0
                else:
                    if self.next_run_at is None:
                        self.next_run_at = time.time() + self.interval
                    wait = max(0.5, self.next_run_at - time.time())

            # 每 0.5 秒醒一次，便于响应触发与暂停
            fired = self._wake.wait(timeout=min(wait, 0.5))
            if self._stop.is_set():
                break

            pending = False
            with self._lock:
                if self.next_run_at is not None and time.time() >= self.next_run_at:
                    pending = True
                    self.next_run_at = None

            if fired or pending:
                with self._lock:
                    if self.paused and not fired:
                        continue
                if not self._stop.is_set():
                    self._do_cycle()
                with self._lock:
                    if not self.paused:
                        self.next_run_at = time.time() + self.interval
                self.broadcast({"type": "status"})

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._loop, name="radar-monitor", daemon=True)
        self._thread.start()
        with self._lock:
            self.started_at = time.time()

    def stop(self) -> None:
        self._stop.set()
        self._wake.set()
        if self._thread:
            self._thread.join(timeout=10)

    def pause(self, auto: bool = False) -> None:
        with self._lock:
            self.paused = True
            self.paused_auto = auto
            self.next_run_at = None
        if not auto:
            self.log("监控已暂停")
        self.broadcast({"type": "status"})

    def resume(self) -> None:
        with self._lock:
            self.paused = False
            self.paused_auto = False
            self.consecutive_failures = 0
            self.next_run_at = time.time() + 1
        self.log("监控已恢复")
        self.broadcast({"type": "status"})

    def probe(self) -> dict:
        """手动跑一次通道自检，结果存起来并广播，界面可直接展示。"""
        import collector
        self.log("正在自检抓取通道…")
        result = collector.probe_channel()
        with self._lock:
            self.channel = result
            if result.get("ok"):
                self.consecutive_failures = 0
        if result.get("ok"):
            self.log(f"通道正常（{result.get('bytes', 0) // 1024} KB，"
                     f"{result.get('posts', 0)} 条）")
        else:
            self.log(f"通道异常：{result.get('reason')} — {result.get('hint')}", "err")
        self.broadcast({"type": "status"})
        return result

    def set_interval(self, minutes: float) -> None:
        with self._lock:
            self.interval = max(0.5, minutes) * 60
            if not self.paused:
                self.next_run_at = time.time() + self.interval
        self.log(f"采集间隔已改为 {minutes:g} 分钟")
        self.broadcast({"type": "status"})
