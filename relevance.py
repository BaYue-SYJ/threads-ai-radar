"""
相关性判定：纯关键词规则，不调用任何模型。

为什么需要它：
    Threads 的搜索结果并不是「正文含该词」的结果，而是语义相关结果。
    实测搜「AI prompt」会返回印尼语/马来语蹭流量帖，甚至出现政治人物
    谈 AI 监管的帖子（11,168 赞冲到榜首）。这些帖子虽然与 AI 沾边，
    但对选题毫无价值，必须剔除。

判定规则（三级）：
    blocked   命中屏蔽词表 → 直接排除
    relevant  正文命中关键词短语，或多词关键词的全部有效词都命中
    offtopic  其余（被搜索召回但与关键词无关）

补充：因为 "ai" 这类短词用子串匹配会误伤 "said" / "again" / "available"，
对纯 ASCII 词采用近似词边界匹配（前后不能接字母数字）。
"""
from __future__ import annotations

import re
from functools import lru_cache

BOUNDARY = "(?<![a-z0-9]){}(?![a-z0-9])"


@lru_cache(maxsize=2048)
def _token_pattern(token: str) -> re.Pattern[str]:
    """给一个关键词片段生成匹配模式。

    纯 ASCII 字母数字片段用近似词边界；含 CJK 或其他字符的片段直接用子串匹配
    （\\b 对中文无效）。
    """
    if re.fullmatch(r"[a-z0-9][a-z0-9\-_.]*", token):
        return re.compile(BOUNDARY.format(re.escape(token)), re.I)
    return re.compile(re.escape(token), re.I)


def tokens_of(keyword: str) -> list[str]:
    """把关键词拆成需要全部命中的片段。"""
    return [t for t in re.split(r"\s+", keyword.strip()) if t]


def alternatives_of(keyword: str) -> list[str]:
    """关键词用 | 分隔同义写法。

    例：ChatGPT | GPT | #chatgpt
      → 搜 Threads 用第一个（ChatGPT）
      → 正文命中任意一个即算相关

    这样能在不牺牲精确度的前提下把召回补回来：
    很多帖只说「GPT」而不写全称，只认字面会漏掉。
    """
    parts = [p.strip() for p in keyword.split("|")]
    return [p for p in parts if p] or [keyword.strip()]


def canonical_of(keyword: str) -> str:
    """用于发起搜索的写法：同义词组里的第一个。"""
    return alternatives_of(keyword)[0]


def _alt_match(alt: str, hay: list[str]) -> tuple[bool, list[str]]:
    """判断某个写法是否命中。返回 (是否命中, 未命中的词)。"""
    toks = tokens_of(alt)
    if not toks:
        return False, []

    # 1) 整条短语命中
    phrase = _token_pattern(alt.strip().lower())
    if any(phrase.search(h) for h in hay):
        return True, []

    if len(toks) == 1:
        return False, toks

    # 2) 全部有效词分别命中
    missed = [t for t in toks
              if not any(_token_pattern(t.lower()).search(h) for h in hay)]
    if not missed:
        return True, []

    # 3) 连写形式命中：AI prompt → aiprompt，Nano Banana → nanobanana
    #    Threads 上话题标签连写非常常见（#aiprompt / #nanobanana），
    #    只判空格分词会大面积漏召回。
    joined = "".join(toks).lower()
    if any(_token_pattern(joined).search(h) for h in hay):
        return True, []

    return False, missed


def _haystacks(post: dict) -> list[str]:
    """参与匹配的文本：正文 + 标签。额外补一份去掉 # 的副本，
    让 "#aiprompt" 也能命中关键词 "AIPrompt"。"""
    parts = [post.get("text") or "", post.get("tag") or ""]
    raw = "\n".join(parts)
    return [raw, raw.replace("#", "")]


def judge(post: dict, keywords: list[str], blocklist: list[str]) -> tuple[str, str]:
    """返回 (relevance, note)。"""
    hay = _haystacks(post)

    for term in blocklist:
        if not term:
            continue
        pat = _token_pattern(term.strip().lower())
        if any(pat.search(h) for h in hay):
            return "blocked", f"命中屏蔽词「{term}」"

    if not keywords:
        return "relevant", ""

    best_note = ""
    for kw in keywords:
        alts = alternatives_of(kw)
        for alt in alts:
            ok, missed = _alt_match(alt, hay)
            if ok:
                label = canonical_of(kw)
                return "relevant", (f"正文含「{label}」" if alt == label
                                    else f"正文含同义词「{alt}」")
            if missed:
                best_note = best_note or f"缺少「{missed[0]}」"
        best_note = best_note or f"正文未出现「{canonical_of(kw)}」"

    return "offtopic", best_note or "正文未命中关键词"


def apply(posts: list[dict], blocklist: list[str]) -> dict:
    """就地给帖子打上 relevance / relevance_note，并返回统计。"""
    counts = {"relevant": 0, "blocked": 0, "offtopic": 0}
    for p in posts:
        status, note = judge(p, p.get("keywords") or [], blocklist)
        p["relevance"] = status
        p["relevance_note"] = note
        counts[status] += 1
    return counts
