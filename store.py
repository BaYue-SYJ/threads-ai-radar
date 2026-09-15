"""
SQLite 存储层。

四张表：
  posts      帖子主表（含相关性判定与评分）
  snapshots  互动数时序快照，用于看一条帖子随时间涨了多少
  runs       每轮采集的状态记录，供前端实时展示进度
  keywords   关键词表，界面可直接增删
"""
from __future__ import annotations

import json
import sqlite3
import threading
import time
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable

from config import DB_PATH, SNAPSHOT_RETENTION_DAYS

_lock = threading.RLock()

SCHEMA = """
PRAGMA journal_mode=WAL;

CREATE TABLE IF NOT EXISTS posts (
    code            TEXT PRIMARY KEY,
    url             TEXT,
    username        TEXT,
    user_id         TEXT,
    verified        INTEGER DEFAULT 0,
    text            TEXT,
    lang            TEXT,
    like_count      INTEGER DEFAULT 0,
    reply_count     INTEGER DEFAULT 0,
    repost_count    INTEGER DEFAULT 0,
    quote_count     INTEGER DEFAULT 0,
    taken_at        INTEGER DEFAULT 0,
    media_type      INTEGER,
    has_image       INTEGER DEFAULT 0,
    is_reply        INTEGER DEFAULT 0,
    tag             TEXT,
    keywords        TEXT DEFAULT '[]',
    category        TEXT DEFAULT '',
    relevance       TEXT DEFAULT 'relevant',
    relevance_note  TEXT DEFAULT '',
    score           REAL DEFAULT 0,
    velocity        REAL DEFAULT 0,
    first_seen      TEXT,
    last_seen       TEXT,
    is_new          INTEGER DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_posts_score  ON posts(score DESC);
CREATE INDEX IF NOT EXISTS idx_posts_taken  ON posts(taken_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_like   ON posts(like_count DESC);
CREATE INDEX IF NOT EXISTS idx_posts_vel    ON posts(velocity DESC);
CREATE INDEX IF NOT EXISTS idx_posts_user   ON posts(username);

CREATE TABLE IF NOT EXISTS snapshots (
    code         TEXT NOT NULL,
    ts           INTEGER NOT NULL,
    like_count   INTEGER DEFAULT 0,
    reply_count  INTEGER DEFAULT 0,
    repost_count INTEGER DEFAULT 0,
    quote_count  INTEGER DEFAULT 0,
    PRIMARY KEY (code, ts)
);
CREATE INDEX IF NOT EXISTS idx_snap_code ON snapshots(code, ts);

CREATE TABLE IF NOT EXISTS runs (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at     TEXT,
    finished_at    TEXT,
    status         TEXT DEFAULT 'running',
    keywords_total INTEGER DEFAULT 0,
    keywords_done  INTEGER DEFAULT 0,
    found          INTEGER DEFAULT 0,
    new_posts      INTEGER DEFAULT 0,
    relevant       INTEGER DEFAULT 0,
    message        TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_runs_started ON runs(started_at DESC);

CREATE TABLE IF NOT EXISTS keywords (
    keyword    TEXT PRIMARY KEY,
    grp        TEXT DEFAULT '',
    enabled    INTEGER DEFAULT 1,
    added_at   TEXT,
    last_run   TEXT,
    total_posts INTEGER DEFAULT 0,
    last_new   INTEGER DEFAULT 0
);

-- 关注名单：盯固定几个竞对，看他们自上次查看以来有没有新帖。
-- 和 keywords 分开存，因为「监控什么词」和「盯谁」是两个正交的维度。
CREATE TABLE IF NOT EXISTS watchlist (
    username  TEXT PRIMARY KEY,
    note      TEXT DEFAULT '',
    added_at  TEXT
);
"""


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def connect() -> sqlite3.Connection:
    con = sqlite3.connect(DB_PATH, timeout=30, check_same_thread=False)
    con.row_factory = sqlite3.Row
    return con


def init_db() -> None:
    with _lock, connect() as con:
        con.executescript(SCHEMA)


# ----------------------------------------------------------------- posts

