[**简体中文**](README.md) | **English** | [**繁體中文**](README.zh-TW.md) | [**日本語**](README.ja.md) | [**한국어**](README.ko.md)

<div align="center">

# Threads Hot-Post Radar

**Watches AI keywords on Threads in real time and pulls out the posts that are climbing right now.**

No login · No OAuth · No official API · Zero third-party dependencies · Runs on your own machine

[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](requirements.txt)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)]()

</div>

---

## Screenshots

**Keyword radar** — the main view. By default it only shows posts that have an image and more than 30 interactions on any single metric.

![Keyword radar](docs/radar.png)

**Table view** — scan score, velocity and all four engagement metrics at a glance.

![Table view](docs/radar-table.png)

**Post detail** — click any row. Includes the four metrics, viral score, velocity, media and why it was kept.

![Post detail](docs/post-drawer.png)

**Author drawer** — click an author name to see their recent relevant posts and whether they produce steadily.

![Author drawer](docs/author-drawer.png)

**Channel alert** — when scraping fails, the UI tells you exactly which link broke (proxy / user agent / rate limit) instead of leaving you guessing.

![Channel alert](docs/channel-alert.png)

**Peer monitor** — aggregated by account, so you can see who consistently produces hits.

![Peer monitor](docs/peers.png)

**Watchlist** — follow a fixed set of accounts and see what's new since you last looked.

![Watchlist](docs/watchlist.png)

**Mobile / tablet** — three responsive breakpoints: desktop, tablet, phone.

<img src="docs/mobile.png" width="300" alt="Mobile view">

---

## What problem it solves

AI content on Threads moves fast, and **you almost never see it in time**:

- The official API's `keyword_search` gives you **zero engagement metrics** — no likes, no replies, no reposts
- Scrolling the algorithmic feed is not keyword monitoring, it's being fed
- By the time a post goes viral and reaches you, the window for acting on it has closed

What this tool does is simple: **take your keywords, scrape them every N minutes, keep only the posts with an image and real traction, sorted by "currently climbing"**.

It is not a scraping framework. It is a single process you can leave running.

---

## Quick start

### 1. Make sure threads.com is reachable

Open <https://www.threads.com/search?q=ChatGPT> in a browser. If you see content, you're fine.

**If it doesn't load** (direct connections are blocked in many regions), you need a proxy first. This project scrapes with Python's standard-library `urllib`, which automatically picks up the system `http_proxy` / `https_proxy` environment variables:

```bat
set http_proxy=http://127.0.0.1:7890
set https_proxy=http://127.0.0.1:7890
```

Or put them in the `.env` file in the project root (see the notes in `.env.example`).

> ⚠ Use your local proxy client's "mixed port" / "HTTP port", not its SOCKS port.

### 2. Start it

On Windows, double-click `start.bat`. Or from a terminal:

```bash
python server.py
```

**No `pip install` needed** — only the Python standard library is used.

### 3. Open the UI

Browse to <http://127.0.0.1:8650>

The first run triggers a scrape automatically (roughly 3–5 minutes), then it loops on your configured interval.

---

## Default filtering rules

There are far more scraped posts than are worth reading, so the UI opens with three gates enabled:

| Rule | Default | Description |
|---|---|---|
| Relevant only | ✅ on | Body text matches one of your keywords (see "Relevance filtering") |
| Has image only | ✅ on | **Text-only posts are hidden** — they have no visual reference value |
| Min interactions | **30** | Likes / replies / reposts — **any one of them** above the threshold |

