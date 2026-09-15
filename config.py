"""
配置中心。所有路径基于 __file__ 解析为绝对路径，
避免「不在项目根目录执行就崩」的老问题。

无需第三方依赖：自带极简 .env 解析，不引入 python-dotenv。
"""
from __future__ import annotations

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
WEB_DIR = BASE_DIR / "web"
DB_PATH = DATA_DIR / "radar.db"
# 刻意不用 YAML/JSON 存关键词：纯文本行格式无需任何第三方库即可读写，
# 用记事本就能改，界面也能直接增删。
KEYWORDS_PATH = BASE_DIR / "keywords.txt"
BLOCKLIST_PATH = BASE_DIR / "blocklist.txt"
# 关注名单：盯固定几个竞对，与「监控什么词」是两个正交维度，单独存文件
WATCHLIST_PATH = BASE_DIR / "watchlist.txt"
LOG_PATH = DATA_DIR / "radar.log"

DATA_DIR.mkdir(parents=True, exist_ok=True)


ENV_PATH = BASE_DIR / ".env"


def _load_env() -> None:
    """读取同目录 .env，已存在的环境变量不覆盖。"""
    if not ENV_PATH.exists():
        return
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key, value = key.strip(), value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def save_env(key: str, value: str) -> None:
    """把一项配置写回 .env 并立即生效。

    为什么需要：采集间隔这类设置如果只存在内存里，重启就丢了——
    对「长期挂机的实时监控」来说，改完隔天开机发现又变回默认值，
    很容易让人以为「设置没生效」。
    """
    os.environ[key] = str(value)
    lines = ENV_PATH.read_text(encoding="utf-8").splitlines() if ENV_PATH.exists() else []
    out, replaced = [], False
    for line in lines:
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and "=" in stripped:
            if stripped.split("=", 1)[0].strip() == key:
                out.append(f"{key}={value}")
                replaced = True
                continue
        out.append(line)
    if not replaced:
        out.append(f"{key}={value}")
    ENV_PATH.write_text("\n".join(out).rstrip("\n") + "\n", encoding="utf-8")


_load_env()

# ---- 服务 ----
HOST = os.getenv("RADAR_HOST", "127.0.0.1")
PORT = int(os.getenv("RADAR_PORT", "8650"))

# ---- 采集 ----
# Googlebot UA 是触发 Threads 服务端渲染的关键；换普通 UA 会拿到空壳页面。
USER_AGENT = os.getenv(
    "RADAR_USER_AGENT",
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
)
# 实时监控的采集间隔（分钟）
INTERVAL_MINUTES = float(os.getenv("RADAR_INTERVAL_MINUTES", "15"))
# 每个关键词之间的抖动间隔（秒），避免固定频率触发风控
JITTER_MIN = float(os.getenv("RADAR_JITTER_MIN", "1.8"))
JITTER_MAX = float(os.getenv("RADAR_JITTER_MAX", "4.2"))
REQUEST_TIMEOUT = int(os.getenv("RADAR_REQUEST_TIMEOUT", "45"))
RETRIES = int(os.getenv("RADAR_RETRIES", "2"))
# 是否启动时立即采集一次
COLLECT_ON_START = os.getenv("RADAR_COLLECT_ON_START", "1") not in ("0", "false", "False")

# SearchResultPage 的变体。各变体返回的是**不同批次**的结果，多取几个相当于翻页。
#
# ⚠ 选变体要看「相关帖产出」，不是「原始条数」——两者差异极大。
#   实测（base 为基准，数字为各自**新增的相关帖数**）：
#
#     关键词        base   recent   top    tag    profile   default
#     ChatGPT         15      +0     +0     +0      +17       +9
#     Nano Banana      3      +0     +2     +1      +13       +7
#     AI prompt       21      +6     +0     +1       +0      +10
#
#   → profile 与 default 是主力，recent / top / tag 近乎零贡献。
#   默认取 base,profile,default：相关帖从 39 条提到 105 条（约 2.7 倍），耗时约 3 倍。
#   （只看原始条数会误判：recent 原始新增很多，但几乎全是语义噪音。）
#
# 取值：base 表示不带 serp_type 参数；全部可用：base,recent,top,tag,profile,default
#
# ⚠ 变体数与封禁风险直接相关。3 变体 × 19 词 = 57 请求/轮，实测连续三轮后
#   threads.com 对出口返回 502（代理隧道被拒），其余站点仍正常 —— 即被风控。
#   长期挂机建议 2 个变体以内（base,profile），把间隔拉到 30 分钟以上。
#   一旦被限，降低压力并停一段时间是唯一有效的恢复方式。
SERP_TYPES = [s.strip() for s in
              os.getenv("RADAR_SERP_TYPES", "base,profile").split(",") if s.strip()]

# 连续多少轮「整轮零产出」后自动暂停。整轮零产出说明是通道级故障
# （出口被封 / 链路不通），继续按间隔重试只会加深封禁。
FAILURE_LIMIT = int(os.getenv("RADAR_FAILURE_LIMIT", "3"))

# 单轮采集的硬上限（秒）。到点就中止本轮，让下一轮能正常开始。
# 为什么需要：笔记本休眠会让采集线程整个冻住（实测卡了 15.5 小时没返回），
# 单个请求的 socket 超时跨休眠未必生效，所以必须有一层「整轮」级别的兜底。
CYCLE_MAX_SECONDS = int(os.getenv("RADAR_CYCLE_MAX_SECONDS", "1800"))

# ---- 评分与展示 ----
TOP_N = int(os.getenv("RADAR_TOP_N", "300"))
# 低于此互动量的帖子视为长尾，前端默认过滤掉（可在界面调整）
MIN_INTERACTIONS_DEFAULT = int(os.getenv("RADAR_MIN_INTERACTIONS", "10"))

# ---- 数据保留 ----
# 快照最多保留天数，避免库无限膨胀
SNAPSHOT_RETENTION_DAYS = int(os.getenv("RADAR_SNAPSHOT_RETENTION_DAYS", "60"))