UPSERT = """
INSERT INTO posts (
    code,url,username,user_id,verified,text,lang,
    like_count,reply_count,repost_count,quote_count,taken_at,
    media_type,has_image,is_reply,tag,keywords,category,
    relevance,relevance_note,score,velocity,first_seen,last_seen,is_new
) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)
ON CONFLICT(code) DO UPDATE SET
    like_count     = excluded.like_count,
    reply_count    = excluded.reply_count,
    repost_count   = excluded.repost_count,
    quote_count    = excluded.quote_count,
    text           = excluded.text,
    score          = excluded.score,
    velocity       = excluded.velocity,
    category       = excluded.category,
    relevance      = excluded.relevance,
    relevance_note = excluded.relevance_note,
    keywords       = excluded.keywords,
    last_seen      = excluded.last_seen
"""


def upsert_posts(posts: Iterable[dict[str, Any]]) -> tuple[int, int]:
    """写入或更新帖子。返回 (新增数, 更新数)。"""
    posts = list(posts)
    if not posts:
        return 0, 0

    ts = _now()
    new = updated = 0
    with _lock, connect() as con:
        for p in posts:
            exists = con.execute(
                "SELECT 1 FROM posts WHERE code=?", (p["code"],)
            ).fetchone()
            row = (
                p["code"], p.get("url"), p.get("username"), p.get("user_id"),
                int(bool(p.get("verified"))), p.get("text"), p.get("lang"),
                int(p.get("like_count") or 0), int(p.get("reply_count") or 0),
                int(p.get("repost_count") or 0), int(p.get("quote_count") or 0),
                int(p.get("taken_at") or 0), p.get("media_type"),
                int(bool(p.get("has_image"))), int(bool(p.get("is_reply"))),
                p.get("tag"), json.dumps(p.get("keywords") or [], ensure_ascii=False),
                p.get("category", ""), p.get("relevance", "relevant"),
                p.get("relevance_note", ""), float(p.get("score") or 0),
                float(p.get("velocity") or 0), ts, ts,
            )
            con.execute(UPSERT, row)
            if exists:
                updated += 1
            else:
                new += 1
            con.execute(
                """INSERT INTO snapshots(code,ts,like_count,reply_count,repost_count,quote_count)
                   VALUES (?,?,?,?,?,?)
                   ON CONFLICT(code,ts) DO UPDATE SET
                     like_count=excluded.like_count, reply_count=excluded.reply_count,
                     repost_count=excluded.repost_count, quote_count=excluded.quote_count""",
                (p["code"], int(time.time()), int(p.get("like_count") or 0),
                 int(p.get("reply_count") or 0), int(p.get("repost_count") or 0),
                 int(p.get("quote_count") or 0)),
            )
    return new, updated


def query_posts(limit: int = 2000, only_relevant: bool = True) -> list[dict]:
    sql = "SELECT * FROM posts"
    if only_relevant:
        sql += " WHERE relevance='relevant'"
    sql += " ORDER BY score DESC LIMIT ?"
    with _lock, connect() as con:
        rows = con.execute(sql, (limit,)).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        try:
            d["keywords"] = json.loads(d.get("keywords") or "[]")
        except json.JSONDecodeError:
            d["keywords"] = []
        out.append(d)
    return out


def mark_all_seen() -> int:
    """把全部帖子的 is_new 清零，并返回本次被清掉的数量。"""
    with _lock, connect() as con:
        n = con.execute("SELECT COUNT(*) FROM posts WHERE is_new=1").fetchone()[0]
        con.execute("UPDATE posts SET is_new=0 WHERE is_new=1")
    return n


def growth_for(code: str, limit: int = 40) -> list[dict]:
    """取一条帖子的互动增长序列。"""
    with _lock, connect() as con:
        rows = con.execute(
            "SELECT ts,like_count,reply_count,repost_count,quote_count "
            "FROM snapshots WHERE code=? ORDER BY ts DESC LIMIT ?", (code, limit)
        ).fetchall()
    return [dict(r) for r in reversed(rows)]


# ----------------------------------------------------------------- authors

# 互动量达到该值即算一条「爆款」。用于统计同行的爆款产出能力。
HIT_THRESHOLD = 500

# GROUP_CONCAT 的分隔符。char(31) = 单元分隔符，正文里不可能出现。
SEP = chr(31)


