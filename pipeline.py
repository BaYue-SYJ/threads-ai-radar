"""
一轮完整采集的编排：抓取 → 相关性判定 → 评分 → 入库。

monitor.py 的调度器和 server.py 的「立即采集」按钮都调用这里，
保证两条入口的行为完全一致。
"""
from __future__ import annotations

import traceback

import time

from config import BLOCKLIST_PATH, CYCLE_MAX_SECONDS, KEYWORDS_PATH
import collector
import relevance
import scorer
import store
from relevance import canonical_of


def load_config() -> tuple[list[tuple[str, str]], list[str]]:
    pairs = store.load_keywords_file(KEYWORDS_PATH)
    blocklist = store.load_blocklist(BLOCKLIST_PATH)
    return pairs, blocklist


def _search_plan(pairs: list[tuple[str, str]]) -> tuple[list[str], dict[str, str]]:
    """关键词里可能写成「ChatGPT | GPT」，只能用第一个写法去搜索。

    返回 (搜索词列表, {搜索词: 原始写法})，采集完再把原始写法换回去，
    这样相关性判定能用上同义词。
    """
    terms: list[str] = []
    raw_by_term: dict[str, str] = {}
    for _, raw in pairs:
        term = canonical_of(raw)
        if term not in raw_by_term:
            raw_by_term[term] = raw
            terms.append(term)
    return terms, raw_by_term


def _interactions(post: dict) -> int:
    """一条帖子的互动总量（四项之和）。"""
    return ((post.get("like_count") or 0) + (post.get("reply_count") or 0)
            + (post.get("repost_count") or 0) + (post.get("quote_count") or 0))


def _drop_noise(posts: list[dict]) -> tuple[list[dict], int]:
    """剔除「零互动」的帖子，不让它们入库。返回 (保留的, 丢弃数)。

    为什么：Threads 搜索为了凑齐一页，会返回大量**刚发布、还没有任何反应**
    的帖子。实测某轮 860 条新入库帖里，判为相关的只有 13 条（1.5%），
    其余几乎全是零赞、与关键词无关的噪音 —— 它们既没有选题价值，
    又把库和榜单一起灌满。

    关键：这不是「永久丢弃」，而是**延迟入库**。
    帖子下次被采到时如果已经有互动，就会被正常收进库 ——
    代价只是失去「零互动那一段」的涨幅轨迹，而不是永远看不到这条帖子。
    因此这条规则比「互动低于某个阈值就不收」温和得多：后者会把
    已经起步、正在上涨的帖子也一并挡掉。
    """
    keep = [p for p in posts if _interactions(p) > 0]
    return keep, len(posts) - len(keep)


