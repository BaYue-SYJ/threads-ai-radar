"""
HTTP 服务：静态页面 + JSON API + SSE 实时推送。

刻意只用标准库（http.server / socketserver），不引 FastAPI / Flask。
这样 `python server.py` 就能直接跑起来，不需要 pip install，
对「长时间驻留的实时监控」来说少一层依赖就少一处故障点。
"""
from __future__ import annotations

import csv
import io
import json
import mimetypes
import queue
import threading
import time
import urllib.parse
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import config
from config import HOST, PORT, WEB_DIR
import store
from monitor import Monitor

monitor = Monitor()
INDEX = WEB_DIR / "index.html"

mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("text/css", ".css")

# 允许预览面板（不同源）直接访问 API
CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
}


class Handler(BaseHTTPRequestHandler):
    server_version = "ThreadsRadar/2.0"
    protocol_version = "HTTP/1.1"

    # ------------------------------------------------------------ 工具

    def log_message(self, fmt, *args):                       # noqa: A003
        pass          # 关掉逐请求日志，避免刷屏；关键事件走 monitor.log

    def _send(self, code: int, body: bytes, ctype: str = "application/json",
              extra: dict | None = None) -> None:
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        for k, v in CORS.items():
            self.send_header(k, v)
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def json_out(self, payload, code: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False, default=str).encode("utf-8")
        self._send(code, body)

    def csv_out(self, header: list[str], rows: list[list], filename: str) -> None:
        """导出 CSV。

        两个细节是给 Excel 准备的，少一个中文就乱码：
          · 开头写 UTF-8 BOM（\\ufeff），否则 Excel 按 GBK 解码 → 中文全乱；
          · 统一 \\r\\n 行尾，Windows 记事本/Excel 都不会挤成一行。
        """
        buf = io.StringIO()
        buf.write("\ufeff")
        wr = csv.writer(buf, lineterminator="\r\n")
        wr.writerow(header)
        wr.writerows(rows)
        body = buf.getvalue().encode("utf-8")
        # 文件名里的中文用 RFC 5987 编码，避免 header 里出现裸的非 ASCII 字节
        quoted = urllib.parse.quote(filename)
        self._send(200, body, "text/csv; charset=utf-8", {
            "Content-Disposition": f"attachment; filename=\"{quoted}\"; "
                                   f"filename*=UTF-8''{quoted}",
            "Cache-Control": "no-store",
        })

    def read_json(self) -> dict:
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            return {}
        if not length:
            return {}
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            return {}

    # ------------------------------------------------------------ 路由

    def do_OPTIONS(self):                                    # noqa: N802
        self._send(204, b"")

    def do_GET(self):                                        # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        qs = urllib.parse.parse_qs(parsed.query)

        if path == "/api/status":
            return self.json_out(monitor.status())

        if path == "/api/posts":
            limit = int((qs.get("limit") or ["2000"])[0])
            only = (qs.get("only_relevant") or ["1"])[0] not in ("0", "false")
            posts = store.query_posts(limit=limit, only_relevant=only)
            return self.json_out({"count": len(posts), "posts": posts})

        if path == "/api/authors":
            limit = int((qs.get("limit") or ["300"])[0])
            only = (qs.get("only_relevant") or ["1"])[0] not in ("0", "false")
            min_posts = int((qs.get("min_posts") or ["1"])[0])
            tier = (qs.get("tier") or [""])[0] or None
            rows = store.author_stats(only_relevant=only, limit=limit,
                                      min_posts=min_posts, tier=tier)
            sort = (qs.get("sort") or [""])[0]
            allowed = ("hits", "interactions", "posts", "avg_interactions",
                       "best_score", "best_likes", "new_count",
                       "active_days", "hit_rate")
            if sort not in allowed:
                # 不指定排序时按分层给一个合理的默认：核心/持续层看爆款与产出，
                # 单帖层看单条影响力。否则榜单会被一次性作者淹掉。
                sort = store.TIER_SORT.get(tier) or ("hits" if min_posts >= 2
                                                     else "interactions")
            if sort == "hit_rate":
                rows.sort(key=lambda r: (-(r["hit_rate"] or 0), -r["hits"]))
            else:
                rows.sort(key=lambda r: (-(r.get(sort) or 0), -r["posts"]))
            return self.json_out({"count": len(rows), "authors": rows,
                                  "hit_threshold": store.HIT_THRESHOLD,
                                  "sort": sort, "min_posts": min_posts,
                                  "tier": tier,
                                  "coverage": store.author_coverage(only)})

        if path.startswith("/api/author/"):
            username = urllib.parse.unquote(path[len("/api/author/"):])
            only = (qs.get("only_relevant") or ["0"])[0] not in ("0", "false")
            posts = store.posts_by_author(username, limit=200, only_relevant=only)
            return self.json_out({"username": username, "count": len(posts),
                                  "posts": posts})

        if path == "/api/keywords":
            return self.json_out({"keywords": store.list_keywords(only_enabled=False)})

        if path == "/api/watchlist":
            only = (qs.get("only_relevant") or ["1"])[0] not in ("0", "false")
            return self.json_out(store.watchlist_stats(only_relevant=only))

        if path.startswith("/api/post/"):
            code = urllib.parse.unquote(path[len("/api/post/"):])
            with store.connect() as con:
                row = con.execute("SELECT * FROM posts WHERE code=?", (code,)).fetchone()
            if not row:
                return self.json_out({"error": "not found"}, 404)
            post = dict(row)
            try:
                post["keywords"] = json.loads(post.get("keywords") or "[]")
            except json.JSONDecodeError:
                post["keywords"] = []
            post["growth"] = store.growth_for(code)
            return self.json_out(post)

        if path == "/api/stream":
            return self.sse()

        if path == "/api/runs":
            return self.json_out({"runs": store.recent_runs(30)})

        if path == "/api/export":
            return self.export_csv(qs)

        if path.startswith("/api/"):
            return self.json_out({"error": "unknown endpoint"}, 404)

        return self.serve_static(path)

    # ------------------------------------------------------------ 导出

    def export_csv(self, qs: dict) -> None:
        what = (qs.get("what") or ["posts"])[0]
        only = (qs.get("only_relevant") or ["1"])[0] not in ("0", "false")
        limit = min(int((qs.get("limit") or ["5000"])[0] or 5000), 20000)
        stamp = datetime.now().strftime("%Y%m%d_%H%M")

        if what == "authors":
            rows = store.author_stats(only_relevant=only, limit=limit)
            rows.sort(key=lambda r: (-r["hits"], -r["posts"]))
            header = ["排名", "账号", "分层", "相关帖数", "爆款数", "爆款率",
                      "点赞", "回复", "转发", "引用", "总互动", "单帖均互动",
                      "最高评分", "最高点赞", "本轮新增", "首次出现", "最近活跃",
                      "活跃天数", "主攻方向", "命中关键词"]
            out = []
            for i, a in enumerate(rows, 1):
                out.append([
                    i, "@" + a["username"], a.get("tier_label") or "", a["posts"],
                    a["hits"], f"{round((a.get('hit_rate') or 0) * 100)}%",
                    a["likes"], a["replies"], a["reposts"], a["quotes"],
                    a["interactions"], round(a.get("avg_interactions") or 0),
                    (f"{a['best_score']:.2f}" if a.get("best_score") is not None else ""),
                    a.get("best_likes") or 0, a.get("new_count") or 0,
                    fmt_ts(a.get("first_at")), fmt_ts(a.get("last_at")),
                    a.get("active_days") or 0,
                    " / ".join(f"{c['name']}({c['count']})"
                               for c in (a.get("top_categories") or [])),
                    " / ".join(f"{c['name']}({c['count']})"
                               for c in (a.get("top_keywords") or [])),
                ])
            return self.csv_out(header, out,
                                f"threads_同行账号_{stamp}.csv")

        posts = store.query_posts(limit=limit, only_relevant=only)
        posts.sort(key=lambda p: -(p.get("score") or 0))
        header = ["排名", "帖子ID", "账号", "分组", "爆款评分", "上涨速度",
                  "点赞", "回复", "转发", "引用", "总互动", "发布时间",
                  "首次入库", "命中关键词", "正文", "缩略图", "链接"]
        out = []
        for i, p in enumerate(posts, 1):
            total = ((p.get("like_count") or 0) + (p.get("reply_count") or 0)
                     + (p.get("repost_count") or 0) + (p.get("quote_count") or 0))
            out.append([
                i, p.get("code"), "@" + (p.get("username") or ""), p.get("category") or "",
                round(p.get("score") or 0, 2), round(p.get("velocity") or 0, 2),
                p.get("like_count") or 0, p.get("reply_count") or 0,
                p.get("repost_count") or 0, p.get("quote_count") or 0, total,
                fmt_ts(p.get("taken_at")), fmt_ts(p.get("first_seen")),
                " / ".join(p.get("keywords") or []),
                (p.get("text") or "").replace("\r", " ").replace("\n", " "),
                p.get("thumb") or "",
                p.get("url") or "",
            ])
        return self.csv_out(header, out, f"threads_爆款帖子_{stamp}.csv")

    def do_POST(self):                                       # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == "/api/collect":
            ok = monitor.trigger()
            return self.json_out(
                {"ok": ok, "message": "已触发采集" if ok else "正在采集中，请稍候"})

        if path == "/api/pause":
            monitor.pause()
            return self.json_out({"ok": True, "paused": True})

        if path == "/api/resume":
            monitor.resume()
            return self.json_out({"ok": True, "paused": False})

        if path == "/api/interval":
            data = self.read_json()
            try:
                minutes = float(data.get("minutes"))
            except (TypeError, ValueError):
                return self.json_out({"ok": False, "error": "minutes 无效"}, 400)
            if not 0.5 <= minutes <= 1440:
                return self.json_out({"ok": False, "error": "间隔需在 0.5~1440 分钟"}, 400)
            monitor.set_interval(minutes)
            # 写回 .env，重启后不会悄悄变回默认值
            config.save_env("RADAR_INTERVAL_MINUTES", f"{minutes:g}")
            return self.json_out({"ok": True, "minutes": minutes, "persisted": True})

        if path == "/api/keywords":
            data = self.read_json()
            kw = (data.get("keyword") or "").strip()
            if not kw:
                return self.json_out({"ok": False, "error": "关键词为空"}, 400)
            store.add_keyword(kw, (data.get("group") or "").strip())
            _persist_keywords()
            monitor.log(f"新增关键词：{kw}")
            return self.json_out({"ok": True, "keywords": store.list_keywords(False)})

        if path == "/api/seen":
            n = store.mark_all_seen()
            monitor.broadcast({"type": "seen", "count": n})
            return self.json_out({"ok": True, "cleared": n})

        if path == "/api/probe":
            return self.json_out(monitor.probe())

        if path == "/api/watchlist":
            data = self.read_json()
            user = store.normalize_username(data.get("username") or "")
            if not user:
                return self.json_out({"ok": False, "error": "账号为空"}, 400)
            created = store.watchlist_add(user, data.get("note") or "")
            _persist_watchlist()
            monitor.log(f"{'已关注' if created else '更新备注'}：@{user}")
            out = store.watchlist_stats()
            out.update({"ok": True, "created": created, "username": user})
            return self.json_out(out)

        return self.json_out({"error": "unknown endpoint"}, 404)

    def do_DELETE(self):                                     # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        qs = urllib.parse.parse_qs(parsed.query)

        if parsed.path == "/api/watchlist":
            user = store.normalize_username((qs.get("username") or [""])[0])
            if not user:
                return self.json_out({"ok": False, "error": "缺少 username"}, 400)
            removed = store.watchlist_remove(user)
            _persist_watchlist()
            monitor.log(f"已取消关注：@{user}")
            out = store.watchlist_stats()
            out.update({"ok": True, "removed": removed, "username": user})
            return self.json_out(out)

        if parsed.path == "/api/keywords":
            qs = urllib.parse.parse_qs(parsed.query)
            kw = (qs.get("keyword") or [""])[0]
            if not kw:
                return self.json_out({"ok": False, "error": "缺少 keyword"}, 400)
            store.remove_keyword(kw)
            _persist_keywords()
            monitor.log(f"删除关键词：{kw}")
            return self.json_out({"ok": True, "keywords": store.list_keywords(False)})
        return self.json_out({"error": "unknown endpoint"}, 404)

    # ------------------------------------------------------------ SSE

    def sse(self) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache, no-transform")
        self.send_header("Connection", "keep-alive")
        self.send_header("X-Accel-Buffering", "no")
        for k, v in CORS.items():
            self.send_header(k, v)
        self.end_headers()

        q = monitor.subscribe()
        last_status = 0.0
        try:
            self.wfile.write(b"retry: 3000\n\n")
            self.wfile.flush()
            while True:
                try:
                    event = q.get(timeout=1.0)
                    self._sse_send("message", event)
                except queue.Empty:
                    pass
                now = time.time()
                if now - last_status >= 2.0:
                    self._sse_send("status", monitor.status())
                    last_status = now
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass
        finally:
            monitor.unsubscribe(q)

    def _sse_send(self, name: str, payload: dict) -> None:
        data = json.dumps(payload, ensure_ascii=False, default=str)
        chunk = f"event: {name}\ndata: {data}\n\n".encode("utf-8")
        self.wfile.write(chunk)
        self.wfile.flush()

    # ------------------------------------------------------------ 静态文件

    def serve_static(self, path: str) -> None:
        if path in ("/", ""):
            target = INDEX
        else:
            rel = path.lstrip("/")
            target = (WEB_DIR / rel).resolve()
            if not str(target).startswith(str(WEB_DIR.resolve())):
                return self._send(403, b"forbidden", "text/plain")
            if target.is_dir():
                target = target / "index.html"

        if not target.exists():
            if "." not in Path(path).name:               # SPA 兜底
                target = INDEX
            else:
                return self._send(404, b"not found", "text/plain")

        ctype = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype in ("application/javascript",
                                                  "application/json"):
            ctype += "; charset=utf-8"
        data = target.read_bytes()
        self._send(200, data, ctype, {"Cache-Control": "no-store"})