def _canonical(keyword: str) -> str:
    """同义词组取主写法：`ChatGPT | GPT | #chatgpt` → `ChatGPT`。"""
    from relevance import canonical_of          # 叶子模块，无循环依赖
    try:
        return canonical_of(keyword)
    except Exception:
        return (keyword or "").split("|")[0].strip()


# 持续度分层。单帖爆款说明「运气好」，多帖 + 多爆款才说明「方法论稳定」，
# 后者才是值得长期盯的同行。
TIER_CORE = "core"          # 帖>=3 且 爆款>=2 —— 核心监控
TIER_STEADY = "steady"      # 帖>=2           —— 持续产出
TIER_SINGLE = "single_hit"  # 帖=1 但爆款>=1   —— 单帖爆款
TIER_CASUAL = "casual"      # 其余

TIER_LABEL = {
    TIER_CORE: "核心监控",
    TIER_STEADY: "持续产出",
    TIER_SINGLE: "单帖爆款",
    TIER_CASUAL: "偶发出现",
}

# 各分层预设的排序字段：同行榜默认不按爆款数排，否则会被单帖作者淹掉。
TIER_SORT = {
    TIER_CORE: "hits",
    TIER_STEADY: "posts",
    TIER_SINGLE: "interactions",
    TIER_CASUAL: "interactions",
}


def _tier_of(posts: int, hits: int) -> str:
    if posts >= 3 and hits >= 2:
        return TIER_CORE
    if posts >= 2:
        return TIER_STEADY
    if hits >= 1:
        return TIER_SINGLE
    return TIER_CASUAL


def author_stats(only_relevant: bool = True, limit: int = 300,
                 min_posts: int = 1, tier: str | None = None,
                 only_usernames: Iterable[str] | None = None) -> list[dict]:
    """按作者聚合，用于竞品 / 同行监控。

    单看一条帖子只能知道「这条火了」；按作者聚合才能看出
    「谁在持续产出爆款」「他们主攻什么方向」「发帖节奏如何」。

    min_posts / tier 是同行榜真正需要的过滤器：数据刚起步时绝大多数
    作者只出现过一次，不过滤的话榜单全是「一次性爆款」，看不出谁值得长期盯。
    """
    where = "WHERE relevance='relevant'" if only_relevant else "WHERE 1=1"
    where += " AND username IS NOT NULL AND username != ''"

    params: list = [HIT_THRESHOLD]
    # 关注名单场景只需要少数几个账号，加个 IN 过滤，别为几个人扫全表
    names = [n for n in (only_usernames or []) if n]
    if names:
        where += f" AND username IN ({','.join('?' * len(names))})"
        params.extend(names)

    sql = f"""
        SELECT username,
               COUNT(*)                         AS posts,
               SUM(like_count)                  AS likes,
               SUM(reply_count)                 AS replies,
               SUM(repost_count)                AS reposts,
               SUM(quote_count)                 AS quotes,
               SUM(CASE WHEN (like_count+reply_count+repost_count+quote_count) >= ?
                         THEN 1 ELSE 0 END)     AS hits,
               MAX(score)                       AS best_score,
               MAX(like_count)                  AS best_likes,
               MIN(taken_at)                    AS first_at,
               MAX(taken_at)                    AS last_at,
               MAX(verified)                    AS verified,
               SUM(is_new)                      AS new_count,
               GROUP_CONCAT(keywords, char(31)) AS kw_blob,
               GROUP_CONCAT(category, char(31)) AS cat_blob
        FROM posts {where}
        GROUP BY username
    """
    if min_posts > 1:
        sql += f" HAVING COUNT(*) >= {int(min_posts)}"
    sql += " ORDER BY posts DESC LIMIT ?"
    params.append(limit)

    with _lock, connect() as con:
        rows = con.execute(sql, params).fetchall()

    out = []
    for r in rows:
        d = dict(r)
        if not d.get("username"):
            continue
        inter = ((d["likes"] or 0) + (d["replies"] or 0)
                 + (d["reposts"] or 0) + (d["quotes"] or 0))
        d["interactions"] = inter
        d["avg_interactions"] = round(inter / d["posts"], 1) if d["posts"] else 0
        d["hit_rate"] = round(d["hits"] / d["posts"], 2) if d["posts"] else 0

        span = (d["last_at"] or 0) - (d["first_at"] or 0)
        days = span / 86400 if span > 0 else 0
        d["active_days"] = round(days, 1)
        d["posts_per_week"] = round(d["posts"] / days * 7, 2) if days >= 1 else None

        # 分隔符必须用 char(31) 而不是 '|'：keywords 列存的是 JSON 数组
        # （如 ["Nano Banana | nanobanana | Nano Banana Pro"]），用 '|' 会把
        # 一个关键词拆成三条，方向统计直接放大数倍。char(31) 在 JSON 文本里
        # 不可能出现，切出来的每段都是一段完整 JSON，可以逐段 loads。
        cats = Counter(x for x in (d.pop("cat_blob") or "").split(SEP) if x)
        kws = Counter()
        for blob in (d.pop("kw_blob") or "").split(SEP):
            if not blob:
                continue
            try:
                names = json.loads(blob)
            except json.JSONDecodeError:
                names = [blob]
            if not isinstance(names, list):
                names = [names]
            # 同义词组只按主写法计一次，否则「ChatGPT / GPT / #chatgpt」会算三票。
            for _k in names:
                if _k:
                    kws[_canonical(_k)] += 1
        d["top_categories"] = [{"name": k, "count": v} for k, v in cats.most_common(3)]
        d["top_keywords"] = [{"name": k, "count": v} for k, v in kws.most_common(4)]

        d["tier"] = _tier_of(d["posts"], d["hits"])
        d["tier_label"] = TIER_LABEL[d["tier"]]
        out.append(d)

    if tier:
        out = [d for d in out if d["tier"] == tier]

    out.sort(key=lambda x: (-x["hits"], -x["interactions"]))
    return out