def run_cycle(on_progress=None, on_log=None) -> dict:
    """执行一轮采集。返回结果摘要。"""
    pairs, blocklist = load_config()
    if not pairs:
        if on_log:
            on_log("关键词表为空，跳过本轮")
        return {"ok": False, "message": "关键词表为空"}

    search_terms, raw_by_term = _search_plan(pairs)
    run_id = store.start_run(len(search_terms))
    if on_log:
        on_log(f"开始采集，共 {len(search_terms)} 个关键词")

    summary = {"ok": True, "run_id": run_id, "keywords": len(search_terms),
               "found": 0, "new": 0, "updated": 0, "relevant": 0,
               "offtopic": 0, "blocked": 0, "unhealthy": [],
               "reason": None, "hint": "", "timed_out": False}

    # 整轮看门狗：休眠 / 单个请求卡死时，靠它把本轮掐掉，别让下一轮排队等不到头。
    deadline = time.time() + CYCLE_MAX_SECONDS if CYCLE_MAX_SECONDS > 0 else None

    def out_of_time() -> bool:
        return deadline is not None and time.time() > deadline

    try:
        def progress(i, total, kw, n, health):
            store.update_run(run_id, keywords_done=i, message=f"正在采集：{kw}")
            if on_progress:
                on_progress(i, total, kw, n, health)
            if on_log:
                # 说清是「抓到了但页面没数据」还是「链路不通」——两者处理方式不同
                if health.get("healthy"):
                    mark = ""
                elif health.get("reason"):
                    mark = f"  ✕ {health['reason']}"
                else:
                    mark = "  ⚠ 页面无有效数据"
                on_log(f"[{i}/{total}] {kw} → {n} 条{mark}")

        posts, healths = collector.search_many(search_terms, on_progress=progress,
                                               stop_flag=out_of_time)
        if out_of_time():
            summary["timed_out"] = True
            done = len(healths)
            on_log(f"⚠ 本轮超过 {CYCLE_MAX_SECONDS // 60} 分钟上限，"
                   f"在 {done}/{len(search_terms)} 处中止（可能是网络卡死或机器休眠）")

        # 把搜索词换回原始写法（含同义词），供相关性判定使用
        for p in posts:
            p["keywords"] = [raw_by_term.get(k, k) for k in (p.get("keywords") or [])]

        summary["found"] = len(posts)
        summary["unhealthy"] = [h for h in healths if not h.get("healthy")]
        # 归类本轮的主要失败原因，供熔断与界面告警使用
        reasons: dict[str, int] = {}
        for h in summary["unhealthy"]:
            r = h.get("reason")
            if r:
                reasons[r] = reasons.get(r, 0) + 1
        if reasons:
            top = max(reasons, key=reasons.get)
            summary["reason"] = top
            summary["hint"] = collector.CHANNEL_HINTS.get(top, "")
        # 整轮颗粒无收 = 通道级故障，而不是个别关键词没数据
        summary["all_failed"] = bool(healths) and len(posts) == 0

        # 最后一道闸：零互动帖不入库（见 _drop_noise 的说明）。
        # 放在相关性判定**之前** —— 让 counts 和后面所有统计只反映
        # 真正入库的那批，免得「相关 189 条」里混着一堆压根没存进去的帖子。
        posts, dropped = _drop_noise(posts)
        summary["dropped"] = dropped
        summary["kept"] = len(posts)

        counts = relevance.apply(posts, blocklist)
        summary.update(counts)

        scorer.apply(posts, pairs)

        new, updated = store.upsert_posts(posts)
        summary["new"] = new
        summary["updated"] = updated

        for _, raw in pairs:
            matched = [p for p in posts if raw in (p.get("keywords") or [])]
            store.set_keyword_stats(raw, len(matched), len(matched))

        # 完成度按实际跑完的关键词数记，超时中止时不能谎报成「全部跑完」
        done = len(healths)
        head = "完成" if done >= len(search_terms) else f"完成（{done}/{len(search_terms)}）"
        msg = (f"{head}：抓到 {summary['found']} 条（丢弃零互动 {dropped} 条），"
               f"新增 {new} 条，"
               f"相关 {counts['relevant']} / 无关 {counts['offtopic']} / 屏蔽 {counts['blocked']}")
        if summary["timed_out"]:
            msg += " · 已达时间上限提前中止"
        # found 记**过滤前**的原始抓取量（= summary["found"]），
        # 而不是 len(posts) —— 后者已经被 _drop_noise 削过，
        # 会让 runs 表的数字和界面摘要对不上。
        store.update_run(run_id, keywords_done=done, found=summary["found"],
                         new_posts=new, relevant=counts["relevant"], message=msg)
        store.finish_run(run_id, "done", msg)
        store.prune_snapshots()

        if on_log:
            on_log(msg)
        return summary

    except Exception as exc:                                # noqa: BLE001
        detail = traceback.format_exc(limit=3)
        msg = f"采集失败：{type(exc).__name__}: {exc}"
        store.finish_run(run_id, "error", msg)
        if on_log:
            on_log(msg)
            on_log(detail.splitlines()[-1] if detail else "")
        summary["ok"] = False
        summary["message"] = msg
        return summary
