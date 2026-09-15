[**简体中文**](README.md) | **English**

# Threads Radar · Real-time Keyword Monitoring

Tracks public Threads posts matching keywords you care about, and turns them into a live leaderboard.

**Zero third-party dependencies — Python standard library only.** Install Python and run it; no `pip install` needed.

![License](https://img.shields.io/badge/License-MIT-blue.svg)
![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB.svg)
![Dependencies](https://img.shields.io/badge/dependencies-none-brightgreen.svg)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)

Three views answer three different questions:

| View | Question it answers |
|---|---|
| **Keyword radar** | which **post** is blowing up |
| **Peer monitoring** | who keeps producing hits (grouped by account + consistency tiers) |
| **Watchlist** | among **the accounts I follow**, who just posted something new |

Every view can export whatever you're currently looking at as CSV (opens cleanly in Excel).

### Highlights

- **Actually real-time**: a resident process collects on an interval, the page gets updates over SSE, and the leaderboard refreshes the moment a cycle finishes — no manual clicking
- **All four engagement metrics**: likes / replies / reposts / quotes — the official API doesn't give you these
- **Thumbnails**: images render in the list, card, and detail views, each post labelled text-only / single image / carousel / video — no need to open every post to judge what's trending
- **Velocity as its own column**: `interactions / hour`, so you see what's *rising*, not just what's historically big
- **Engagement growth curves**: every cycle writes a snapshot, so a post's growth is visible in its detail drawer
- **Channel health checks + circuit breaker**: failures are classified by actual cause, and repeated empty cycles stop the monitor instead of hammering a blocked exit
- **Zero dependencies**: only `urllib` / `sqlite3` / `http.server` / `threading`, so long-running sessions don't break on environment drift
- **Responsive in three tiers**: desktop / tablet / mobile — measured across 54 width×view combinations with no horizontal overflow

---

## Screenshots

> Captured from real runs. Post counts differ between shots because they were taken at different collection cycles.

| | |
|---|---|
| **Keyword radar**<br>which post is hot · stat cards + keyword management | **Peer monitoring**<br>who keeps producing hits · tiers + table/card views |
| ![Keyword radar](docs/radar.png) | ![Peer monitoring](docs/peers.png) |
| **Watchlist**<br>who I follow just posted something · new ones float to the top | **Post detail drawer**<br>media · score · velocity · growth curve · matched keywords |
| ![Watchlist](docs/watchlist.png) | ![Post detail](docs/post-drawer.png) |

---

## Contents

- [Quick start](#quick-start) · [Make sure threads.com is reachable](#make-sure-threadscom-is-reachable) · [Deploy / share with others](#deploy--share-with-others)
- [How it gets the data](#how-it-gets-the-data) (including the field-location trap)
- [How to write keywords](#how-to-write-keywords) · [Relevance filtering](#relevance-filtering) · [Scrape variants](#scrape-variants-pagination-effectively)
- [How real-time monitoring works](#how-real-time-monitoring-works) (responsive / health checks / circuit breaker / watchdog)
- [Peer / competitor monitoring](#peer--competitor-monitoring) · [Watchlist](#watchlist) · [CSV export](#csv-export)
- [Files](#files) · [HTTP API](#http-api) · [Scoring](#scoring) · [Configuration](#configuration)
- [FAQ](#faq) · [Known limitations](#known-limitations) · [About the author](#about-the-author) · [License](#license)

---

## Quick start

Requires **Python 3.10+**. No `pip install` (zero third-party dependencies).

```
double-click start.bat
```

Or:

```bash
python server.py
```

Then open **http://127.0.0.1:8650** in your browser.

The first collection cycle starts immediately, and subsequent cycles follow the configured interval.

### Make sure threads.com is reachable

This is **the one place people get stuck**. The tool scrapes with the standard-library `urllib`,
which picks up the `http_proxy` / `https_proxy` environment variables automatically — so if a
direct connection fails, configure a proxy using either method below.

**Option 1: put it in `.env`** (recommended — travels with the project)

```bash
cp .env.example .env          # Windows: copy .env.example .env
```

Then edit `.env`, uncomment, and set your own port:

```env
http_proxy=http://127.0.0.1:7890
https_proxy=http://127.0.0.1:7890
```

**Option 2: set environment variables** (temporary, in a Windows terminal)

```bat
set http_proxy=http://127.0.0.1:7890
set https_proxy=http://127.0.0.1:7890
```

> Where to find the port: Clash / v2rayN and similar clients expose an "HTTP port" or "mixed port".
> **Do not use a `socks5://` URL** — `urllib` does not support SOCKS proxies; you need the HTTP port.

Once configured, click **channel probe** in the top-right of the UI (`POST /api/probe`), or verify from the CLI:

```bash
python -c "from collector import probe_channel; print(probe_channel())"
```

> ⚠️ The proxy must stay on for collection to work. With it off, the channel reports 502 (`proxy_tunnel_502`).
> To diagnose, compare against `baidu.com` / `api.github.com`: if those two work and only `threads.com`
> fails → your exit IP is being rate-limited by Meta (lower the frequency; it self-heals in ~20 minutes);
> if all three fail → the proxy itself is down.
> Channel state and failure reasons are shown in the alert bar at the top of the UI.

---

## Deploy / share with others

**This is meant to be a single-machine personal monitoring console, not a public service.** It binds to
`127.0.0.1` by default. The simplest way to share it is to have the other person clone and run it.

```
git clone https://github.com/BaYue-SYJ/threads-ai-radar.git
cd threads-ai-radar
# configure your proxy (see the section above)
start.bat            # or: python server.py
```

Three things to know:

1. **No dependencies to install** — just Python. The database `data/radar.db` is created on first launch.
2. **Every machine collects its own data.** There are no accounts and no data sync. If two people want
   to watch the same leaderboard, point them at the same machine (see the next point).
3. **Don't expose it to the public internet.** The HTTP server has no authentication, so anyone who can
   reach the port can change your keywords and watchlist. For LAN sharing, bind to an internal address only:

   ```env
   RADAR_HOST=0.0.0.0        # or a specific internal IP such as 192.168.1.10
   ```

   Then restrict source IPs with a firewall. **Do not** port-forward it to the internet.

### About the `tools/` directory (optional)

`tools/` holds the **regression scripts** used while developing this project. They need Node:

| Script | Purpose | Requires |
|---|---|---|
| `check_e2e.cjs` | End-to-end regression: add/remove watchlist entries, stars, two-way navigation, CSV export — 39 assertions | puppeteer-core |
| `check_watch.cjs` | Responsive sweep: 18 widths × 3 views = 54 combinations, checking horizontal overflow and JS errors | puppeteer-core |
| `shots3.cjs` | Automated screenshots of the three views (desktop 1440 / tablet 1024 / mobile 390) | puppeteer-core |
| `scan_broken_modules.cjs` | Scans `node_modules` for packages whose entry file is missing | **none** |

**If you only want to use the tool, you can ignore this directory entirely.** To run the regressions:

```bash
npm i -D puppeteer-core
node tools/check_watch.cjs        # the server must be running
```

The scripts auto-detect Chrome; if that fails, point them at it with `CHROME_PATH` / `PUPPETEER_PATH`.

---

## How it gets the data

This is the single most important part of the project, so it comes early.

**The official Threads API is a dead end.** `keyword_search` requires Meta App Review; before approval it
only returns your own posts, and the response **does not contain** likes / replies / reposts / quotes at all.
A "trending radar" that can't get engagement data doesn't exist.

**What this project actually uses: a Googlebot UA plus server-side rendering.**

| Request | What comes back |
|---|---|
| Normal browser UA | a ~275KB SPA shell with **no post data whatsoever** |
| `Googlebot` UA | a **complete 1.0–1.9MB SSR page**, with post data inlined as JSON |

No login, no OAuth, no App Review, no cost — and all four engagement metrics are available.

### Field locations (the easiest trap when editing code)

The four metrics are **not at the same level**:

| Field | Location |
|---|---|
| `like_count` | **top level** of the post object |
| `direct_reply_count` | inside `text_post_app_info` — note it is **not** called `reply_count` |
| `repost_count` | inside `text_post_app_info` |
| `quote_count` | inside `text_post_app_info` |

To detect whether an object is a post, the condition must include `code` + `like_count` +
`text_post_app_info` all at once. Checking only the first two **stops at the outer level** and never
descends, so the last three fields all read as 0 — a trap I actually hit while developing this.

---

## How to write keywords

Edit `keywords.txt`, or add and remove them directly in the "monitored keywords" panel at the top of the UI.

```
[models]                  <- brackets define a group, used as the category in the UI
ChatGPT | GPT | chatgpt   <- pipes separate synonyms
AI prompt                 <- a space means AND
```

- **Space = AND**: `AI prompt` requires both "AI" and "prompt" in the body
- **Pipe = OR**: `ChatGPT | GPT` matches if either appears.
  **Only the first form is used for searching**; the rest are used for matching only. Plenty of posts say
  just `GPT` without the full name, so synonyms prevent misses.
- Hashtag concatenations are handled automatically: `#aiprompt` also matches `AI prompt`
- Short words like `ai` use approximate word-boundary matching, so they don't hit `said` or `available`

## Relevance filtering

Threads search is **semantic recall**, not "the body contains this word". Searching `AI prompt` returns
Indonesian engagement-farming posts and even politicians talking about AI regulation (one hit the top
with 11,168 likes).

So every cycle assigns each post a verdict:

| Verdict | Meaning |
|---|---|
| **relevant** | the body matches the keyword phrase, all effective words, or a synonym |
| **off-topic** | recalled by search, but the body isn't about the keyword |
| **blocked** | matched a noise term in `blocklist.txt` |

The **relevant only** toggle in the UI controls whether the latter two are shown; it's on by default.

**The relevant rate is inherently low — measured at roughly 4%.** That's a property of Threads search,
not a bug. Across 16,710 recalled posts on this machine, 730 were relevant (**4.4%**, snapshot from
2026-09-15). An extreme example: searching `Nano Banana` recalled 64 posts, of which **zero** contained
"banana" — they were all Indonesian "nano KOL" marketing posts, correctly filtered out.

> A low relevant rate doesn't make it useless: what gets filtered out is semantic noise, and what remains
> is a real match. To improve coverage, add keywords and variants rather than loosening the filter.

After changing keywords or blocklist terms, re-evaluate existing data without re-scraping:

```bash
python refilter.py
```

---

## Scrape variants (pagination, effectively)

The `serp_type` parameter on Threads search pages returns **different batches** of results. Fetching
several variants and merging them is effectively pagination — and more reliable than driving the internal
GraphQL API for a cursor (that path needs a real browser session's cookies and CSRF token; a bare POST
returns an HTML shell, and the `doc_id` rotates anyway).

**⚠️ Choose variants by "relevant posts produced", never by "raw count" — the two differ dramatically.**

Relevant posts each variant adds, measured against `base`:

| Keyword | base | recent | top | tag | **profile** | **default** |
|---|---|---|---|---|---|---|
| ChatGPT | 15 | +0 | +0 | +0 | **+17** | +9 |
| Nano Banana | 3 | +0 | +2 | +1 | **+13** | +7 |
| AI prompt | 21 | +6 | +0 | +1 | +0 | **+10** |

`recent` adds a lot of raw posts but they're **almost entirely semantic noise**; the real value is in
`profile` and `default`. I initially picked `base,recent,top` based on raw counts and ended up with the
two weakest variants — re-selecting by relevant posts produced the actual gains.

Three-variant results:

| | single variant | three variants | gain |
|---|---|---|---|
| total in DB | 980 | **3,865** | 3.9× |
| **relevant posts** | 136 | **415** | **3.1×** |
| accounts covered | 941 | 3,562 | 3.8× |
| time per cycle | ~2 min | ~7 min | 3.5× |

### ⚠️ Variant count is directly tied to ban risk (measured the hard way)

Three variants × 19 keywords = **57 requests per cycle**. After three full cycles, `threads.com` started
returning this to this machine's exit:

```
urllib.error.URLError: Tunnel connection failed: 502 Bad Gateway
```

Meanwhile `baidu.com` and `api.github.com` still returned 200 — so **it wasn't the proxy dying and it
wasn't Threads going down**, it was the exit IP being rate-limited by Meta. It recovered on its own after
about 20 minutes.

Conclusion: **for long-running deployments, stay at 2 variants or fewer** (the default `base,profile`) and
push the interval to 30 minutes or more. Once limited, the only effective recovery is to reduce pressure
and wait — hammering it only extends the block.

> Diagnosing problems like this requires comparing channels first: check `baidu.com` / `api.github.com`
> to distinguish "the proxy is broken overall" from "a single target is rate-limiting you".

---

## How real-time monitoring works

When `server.py` starts, it spins up a background scheduler thread:

- collects all keywords on a fixed interval (15 minutes by default)
- inserts **random jitter** of 1.8–4.2 seconds between keywords, so a fixed rhythm doesn't trip the rate limiter
- the page receives updates over **SSE** (`/api/stream`), syncing state every 2 seconds and refreshing the
  leaderboard as soon as a cycle finishes
- every cycle writes an engagement snapshot to the `snapshots` table, which powers the growth curve in the detail drawer

What the UI shows:

- a live status dot in the nav bar: **monitoring / collecting / paused / channel error**
- a countdown to the next cycle
- a progress bar like `7/19 · Midjourney`
- a scrolling collection log (including alerts)
- a **NEW** badge on freshly ingested posts

### Responsive

All three views adapt across desktop / tablet / mobile; measured across **18 widths (390–1680px) × 3 views
= 54 combinations with no horizontal overflow**:

<p align="center">
  <img src="docs/mobile.png" width="380" alt="Mobile keyword radar">
</p>

| Breakpoint | Nav bar | Peer table | Watchlist table |
|---|---|---|---|
| ≥1181px | single row | all 11 columns | all columns |
| 1081–1180px | tighter spacing | hides hit rate / avg interactions / best score (hit rate is derivable from post count) | hides focus area (width goes to the note instead) |
| ≤1080px | actions wrap to a second row | same as above | same as above |
| ≤860px | same as above | switches to **card view** by default; if you switch to the table manually it scrolls inside its container (columns are never silently clipped) | same as above; forms stack full-width |

> War story: adding the third tab (watchlist) pushed the nav bar's minimum content width to **1078px**.
> Wrapping only kicked in at 860px, so **at 1024px the right-hand controls were pushed 54px off screen** —
> desktop and mobile were both fine, and only the middle range was broken, which is easy to miss.
> The current approach is to move the whole row down rather than keep compressing spacing; compressing
> any further makes the buttons bunch up.
>
> Another trap: an overflow check based on **`getBoundingClientRect().right > clientWidth` counts
> closed drawers as overflow** — they're moved off screen with `translateX(101%)`. The detection script
> has to exclude drawers or every width reports a false positive. The more reliable test is
> `documentElement.scrollWidth > clientWidth`.

### Health checks and channel probe

Every fetch validates "response ≥ 400KB and ≥ 5 posts parsed"; anything less is flagged as abnormal.

But a size check alone isn't enough — **"fetched but the page has no data" and "the link is down
entirely" are different things**. The former just needs the scraper restarted; the latter only deepens
rate-limiting if retried hard. So failures are classified by cause:

| reason | Meaning | What to do |
|---|---|---|
| `proxy_tunnel_502` | proxy tunnel 502, exit rejected | lower frequency + wait |
| `rate_limited` | HTTP 429 | fewer variants, longer interval |
| `connect_timeout` | direct connection blocked | route through a working proxy |
| `tls_reset` | TLS reset by an intermediary | switch links |
| `gateway` | upstream 5xx | usually self-heals |
| `empty_shell` | page fetched but no SSR | UA was downgraded; check whether `RADAR_USER_AGENT` was changed |

Clicking **probe** in the nav bar, or calling `/api/probe`, sends a **single** request to determine
channel state quickly instead of waiting for a whole cycle.

![Channel error alert](docs/channel-alert.png)

The screenshot above is the real UI when the exit was rate-limited: the red bar at the top gives the
**specific cause** (`proxy_tunnel_502`) and an **actionable suggestion** (wait a while, or reduce the
variant count) rather than just logging "page error". The nav status dot also switches to "channel error".

### Circuit breaker

If a **whole cycle produces nothing** (not one post across all 19 keywords), that points to a channel-level
failure rather than every keyword being empty. **Three consecutive** such cycles **automatically pause
monitoring** and explain why in the log — instead of continuing to hammer a blocked exit on a schedule.

### Whole-cycle watchdog

Each cycle has a **hard time limit** (`RADAR_CYCLE_MAX_SECONDS`, default 1800s = 30 minutes). When it's
hit, the cycle aborts and the log records which keyword it stopped at and why.

Why this is needed: **laptop sleep freezes the collection thread**. In one measured case the machine
slept after the 7th keyword and the thread sat there for **15.5 hours** without returning (per-request
socket timeouts don't necessarily survive a sleep), blocking the next cycle the whole time. The watchdog
checks for timeout before each keyword, so once the machine wakes the cycle wraps up immediately and the
next one can start normally.

When a cycle aborts early, `keywords_done` records the **actual number completed** (e.g. `9/19`) rather
than claiming everything finished.

### Cleaning up orphaned runs

If the process is killed (or the watchdog aborts a cycle), the run record stays at `running`. On startup
these are swept automatically and marked `error / process interrupted, cycle incomplete` — otherwise the
UI would show "collecting" forever and look stuck.

---

## Peer / competitor monitoring

The keyword leaderboard answers "**which post is hot**"; the peer leaderboard answers "**who keeps
producing hits**". The latter requires grouping by author, and it's the real differentiator of this
project — competitor monitoring is about people and methods, not individual posts.

The second tab, **Peer monitoring**, groups relevant posts by author:

- **Tiers**, assigned automatically by consistency — this is what you actually filter on

  | Tier | Condition | Meaning |
  |---|---|---|
  | Core | posts ≥ 3 and hits ≥ 2 | stable method, worth long-term tracking |
  | Steady | posts ≥ 2 | consistent output |
  | Single hit | posts = 1 and hits ≥ 1 | possibly luck |
  | Casual | everything else | one-off appearance |

  (a "hit" = a single post with ≥ 500 interactions; the threshold lives in `store.HIT_THRESHOLD`)

- **Each row shows**: relevant posts, hits, hit rate, total interactions, average per post, best score, focus area, last active
- **Click any account** to open a drawer: tier, posting cadence (~N posts/week), focus area, matched keywords, and all of that account's relevant posts
- **Sorting**: hits / relevant posts / total interactions / average per post / hit rate / best score / best likes / new this cycle

### Why consistency filtering is essential

With little data, most accounts appear only once. In the first measured cycle, out of 391 authors:

```
posts >= 1: 391        posts >= 2: 14        posts >= 3: 5
tiers: core 1 / steady 13 / single hit 50 / casual 327
```

**96% of accounts are one-off appearances.** Sorting purely by hits would fill the leaderboard with
single-post authors and tell you nothing about who's worth tracking. So there's a "steady output only
(≥2 posts)" toggle by default, and each tier has its own default sort field.

The UI shows sample depth at the top, making clear that few "steady" accounts means not enough cycles yet
rather than a broken feature. **Run it for a while and the leaderboard becomes genuinely informative** —
which is exactly why the account dimension needs time to accumulate.

---

## Watchlist

The peer leaderboard is "a ranking swept from the whole site"; the watchlist is "**the people I've
specifically decided to track**". These need different interfaces: the former should be complete and
sortable so you can find patterns; the latter should be short and immediately show who just posted.

The third tab, **Watchlist**, with three ways to add accounts:

- the **☆** on each row/card of the peer page (both table and card views)
- the input at the top of the watchlist page — paste `@xxx`, `xxx/`, an entire profile URL, or a post URL
- edit `watchlist.txt` directly as `account | note`; it's read on startup

Once followed:

- **accounts with new posts float to the top** with a blue `+N` badge; the header reads "following N / N with new posts / N new posts total"
- a "new posts only" toggle, plus sorting by new this cycle / total interactions / hits / relevant posts / last active
- the note is always visible (its own column) — recording *why* you follow someone beats recording their handle
- clicking an account name opens the same drawer with all their relevant posts, where you can also follow/unfollow
- the list is written back to `watchlist.txt`, with the **database as source of truth and the file as a mirror**, so the UI can't corrupt the file

> Following only means "keep an eye on this one" — **it is not a collection switch**. An account needs to
> be matched by a keyword before it has any data. Accounts that haven't been ingested yet show
> `has_posts=false` and a row of zeros instead of disappearing from the list — otherwise you'd think
> following silently failed.

### Post ⇄ account two-way navigation

The post detail drawer has "see all relevant posts from @xxx →", and the account drawer links any post
back to its detail view. Both directions swap content **inside the same drawer** rather than stacking
routes, so bouncing back and forth never creates a history-stack conflict.

![Account detail drawer](docs/author-drawer.png)

The account drawer lays everything out at once: relevant posts, hits, total and average interactions,
focus area, matched keywords, and the full list of relevant posts. The **Follow this account** button in
the top-right adds it to the watchlist in one click, after which you can track its new posts in the
Watchlist tab.

---

## CSV export

Each of the three views has an "export CSV" button (keyword radar / peer monitoring / watchlist).

What you get is **exactly what's on screen** — filters, search terms, and sort order included. Filtering
down to a subset and then getting the full dataset is the kind of inconsistency that makes people angry.

Two details exist for Excel's sake; miss either one and Chinese text is garbled:

- a UTF-8 BOM (`\ufeff`) at the start. Without it Excel decodes as GBK and every Chinese column turns to mojibake
- `\r\n` line endings throughout, so neither Notepad nor Excel collapses the table into one line

There's also a server-side `/api/export` (below) returning the same BOM/CRLF format, suited to bulk
exports and scripted use — not limited to the 3,000 rows the browser keeps in memory.

---

## Files

| File | Purpose |
|---|---|
| `server.py` | HTTP service: static page + JSON API + SSE push |
| `monitor.py` | Background scheduler thread: timed collection, pause/resume, progress reporting |
| `pipeline.py` | Orchestrates one cycle: fetch → judge → score → store |
| `collector.py` | Fetch layer: Googlebot UA + SSR parsing |
| `relevance.py` | Pure keyword relevance judging (supports AND / OR / concatenation / blocklist) |
| `scorer.py` | Hit scoring and category assignment |
| `store.py` | SQLite storage layer |
| `selftest.py` | Self-check: inspects recall quality and filter behaviour without writing to the DB |
| `refilter.py` | Recompute: re-judge existing data after changing keywords |
| `keywords.txt` | Keyword table (the UI reads and writes it) |
| `blocklist.txt` | Noise/blocklist terms |
| `watchlist.txt` | **Watchlist** (the UI reads and writes it; database is source of truth, file is a mirror) |
| `web/index.html` | Frontend (single file) |
| `docs/` | Screenshots used by the README |
| `tools/` | Development regression scripts (optional, needs Node — see the deploy section) |
| `README.md` | Chinese documentation (switchable from the top) |
| `LICENSE` | MIT |

Database: `data/radar.db`, with five tables — `posts` / `snapshots` / `runs` / `keywords` / `watchlist`.

> **Upgrading from an older version needs nothing from you — overwrite the files and restart.** On startup
> the app adds the `thumb` column to `posts` and corrects the existing `has_image` values
> (an `ALTER TABLE` plus one `UPDATE`; idempotent, deletes nothing). The one thing that can't be conjured
> back is the thumbnail URL of old posts — it was never stored, so it backfills only when those posts get
> collected again.

### HTTP API

| Method | Path | Description |
|---|---|---|
| GET | `/api/status` | Runtime state: progress, next cycle, channel state, stats, log |
| GET | `/api/posts?limit=&only_relevant=` | Post list |
| GET | `/api/post/<code>` | Single post detail + engagement growth curve |
| GET | `/api/authors?min_posts=&tier=&sort=&limit=` | **Peer leaderboard**, including `coverage` sample depth |
| GET | `/api/author/<username>` | **One account's relevant posts** |
| GET | `/api/watchlist` | **Watchlist**, with per-account aggregates and a `summary` |
| GET | `/api/export?what=posts\|authors&only_relevant=&limit=` | **CSV export** (UTF-8 BOM + CRLF, opens directly in Excel) |
| GET | `/api/keywords` | Keyword table |
| GET | `/api/runs` | Collection history |
| GET | `/api/stream` | SSE push (state / log / progress) |
| POST | `/api/collect` | Collect now |
| POST | `/api/pause` · `/api/resume` | Pause / resume |
| POST | `/api/interval` | Change the collection interval (`{"minutes": 30}`) |
| POST | `/api/probe` | **Channel probe** (one request to check whether the link works) |
| POST | `/api/keywords` | Add a keyword |
| POST | `/api/watchlist` | **Follow** (`{"username":"@xxx","note":"..."}`; the handle is normalized) |
| POST | `/api/seen` | Clear all NEW markers |
| DELETE | `/api/keywords?keyword=` | Delete a keyword |
| DELETE | `/api/watchlist?username=` | **Unfollow** |

Account handles in `/api/watchlist` are normalized: `@Xxx`, `https://www.threads.com/@Xxx/?hl=zh`, and
`threads.net/@Xxx/` all collapse to lowercase `xxx`. Without normalization, `@SomeOne` and `someone`
would show up as two separate rows.

Every post from `/api/posts` and `/api/post/<code>` carries three media fields:
`media_type` (`19` = text-only / `1` = single image / `8` = carousel / `2` = video),
`has_image`, and `thumb` (the thumbnail URL, `null` when there is no image).
**A video post has `media_type` `2`, but its thumbnail is the cover frame** — so "has an image"
does not mean "is an image post". Use `media_type` to tell post types apart.

`sort` for `/api/authors` accepts `hits` / `posts` / `interactions` / `avg_interactions` / `hit_rate` /
`best_score` / `best_likes` / `new_count`. When omitted, a per-tier default applies — core/steady tiers
sort by hit count and output, single-hit tier by individual impact.

`limit` for `/api/export` caps at 20000 (default 5000); `what` only recognizes `authors`, anything else
is treated as `posts`.

---

## Scoring

The formula below uses real data for all four engagement metrics:

```
score = (1.0*ln(likes) + 2.5*ln(replies) + 3.0*ln(reposts) + 3.0*ln(quotes))
      * AI relevance weight (1.25 / 1.0)
      * time decay (1/sqrt(1 + hours/24))
```

**Velocity** is tracked separately as `interactions / hour`. A trending radar should really surface
*rising* posts rather than old ones with high historical totals, so it gets its own sort option.

---

## Configuration

Copy `.env.example` to `.env` and edit as needed; every setting has a default.
**Changing the interval in the UI writes back to `.env`**, so it survives restarts.

> The proxy settings (`http_proxy` / `https_proxy`) also live in `.env` — see
> [Make sure threads.com is reachable](#make-sure-threadscom-is-reachable) above.

The ones people change most:

```env
RADAR_INTERVAL_MINUTES=30          # collection interval (minutes)
RADAR_PORT=8650                    # service port
RADAR_SERP_TYPES=base,profile      # scrape variants; more is more complete but riskier
RADAR_CYCLE_MAX_SECONDS=1800       # per-cycle time limit (watchdog)
RADAR_FAILURE_LIMIT=3              # tripping the breaker after N empty cycles
```

> ⚠️ Don't change `RADAR_USER_AGENT`. A normal browser UA returns a shell page and breaks collection entirely.

---

## FAQ

**The page loads but there's no data at all / it keeps reporting a failed collection.**

Check the `reason` in the alert bar at the top. The two most common cases:

- no proxy running → a direct connection to `threads.com` fails (the default situation in mainland China)
- proxy running but the exit is rate-limited by Meta (`proxy_tunnel_502`) → lower the frequency and wait ~20 minutes for it to self-heal

Clicking **probe** in the nav bar sends a single request to check the channel, without waiting for a cycle.

**How do I tell "the proxy died" from "only Threads is rate-limiting me"?**

Compare against `baidu.com` / `api.github.com`: if those two work and only `threads.com` fails → the exit
is being rate-limited; if all three fail → the proxy itself is broken. **This distinction matters**, or
you'll waste time digging through code.

**Port 8650 is in use.**

Change `RADAR_PORT` in `.env`, or set it temporarily with `set RADAR_PORT=8660`.

**Too few relevant posts.**

Threads search is semantic recall, so the relevant rate is inherently 4–5%. That's the platform, not a
bug. The most effective way to widen coverage is **more keywords** and **more variants**
(`RADAR_SERP_TYPES`) — not loosening the filter, which only adds noise.

**Most accounts on the peer leaderboard appeared only once, so it looks pointless.**

That's normal. In the first cycle, 96% of authors had exactly one relevant post. A "steady output"
leaderboard needs **a dozen or so cycles** to take shape; leave it running for a few days and it looks
completely different.

**I changed `keywords.txt` but existing data didn't get re-categorized.**

Keywords only affect **new** collections. To re-judge existing data:

```bash
python refilter.py
```

**Where is the data stored? How do I back up or migrate it?**

Everything is in the single SQLite file `data/radar.db` — just copy it (copying the `-wal` file too is
safer). When moving machines, bring `.env` as well (it holds settings you changed, such as the interval).

**Can it monitor X / Instagram / Xiaohongshu?**

No — this project is Threads only. Scraping a different platform is an entirely different problem, not a
configuration change.

**Will collection affect my Threads account?**

**No.** It requires no login and uses the public search page with a Googlebot UA, never touching your
account. However, **your exit IP can be rate-limited**: measured at 3 variants × 19 keywords, three cycles
in a row triggered a 502 (self-healing in ~20 minutes). For long-running deployments, stay at ≤2 variants
with an interval ≥30 minutes.

**Does the UI show post images?**

Not in the current version — see [Known limitations #10](#known-limitations). It's a known gap, planned for
a later release.

---

## Known limitations

1. **No real pagination cursor.** Replaced by multi-variant scraping (see above): roughly 110–130 deduplicated results per keyword, a 3.1× increase in relevant posts. True pagination would require the internal GraphQL `doc_id` plus a real browser session — expensive, and the `doc_id` rotates.
2. **The relevant rate is inherently low**: 730 of 16,710 posts measured on this machine, about **4.4%** (2026-09-15 snapshot). Threads search is semantic matching, so it returns plenty of posts that merely brush against a word (searching `AI art` returns anything mentioning art). Adding keywords and variants improves coverage more than tuning the filter.
3. **Many posts have zero interactions**: long-tail posts dominate, which is what the "min interactions" slider exists for.
4. **The UA strategy is a workaround**, not a public Meta contract, and can tighten at any time. **Scraping too fast triggers exit rate-limiting** (3 variants for 3 cycles measured a 502, self-healing in ~20 minutes). Alerting, the channel probe, and the circuit breaker are the defenses.
5. **`detected_language` is unreliable**: **81%** of relevant posts have NULL (45% across the whole DB), so it can't be used for language filtering. Filtering by language means inspecting the body yourself.
6. Categories come from the groups in `keywords.txt`; anything unmatched lands in "ungrouped".
7. Each cycle takes roughly 2 minutes per variant × number of keywords. If the keyword count grows a lot, raise the interval too, or cycles will pile up.
8. **The peer dimension needs time.** In the first cycle only 14 of 391 authors had ≥2 relevant posts; the other 96% appeared once. For the "steady output" leaderboard to mean anything, run at least a dozen cycles.
9. **Cold start for new accounts/posts**: `velocity` (interactions/hour) has only one snapshot on first collection, so the curve needs a second cycle to take shape.
10. **`has_image` is always 1 and the UI shows no images — fixed, but thumbnails for existing rows need backfilling.**
    This was a real bug, fixed in this release. But **old rows in an existing database can't be conjured out of
    nothing**, so three separate things:

    - **Write path (fixed)**: the old test was `bool(raw.get("image_versions2"))`, but Threads returns that key
      on **every** post — including text-only ones, where its value is the empty shell `{"candidates": []}` — so
      the boolean was always true. Measured: all 19,963 / 19,963 rows were flagged "has image". It now reads
      `bool((raw.get("image_versions2") or {}).get("candidates"))`. Cross-checked on a fresh 52-post sample:
      all 33 posts with `media_type=19` (text-only) have no image, and all 19 with `1`/`8`/`2`
      (single image / carousel / video) do — 100% consistent.
    - **Existing `has_image` values (fixed)**: a data migration runs once at startup
      (`UPDATE posts SET has_image=0 WHERE media_type=19 AND has_image=1`). It is idempotent and deletes
      nothing. Measured: it flipped 13,247 text-only posts back to "no image", taking `has_image=1` from
      19,966 down to 6,719 out of 19,968 rows (33.6%).
    - **Thumbnails (new, new posts only)**: the `posts` table gained a `thumb` column, and the list, card, and
      detail drawer all render it; CSV export includes it too. But **`thumb` is empty on old rows** — no URL was
      ever stored, so there is nothing to recover. It backfills as those posts get collected again (the write
      uses `COALESCE`, so existing good values are never erased). To see thumbnails everywhere immediately,
      delete `data/radar.db` and run one cycle.

---

## About the author

The author is **Shuixian (水仙)**, working on AI prompts and social media operations. Everything below is
**free to use**.

### Free prompt library

**5,000+** AI art / image-generation prompts, free and public, no sign-up:

- Primary → **<https://prompt.qqsrc.com/>**
- Mirror → **<https://prompt.shuixai.me/>**

### WeChat Official Account

**水仙的 AI 提示词** — prompt templates, hands-on AI tool reviews, and content operations methods.

<p align="center">
  <img src="docs/wechat-mp-qr.jpg" width="300" alt="WeChat Official Account QR code: 水仙的 AI 提示词">
</p>

### Related projects

| Project | Description |
|---|---|
| [**shuixian-manju-skills**](https://github.com/BaYue-SYJ/shuixian-manju-skills) | Shuixian's 6-piece short-drama kit: a skill set taking a novel to a finished short drama (inspired by shuohao-skills) |
| [**shuixian-prompts**](https://github.com/BaYue-SYJ/shuixian-prompts) | Source code for the free prompt site above |
| [**zimeiti-workbuddy**](https://github.com/BaYue-SYJ/zimeiti-workbuddy) | Creator Buddy: an end-to-end creation skill toolkit for Official Accounts / Xiaohongshu / short video |
| [**web-html-image-skill**](https://github.com/BaYue-SYJ/web-html-image-skill) | web-image: render images with HTML/CSS instead of an image model, 32 preset styles |

### Contact / support

If the radar gives you trouble, or you want to talk prompts and content creation, reach out.

| WeChat | Support |
|---|---|
| <img src="docs/wechat-qr.jpg" width="260" alt="WeChat QR code"> | <img src="docs/reward-qr.jpg" width="260" alt="Tip QR code"> |
| Scan to add me — AI prompts and content creation | If this helped, you can buy me a coffee ☕ |

> Before asking, please skim the [FAQ](#faq) above — the vast majority of "no data" reports are a missing
> proxy or a rate-limited exit, both of which you can check yourself in two steps.
> If it really is a bug, include the `reason` from the alert bar at the top of the UI and diagnosis goes
> much faster.

---

## License

[MIT License](LICENSE) © 2026 BaYue-SYJ

Free to use, modify, distribute, and use commercially, as long as the copyright and license notice are
kept. This project is intended for learning and personal research — please respect Threads / Meta's terms
of service and control your scraping frequency.