def author_coverage(only_relevant: bool = True) -> dict:
    """同行维度的样本厚度。数据刚起步时「持续产出」人数会很少，
    界面上必须把这件事说清楚，否则用户会以为是工具坏了。"""
    rows = author_stats(only_relevant=only_relevant, limit=100000)
    total = len(rows)
    by_tier = Counter(r["tier"] for r in rows)
    multi = sum(1 for r in rows if r["posts"] >= 2)
    return {
        "authors_total": total,
        "authors_multi_post": multi,
        "authors_single": total - multi,
        "multi_post_ratio": round(multi / total, 3) if total else 0,
        "by_tier": {k: by_tier.get(k, 0) for k in
                    (TIER_CORE, TIER_STEADY, TIER_SINGLE, TIER_CASUAL)},
        "tier_labels": TIER_LABEL,
        "hit_threshold": HIT_THRESHOLD,
    }


def posts_by_author(username: str, limit: int = 200,
                    only_relevant: bool = True) -> list[dict]:
    sql = "SELECT * FROM posts WHERE username=?"
    if only_relevant:
        sql += " AND relevance='relevant'"
    sql += " ORDER BY score DESC LIMIT ?"
    with _lock, connect() as con:
        rows = con.execute(sql, (username, limit)).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        try:
            d["keywords"] = json.loads(d.get("keywords") or "[]")
        except json.JSONDecodeError:
            d["keywords"] = []
        out.append(d)
    return out


# ----------------------------------------------------------------- watchlist

def normalize_username(raw: str) -> str:
    """容错处理用户输入：允许粘贴 @xxx、@xxx/ 或整条帖子/主页链接。

    统一转小写 —— Threads 的用户名不区分大小写，若不归一化，
    `@SomeOne` 与 `someone` 会在名单里变成两行。
    """
    s = (raw or "").strip()
    if not s:
        return ""
    low = s.lower()
    for host in ("threads.com/", "threads.net/"):
        if host in low:
            s = s.split(host, 1)[1]
            break
    s = s.lstrip("@").strip()
    s = s.split("/", 1)[0].split("?", 1)[0].split("#", 1)[0]
    return s.lstrip("@").strip().strip(".").lower()


def watchlist_all() -> list[dict]:
    with _lock, connect() as con:
        rows = con.execute(
            "SELECT username,note,added_at FROM watchlist ORDER BY added_at"
        ).fetchall()
    return [dict(r) for r in rows]


