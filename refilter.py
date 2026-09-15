"""
重算工具：改完 keywords.txt / blocklist.txt 后，直接对库里已有帖子
重新做相关性判定与评分，不需要重新抓取。

典型用法：
    改完屏蔽词，跑一次  python refilter.py
    看哪些帖子从「无关」翻成「相关」了
"""
from __future__ import annotations

import collections

from config import BLOCKLIST_PATH, KEYWORDS_PATH
import relevance
import scorer
import store


def main() -> None:
    pairs = store.load_keywords_file(KEYWORDS_PATH)
    blocklist = store.load_blocklist(BLOCKLIST_PATH)
    posts = store.all_raw_posts()

    if not posts:
        print("库里还没有帖子，先跑一轮采集：python server.py（或 start.bat）")
        return

    before = collections.Counter(p["relevance"] for p in posts)

    relevance.apply(posts, blocklist)
    scorer.apply(posts, pairs)

    after = collections.Counter(p["relevance"] for p in posts)
    store.update_analysis(posts)

    print(f"已重算 {len(posts)} 条帖子")
    print(f"关键词 {len(pairs)} 个 / 屏蔽词 {len(blocklist)} 条")
    print()
    print(f"{'判定':<8}{'重算前':>8}{'重算后':>8}{'变化':>8}")
    print("-" * 34)
    for key, label in (("relevant", "相关"), ("offtopic", "无关"), ("blocked", "屏蔽")):
        b, a = before[key], after[key]
        delta = a - b
        sign = f"+{delta}" if delta > 0 else str(delta)
        print(f"{label:<8}{b:>8}{a:>8}{sign:>8}")

    print()
    rel = [p for p in posts if p["relevance"] == "relevant"]
    rel.sort(key=lambda x: x["score"], reverse=True)
    print(f"=== 重算后的爆款榜 Top 12 / 共 {len(rel)} 条 ===")
    print(f"{'#':<3}{'评分':<8}{'速度':<9}{'作者':<20}{'赞':>6}{'回':>5}{'转':>5}{'引':>5}  分组")
    print("-" * 92)
    for i, p in enumerate(rel[:12], 1):
        print(f"{i:<3}{p['score']:<8.2f}{p['velocity']:<9.2f}@{p['username'][:18]:<19}"
              f"{p['like_count']:>6}{p['reply_count']:>5}{p['repost_count']:>5}"
              f"{p['quote_count']:>5}  {p['category']}")


if __name__ == "__main__":
    main()
