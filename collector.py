"""
采集层：Threads 搜索页的匿名抓取。

原理（已实测验证）：
    Threads 对普通浏览器 UA 不做内容服务端渲染，只返回 ~275KB 的空壳页面；
    换成 Googlebot UA 后 Meta 会返回完整 SSR 页面（1~2MB），
    帖子数据以内嵌 JSON 形式直接给出。免登录、无需 OAuth、无需 App Review。

字段位置（最容易踩的坑）：
    like_count          在帖子对象顶层
    direct_reply_count  在 text_post_app_info 内，注意「不叫 reply_count」
    repost_count        在 text_post_app_info 内
    quote_count         在 text_post_app_info 内
    → 判定帖子对象的条件必须同时含 code + like_count + text_post_app_info，
      只判前两者会停在外层，导致后三个字段全部读成 0。
"""
from __future__ import annotations

import json
import random
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from config import (JITTER_MAX, JITTER_MIN, REQUEST_TIMEOUT, RETRIES, SERP_TYPES,
                    USER_AGENT)

SEARCH_URL = "https://www.threads.com/search?q={q}"
_BLOCK = re.compile(r'<script type="application/json"[^>]*>(.*?)</script>', re.S)
_MAX_DEPTH = 45

# 页面健康基线：低于此体积基本可以断定没拿到 SSR 内容
MIN_HEALTHY_BYTES = 400_000
MIN_HEALTHY_POSTS = 5


# 抓不动的原因要分开报，不能一律「页面异常」——
# 到底是自己的 UA 不对、还是链路被断、还是被风控，处理方式完全不同。
CHANNEL_HINTS = {
    "proxy_tunnel_502": "代理隧道 502：本机到 Threads 的出口被拒。连续高频抓取后常见，"
                        "出口 IP 被 Meta 风控。停一段时间再试，或换出口。",
    "rate_limited":     "HTTP 429：明确被限流。降低抓取频率（减少 serp_type 变体、拉长间隔）。",
    "connect_timeout":  "连接超时：直连被阻断。需要走可用代理。",
    "tls_reset":        "TLS 被重置：链路被中间设备打断。",
    "gateway":           "网关错误（5xx）：上游或代理侧故障，通常可自愈。",
    "empty_shell":      "拿到了页面但没有 SSR 数据：UA 被降级成普通浏览器，需要 Googlebot UA。",
    "unknown":          "未知原因，见错误详情。",
}


class CollectError(RuntimeError):
    def __init__(self, message: str, reason: str = "unknown", hint: str = ""):
        super().__init__(message)
        self.reason = reason
        self.hint = hint or CHANNEL_HINTS.get(reason, "")


def classify(exc: Exception) -> tuple[str, str]:
    """把一个异常归到具体通道原因。返回 (reason, 中文说明)。"""
    msg = str(exc)
    if isinstance(exc, urllib.error.HTTPError):
        if exc.code == 429:
            return "rate_limited", f"HTTP {exc.code}"
        if exc.code in (500, 502, 503, 504):
            return "gateway", f"HTTP {exc.code}"
        return "unknown", f"HTTP {exc.code}"
    if "Tunnel connection failed" in msg:
        return "proxy_tunnel_502", msg.split(":")[-1].strip()[:80]
    if "10060" in msg or "timed out" in msg or "TimeoutError" in type(exc).__name__:
        return "connect_timeout", "连接超时"
    # Python 的两种 TLS 中断文案都要覆盖：
    #   "EOF occurred in violation of protocol (_ssl.c:1006)"
    #   "[SSL: UNEXPECTED_EOF_WHILE_READING] ..."
    if ("EOF occurred" in msg or "UNEXPECTED_EOF" in msg
            or "_ssl.c" in msg or "CERTIFICATE" in msg or "SSL:" in msg):
        return "tls_reset", "TLS/SSL 中断"
    return "unknown", msg[:110]


def _jitter() -> None:
    time.sleep(random.uniform(JITTER_MIN, JITTER_MAX))


def build_url(keyword: str, variant: str | None = None) -> str:
    """variant='base' 表示不带 serp_type 参数。"""
    url = SEARCH_URL.format(q=urllib.parse.quote(keyword))
    if variant and variant != "base":
        url += f"&serp_type={variant}"
    return url