def watchlist_add(username: str, note: str = "") -> bool:
    """返回 True 表示新增，False 表示已存在（只更新备注）。"""
    u = normalize_username(username)
    if not u:
        return False
    with _lock, connect() as con:
        existed = con.execute("SELECT 1 FROM watchlist WHERE username=?", (u,)).fetchone()
        if existed:
            if note:
                con.execute("UPDATE watchlist SET note=? WHERE username=?", (note.strip(), u))
            return False
        con.execute("INSERT INTO watchlist(username,note,added_at) VALUES (?,?,?)",
                    (u, note.strip(), _now()))
    return True


def watchlist_remove(username: str) -> bool:
    u = normalize_username(username)
    with _lock, connect() as con:
        return con.execute("DELETE FROM watchlist WHERE username=?", (u,)).rowcount > 0


def watchlist_stats(only_relevant: bool = True) -> dict:
    """关注名单 + 每个账号的实时聚合。

    已关注但库里还没有相关帖的账号也要列出来（否则用户会以为关注没生效），
    这种行给出零值并标记 has_posts=False。
    """
    watched = watchlist_all()
    names = [w["username"] for w in watched]
    by_name = {r["username"]: r for r in
               author_stats(only_relevant=only_relevant, limit=len(names) or 1,
                            only_usernames=names)}

    accounts: list[dict] = []
    for w in watched:
        row = by_name.get(w["username"])
        if row:
            item = dict(row)
            item["has_posts"] = True
        else:
            item = {
                "username": w["username"], "posts": 0, "hits": 0,
                "likes": 0, "replies": 0, "reposts": 0, "quotes": 0,
                "interactions": 0, "avg_interactions": 0, "hit_rate": 0,
                "best_score": None, "best_likes": 0, "new_count": 0,
                "first_at": None, "last_at": None, "active_days": 0,
                "posts_per_week": None, "verified": 0,
                "top_categories": [], "top_keywords": [],
                "tier": TIER_CASUAL, "tier_label": TIER_LABEL[TIER_CASUAL],
                "has_posts": False,
            }
        item["note"] = w["note"]
        item["added_at"] = w["added_at"]
        accounts.append(item)

    # 有新帖的排最前，其次按最近活跃
    accounts.sort(key=lambda r: (-(r.get("new_count") or 0),
                                 -(r.get("last_at") or 0)))

    with_new = sum(1 for a in accounts if (a.get("new_count") or 0) > 0)
    summary = {
        "accounts": len(accounts),
        "with_posts": sum(1 for a in accounts if a.get("has_posts")),
        "with_new": with_new,
        "new_posts": sum(a.get("new_count") or 0 for a in accounts),
        "hits": sum(a.get("hits") or 0 for a in accounts),
        "interactions": sum(a.get("interactions") or 0 for a in accounts),
    }
    return {"accounts": accounts, "summary": summary}


# --- watchlist.txt 读写（与 keywords.txt 同风格，记事本可改）---

def load_watchlist_file(path) -> list[tuple[str, str]]:
    """解析 watchlist.txt → [(账号, 备注)]。格式：`账号 | 备注`，备注可省。"""
    out: list[tuple[str, str]] = []
    if not path.exists():
        return out
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        user, _, note = line.partition("|")
        u = normalize_username(user)
        if u:
            out.append((u, note.strip()))
    return out


def write_watchlist_file(path, rows: list[tuple[str, str]]) -> None:
    lines = [
        "# ============================================================",
        "#  关注名单（同行 / 竞品监控）",
        "# ------------------------------------------------------------",
        "#  用法：",
        "#    · 每行一个 Threads 账号，不用写 @",
        "#    · 用 | 追加备注，例：someaccount | 主攻 XX 方向",
        "#    · 界面里的增删也会写回本文件",
        "# ============================================================",
        "",
    ]
    for user, note in rows:
        lines.append(f"{user} | {note}" if note else user)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def sync_watchlist(pairs: list[tuple[str, str]]) -> None:
    """把文件里的关注名单同步进库（已有的不覆盖备注与加入时间）。"""
    with _lock, connect() as con:
        for user, note in pairs:
            con.execute("INSERT OR IGNORE INTO watchlist(username,note,added_at) "
                        "VALUES (?,?,?)", (user, note, _now()))


