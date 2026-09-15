"""
评分与归类。

评分沿用原 scorer.py 的公式（点赞 1.0 / 回复 2.5 / 转发 3.0 / 引用 3.0
+ 时间衰减 + AI 相关度加权），现在四个指标都有真实数据了。

另外增加「热度速度」velocity：单位时间的互动增量。
爆款雷达真正该看的是「正在涨」的帖子，而不是「历史总量高」的老帖，
所以界面上把它单列一列。
"""
from __future__ import annotations

import math
from datetime import datetime, timezone

FIT_TERMS = ("ai", "gpt", "chatgpt", "prompt", "workflow", "tool", "agent",
             "claude", "gemini", "midjourney", "image", "video")


def recency_factor(taken_at: int) -> float:
    if not taken_at:
        return 1.0
    try:
        dt = datetime.fromtimestamp(taken_at, tz=timezone.utc)
    except (OverflowError, OSError, ValueError):
        return 1.0
    hours = max(0.0, (datetime.now(timezone.utc) - dt).total_seconds() / 3600)
    return 1 / math.sqrt(1 + hours / 24)


def interactions(post: dict) -> int:
    return (int(post.get("like_count") or 0) + int(post.get("reply_count") or 0)
            + int(post.get("repost_count") or 0) + int(post.get("quote_count") or 0))


def viral_score(post: dict) -> float:
    likes = int(post.get("like_count") or 0)
    replies = int(post.get("reply_count") or 0)
    reposts = int(post.get("repost_count") or 0)
    quotes = int(post.get("quote_count") or 0)

    raw = (1.0 * math.log1p(likes)
           + 2.5 * math.log1p(replies)
           + 3.0 * math.log1p(reposts)
           + 3.0 * math.log1p(quotes))

    text = (post.get("text") or "").lower()
    fit = 1.25 if any(t in text for t in FIT_TERMS) else 1.0
    return round(raw * fit * recency_factor(int(post.get("taken_at") or 0)), 4)


def velocity(post: dict) -> float:
    """每小时互动量。用于识别「正在涨」的帖子。"""
    total = interactions(post)
    if not total:
        return 0.0
    taken = int(post.get("taken_at") or 0)
    if not taken:
        return float(total)
    hours = max(1.0, (datetime.now(timezone.utc)
                      - datetime.fromtimestamp(taken, tz=timezone.utc)).total_seconds() / 3600)
    return round(total / hours, 4)


def compact(n: int) -> str:
    """互动量的紧凑写法，前端也用同一套口径。"""
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}M"
    if n >= 1_000:
        return f"{n / 1_000:.1f}K"
    return str(n)


def group_map(pairs: list[tuple[str, str]]) -> dict[str, str]:
    """{关键词: 分组}，用于把帖子归类到用户自己定义的分组。"""
    return {kw: grp for grp, kw in pairs if grp}


def category_for(post: dict, groups: dict[str, str]) -> str:
    """用「命中的第一个关键词所属分组」作为分类。

    关键词规则分类的正确率很难做好：实测按规则硬分，530 条里 432 条会落进
    「其他」，基本不可用。所以直接复用用户自己在 keywords.txt 里写的分组，
    既准确又不用维护第二套规则。
    """
    for kw in post.get("keywords") or []:
        if kw in groups:
            return groups[kw]
    return "未分组"


def apply(posts: list[dict], pairs: list[tuple[str, str]]) -> None:
    """就地写入 score / velocity / category。"""
    groups = group_map(pairs)
    for p in posts:
        p["score"] = viral_score(p)
        p["velocity"] = velocity(p)
        p["category"] = category_for(p, groups)