def fetch(url: str, timeout: int = REQUEST_TIMEOUT, retries: int = RETRIES) -> str:
    last: Exception | None = None
    reason = "unknown"
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": USER_AGENT,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
                "Cache-Control": "no-cache",
            })
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read().decode("utf-8", "ignore")
        except urllib.error.HTTPError as exc:
            last = exc
            reason, _ = classify(exc)
            # 429 / 5xx 才重试，4xx 其他直接放弃
            if exc.code not in (429, 500, 502, 503, 504):
                break
        except Exception as exc:                            # noqa: BLE001
            last = exc
            reason, _ = classify(exc)
            # 隧道被拒 / 链路不通属于「封禁态」，重试两次没意义，早点返回让上层熔断
            if reason in ("proxy_tunnel_502", "tls_reset") and attempt >= 1:
                break
        if attempt < retries:
            # 指数退避 + 抖动，避免固定节奏
            time.sleep((2.0 ** attempt) + random.uniform(0.5, 1.5))
    raise CollectError(f"抓取失败: {url} → {last}", reason=reason)


def probe_channel(timeout: int = 20) -> dict:
    """一次轻量自检：当前通道还能不能拿到 Threads 的 SSR 页面。

    只发 1 个请求，用来快速分辨「抓取器坏了」还是「出口被封了」，
    免得用户看着界面一直转圈却不知道问题在哪。
    """
    url = build_url("ChatGPT", "base")
    try:
        html = fetch(url, timeout=timeout, retries=0)
    except CollectError as exc:
        return {"ok": False, "reason": exc.reason, "detail": str(exc)[:160],
                "hint": exc.hint}
    posts = parse(html)
    if len(html) < MIN_HEALTHY_BYTES and not posts:
        return {"ok": False, "reason": "empty_shell",
                "detail": f"仅 {len(html)} 字节，无 SSR 数据",
                "hint": CHANNEL_HINTS["empty_shell"]}
    return {"ok": True, "reason": "ok", "bytes": len(html), "posts": len(posts),
            "hint": "通道正常"}


def _walk(node: Any, out: list, depth: int = 0) -> None:
    """递归定位帖子对象。三个字段必须同时存在，否则会漏掉嵌套指标。"""
    if depth > _MAX_DEPTH:
        return
    if isinstance(node, dict):
        if "code" in node and "like_count" in node and "text_post_app_info" in node:
            out.append(node)
            return
        for value in node.values():
            _walk(value, out, depth + 1)
    elif isinstance(node, list):
        for value in node:
            _walk(value, out, depth + 1)