# ----------------------------------------------------------------- runs

def recover_stale_runs(note: str = "进程中断，本轮未完成") -> int:
    """把上次进程留下的「running」记录收尾。

    进程被强杀时采集记录会永远停在 running，界面上会一直显示在采集，
    还会让「下一轮」的进度计算错乱。启动时先扫一遍收掉。
    """
    with _lock, connect() as con:
        cur = con.execute(
            "UPDATE runs SET status='error', finished_at=?, message=? "
            "WHERE status='running'",
            (_now(), note),
        )
        return cur.rowcount


def start_run(keywords_total: int) -> int:
    with _lock, connect() as con:
        cur = con.execute(
            "INSERT INTO runs(started_at,status,keywords_total,message) VALUES (?,'running',?,?)",
            (_now(), keywords_total, "开始采集"),
        )
        return int(cur.lastrowid)


def update_run(run_id: int, **fields) -> None:
    if not fields:
        return
    cols = ", ".join(f"{k}=?" for k in fields)
    with _lock, connect() as con:
        con.execute(f"UPDATE runs SET {cols} WHERE id=?", (*fields.values(), run_id))


def finish_run(run_id: int, status: str, message: str = "") -> None:
    with _lock, connect() as con:
        con.execute(
            "UPDATE runs SET status=?, finished_at=?, message=? WHERE id=?",
            (status, _now(), message, run_id),
        )


def current_run() -> dict | None:
    with _lock, connect() as con:
        row = con.execute(
            "SELECT * FROM runs WHERE status='running' ORDER BY id DESC LIMIT 1"
        ).fetchone()
    return dict(row) if row else None


def last_run() -> dict | None:
    with _lock, connect() as con:
        row = con.execute("SELECT * FROM runs ORDER BY id DESC LIMIT 1").fetchone()
    return dict(row) if row else None


def recent_runs(limit: int = 12) -> list[dict]:
    with _lock, connect() as con:
        rows = con.execute(
            "SELECT * FROM runs ORDER BY id DESC LIMIT ?", (limit,)
        ).fetchall()
    return [dict(r) for r in rows]


# ----------------------------------------------------------------- keywords

def load_keywords_file(path) -> list[tuple[str, str]]:
    """解析 keywords.txt，返回 [(分组, 关键词)]。"""
    result: list[tuple[str, str]] = []
    if not path.exists():
        return result
    group = ""
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("[") and line.endswith("]"):
            group = line[1:-1].strip()
            continue
        result.append((group, line))
    return result


def load_blocklist(path) -> list[str]:
    if not path.exists():
        return []
    out = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if line and not line.startswith("#"):
            out.append(line)
    return out


def sync_keywords(pairs: list[tuple[str, str]]) -> None:
    """把文件里的关键词同步进库（保留已有的统计数据）。"""
    with _lock, connect() as con:
        for grp, kw in pairs:
            con.execute(
                "INSERT INTO keywords(keyword,grp,added_at) VALUES (?,?,?) "
                "ON CONFLICT(keyword) DO UPDATE SET grp=excluded.grp",
                (kw, grp, _now()),
            )


def list_keywords(only_enabled: bool = True) -> list[dict]:
    sql = "SELECT * FROM keywords"
    if only_enabled:
        sql += " WHERE enabled=1"
    sql += " ORDER BY grp, keyword"
    with _lock, connect() as con:
        rows = con.execute(sql).fetchall()
    return [dict(r) for r in rows]


def add_keyword(keyword: str, grp: str = "") -> None:
    keyword = keyword.strip()
    if not keyword:
        return
    with _lock, connect() as con:
        con.execute(
            "INSERT INTO keywords(keyword,grp,added_at) VALUES (?,?,?) "
            "ON CONFLICT(keyword) DO UPDATE SET grp=excluded.grp, enabled=1",
            (keyword, grp, _now()),
        )


def remove_keyword(keyword: str) -> None:
    with _lock, connect() as con:
        con.execute("DELETE FROM keywords WHERE keyword=?", (keyword,))