# ---------------------------------------------------------------- 导出工具

def fmt_ts(v) -> str:
    """时间列统一成 `2026-09-15 09:44`，Excel 里能直接排序。

    库里两种时间混着存：帖子的 taken_at 是 epoch 秒，first_seen/last_seen
    是 SQLite 写进去的字符串，所以这里两种都得认。
    """
    if v in (None, "", 0):
        return ""
    if isinstance(v, (int, float)):
        try:
            return datetime.fromtimestamp(v).strftime("%Y-%m-%d %H:%M")
        except (OSError, OverflowError, ValueError):
            return str(v)
    s = str(v)
    return s[:16] if len(s) >= 16 else s


# ---------------------------------------------------------------- 关键词回写

def _persist_keywords() -> None:
    """把库里的关键词写回 keywords.txt，保证文件与界面一致。"""
    from config import KEYWORDS_PATH
    rows = store.list_keywords(only_enabled=False)
    store.write_keywords_file(KEYWORDS_PATH, [(r["grp"] or "", r["keyword"]) for r in rows])


def _persist_watchlist() -> None:
    """把库里的关注名单写回 watchlist.txt。

    和关键词一样走「库为准、文件为镜像」：界面增删都落库，
    再整体回写文件，避免两边各改一半后对不上。
    """
    from config import WATCHLIST_PATH
    rows = store.watchlist_all()
    store.write_watchlist_file(
        WATCHLIST_PATH, [(r["username"], r["note"] or "") for r in rows])


