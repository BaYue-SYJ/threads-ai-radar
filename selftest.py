"""
自检脚本：不写库，跑通「抓取 → 相关性判定 → 评分」并打印效果对比。

用途：
  · 换关键词后先看看召回质量，再决定要不要正式采集
  · 怀疑抓取失效时用它确认 SSR 是否还在正常返回

用法：
  python selftest.py                 # 用 keywords.txt 的前 2 个关键词
  python selftest.py "Nano Banana" "AI prompt" "Veo"
"""
from __future__ import annotations

import sys
import time

from config import BLOCKLIST_PATH, KEYWORDS_PATH
import collector
import relevance
import scorer
import store
from relevance import canonical_of


def main() -> None:
    pairs = store.load_keywords_file(KEYWORDS_PATH)
    if len(sys.argv) > 1:
        raws = sys.argv[1:]
    else:
        raws = [kw for _, kw in pairs][:2]

    blocklist = store.load_blocklist(BLOCKLIST_PATH)

    # 关键词可能写成「ChatGPT | GPT」，只能用第一个写法去搜索
    terms, raw_by_term = [], {}
    for raw in raws:
        term = canonical_of(raw)
        if term not in raw_by_term:
            raw_by_term[term] = raw
            terms.append(term)

    print("关键词 :", "  ".join(terms))
    print("屏蔽词 :", len(blocklist), "条")
    print("-" * 78)

    t0 = time.time()
    posts, healths = collector.search_many(terms)
    elapsed = time.time() - t0

    for p in posts:
        p["keywords"] = [raw_by_term.get(k, k) for k in (p.get("keywords") or [])]

    print(f"抓取完成：{len(posts)} 条去重帖子，耗时 {elapsed:.1f}s")
    for h in healths:
        status = "OK " if h["healthy"] else "异常"
        print(f"  [{status}] {h['keyword']:<16} {h['bytes']:>9,} 字节  {h['posts']:>3} 条"
              + (f"  {h.get('error', '')[:50]}" if h.get("error") else ""))
    print()

    counts = relevance.apply(posts, blocklist)
    scorer.apply(posts, pairs)

    total = len(posts)
    print("=== 相关性判定结果 ===")
    for key, label in (("relevant", "相关"), ("offtopic", "无关"), ("blocked", "屏蔽")):
        n = counts[key]
        pct = n / total * 100 if total else 0
        bar = "#" * int(pct / 3)
        print(f"  {label:<4} {n:>4} 条  {pct:>5.1f}%  {bar}")

    print()
    print("=== 被剔除的样例（噪音） ===")
    off = [p for p in posts if p["relevance"] != "relevant"]
    off.sort(key=lambda p: p["like_count"], reverse=True)
    for p in off[:6]:
        reason = p["relevance_note"][:26]
        print(f"  [{p['relevance']:<8}] 赞{p['like_count']:>6}  {reason:<28} "
              f"{p['text'][:42]!r}")

    print()
    rel = [p for p in posts if p["relevance"] == "relevant"]
    rel.sort(key=lambda p: p["score"], reverse=True)
    print(f"=== 保留后的爆款榜（Top 10 / 共 {len(rel)} 条）===")
    print(f"{'#':<3} {'评分':<8} {'速度':<8} {'作者':<19} {'赞':>6} {'回':>5} {'转':>5} {'引':>5}  分类")
    print("-" * 96)
    for i, p in enumerate(rel[:10], 1):
        print(f"{i:<3} {p['score']:<8.2f} {p['velocity']:<8.2f} @{p['username'][:18]:<18} "
              f"{p['like_count']:>6} {p['reply_count']:>5} {p['repost_count']:>5} "
              f"{p['quote_count']:>5}  {p['category']}")

    print()
    cats: dict[str, int] = {}
    for p in rel:
        cats[p["category"]] = cats.get(p["category"], 0) + 1
    print("=== 按你的分组归类 ===")
    for name, n in sorted(cats.items(), key=lambda x: -x[1]):
        print(f"  {name:<12} {n:>4} 条")


if __name__ == "__main__":
    main()