def set_keyword_stats(keyword: str, total: int, new: int) -> None:
    with _lock, connect() as con:
        con.execute(
            "UPDATE keywords SET last_run=?, total_posts=?, last_new=? WHERE keyword=?",
            (_now(), total, new, keyword),
        )


def write_keywords_file(path, groups: list[tuple[str, str]]) -> None:
    """把库里的关键词回写到 keywords.txt，保持文件与界面一致。"""
    buf: list[str] = [
        "# 由界面自动维护，也可手工编辑（界面会重新读取本文件）",
        "# [方括号] 为分组，每行一个关键词，# 开头是注释",
        "",
    ]
    order: list[str] = []
    by_group: dict[str, list[str]] = {}
    for grp, kw in groups:
        if grp not in by_group:
            by_group[grp] = []
            order.append(grp)
        by_group[grp].append(kw)
    for grp in order:
        if grp:
            buf.append(f"[{grp}]")
        buf.extend(by_group[grp])
        buf.append("")
    path.write_text("\n".join(buf), encoding="utf-8")


# ----------------------------------------------------------------- stats

def stats() -> dict:
    with _lock, connect() as con:
        total = con.execute("SELECT COUNT(*) FROM posts").fetchone()[0]
        relevant = con.execute(
            "SELECT COUNT(*) FROM posts WHERE relevance='relevant'").fetchone()[0]
        blocked = con.execute(
            "SELECT COUNT(*) FROM posts WHERE relevance='blocked'").fetchone()[0]
        off = con.execute(
            "SELECT COUNT(*) FROM posts WHERE relevance='offtopic'").fetchone()[0]
        authors = con.execute("SELECT COUNT(DISTINCT username) FROM posts").fetchone()[0]
        if relevant:
            agg = con.execute(
                "SELECT SUM(like_count),SUM(reply_count),SUM(repost_count),SUM(quote_count) "
                "FROM posts WHERE relevance='relevant'").fetchone()
        else:
            agg = (0, 0, 0, 0)
        new = con.execute("SELECT COUNT(*) FROM posts WHERE is_new=1").fetchone()[0]
        newest = con.execute(
            "SELECT code,username,score FROM posts WHERE relevance='relevant' "
            "ORDER BY score DESC LIMIT 1").fetchone()
    inter = sum(int(x or 0) for x in agg)
    return {
        "total": total,
        "relevant": relevant,
        "blocked": blocked,
        "offtopic": off,
        "authors": authors,
        "interactions": inter,
        "likes": int(agg[0] or 0),
        "replies": int(agg[1] or 0),
        "reposts": int(agg[2] or 0),
        "quotes": int(agg[3] or 0),
        "new": new,
        "top": dict(newest) if newest else None,
    }


def update_analysis(posts: Iterable[dict[str, Any]]) -> int:
    """只更新相关性判定与评分，不动帖子本身。

    改完 keywords.txt / blocklist.txt 后用它重算，无需重新抓取。
    """
    posts = list(posts)
    if not posts:
        return 0
    with _lock, connect() as con:
        for p in posts:
            con.execute(
                """UPDATE posts SET relevance=?, relevance_note=?, category=?,
                   score=?, velocity=?, keywords=? WHERE code=?""",
                (p.get("relevance", "relevant"), p.get("relevance_note", ""),
                 p.get("category", ""), float(p.get("score") or 0),
                 float(p.get("velocity") or 0),
                 json.dumps(p.get("keywords") or [], ensure_ascii=False),
                 p["code"]),
            )
    return len(posts)


def all_raw_posts() -> list[dict]:
    """取出全部帖子（含无关与屏蔽），供重算使用。"""
    with _lock, connect() as con:
        rows = con.execute("SELECT * FROM posts").fetchall()
    out = []
    for r in rows:
        d = dict(r)
        try:
            d["keywords"] = json.loads(d.get("keywords") or "[]")
        except json.JSONDecodeError:
            d["keywords"] = []
        out.append(d)
    return out


def prune_snapshots() -> int:
    cutoff = int((datetime.now(timezone.utc)
                  - timedelta(days=SNAPSHOT_RETENTION_DAYS)).timestamp())
    with _lock, connect() as con:
        cur = con.execute("DELETE FROM snapshots WHERE ts < ?", (cutoff,))
        return cur.rowcount