# ---------------------------------------------------------------- 启动

def main() -> None:
    store.init_db()
    stale = store.recover_stale_runs()
    pairs, _ = pipeline_load()
    store.sync_keywords(pairs)
    watched = store.sync_watchlist(store.load_watchlist_file(config.WATCHLIST_PATH))

    monitor.start()
    httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    httpd.daemon_threads = True

    url = f"http://{HOST}:{PORT}"
    print("=" * 62)
    print("  Threads 爆款雷达 · 实时关键词监控")
    print("=" * 62)
    print(f"  界面      {url}")
    print(f"  关键词    {len(store.list_keywords())} 个")
    print(f"  关注名单  {len(store.watchlist_all())} 个账号")
    print(f"  采集间隔  {monitor.interval / 60:g} 分钟")
    print(f"  数据库    {store.DB_PATH}")
    if stale:
        print(f"  已收尾    {stale} 条中断的采集记录")
    if watched:
        print(f"  关注同步  {watched} 个账号来自 watchlist.txt")
    print("  按 Ctrl+C 停止")
    print("=" * 62)

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n正在停止…")
    finally:
        monitor.stop()
        httpd.shutdown()
        print("已停止。")


def pipeline_load():
    import pipeline
    return pipeline.load_config()


if __name__ == "__main__":
    main()