def _int(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _thumb(image_versions2: Any, max_width: int = 640) -> str | None:
    """从 image_versions2 里挑一张尺寸合适的缩略图 URL。

    纯文字帖的 candidates 是空数组 → 返回 None。
    挑「不超过 max_width 的最大一张」而不是最小一张：缩略图在 2x 屏上要放大显示，
    取太小的会糊；但也不能取原图，动辄几千像素会把列表拖垮。
    """
    if not isinstance(image_versions2, dict):
        return None
    cands = image_versions2.get("candidates")
    if not isinstance(cands, list) or not cands:
        return None
    usable = [c for c in cands if isinstance(c, dict) and c.get("url")]
    if not usable:
        return None
    fits = [c for c in usable if _int(c.get("width")) <= max_width]
    pick = (max(fits, key=lambda c: _int(c.get("width"))) if fits
            else min(usable, key=lambda c: _int(c.get("width"))))
    return pick.get("url")


def parse(html: str) -> list[dict]:
    """从 SSR 页面里抽出帖子列表。"""
    posts: list[dict] = []
    seen: set[str] = set()
    for blob in _BLOCK.findall(html):
        if "like_count" not in blob:
            continue
        try:
            payload = json.loads(blob)
        except json.JSONDecodeError:
            continue
        found: list = []
        _walk(payload, found)
        for raw in found:
            code = raw.get("code")
            if not code or code in seen:
                continue
            seen.add(code)
            posts.append(_normalize(raw))
    return posts


def _normalize(raw: dict) -> dict:
    info = raw.get("text_post_app_info") or {}
    caption = raw.get("caption") or {}
    user = raw.get("user") or {}
    username = user.get("username") or ""
    code = raw.get("code") or ""
    tag_header = info.get("tag_header")
    return {
        "code": code,
        "url": f"https://www.threads.com/@{username}/post/{code}",
        "username": username,
        "user_id": str(user.get("pk") or user.get("id") or ""),
        "verified": bool(user.get("is_verified")),
        "text": caption.get("text") or "",
        "lang": raw.get("detected_language"),
        "like_count": _int(raw.get("like_count")),
        "reply_count": _int(info.get("direct_reply_count")),
        "repost_count": _int(info.get("repost_count")),
        "quote_count": _int(info.get("quote_count")),
        "taken_at": _int(raw.get("taken_at")),
        "media_type": raw.get("media_type"),
        # ⚠️ 不能用 bool(raw.get("image_versions2")) —— Threads 给**每一条**帖子
        # （含纯文字帖）都返回了这个 key，纯文字帖的值是空壳 {"candidates": []}，
        # 那个布尔值会恒为 True。实测踩过：库里 19,963 / 19,963 条全被标成有图。
        "has_image": bool((raw.get("image_versions2") or {}).get("candidates")),
        "thumb": _thumb(raw.get("image_versions2")),
        "is_reply": bool(info.get("is_reply")),
        "tag": tag_header.get("display_name") if isinstance(tag_header, dict) else None,
    }


def search_one(keyword: str, timeout: int = REQUEST_TIMEOUT,
               variants: list[str] | None = None) -> tuple[list[dict], dict]:
    """抓一个关键词。

    对每个 serp_type 变体各发一次请求再合并去重——实测各变体返回的是
    不同批次的结果，多取几个相当于翻页，比走 GraphQL 拿游标更可靠。
    返回 (帖子列表, 健康信息)。
    """
    variants = variants or SERP_TYPES or ["base"]
    merged: dict[str, dict] = {}
    detail: list[dict] = []
    total_bytes = 0
    errors: list[str] = []
    reasons: dict[str, int] = {}

    for i, variant in enumerate(variants):
        if i:
            _jitter()
        try:
            html = fetch(build_url(keyword, variant), timeout=timeout)
        except CollectError as exc:
            reasons[exc.reason] = reasons.get(exc.reason, 0) + 1
            errors.append(f"{variant}:{exc.reason}")
            detail.append({"variant": variant, "bytes": 0, "posts": 0,
                           "ok": False, "reason": exc.reason})
            continue
        except Exception as exc:                            # noqa: BLE001
            reason, _ = classify(exc)
            reasons[reason] = reasons.get(reason, 0) + 1
            errors.append(f"{variant}:{reason}")
            detail.append({"variant": variant, "bytes": 0, "posts": 0,
                           "ok": False, "reason": reason})
            continue

        posts = parse(html)
        total_bytes += len(html)
        detail.append({"variant": variant, "bytes": len(html),
                       "posts": len(posts), "ok": True})
        for p in posts:
            merged.setdefault(p["code"], p)

    health = {
        "keyword": keyword,
        "bytes": total_bytes,
        "posts": len(merged),
        "variants": detail,
        "healthy": (total_bytes >= MIN_HEALTHY_BYTES and len(merged) >= MIN_HEALTHY_POSTS),
    }
    if errors:
        health["error"] = "; ".join(errors)
        # 取出现最多的原因作为该关键词的判定
        top = max(reasons, key=reasons.get)
        health["reason"] = top
        health["hint"] = CHANNEL_HINTS.get(top, "")
    return list(merged.values()), health


def search_many(keywords: list[str], on_progress=None,
                stop_flag=None) -> tuple[list[dict], list[dict]]:
    """顺序抓多个关键词，关键词之间加抖动间隔。

    on_progress(index, total, keyword, posts, health) 用于向上汇报进度；
    stop_flag 是一个可调用对象，返回 True 时提前中止。
    """
    all_posts: dict[str, dict] = {}
    hit: dict[str, list[str]] = {}
    healths: list[dict] = []

    for i, kw in enumerate(keywords, 1):
        if stop_flag and stop_flag():
            break
        try:
            posts, health = search_one(kw)
        except Exception as exc:                            # noqa: BLE001
            health = {"keyword": kw, "bytes": 0, "posts": 0,
                      "healthy": False, "error": str(exc)}
            healths.append(health)
            if on_progress:
                on_progress(i, len(keywords), kw, 0, health)
            continue

        healths.append(health)
        for p in posts:
            code = p["code"]
            if code in all_posts:
                hit.setdefault(code, list(all_posts[code]["keywords"])).append(kw)
            else:
                p["keywords"] = [kw]
                all_posts[code] = p
                hit[code] = [kw]

        if on_progress:
            on_progress(i, len(keywords), kw, len(posts), health)

        if i < len(keywords):
            _jitter()

    merged = []
    for code, p in all_posts.items():
        p["keywords"] = sorted(set(hit.get(code, p.get("keywords", []))))
        merged.append(p)
    return merged, healths