"Min interactions" uses the **maximum of the three**, not their sum — summing would rate "34 likes + 33 replies + 33 reposts" the same as "100 likes + 0 + 0", yet only the latter is a real hit. Quotes are excluded (they measure "being discussed by reference", not the post's own traction).

**All three toggles live in the UI and can be switched off at any time to see everything.** The threshold can also be pinned in `.env`:

```ini
RADAR_MIN_INTERACTIONS=30
```

---

## How it gets the data

### The core trick: Googlebot UA + server-side rendering

Threads **does not server-render content for normal browser user agents** — it returns a ~275 KB empty shell and loads everything with JS.

Switch to a **Googlebot user agent**, however, and Meta obligingly returns the full SSR page (1–2 MB) with the post data embedded as inline JSON.

That gives this pipeline:

```
Request the search page with a Googlebot UA
  → receive SSR HTML
  → extract JSON from <script type="application/json">
  → recursively locate post objects
  → normalise fields
```

**No login, no OAuth, no App Review.**

### ⚠️ The easiest trap when editing the code: field locations

The four engagement metrics are **not at the same level**:

| Field | Location |
|---|---|
| `like_count` | **top level** of the post object |
| `direct_reply_count` | inside `text_post_app_info` (note: it is **not** called `reply_count`) |
| `repost_count` | inside `text_post_app_info` |
| `quote_count` | inside `text_post_app_info` |

So the test for "is this a post object" must require **all three** of `code` + `like_count` + `text_post_app_info`. Checking only the first two stops at the outer layer and makes the other three fields read as 0.

Also, `has_image` must **not** be written as `bool(raw.get("image_versions2"))` — Threads returns that key for **every** post including text-only ones, whose value is the empty shell `{"candidates": []}`. That boolean would be permanently True (we hit this: nearly twenty thousand rows in the database were all marked as having an image).

---

## How to write keywords

Edit `keywords.txt` in the project root, or add/remove them in the UI (the UI writes back to the same file).

```
# One keyword per line, [square brackets] are groups

[Model]
ChatGPT | GPT | chatgpt
Claude | ClaudeAI | Anthropic Claude

[Image gen]
Midjourney | midjourney
AI art | AI 绘画 | AI画
```

Three rules:

- **`|` means synonyms** — only the **first** spelling is used for searching, but a match on any of them counts as relevant. This recovers recall without sacrificing precision (plenty of posts say "GPT" and never write the full name).
- **A space means AND** — `AI prompt` requires both "AI" and "prompt" to appear. The concatenated form also matches (`#aiprompt`).
- **`[Group]`** is purely for classifying things in the UI and can be changed freely. Group names are **not** translated into other UI languages — they are also data values, and translating them would mean you could no longer search the files for the words you see on screen.

---

## Relevance filtering

Threads search does not return "posts containing this word" — it returns **semantically related** results. Searching "AI prompt" empirically surfaces Indonesian/Malay engagement-farming posts and even politicians discussing AI regulation (one of them with 11k+ likes at the top of the list). Those posts are tangentially about AI but worthless for picking topics.

So there is a filter layer, pure keyword rules, no model calls:

| Verdict | Condition |
|---|---|
| `blocked` | Matches a term in `blocklist.txt` → excluded outright |
| `relevant` | Body matches a keyword (the whole phrase, or all its tokens, or the concatenated form) |
| `offtopic` | Everything else (recalled by search but unrelated to the keywords) |

Two implementation details:

1. **Short words like `ai` cause false positives with substring matching** — `said`, `again`, `available`. So pure-ASCII terms use approximate word-boundary matching (no alphanumeric character on either side).
2. **The `tag` field participates in matching** — a post belonging to the "AI Threads" community gets "AI" from its tag. So a post whose body only says "prompt" can still match the keyword `AI prompt`.

**Requiring a keyword match is the inherent cost of this approach**: a post like "ChatGPT Images 2.5 能給我們設計師留一條生路？" is obviously AI-related but gets classified offtopic because it doesn't contain any word from the keyword list. **The fix is to add the word to `keywords.txt`, not to loosen the rules** — loosening immediately floods you with noise.

### Zero-interaction posts are never stored

Threads pads out a page of search results with a great many **freshly posted, completely unreactioned** posts. In one measured cycle, 1,421 posts were scraped and only 359 were relevant; the rest were almost entirely zero-like noise unrelated to the keywords.

So the collection layer has a gate: **posts with all four metrics at 0 are not written to the database**.

This is not "discarding forever" but **delayed ingestion** — if the post is scraped again later and has interactions by then, it is stored normally. The only cost is losing the "zero-interaction segment" of its growth curve, not losing the post.

> This rule is far gentler than "don't collect below some interaction threshold": the latter would also block posts that have already started climbing.

---

## Scrape variants and ban risk

For the same search term, different `serp_type` parameters return **different batches** of results — effectively pagination.

Measured overlap between variants is only **50–63%**:

| Query | base | recent | profile | Union of all three |
|---|---|---|---|---|
| `q=Claude` | 76 posts | 74 posts | 74 posts | **137 posts (+80%)** |
| `q=ChatGPT` | 61 posts | 60 posts | 62 posts | **109 posts (+79%)** |

So enabling more variants is the most direct way to raise recall:

```ini
RADAR_SERP_TYPES=base,profile,recent
```

Available values: `base` (no parameter), `recent`, `top`, `tag`, `profile`, `default`.

### ⚠️ The number of variants directly determines ban risk

**This is the parameter to be most conservative about.** Measured:

| Configuration | Requests | Result |
|---|---|---|
| 3 variants × 19 keywords | 57 per cycle (~114/hour) | **threads.com returns 502 after three consecutive cycles**, self-heals in ~20 minutes |
| 2 variants × 19 keywords | 38 per cycle | Stable |
| 3 variants × 12 keywords | 36 per cycle (~72/hour) | Stable (current default) |

**Recommendation**: keep `keywords × variants ≤ 40` and the interval at 30 minutes or more. Once throttled, **reducing pressure and waiting is the only effective recovery** — hammering retries only prolongs the block.

To diagnose a block, test `threads.com` alongside an unrelated site (e.g. `baidu.com`). Only threads failing → your egress IP is being throttled by Meta. Both failing → your proxy is down.

---

## How the real-time monitor works

A background thread inside the service loop-scrapes on the interval. Beyond the main path there are four safety nets:

- **Channel self-test** — one-click probe of whether the current proxy path can still obtain SSR pages, distinguishing "the scraper is broken" from "the egress is blocked"
- **Circuit breaker** — auto-pauses after 3 consecutive cycles with zero output. Zero output across a whole cycle means a channel-level failure, and retrying on the interval only deepens the ban
- **Whole-cycle watchdog** — laptop sleep freezes the scraping thread entirely (measured: stuck for 15.5 hours without returning), so there is a cycle-level timeout as a backstop
- **Stale-run cleanup** — after the process is killed, a run still marked `running` in the database is automatically flagged as interrupted

---

## Configuration

Every setting has a built-in default. Put overrides in `.env` in the project root (full list in `.env.example`).

```ini
RADAR_PORT=8650                        # service port
RADAR_INTERVAL_MINUTES=30              # scrape interval (minutes)
RADAR_SERP_TYPES=base,profile,recent   # scrape variants: more is broader but riskier
RADAR_MIN_INTERACTIONS=30              # initial value of the "min interactions" slider
RADAR_CYCLE_MAX_SECONDS=1800           # per-cycle time limit (watchdog)
RADAR_FAILURE_LIMIT=3                  # consecutive zero-output cycles before circuit break
RADAR_HOST=127.0.0.1                   # bind address, local-only by default
```

Changing the interval in the UI **writes it back to `.env`**, so the setting survives a restart.

### HTTP API

The service also exposes a JSON API so you can wire it into other tools:

| Method | Path | Description |
|---|---|---|
| GET | `/api/status` | Running state, statistics, recent logs |
| GET | `/api/posts?limit=&only_relevant=` | Post list |
| GET | `/api/authors?limit=&tier=` | Aggregated author leaderboard |
| GET | `/api/post/<code>` | Single post detail |
| GET | `/api/stream` | SSE event stream |
| GET | `/api/export?what=posts\|authors` | CSV export (UTF-8 BOM, opens cleanly in Excel) |
| POST | `/api/collect` | Run one scrape cycle now |
| POST | `/api/pause` `/api/resume` | Pause / resume |
| POST/DELETE | `/api/keywords` `/api/watchlist` | Add/remove keywords and watchlist entries |

---

## FAQ

**Q: It spins forever / scrapes zero posts?**
Click the "self-test" button in the UI. It tells you exactly which link failed: DNS, proxy tunnel, degraded user agent, or rate limiting.

**Q: The list shows far fewer rows than "N in database"?**
That's by design. The database count is everything scraped; the list by default shows only the part that is "relevant + has an image + meets the interaction threshold". Turn off the toggles to see everything.

**Q: Why is the velocity column all zeros?**
Velocity is computed by **comparing engagement growth between two consecutive scrapes**. Right after a database reset or a cold start, each post has only one snapshot, so it takes two cycles or more before velocity can be calculated.

**Q: Garbled Chinese characters?**
CSV export already writes a UTF-8 BOM, so Excel opens it correctly. If text is garbled elsewhere, check your terminal encoding (`chcp 65001` on Windows).

**Q: Can I deploy this on a server and leave it running?**
Yes, but note two things: ① `RADAR_HOST` defaults to `127.0.0.1` (local-only); exposing it requires explicitly setting `0.0.0.0` **and adding your own reverse proxy and authentication** — this project has no user system; ② your egress IP drives ban probability, and datacenter IPs are usually throttled more readily than residential ones.

---

## Known limitations

These are not bugs; they are the boundaries of the approach. Documented so you don't waste time on them:

1. **Search recall is capped; coverage can never be 100%.** Each query returns one page (~50–80 posts), and fresh zero-interaction posts inside communities (e.g. "AI Art") never make the candidate set. We tested searching a post's exact opening words: **0 results** — Threads search is **not a full-text index**, it is an algorithmic candidate set.
2. **Community pages are unreachable.** The "topic community pages" you see in a browser (with Hot/Recent tabs) are JS-rendered; headless SSR scraping receives a degraded result (measured: returned entirely unrelated posts). Covering them would require JS rendering plus a logged-in session, which directly conflicts with this project's "zero dependencies, no login" positioning.
3. **Freshly posted content is overwhelmingly noise.** In one measured cycle, newly ingested posts had a relevance rate of only **1.5%** (versus 34–59% for older posts). "Real-time" and "relevant" are inherently in tension — the zero-interaction gate removes most of it.
4. **A great many interactions reading 0 is normal.** Long-tail posts dominate; that is exactly what the "min interactions" slider is for.
5. **Depends on Threads' page structure.** If Meta reorganises how SSR data is emitted, the parsing logic has to follow. The comment block at the top of `collector.py` documents the field locations, so it's not hard to fix.
6. **Single machine, single process, no authentication.** Positioned as a personal tool you leave running on your own computer, not a multi-user service.

---

## Files

```
threads-ai-radar/
├── server.py          HTTP service + JSON API + static files
├── monitor.py         Background scheduling: interval scraping, self-test, circuit breaker, watchdog
├── pipeline.py        Orchestration of one cycle: scrape → relevance → score → store
├── collector.py       Collection layer: Googlebot UA, SSR page, inline JSON parsing
├── relevance.py       Relevance verdicts: pure keyword rules (blocked / relevant / offtopic)
├── scorer.py          Viral score and velocity
├── store.py           SQLite storage: schema, migrations, queries, author aggregation
├── config.py          Config loading (.env plus environment variables)
├── selftest.py        Self-test: runs the filter and leaderboard, prints rejected samples
├── refilter.py        Re-applies relevance to existing rows after editing keywords
├── start.bat          One-click start for Windows
├── requirements.txt   Empty — this project has zero third-party dependencies
├── keywords.txt       Monitored keywords (editable in the UI; writes back here)
├── blocklist.txt      Blocked terms (an outright exclusion when matched)
├── watchlist.txt      Accounts to follow
├── .env.example       Configuration example
├── data/
│   └── radar.db       SQLite database (ships with sample data so the UI works out of the box)
├── docs/              Screenshots used in this README
└── web/
    ├── index.html     Single-file frontend (no framework, no build step)
    └── i18n.js        Five-language dictionary and runtime (zh / en / zh-TW / ja / ko)
```

**The UI supports five languages**: 简体中文, English, 繁體中文, 日本語, 한국어. Switch in the top-right corner; the choice is stored in localStorage. All UI chrome is translated, but **post bodies, account names and group names are not** — those are data, not interface.

---

## About the author

If this saved you some time, you can buy me a coffee ☕; feel free to add me on WeChat too.

| Tip jar | WeChat | Official account |
|:---:|:---:|:---:|
| <img src="docs/reward-qr.jpg" width="180" alt="Tip jar"> | <img src="docs/wechat-qr.jpg" width="180" alt="WeChat"> | <img src="docs/wechat-mp-qr.jpg" width="180" alt="Official account"> |

The official account covers AI tools and prompt engineering.

---

## 社区

| [**Linux.Do**](https://linux.do) | Linux.Do — 与社区分享、讨论和跟踪发展 |

## License

[MIT](LICENSE) — use it, change it, redistribute it.

> ⚠️ Please use it responsibly. The built-in interval (30 minutes) and variant count (3) are configurations measured to avoid throttling. **Before speeding anything up, read the "Scrape variants and ban risk" section.** Aggressive scraping gets you banned and degrades the experience for everyone else.
