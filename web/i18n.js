/* ============================================================================
   Threads 爆款雷达 · 前端多语言字典
   ----------------------------------------------------------------------------
   支持五种语言：简体中文 / English / 繁體中文 / 日本語 / 한국어
   术语与仓库内五份 README 保持一致。

   用法：
     T('key')                    取当前语言的词
     T('key', {n: 12})           取词并替换 {n} 占位符
     setLang('ja')               切换语言（会整页重渲染并写入 localStorage）

   约定：
     · 帖子正文、账号名、分组名、接口返回的错误原文 —— 一律不翻译。
       「分组」是用户在 keywords.txt 里自己写的词（模型 / 生图 / 提示词…），
       翻译它会让同一份数据在不同语言下对不上号。
     · <html lang> 会同步更新，方便浏览器做字体回退与断行。
   ============================================================================ */
(function (global) {
  'use strict';

  /* 下面 T() 里会多次比对首字符，缓存成常量避免重复建正则 */
  var CJK_CODES = ['zh', 'zh-TW'];

  var DICT = {

  /* ======================= 简体中文 zh ======================= */
  zh: {
    _name: '简体中文',
    _label: '语言',

    /* --- 品牌 / 导航 --- */
    'brand': '爆款雷达',
    'brand_sub': 'Threads · 实时关键词监控',
    'tab_radar': '关键词雷达',
    'tab_peers': '同行监控',
    'tab_watch': '关注名单',
    'lang_label': '语言',

    /* --- 状态 --- */
    'state_connecting': '连接中…',
    'state_monitoring': '监控中',
    'state_collecting': '采集中…',
    'state_channel_bad': '通道异常',
    'state_paused': '已暂停',
    'state_paused_fuse': '已熔断暂停',
    'state_disconnected': '连接断开，重试中…',
    'next_run': '下次采集',
    'interval_title': '采集间隔',
    'interval_5': '每 5 分钟',
    'interval_10': '每 10 分钟',
    'interval_15': '每 15 分钟',
    'interval_30': '每 30 分钟',
    'interval_60': '每 1 小时',
    'interval_180': '每 3 小时',
    'btn_probe': '自检',
    'btn_probe_title': '自检抓取通道',
    'btn_probe_ing': '自检中…',
    'btn_probe_channel': '通道自检',
    'btn_pause': '暂停',
    'btn_resume': '恢复',
    'btn_collect': '立即采集',
    'prog_running': '正在采集',
    'alert_channel_bad': '抓取通道异常',
    'alert_channel_bad_reason': '抓取通道异常：{reason}',
    'alert_channel_bad_fails': '（连续 {n} 轮 0 条）',
    'alert_channel_hint': '<br>排查看：<code>/api/probe</code> 自检、代理是否可达 threads.com、是否该降低抓取频率（减少 serp_type 变体数）。',
    'alert_auto_paused': '已因通道故障自动暂停',
    'alert_auto_paused_body': '连续多轮抓不到数据，为免加深封禁已自动停采。排查后点「恢复」继续。',

    /* --- 统计卡 --- */
    'stat_relevant': '相关帖子',
    'stat_authors': '覆盖账号',
    'stat_authors_note': '按作者去重',
    'stat_inter': '总互动量',
    'stat_inter_note': '赞 + 回 + 转 + 引',
    'stat_new': '本轮新增',
    'unit_posts': '条',
    'unit_accounts': '个',
    'stat_total_note': '库内共 {total} 条（无关 {offtopic} / 屏蔽 {blocked}）',
    'stat_top': '最高分 @{user} {score}',
    'stat_empty': '暂无数据',
    'kw_count': '{n} 个',

    /* --- 关键词面板 --- */
    'panel_keywords': '监控关键词',
    'kw_ph': '新增关键词，用 | 分隔同义词',
    'kw_group_ph': '分组（可选）',
    'btn_add': '添加',
    'kw_hint': '空格 = AND，竖线 = OR 同义词。例：<code>ChatGPT | GPT | #chatgpt</code> —— 只用第一个写法去搜索，命中任意一个即算相关。<br>修改会写回 <code>keywords.txt</code>，下一轮采集生效。',
    'kw_empty': '还没有关键词，在下面添加',
    'kw_del_title': '删除',
    'kw_del_confirm': '删除关键词「{kw}」？',
    'kw_add_failed': '添加失败',
    'kw_no_data': '暂无关键词数据',

    /* --- 日志面板 --- */
    'panel_log': '采集日志',
    'log_live': '实时',
    'log_waiting': '等待数据…',
    'log_empty': '暂无日志',

    /* --- 筛选区 --- */
    'flt_group': '分组',
    'flt_keyword': '关键词',
    'flt_filter': '筛选',
    'flt_tier': '分层',
    'flt_only_relevant': '仅看相关',
    'flt_only_multi': '只看持续产出（≥2 帖）',
    'flt_only_new': '只看有新帖',
    'flt_view_card': '卡片',
    'flt_view_table': '表格',
    'flt_search_posts': '搜索正文或作者…',
    'flt_search_authors': '搜索账号、主攻方向或关键词…',
    'flt_search_watch': '搜索账号、备注或主攻方向…',
    'flt_min_inter': '最低互动',
    'flt_sort': '排序',
    'btn_reset': '重置',
    'btn_export': '导出 CSV',
    'btn_export_posts_title': '把当前筛选结果导出为 CSV，可直接用 Excel 打开',
    'btn_export_authors_title': '把当前同行榜导出为 CSV，可直接用 Excel 打开',
    'btn_export_watch_title': '导出为 CSV，可直接用 Excel 打开',
    'unit_results': '条结果',
    'meta_posts': '条结果 / 库内 {n} 条',
    'meta_authors': '个账号 / 载入 {n} 个',
    'meta_watch': '个关注账号 / 名单共 {n} 个',

    /* --- 排序项：帖子 --- */
    'sort_score': '爆款评分',
    'sort_velocity': '上涨速度',
    'sort_likes': '点赞数',
    'sort_replies': '回复数',
    'sort_reposts': '转发数',
    'sort_taken': '最新发布',
    'sort_seen': '最新入库',
    /* --- 排序项：同行 --- */
    'sort_hits': '爆款数',
    'sort_posts': '相关帖数',
    'sort_inter': '总互动',
    'sort_avg_inter': '单帖均互动',
    'sort_hit_rate': '爆款率',
    'sort_best_score': '最高评分',
    'sort_best_likes': '最高点赞',
    'sort_new': '本轮新增',
    /* --- 排序项：关注名单 --- */
    'sort_last': '最近活跃',
    'sort_added': '加入顺序',

    /* --- 帖子列表 --- */
    'empty_posts': '没有符合条件的帖子。<br>放宽「最低互动」，或点上方「立即采集」。',
    'empty_authors': '没有符合条件的账号。<br>数据少时先取消「只看持续产出」，或点上方「立即采集」多跑几轮。',
    'empty_watch': '关注名单还是空的。<br>在上面的输入框填一个 Threads 账号，或去「同行监控」页点账号左边的 ☆。',
    'empty_watch_filtered': '没有符合条件的关注账号。<br>取消「只看有新帖」，或清空搜索词试试。',
    'no_text': '（无正文）',
    'speed_suffix': ' · 速度 {v}/h',
    'loading': '加载中…',
    'load_failed': '加载失败',
    'detail_load_failed': '详情加载失败',

    /* --- 表格表头：帖子 --- */
    'th_score': '评分',
    'th_velocity': '速度',
    'th_author': '作者',
    'th_likes': '赞',
    'th_replies': '回',
    'th_reposts': '转',
    'th_quotes': '引',
    'th_text': '正文',
    'th_published': '发布',
    /* --- 表格表头：同行 / 关注名单 --- */
    'th_account': '账号',
    'th_tier': '分层',
    'th_posts': '帖',
    'th_hits': '爆款',
    'th_hit_rate': '爆款率',
    'th_inter': '总互动',
    'th_avg_inter': '均互动',
    'th_best': '最高分',
    'th_dirs': '主攻方向',
    'th_last': '最近活跃',
    'th_note': '备注',
    'th_new': '新增',

    /* --- 互动口径（卡片缩写 / 详情全称） --- */
    'm_like': '赞',
    'm_reply': '回',
    'm_repost': '转',
    'm_quote': '引',
    'm_likes': '点赞',
    'm_replies': '回复',
    'm_reposts': '转发',
    'm_quotes': '引用',

    /* --- 分组名。keywords.txt 里写的是中文分组，数据侧的值不该被翻，
           但界面上显示成什么语言是另一回事，所以给一份显示用映射。 --- */
    'cat_ungrouped': '未分组',
    'cat_model': '模型',
    'cat_image': '生图',
    'cat_prompt': '提示词',
    'cat_video': '视频',
    'cat_agent': 'Agent 与工具',

    /* --- 媒体类型 --- */
    'media_text': '纯文字',
    'media_image': '单图',
    'media_carousel': '多图',
    'media_video': '视频',
    'media_unknown': '未知媒体',

    /* --- 详情抽屉 --- */
    'dw_see_all': '看 @{user} 的全部相关帖 →',
    'dw_score': '爆款评分',
    'dw_velocity': '上涨速度',
    'dw_per_hour': '互动 / 小时',
    'dw_growth': '互动增长 · 共 {n} 次采样',
    'dw_growth_range': '首次 {first} → 最新 {last} 次互动',
    'dw_section_text': '正文',
    'dw_section_attrs': '属性',
    'dw_section_dirs': '主攻方向',
    'dw_section_kw': '命中关键词',
    'dw_section_posts': '相关帖子 · {n} 条',
    'dw_no_posts': '没有相关帖。',
    'dw_open': '在 Threads 打开原帖 ↗',
    'dw_unknown_lang': '未知语言',
    'dw_relevance_why': '判定依据：{note}',
    'dw_posts_count': '{n} 帖',
    'dw_last_active': '最近活跃 {when}',
    'dw_per_week': '约 {n} 帖/周',
    'dw_verified': '已认证',

    /* --- 相关性 --- */
    'rel_relevant': '相关',
    'rel_blocked': '已屏蔽',
    'rel_offtopic': '无关',

    /* --- 关注 --- */
    'w_watching': '正在盯 <b>{accounts}</b> 个账号，其中 <b>{withnew}</b> 个本轮有新帖，共 <b>{newposts}</b> 条新帖。<br><span style="color:var(--faint);font-size:12px">还没进过库的账号会先显示 0（关注只是标记，不是采集开关）。点账号名可看 TA 的全部相关帖；星标 ★ 也可以在「同行监控」页直接点。</span>',
    'w_stat_accounts': '关注账号',
    'w_stat_with_posts': '已有数据',
    'w_stat_with_new': '有新帖',
    'w_stat_new_posts': '本轮新帖',
    'w_stat_hits': '累计爆款',
    'w_stat_inter': '总互动',
    'w_panel_title': '添加关注账号',
    'w_ph': 'Threads 账号，可粘贴 @账号 或主页链接',
    'w_note_ph': '备注（可选）',
    'btn_follow': '关注',
    'w_hint': '名单会写回 <code>watchlist.txt</code>，也可以直接在文件里加行（格式 <code>账号 | 备注</code>），重启后自动读入。<br>关注只做「挑出来盯住」——账号得先被关键词命中入库，才会有帖数和爆款数；还没入库的账号先显示为 0。',
    'w_star_on': '★ 已关注',
    'w_star_off': '☆ 关注该账号',
    'w_to_watch': '在「关注名单」页可以集中查看',
    'w_added_hint': '加入后可在「关注名单」页集中查看',
    'w_removed': '已从关注名单移除',
    'w_unfollow': '取消关注',
    'w_remove_title': '把 @{user} 从关注名单移除？',
    'w_not_in_db': '还没进过库',
    'w_last_active': '最近活跃 {when}',
    'op_failed': '操作失败',

    /* --- 同行覆盖度 --- */
    'cov_main': '库内共 <b>{total}</b> 个账号，其中只有 <b>{multi}</b> 个（{pct}%）发过 ≥2 条相关帖，其余都是一次性出现的账号。<br><span style="color:var(--faint);font-size:12px">同行榜靠多轮采集累积：采集轮次越多，「持续产出」的账号才会浮出来。爆款阈值 = 单条互动 ≥ {th}。</span>',
    'tier_all': '全部',
    'tier_core': '核心监控',
    'tier_steady': '持续产出',
    'tier_single': '单帖爆款',
    'tier_casual': '偶发出现',

    /* --- CSV --- */
    'csv_nothing': '当前没有可导出的结果',
    'csv_posts_file': 'threads_爆款帖子_',
    'csv_authors_file': 'threads_同行账号_',
    'csv_watch_file': 'threads_关注名单_',
    'csv_rank': '排名',
    'csv_post_id': '帖子ID',
    'csv_account': '账号',
    'csv_group': '分组',
    'csv_score': '爆款评分',
    'csv_velocity': '上涨速度',
    'csv_likes': '点赞',
    'csv_replies': '回复',
    'csv_reposts': '转发',
    'csv_quotes': '引用',
    'csv_inter': '总互动',
    'csv_avg_inter': '单帖均互动',
    'csv_published': '发布时间',
    'csv_kw': '命中关键词',
    'csv_text': '正文',
    'csv_thumb': '缩略图',
    'csv_url': '链接',
    'csv_tier': '分层',
    'csv_posts': '相关帖数',
    'csv_hits': '爆款数',
    'csv_rate': '爆款率',
    'csv_best_score': '最高评分',
    'csv_best_likes': '最高点赞',
    'csv_new': '本轮新增',
    'csv_last': '最近活跃',
    'csv_active_days': '活跃天数',
    'csv_per_week': '约帖/周',
    'csv_dirs': '主攻方向',
    'csv_note': '备注',
    'csv_added': '加入时间',

    /* --- 自检 --- */
    'probe_ok': '通道正常\n拿到 {bytes} 字节，解析出 {posts} 条帖子',
    'probe_fail': '通道不通\n原因：{reason}\n{hint}\n\n{detail}',

    /* --- 相对时间 --- */
    'ago_just': '刚刚',
    'ago_min': '{n} 分钟前',
    'ago_hour': '{n} 小时前',
    'ago_day': '{n} 天前',
    'ago_month': '{n} 个月前'
  },

  /* ======================= English en ======================= */
  en: {
    _name: 'English',
    _label: 'Language',

    'brand': 'Hot-Post Radar',
    'brand_sub': 'Threads · live keyword monitor',
    'tab_radar': 'Keyword Radar',
    'tab_peers': 'Competitors',
    'tab_watch': 'Watchlist',
    'lang_label': 'Language',

    'state_connecting': 'Connecting…',
    'state_monitoring': 'Monitoring',
    'state_collecting': 'Collecting…',
    'state_channel_bad': 'Channel error',
    'state_paused': 'Paused',
    'state_paused_fuse': 'Auto-paused',
    'state_disconnected': 'Disconnected, retrying…',
    'next_run': 'Next run',
    'interval_title': 'Collection interval',
    'interval_5': 'Every 5 min',
    'interval_10': 'Every 10 min',
    'interval_15': 'Every 15 min',
    'interval_30': 'Every 30 min',
    'interval_60': 'Every 1 hour',
    'interval_180': 'Every 3 hours',
    'btn_probe': 'Test',
    'btn_probe_title': 'Test the scraping channel',
    'btn_probe_ing': 'Testing…',
    'btn_probe_channel': 'Test channel',
    'btn_pause': 'Pause',
    'btn_resume': 'Resume',
    'btn_collect': 'Collect now',
    'prog_running': 'Collecting',
    'alert_channel_bad': 'Scraping channel error',
    'alert_channel_bad_reason': 'Scraping channel error: {reason}',
    'alert_channel_bad_fails': ' ({n} empty rounds in a row)',
    'alert_channel_hint': '<br>To diagnose: run <code>/api/probe</code>, check whether the proxy can reach threads.com, and consider lowering the request rate (fewer serp_type variants).',
    'alert_auto_paused': 'Auto-paused by channel failure',
    'alert_auto_paused_body': 'Several rounds in a row returned no data, so collection stopped to avoid deepening the block. Diagnose, then hit “Resume”.',

    'stat_relevant': 'Relevant posts',
    'stat_authors': 'Accounts',
    'stat_authors_note': 'deduped by author',
    'stat_inter': 'Total interactions',
    'stat_inter_note': 'likes + replies + reposts + quotes',
    'stat_new': 'New this cycle',
    'unit_posts': '',
    'unit_accounts': '',
    'stat_total_note': '{total} in DB (off-topic {offtopic} / blocked {blocked})',
    'stat_top': 'Top @{user} {score}',
    'stat_empty': 'No data yet',
    'kw_count': '{n}',

    'panel_keywords': 'Monitored keywords',
    'kw_ph': 'Add a keyword; use | to separate synonyms',
    'kw_group_ph': 'Group (optional)',
    'btn_add': 'Add',
    'kw_hint': 'Space = AND, pipe = OR synonyms. Example: <code>ChatGPT | GPT | #chatgpt</code> — only the first form is used for searching; matching any one counts as relevant.<br>Changes are written back to <code>keywords.txt</code> and take effect next cycle.',
    'kw_empty': 'No keywords yet — add one below',
    'kw_del_title': 'Delete',
    'kw_del_confirm': 'Delete keyword “{kw}”?',
    'kw_add_failed': 'Failed to add',
    'kw_no_data': 'No keyword data',

    'panel_log': 'Collection log',
    'log_live': 'live',
    'log_waiting': 'Waiting for data…',
    'log_empty': 'No logs yet',

    'flt_group': 'Group',
    'flt_keyword': 'Keyword',
    'flt_filter': 'Filter',
    'flt_tier': 'Tier',
    'flt_only_relevant': 'Relevant only',
    'flt_only_multi': 'Consistent posters only (≥2 posts)',
    'flt_only_new': 'With new posts only',
    'flt_view_card': 'Cards',
    'flt_view_table': 'Table',
    'flt_search_posts': 'Search text or author…',
    'flt_search_authors': 'Search account, niche or keyword…',
    'flt_search_watch': 'Search account, note or niche…',
    'flt_min_inter': 'Min interactions',
    'flt_sort': 'Sort',
    'btn_reset': 'Reset',
    'btn_export': 'Export CSV',
    'btn_export_posts_title': 'Export the current filtered result as CSV, openable directly in Excel',
    'btn_export_authors_title': 'Export the current competitor ranking as CSV, openable directly in Excel',
    'btn_export_watch_title': 'Export as CSV, openable directly in Excel',
    'unit_results': 'results',
    'meta_posts': 'results / {n} in DB',
    'meta_authors': 'accounts / {n} loaded',
    'meta_watch': 'watched accounts / {n} on the list',

    'sort_score': 'Viral score',
    'sort_velocity': 'Velocity',
    'sort_likes': 'Likes',
    'sort_replies': 'Replies',
    'sort_reposts': 'Reposts',
    'sort_taken': 'Newest published',
    'sort_seen': 'Newest collected',
    'sort_hits': 'Hot posts',
    'sort_posts': 'Relevant posts',
    'sort_inter': 'Interactions',
    'sort_avg_inter': 'Avg per post',
    'sort_hit_rate': 'Hit rate',
    'sort_best_score': 'Best score',
    'sort_best_likes': 'Most likes',
    'sort_new': 'New this cycle',
    'sort_last': 'Last active',
    'sort_added': 'Order added',

    'empty_posts': 'No posts match.<br>Lower “Min interactions”, or hit “Collect now” above.',
    'empty_authors': 'No accounts match.<br>With little data, first uncheck “Consistent posters only”, or hit “Collect now” and run a few more cycles.',
    'empty_watch': 'Your watchlist is empty.<br>Enter a Threads account in the box above, or click the ☆ next to an account on the Competitors tab.',
    'empty_watch_filtered': 'No watched accounts match.<br>Uncheck “With new posts only”, or clear the search box.',
    'no_text': '(no text)',
    'speed_suffix': ' · {v}/h',
    'loading': 'Loading…',
    'load_failed': 'Failed to load',
    'detail_load_failed': 'Failed to load details',

    'th_score': 'Score',
    'th_velocity': 'Speed',
    'th_author': 'Author',
    'th_likes': 'Likes',
    'th_replies': 'Rep.',
    'th_reposts': 'Repost',
    'th_quotes': 'Quote',
    'th_text': 'Text',
    'th_published': 'Posted',
    'th_account': 'Account',
    'th_tier': 'Tier',
    'th_posts': 'Posts',
    'th_hits': 'Hot',
    'th_hit_rate': 'Hit rate',
    'th_inter': 'Interactions',
    'th_avg_inter': 'Avg',
    'th_best': 'Best',
    'th_dirs': 'Niche',
    'th_last': 'Last active',
    'th_note': 'Note',
    'th_new': 'New',

    'm_like': 'Like',
    'm_reply': 'Rep.',
    'm_repost': 'Repost',
    'm_quote': 'Quote',
    'm_likes': 'Likes',
    'm_replies': 'Replies',
    'm_reposts': 'Reposts',
    'm_quotes': 'Quotes',

    'cat_ungrouped': 'Ungrouped',
    'cat_model': 'Models',
    'cat_image': 'Image gen',
    'cat_prompt': 'Prompts',
    'cat_video': 'Video',
    'cat_agent': 'Agent & Tools',

    'media_text': 'Text',
    'media_image': 'Image',
    'media_carousel': 'Carousel',
    'media_video': 'Video',
    'media_unknown': 'Unknown',

    'dw_see_all': 'See all relevant posts from @{user} →',
    'dw_score': 'Viral score',
    'dw_velocity': 'Velocity',
    'dw_per_hour': 'interactions / hour',
    'dw_growth': 'Interaction growth · {n} samples',
    'dw_growth_range': 'first {first} → latest {last} interactions',
    'dw_section_text': 'Text',
    'dw_section_attrs': 'Attributes',
    'dw_section_dirs': 'Niche',
    'dw_section_kw': 'Matched keywords',
    'dw_section_posts': 'Relevant posts · {n}',
    'dw_no_posts': 'No relevant posts.',
    'dw_open': 'Open the original post on Threads ↗',
    'dw_unknown_lang': 'Unknown language',
    'dw_relevance_why': 'Reason: {note}',
    'dw_posts_count': '{n} posts',
    'dw_last_active': 'Last active {when}',
    'dw_per_week': '~{n} posts/week',
    'dw_verified': 'Verified',

    'rel_relevant': 'Relevant',
    'rel_blocked': 'Blocked',
    'rel_offtopic': 'Off-topic',

    'w_watching': 'Watching <b>{accounts}</b> accounts; <b>{withnew}</b> have new posts this cycle, <b>{newposts}</b> new posts in total.<br><span style="color:var(--faint);font-size:12px">Accounts not yet in the DB show 0 first (watching is just a bookmark, not a collection switch). Click an account name to see all their relevant posts; you can also click the ★ on the Competitors tab.</span>',
    'w_stat_accounts': 'Watched',
    'w_stat_with_posts': 'With data',
    'w_stat_with_new': 'With new posts',
    'w_stat_new_posts': 'New this cycle',
    'w_stat_hits': 'Total hot posts',
    'w_stat_inter': 'Interactions',
    'w_panel_title': 'Add an account to watch',
    'w_ph': 'Threads account — paste @handle or a profile link',
    'w_note_ph': 'Note (optional)',
    'btn_follow': 'Watch',
    'w_hint': 'The list is written back to <code>watchlist.txt</code>; you can also add lines directly in the file (format <code>account | note</code>) — they load on restart.<br>Watching only “picks it out to keep an eye on” — an account must first be captured by keywords to have post and hot-post counts; accounts not yet in the DB show 0.',
    'w_star_on': '★ Watched',
    'w_star_off': '☆ Watch this account',
    'w_to_watch': 'See them all on the Watchlist tab',
    'w_added_hint': 'After adding, see them all on the Watchlist tab',
    'w_removed': 'Removed from watchlist',
    'w_unfollow': 'Unwatch',
    'w_remove_title': 'Remove @{user} from the watchlist?',
    'w_not_in_db': 'Not in DB yet',
    'w_last_active': 'Last active {when}',
    'op_failed': 'Operation failed',

    'cov_main': '{total} accounts in the DB, but only <b>{multi}</b> ({pct}%) have posted ≥2 relevant posts — the rest showed up once.<br><span style="color:var(--faint);font-size:12px">The competitor ranking builds up over many cycles: the more rounds collected, the more “consistent posters” surface. Hot-post threshold = single-post interactions ≥ {th}.</span>',
    'tier_all': 'All',
    'tier_core': 'Core',
    'tier_steady': 'Steady',
    'tier_single': 'One-hit',
    'tier_casual': 'Casual',

    'csv_nothing': 'Nothing to export',
    'csv_posts_file': 'threads_hot_posts_',
    'csv_authors_file': 'threads_competitors_',
    'csv_watch_file': 'threads_watchlist_',
    'csv_rank': 'Rank',
    'csv_post_id': 'Post ID',
    'csv_account': 'Account',
    'csv_group': 'Group',
    'csv_score': 'Viral score',
    'csv_velocity': 'Velocity',
    'csv_likes': 'Likes',
    'csv_replies': 'Replies',
    'csv_reposts': 'Reposts',
    'csv_quotes': 'Quotes',
    'csv_inter': 'Interactions',
    'csv_avg_inter': 'Avg per post',
    'csv_published': 'Published',
    'csv_kw': 'Matched keywords',
    'csv_text': 'Text',
    'csv_thumb': 'Thumbnail',
    'csv_url': 'Link',
    'csv_tier': 'Tier',
    'csv_posts': 'Relevant posts',
    'csv_hits': 'Hot posts',
    'csv_rate': 'Hit rate',
    'csv_best_score': 'Best score',
    'csv_best_likes': 'Most likes',
    'csv_new': 'New this cycle',
    'csv_last': 'Last active',
    'csv_active_days': 'Active days',
    'csv_per_week': 'Posts/week',
    'csv_dirs': 'Niche',
    'csv_note': 'Note',
    'csv_added': 'Added at',

    'probe_ok': 'Channel OK\nGot {bytes} bytes, parsed {posts} posts',
    'probe_fail': 'Channel down\nReason: {reason}\n{hint}\n\n{detail}',

    'ago_just': 'just now',
    'ago_min': '{n} min ago',
    'ago_hour': '{n} h ago',
    'ago_day': '{n} d ago',
    'ago_month': '{n} mo ago'
  },

  /* ======================= 繁體中文 zh-TW ======================= */
  'zh-TW': {
    _name: '繁體中文',
    _label: '語言',

    'brand': '爆款雷達',
    'brand_sub': 'Threads · 即時關鍵詞監控',
    'tab_radar': '關鍵詞雷達',
    'tab_peers': '同行監控',
    'tab_watch': '關注名單',
    'lang_label': '語言',

    'state_connecting': '連線中…',
    'state_monitoring': '監控中',
    'state_collecting': '採集中…',
    'state_channel_bad': '通道異常',
    'state_paused': '已暫停',
    'state_paused_fuse': '已熔斷暫停',
    'state_disconnected': '連線中斷，重試中…',
    'next_run': '下次採集',
    'interval_title': '採集間隔',
    'interval_5': '每 5 分鐘',
    'interval_10': '每 10 分鐘',
    'interval_15': '每 15 分鐘',
    'interval_30': '每 30 分鐘',
    'interval_60': '每 1 小時',
    'interval_180': '每 3 小時',
    'btn_probe': '自檢',
    'btn_probe_title': '自檢抓取通道',
    'btn_probe_ing': '自檢中…',
    'btn_probe_channel': '通道自檢',
    'btn_pause': '暫停',
    'btn_resume': '恢復',
    'btn_collect': '立即採集',
    'prog_running': '正在採集',
    'alert_channel_bad': '抓取通道異常',
    'alert_channel_bad_reason': '抓取通道異常：{reason}',
    'alert_channel_bad_fails': '（連續 {n} 輪 0 條）',
    'alert_channel_hint': '<br>排查看：<code>/api/probe</code> 自檢、代理是否可達 threads.com、是否該降低抓取頻率（減少 serp_type 變體數）。',
    'alert_auto_paused': '已因通道故障自動暫停',
    'alert_auto_paused_body': '連續多輪抓不到資料，為免加深封禁已自動停採。排查後點「恢復」繼續。',

    'stat_relevant': '相關貼文',
    'stat_authors': '覆蓋帳號',
    'stat_authors_note': '按作者去重',
    'stat_inter': '總互動量',
    'stat_inter_note': '讚 + 回 + 轉 + 引',
    'stat_new': '本輪新增',
    'unit_posts': '條',
    'unit_accounts': '個',
    'stat_total_note': '庫內共 {total} 條（無關 {offtopic} / 封鎖 {blocked}）',
    'stat_top': '最高分 @{user} {score}',
    'stat_empty': '暫無資料',
    'kw_count': '{n} 個',

    'panel_keywords': '監控關鍵詞',
    'kw_ph': '新增關鍵詞，用 | 分隔同義詞',
    'kw_group_ph': '分組（可選）',
    'btn_add': '新增',
    'kw_hint': '空格 = AND，豎線 = OR 同義詞。例：<code>ChatGPT | GPT | #chatgpt</code> —— 只用第一個寫法去搜尋，命中任一個即算相關。<br>修改會寫回 <code>keywords.txt</code>，下一輪採集生效。',
    'kw_empty': '還沒有關鍵詞，在下面新增',
    'kw_del_title': '刪除',
    'kw_del_confirm': '刪除關鍵詞「{kw}」？',
    'kw_add_failed': '新增失敗',
    'kw_no_data': '暫無關鍵詞資料',

    'panel_log': '採集日誌',
    'log_live': '即時',
    'log_waiting': '等待資料…',
    'log_empty': '暫無日誌',

    'flt_group': '分組',
    'flt_keyword': '關鍵詞',
    'flt_filter': '篩選',
    'flt_tier': '分層',
    'flt_only_relevant': '僅看相關',
    'flt_only_multi': '只看持續產出（≥2 貼）',
    'flt_only_new': '只看有新貼',
    'flt_view_card': '卡片',
    'flt_view_table': '表格',
    'flt_search_posts': '搜尋正文或作者…',
    'flt_search_authors': '搜尋帳號、主攻方向或關鍵詞…',
    'flt_search_watch': '搜尋帳號、備註或主攻方向…',
    'flt_min_inter': '最低互動',
    'flt_sort': '排序',
    'btn_reset': '重設',
    'btn_export': '匯出 CSV',
    'btn_export_posts_title': '把當前篩選結果匯出為 CSV，可直接用 Excel 開啟',
    'btn_export_authors_title': '把當前同行榜匯出為 CSV，可直接用 Excel 開啟',
    'btn_export_watch_title': '匯出為 CSV，可直接用 Excel 開啟',
    'unit_results': '條結果',
    'meta_posts': '條結果 / 庫內 {n} 條',
    'meta_authors': '個帳號 / 載入 {n} 個',
    'meta_watch': '個關注帳號 / 名單共 {n} 個',

    'sort_score': '爆款評分',
    'sort_velocity': '上漲速度',
    'sort_likes': '按讚數',
    'sort_replies': '回覆數',
    'sort_reposts': '轉發數',
    'sort_taken': '最新發布',
    'sort_seen': '最新入庫',
    'sort_hits': '爆款數',
    'sort_posts': '相關貼數',
    'sort_inter': '總互動',
    'sort_avg_inter': '單貼均互動',
    'sort_hit_rate': '爆款率',
    'sort_best_score': '最高評分',
    'sort_best_likes': '最高按讚',
    'sort_new': '本輪新增',
    'sort_last': '最近活躍',
    'sort_added': '加入順序',

    'empty_posts': '沒有符合條件的貼文。<br>放寬「最低互動」，或點上方「立即採集」。',
    'empty_authors': '沒有符合條件的帳號。<br>資料少時先取消「只看持續產出」，或點上方「立即採集」多跑幾輪。',
    'empty_watch': '關注名單還是空的。<br>在上面的輸入框填一個 Threads 帳號，或去「同行監控」頁點帳號左邊的 ☆。',
    'empty_watch_filtered': '沒有符合條件的關注帳號。<br>取消「只看有新貼」，或清空搜尋詞試試。',
    'no_text': '（無正文）',
    'speed_suffix': ' · 速度 {v}/h',
    'loading': '載入中…',
    'load_failed': '載入失敗',
    'detail_load_failed': '詳情載入失敗',

    'th_score': '評分',
    'th_velocity': '速度',
    'th_author': '作者',
    'th_likes': '讚',
    'th_replies': '回',
    'th_reposts': '轉',
    'th_quotes': '引',
    'th_text': '正文',
    'th_published': '發布',
    'th_account': '帳號',
    'th_tier': '分層',
    'th_posts': '貼',
    'th_hits': '爆款',
    'th_hit_rate': '爆款率',
    'th_inter': '總互動',
    'th_avg_inter': '均互動',
    'th_best': '最高分',
    'th_dirs': '主攻方向',
    'th_last': '最近活躍',
    'th_note': '備註',
    'th_new': '新增',

    'm_like': '讚',
    'm_reply': '回',
    'm_repost': '轉',
    'm_quote': '引',
    'm_likes': '按讚',
    'm_replies': '回覆',
    'm_reposts': '轉發',
    'm_quotes': '引用',

    'cat_ungrouped': '未分組',
    'cat_model': '模型',
    'cat_image': '生圖',
    'cat_prompt': '提示詞',
    'cat_video': '影片',
    'cat_agent': 'Agent 與工具',

    'media_text': '純文字',
    'media_image': '單圖',
    'media_carousel': '多圖',
    'media_video': '影片',
    'media_unknown': '未知媒體',

    'dw_see_all': '看 @{user} 的全部相關貼 →',
    'dw_score': '爆款評分',
    'dw_velocity': '上漲速度',
    'dw_per_hour': '互動 / 小時',
    'dw_growth': '互動增長 · 共 {n} 次取樣',
    'dw_growth_range': '首次 {first} → 最新 {last} 次互動',
    'dw_section_text': '正文',
    'dw_section_attrs': '屬性',
    'dw_section_dirs': '主攻方向',
    'dw_section_kw': '命中關鍵詞',
    'dw_section_posts': '相關貼文 · {n} 條',
    'dw_no_posts': '沒有相關貼。',
    'dw_open': '在 Threads 開啟原貼 ↗',
    'dw_unknown_lang': '未知語言',
    'dw_relevance_why': '判定依據：{note}',
    'dw_posts_count': '{n} 貼',
    'dw_last_active': '最近活躍 {when}',
    'dw_per_week': '約 {n} 貼/週',
    'dw_verified': '已驗證',

    'rel_relevant': '相關',
    'rel_blocked': '已封鎖',
    'rel_offtopic': '無關',

    'w_watching': '正在盯 <b>{accounts}</b> 個帳號，其中 <b>{withnew}</b> 個本輪有新貼，共 <b>{newposts}</b> 條新貼。<br><span style="color:var(--faint);font-size:12px">還沒進過庫的帳號會先顯示 0（關注只是標記，不是採集開關）。點帳號名可看 TA 的全部相關貼；星標 ★ 也可以在「同行監控」頁直接點。</span>',
    'w_stat_accounts': '關注帳號',
    'w_stat_with_posts': '已有資料',
    'w_stat_with_new': '有新貼',
    'w_stat_new_posts': '本輪新貼',
    'w_stat_hits': '累計爆款',
    'w_stat_inter': '總互動',
    'w_panel_title': '新增關注帳號',
    'w_ph': 'Threads 帳號，可貼上 @帳號 或主頁連結',
    'w_note_ph': '備註（可選）',
    'btn_follow': '關注',
    'w_hint': '名單會寫回 <code>watchlist.txt</code>，也可以直接在檔案裡加行（格式 <code>帳號 | 備註</code>），重啟後自動讀入。<br>關注只做「挑出來盯住」——帳號得先被關鍵詞命中入庫，才會有貼數和爆款數；還沒入庫的帳號先顯示為 0。',
    'w_star_on': '★ 已關注',
    'w_star_off': '☆ 關注該帳號',
    'w_to_watch': '在「關注名單」頁可以集中查看',
    'w_added_hint': '加入後可在「關注名單」頁集中查看',
    'w_removed': '已從關注名單移除',
    'w_unfollow': '取消關注',
    'w_remove_title': '把 @{user} 從關注名單移除？',
    'w_not_in_db': '還沒進過庫',
    'w_last_active': '最近活躍 {when}',
    'op_failed': '操作失敗',

    'cov_main': '庫內共 <b>{total}</b> 個帳號，其中只有 <b>{multi}</b> 個（{pct}%）發過 ≥2 條相關貼，其餘都是一次性出現的帳號。<br><span style="color:var(--faint);font-size:12px">同行榜靠多輪採集累積：採集輪次越多，「持續產出」的帳號才會浮出來。爆款閾值 = 單條互動 ≥ {th}。</span>',
    'tier_all': '全部',
    'tier_core': '核心監控',
    'tier_steady': '持續產出',
    'tier_single': '單貼爆款',
    'tier_casual': '偶發出現',

    'csv_nothing': '當前沒有可匯出的結果',
    'csv_posts_file': 'threads_爆款貼文_',
    'csv_authors_file': 'threads_同行帳號_',
    'csv_watch_file': 'threads_關注名單_',
    'csv_rank': '排名',
    'csv_post_id': '貼文ID',
    'csv_account': '帳號',
    'csv_group': '分組',
    'csv_score': '爆款評分',
    'csv_velocity': '上漲速度',
    'csv_likes': '按讚',
    'csv_replies': '回覆',
    'csv_reposts': '轉發',
    'csv_quotes': '引用',
    'csv_inter': '總互動',
    'csv_avg_inter': '單貼均互動',
    'csv_published': '發布時間',
    'csv_kw': '命中關鍵詞',
    'csv_text': '正文',
    'csv_thumb': '縮圖',
    'csv_url': '連結',
    'csv_tier': '分層',
    'csv_posts': '相關貼數',
    'csv_hits': '爆款數',
    'csv_rate': '爆款率',
    'csv_best_score': '最高評分',
    'csv_best_likes': '最高按讚',
    'csv_new': '本輪新增',
    'csv_last': '最近活躍',
    'csv_active_days': '活躍天數',
    'csv_per_week': '約貼/週',
    'csv_dirs': '主攻方向',
    'csv_note': '備註',
    'csv_added': '加入時間',

    'probe_ok': '通道正常\n拿到 {bytes} 位元組，解析出 {posts} 條貼文',
    'probe_fail': '通道不通\n原因：{reason}\n{hint}\n\n{detail}',

    'ago_just': '剛剛',
    'ago_min': '{n} 分鐘前',
    'ago_hour': '{n} 小時前',
    'ago_day': '{n} 天前',
    'ago_month': '{n} 個月前'
  },

  /* ======================= 日本語 ja ======================= */
  ja: {
    _name: '日本語',
    _label: '言語',

    'brand': 'バズレーダー',
    'brand_sub': 'Threads · リアルタイム keyword monitor',
    'tab_radar': 'キーワードレーダー',
    'tab_peers': '競合モニタ',
    'tab_watch': 'ウォッチリスト',
    'lang_label': '言語',

    'state_connecting': '接続中…',
    'state_monitoring': '監視中',
    'state_collecting': '収集中…',
    'state_channel_bad': 'チャネル異常',
    'state_paused': '一時停止中',
    'state_paused_fuse': '自動停止中',
    'state_disconnected': '切断されました。再接続中…',
    'next_run': '次回収集',
    'interval_title': '収集間隔',
    'interval_5': '5 分ごと',
    'interval_10': '10 分ごと',
    'interval_15': '15 分ごと',
    'interval_30': '30 分ごと',
    'interval_60': '1 時間ごと',
    'interval_180': '3 時間ごと',
    'btn_probe': '診断',
    'btn_probe_title': '取得チャネルを診断',
    'btn_probe_ing': '診断中…',
    'btn_probe_channel': 'チャネル診断',
    'btn_pause': '一時停止',
    'btn_resume': '再開',
    'btn_collect': '今すぐ収集',
    'prog_running': '収集中',
    'alert_channel_bad': '取得チャネル異常',
    'alert_channel_bad_reason': '取得チャネル異常：{reason}',
    'alert_channel_bad_fails': '（{n} 回連続で 0 件）',
    'alert_channel_hint': '<br>確認方法：<code>/api/probe</code> の実行、プロキシが threads.com に到達できるか、リクエスト頻度を下げるべきか（serp_type の変体数を減らす）。',
    'alert_auto_paused': 'チャネル障害により自動停止しました',
    'alert_auto_paused_body': '何度も連続でデータが取得できなかったため、ブロックを深めないよう収集を自動停止しました。原因を確認して「再開」を押してください。',

    'stat_relevant': '関連投稿',
    'stat_authors': 'カバーアカウント',
    'stat_authors_note': '投稿者で重複排除',
    'stat_inter': '総インタラクション',
    'stat_inter_note': 'いいね + 返信 + リポスト + 引用',
    'stat_new': '今回の新規',
    'unit_posts': '件',
    'unit_accounts': '件',
    'stat_total_note': 'DB 内 {total} 件（非関連 {offtopic} / ブロック {blocked}）',
    'stat_top': '最高スコア @{user} {score}',
    'stat_empty': 'データなし',
    'kw_count': '{n} 件',

    'panel_keywords': '監視キーワード',
    'kw_ph': 'キーワードを追加（同義語は | 区切り）',
    'kw_group_ph': 'グループ（任意）',
    'btn_add': '追加',
    'kw_hint': 'スペース = AND、縦線 = OR の同義語。例：<code>ChatGPT | GPT | #chatgpt</code> —— 検索に使うのは最初の表記だけで、いずれかに一致すれば関連と判定します。<br>変更は <code>keywords.txt</code> に書き戻され、次回の収集から有効になります。',
    'kw_empty': 'キーワードがまだありません。下から追加してください',
    'kw_del_title': '削除',
    'kw_del_confirm': 'キーワード「{kw}」を削除しますか？',
    'kw_add_failed': '追加に失敗しました',
    'kw_no_data': 'キーワードデータなし',

    'panel_log': '収集ログ',
    'log_live': 'リアルタイム',
    'log_waiting': 'データ待機中…',
    'log_empty': 'ログはまだありません',

    'flt_group': 'グループ',
    'flt_keyword': 'キーワード',
    'flt_filter': '絞り込み',
    'flt_tier': '階層',
    'flt_only_relevant': '関連のみ',
    'flt_only_multi': '継続投稿のみ（2 件以上）',
    'flt_only_new': '新着のあるもののみ',
    'flt_view_card': 'カード',
    'flt_view_table': 'テーブル',
    'flt_search_posts': '本文または投稿者を検索…',
    'flt_search_authors': 'アカウント・専門分野・キーワードを検索…',
    'flt_search_watch': 'アカウント・メモ・専門分野を検索…',
    'flt_min_inter': '最低インタラクション',
    'flt_sort': '並び順',
    'btn_reset': 'リセット',
    'btn_export': 'CSV 書き出し',
    'btn_export_posts_title': '現在の絞り込み結果を CSV に書き出します。Excel でそのまま開けます',
    'btn_export_authors_title': '現在の競合ランキングを CSV に書き出します。Excel でそのまま開けます',
    'btn_export_watch_title': 'CSV に書き出します。Excel でそのまま開けます',
    'unit_results': '件の結果',
    'meta_posts': '件の結果 / DB 内 {n} 件',
    'meta_authors': '件のアカウント / 読み込み {n} 件',
    'meta_watch': '件のウォッチ中アカウント / リスト計 {n} 件',

    'sort_score': 'バズスコア',
    'sort_velocity': '上昇速度',
    'sort_likes': 'いいね数',
    'sort_replies': '返信数',
    'sort_reposts': 'リポスト数',
    'sort_taken': '新着順（投稿日）',
    'sort_seen': '新着順（取得日）',
    'sort_hits': 'バズ件数',
    'sort_posts': '関連投稿数',
    'sort_inter': '総インタラクション',
    'sort_avg_inter': '1 件あたり平均',
    'sort_hit_rate': 'バズ率',
    'sort_best_score': '最高スコア',
    'sort_best_likes': '最多いいね',
    'sort_new': '今回の新規',
    'sort_last': '最近の活動',
    'sort_added': '追加順',

    'empty_posts': '条件に合う投稿がありません。<br>「最低インタラクション」を緩めるか、上の「今すぐ収集」を押してください。',
    'empty_authors': '条件に合うアカウントがありません。<br>データが少ないうちは「継続投稿のみ」を外すか、「今すぐ収集」で数回実行してください。',
    'empty_watch': 'ウォッチリストはまだ空です。<br>上の入力欄に Threads アカウントを入れるか、「競合モニタ」タブでアカウント左の ☆ を押してください。',
    'empty_watch_filtered': '条件に合うウォッチ中アカウントがありません。<br>「新着のあるもののみ」を外すか、検索語を消してみてください。',
    'no_text': '（本文なし）',
    'speed_suffix': ' · 速度 {v}/h',
    'loading': '読み込み中…',
    'load_failed': '読み込みに失敗しました',
    'detail_load_failed': '詳細の読み込みに失敗しました',

    'th_score': 'スコア',
    'th_velocity': '速度',
    'th_author': '投稿者',
    'th_likes': 'いいね',
    'th_replies': '返信',
    'th_reposts': 'RP',
    'th_quotes': '引用',
    'th_text': '本文',
    'th_published': '投稿',
    'th_account': 'アカウント',
    'th_tier': '階層',
    'th_posts': '投稿',
    'th_hits': 'バズ',
    'th_hit_rate': 'バズ率',
    'th_inter': '総インタラクション',
    'th_avg_inter': '平均',
    'th_best': '最高',
    'th_dirs': '専門分野',
    'th_last': '最近の活動',
    'th_note': 'メモ',
    'th_new': '新規',

    'm_like': 'いいね',
    'm_reply': '返信',
    'm_repost': 'RP',
    'm_quote': '引用',
    'm_likes': 'いいね',
    'm_replies': '返信',
    'm_reposts': 'リポスト',
    'm_quotes': '引用',

    'cat_ungrouped': '未分類',
    'cat_model': 'モデル',
    'cat_image': '画像生成',
    'cat_prompt': 'プロンプト',
    'cat_video': '動画',
    'cat_agent': 'Agent・ツール',

    'media_text': 'テキスト',
    'media_image': '画像 1 枚',
    'media_carousel': '画像複数',
    'media_video': '動画',
    'media_unknown': '不明',

    'dw_see_all': '@{user} の関連投稿をすべて見る →',
    'dw_score': 'バズスコア',
    'dw_velocity': '上昇速度',
    'dw_per_hour': 'インタラクション / 時間',
    'dw_growth': 'インタラクション推移 · 全 {n} 回サンプリング',
    'dw_growth_range': '初回 {first} → 最新 {last} インタラクション',
    'dw_section_text': '本文',
    'dw_section_attrs': '属性',
    'dw_section_dirs': '専門分野',
    'dw_section_kw': '一致キーワード',
    'dw_section_posts': '関連投稿 · {n} 件',
    'dw_no_posts': '関連投稿はありません。',
    'dw_open': 'Threads で元の投稿を開く ↗',
    'dw_unknown_lang': '言語不明',
    'dw_relevance_why': '判定理由：{note}',
    'dw_posts_count': '{n} 件の投稿',
    'dw_last_active': '最近の活動 {when}',
    'dw_per_week': '約 {n} 件/週',
    'dw_verified': '認証済み',

    'rel_relevant': '関連',
    'rel_blocked': 'ブロック済み',
    'rel_offtopic': '非関連',

    'w_watching': '<b>{accounts}</b> 件のアカウントを監視中。うち <b>{withnew}</b> 件が今回新着あり、新着は計 <b>{newposts}</b> 件です。<br><span style="color:var(--faint);font-size:12px">まだ DB に入っていないアカウントは 0 と表示されます（ウォッチは印を付けるだけで、収集のスイッチではありません）。アカウント名をクリックすると関連投稿をすべて見られます。★ は「競合モニタ」タブからも押せます。</span>',
    'w_stat_accounts': 'ウォッチ中',
    'w_stat_with_posts': 'データあり',
    'w_stat_with_new': '新着あり',
    'w_stat_new_posts': '今回の新着',
    'w_stat_hits': '累計バズ',
    'w_stat_inter': '総インタラクション',
    'w_panel_title': 'ウォッチするアカウントを追加',
    'w_ph': 'Threads アカウント（@ハンドルまたはプロフィール URL を貼り付け可）',
    'w_note_ph': 'メモ（任意）',
    'btn_follow': 'ウォッチ',
    'w_hint': 'リストは <code>watchlist.txt</code> に書き戻されます。ファイルに直接行を追加しても構いません（形式 <code>アカウント | メモ</code>）。再起動時に読み込まれます。<br>ウォッチは「選んで見張る」だけの機能です。アカウントがキーワードでヒットして DB に入らないと、投稿数やバズ件数は付きません。未登録のアカウントは 0 と表示されます。',
    'w_star_on': '★ ウォッチ中',
    'w_star_off': '☆ このアカウントをウォッチ',
    'w_to_watch': '「ウォッチリスト」タブでまとめて確認できます',
    'w_added_hint': '追加後は「ウォッチリスト」タブでまとめて確認できます',
    'w_removed': 'ウォッチリストから外しました',
    'w_unfollow': 'ウォッチ解除',
    'w_remove_title': '@{user} をウォッチリストから外しますか？',
    'w_not_in_db': 'まだ DB にありません',
    'w_last_active': '最近の活動 {when}',
    'op_failed': '操作に失敗しました',

    'cov_main': 'DB 内に <b>{total}</b> 件のアカウントがありますが、関連投稿を 2 件以上出したのは <b>{multi}</b> 件（{pct}%）だけで、残りは一度しか現れていません。<br><span style="color:var(--faint);font-size:12px">競合ランキングは何度も収集して蓄積されます。回数を重ねるほど「継続して出す」アカウントが浮かび上がります。バズのしきい値 = 1 件のインタラクション ≥ {th}。</span>',
    'tier_all': 'すべて',
    'tier_core': 'コア監視',
    'tier_steady': '継続投稿',
    'tier_single': '単発バズ',
    'tier_casual': 'たまに出現',

    'csv_nothing': '書き出せる結果がありません',
    'csv_posts_file': 'threads_バズ投稿_',
    'csv_authors_file': 'threads_競合アカウント_',
    'csv_watch_file': 'threads_ウォッチリスト_',
    'csv_rank': '順位',
    'csv_post_id': '投稿ID',
    'csv_account': 'アカウント',
    'csv_group': 'グループ',
    'csv_score': 'バズスコア',
    'csv_velocity': '上昇速度',
    'csv_likes': 'いいね',
    'csv_replies': '返信',
    'csv_reposts': 'リポスト',
    'csv_quotes': '引用',
    'csv_inter': '総インタラクション',
    'csv_avg_inter': '1 件あたり平均',
    'csv_published': '投稿日時',
    'csv_kw': '一致キーワード',
    'csv_text': '本文',
    'csv_thumb': 'サムネイル',
    'csv_url': 'リンク',
    'csv_tier': '階層',
    'csv_posts': '関連投稿数',
    'csv_hits': 'バズ件数',
    'csv_rate': 'バズ率',
    'csv_best_score': '最高スコア',
    'csv_best_likes': '最多いいね',
    'csv_new': '今回の新規',
    'csv_last': '最近の活動',
    'csv_active_days': '活動日数',
    'csv_per_week': '投稿/週',
    'csv_dirs': '専門分野',
    'csv_note': 'メモ',
    'csv_added': '追加日時',

    'probe_ok': 'チャネル正常\n{bytes} バイト取得、{posts} 件の投稿を解析',
    'probe_fail': 'チャネル不通\n原因：{reason}\n{hint}\n\n{detail}',

    'ago_just': 'たった今',
    'ago_min': '{n} 分前',
    'ago_hour': '{n} 時間前',
    'ago_day': '{n} 日前',
    'ago_month': '{n} か月前'
  },

  /* ======================= 한국어 ko ======================= */
  ko: {
    _name: '한국어',
    _label: '언어',

    'brand': '핫포스트 레이더',
    'brand_sub': 'Threads · 실시간 키워드 모니터',
    'tab_radar': '키워드 레이더',
    'tab_peers': '경쟁사 모니터',
    'tab_watch': '관심 목록',
    'lang_label': '언어',

    'state_connecting': '연결 중…',
    'state_monitoring': '모니터링 중',
    'state_collecting': '수집 중…',
    'state_channel_bad': '채널 오류',
    'state_paused': '일시중지됨',
    'state_paused_fuse': '자동 중지됨',
    'state_disconnected': '연결이 끊겼습니다. 재시도 중…',
    'next_run': '다음 수집',
    'interval_title': '수집 주기',
    'interval_5': '5분마다',
    'interval_10': '10분마다',
    'interval_15': '15분마다',
    'interval_30': '30분마다',
    'interval_60': '1시간마다',
    'interval_180': '3시간마다',
    'btn_probe': '점검',
    'btn_probe_title': '수집 채널 점검',
    'btn_probe_ing': '점검 중…',
    'btn_probe_channel': '채널 점검',
    'btn_pause': '일시중지',
    'btn_resume': '재개',
    'btn_collect': '지금 수집',
    'prog_running': '수집 중',
    'alert_channel_bad': '수집 채널 오류',
    'alert_channel_bad_reason': '수집 채널 오류: {reason}',
    'alert_channel_bad_fails': ' ({n}회 연속 0건)',
    'alert_channel_hint': '<br>확인 방법: <code>/api/probe</code> 실행, 프록시가 threads.com에 도달하는지, 요청 빈도를 낮춰야 하는지(serp_type 변형 수 줄이기).',
    'alert_auto_paused': '채널 장애로 자동 중지되었습니다',
    'alert_auto_paused_body': '여러 회 연속 데이터를 가져오지 못해 차단이 깊어지는 것을 막기 위해 자동으로 수집을 멈췄습니다. 원인을 확인한 뒤 「재개」를 누르세요.',

    'stat_relevant': '관련 게시물',
    'stat_authors': '커버 계정',
    'stat_authors_note': '작성자 기준 중복 제거',
    'stat_inter': '총 인터랙션',
    'stat_inter_note': '좋아요 + 답글 + 리포스트 + 인용',
    'stat_new': '이번 주기 신규',
    'unit_posts': '건',
    'unit_accounts': '개',
    'stat_total_note': 'DB 내 {total}건 (무관 {offtopic} / 차단 {blocked})',
    'stat_top': '최고 점수 @{user} {score}',
    'stat_empty': '데이터 없음',
    'kw_count': '{n}개',

    'panel_keywords': '모니터링 키워드',
    'kw_ph': '키워드 추가, 동의어는 | 로 구분',
    'kw_group_ph': '그룹 (선택)',
    'btn_add': '추가',
    'kw_hint': '공백 = AND, 세로줄 = OR 동의어. 예: <code>ChatGPT | GPT | #chatgpt</code> —— 검색에는 첫 번째 표기만 쓰고, 하나라도 걸리면 관련으로 판정합니다.<br>변경 사항은 <code>keywords.txt</code>에 기록되어 다음 수집 주기부터 적용됩니다.',
    'kw_empty': '키워드가 없습니다. 아래에서 추가하세요',
    'kw_del_title': '삭제',
    'kw_del_confirm': '키워드 「{kw}」를 삭제할까요?',
    'kw_add_failed': '추가 실패',
    'kw_no_data': '키워드 데이터 없음',

    'panel_log': '수집 로그',
    'log_live': '실시간',
    'log_waiting': '데이터 대기 중…',
    'log_empty': '로그 없음',

    'flt_group': '그룹',
    'flt_keyword': '키워드',
    'flt_filter': '필터',
    'flt_tier': '계층',
    'flt_only_relevant': '관련만 보기',
    'flt_only_multi': '지속 작성자만 (게시물 ≥2)',
    'flt_only_new': '새 게시물 있는 계정만',
    'flt_view_card': '카드',
    'flt_view_table': '표',
    'flt_search_posts': '본문 또는 작성자 검색…',
    'flt_search_authors': '계정, 주력 분야 또는 키워드 검색…',
    'flt_search_watch': '계정, 메모 또는 주력 분야 검색…',
    'flt_min_inter': '최소 인터랙션',
    'flt_sort': '정렬',
    'btn_reset': '초기화',
    'btn_export': 'CSV 내보내기',
    'btn_export_posts_title': '현재 필터 결과를 CSV로 내보냅니다. Excel에서 바로 열 수 있습니다',
    'btn_export_authors_title': '현재 경쟁사 순위를 CSV로 내보냅니다. Excel에서 바로 열 수 있습니다',
    'btn_export_watch_title': 'CSV로 내보냅니다. Excel에서 바로 열 수 있습니다',
    'unit_results': '개 결과',
    'meta_posts': '개 결과 / DB 내 {n}건',
    'meta_authors': '개 계정 / {n}개 로드됨',
    'meta_watch': '개 관심 계정 / 목록 총 {n}개',

    'sort_score': '바이럴 점수',
    'sort_velocity': '상승 속도',
    'sort_likes': '좋아요 수',
    'sort_replies': '답글 수',
    'sort_reposts': '리포스트 수',
    'sort_taken': '최신 게시순',
    'sort_seen': '최신 수집순',
    'sort_hits': '핫 게시물 수',
    'sort_posts': '관련 게시물 수',
    'sort_inter': '총 인터랙션',
    'sort_avg_inter': '게시물당 평균',
    'sort_hit_rate': '핫 비율',
    'sort_best_score': '최고 점수',
    'sort_best_likes': '최다 좋아요',
    'sort_new': '이번 주기 신규',
    'sort_last': '최근 활동',
    'sort_added': '추가 순서',

    'empty_posts': '조건에 맞는 게시물이 없습니다.<br>「최소 인터랙션」을 낮추거나 위의 「지금 수집」을 누르세요.',
    'empty_authors': '조건에 맞는 계정이 없습니다.<br>데이터가 적을 때는 「지속 작성자만」을 먼저 해제하거나, 「지금 수집」으로 몇 번 더 돌려보세요.',
    'empty_watch': '관심 목록이 비어 있습니다.<br>위 입력란에 Threads 계정을 넣거나, 「경쟁사 모니터」 탭에서 계정 왼쪽의 ☆를 누르세요.',
    'empty_watch_filtered': '조건에 맞는 관심 계정이 없습니다.<br>「새 게시물 있는 계정만」을 해제하거나 검색어를 지워보세요.',
    'no_text': '(본문 없음)',
    'speed_suffix': ' · 속도 {v}/h',
    'loading': '불러오는 중…',
    'load_failed': '불러오기 실패',
    'detail_load_failed': '상세 정보 불러오기 실패',

    'th_score': '점수',
    'th_velocity': '속도',
    'th_author': '작성자',
    'th_likes': '좋아요',
    'th_replies': '답글',
    'th_reposts': '리포스트',
    'th_quotes': '인용',
    'th_text': '본문',
    'th_published': '게시',
    'th_account': '계정',
    'th_tier': '계층',
    'th_posts': '게시물',
    'th_hits': '핫',
    'th_hit_rate': '핫 비율',
    'th_inter': '총 인터랙션',
    'th_avg_inter': '평균',
    'th_best': '최고',
    'th_dirs': '주력 분야',
    'th_last': '최근 활동',
    'th_note': '메모',
    'th_new': '신규',

    'm_like': '좋아요',
    'm_reply': '답글',
    'm_repost': '리포스트',
    'm_quote': '인용',
    'm_likes': '좋아요',
    'm_replies': '답글',
    'm_reposts': '리포스트',
    'm_quotes': '인용',

    'cat_ungrouped': '미분류',
    'cat_model': '모델',
    'cat_image': '이미지 생성',
    'cat_prompt': '프롬프트',
    'cat_video': '동영상',
    'cat_agent': 'Agent & 도구',

    'media_text': '텍스트',
    'media_image': '이미지 1장',
    'media_carousel': '이미지 여러 장',
    'media_video': '동영상',
    'media_unknown': '알 수 없음',

    'dw_see_all': '@{user}의 관련 게시물 전체 보기 →',
    'dw_score': '바이럴 점수',
    'dw_velocity': '상승 속도',
    'dw_per_hour': '인터랙션 / 시간',
    'dw_growth': '인터랙션 증가 · 총 {n}회 샘플링',
    'dw_growth_range': '최초 {first} → 최신 {last} 인터랙션',
    'dw_section_text': '본문',
    'dw_section_attrs': '속성',
    'dw_section_dirs': '주력 분야',
    'dw_section_kw': '일치 키워드',
    'dw_section_posts': '관련 게시물 · {n}건',
    'dw_no_posts': '관련 게시물이 없습니다.',
    'dw_open': 'Threads에서 원본 게시물 열기 ↗',
    'dw_unknown_lang': '언어 미상',
    'dw_relevance_why': '판정 근거: {note}',
    'dw_posts_count': '게시물 {n}건',
    'dw_last_active': '최근 활동 {when}',
    'dw_per_week': '주 {n}건',
    'dw_verified': '인증됨',

    'rel_relevant': '관련',
    'rel_blocked': '차단됨',
    'rel_offtopic': '무관',

    'w_watching': '<b>{accounts}</b>개 계정을 지켜보는 중입니다. 그중 <b>{withnew}</b>개가 이번 주기에 새 게시물이 있고, 새 게시물은 총 <b>{newposts}</b>건입니다.<br><span style="color:var(--faint);font-size:12px">아직 DB에 없는 계정은 0으로 표시됩니다(관심 등록은 표시일 뿐, 수집 스위치가 아닙니다). 계정 이름을 클릭하면 관련 게시물 전체를 볼 수 있고, ★는 「경쟁사 모니터」 탭에서도 누를 수 있습니다.</span>',
    'w_stat_accounts': '관심 계정',
    'w_stat_with_posts': '데이터 있음',
    'w_stat_with_new': '새 게시물',
    'w_stat_new_posts': '이번 주기 신규',
    'w_stat_hits': '누적 핫 게시물',
    'w_stat_inter': '총 인터랙션',
    'w_panel_title': '관심 계정 추가',
    'w_ph': 'Threads 계정 (@핸들 또는 프로필 링크 붙여넣기 가능)',
    'w_note_ph': '메모 (선택)',
    'btn_follow': '관심 등록',
    'w_hint': '목록은 <code>watchlist.txt</code>에 기록되며, 파일에 직접 줄을 추가해도 됩니다(형식 <code>계정 | 메모</code>). 재시작 시 자동으로 읽어옵니다.<br>관심 등록은 「골라서 지켜보는」 기능일 뿐입니다. 계정이 키워드에 걸려 DB에 들어가야 게시물 수와 핫 게시물 수가 붙습니다. 아직 없는 계정은 0으로 표시됩니다.',
    'w_star_on': '★ 관심 등록됨',
    'w_star_off': '☆ 이 계정 관심 등록',
    'w_to_watch': '「관심 목록」 탭에서 모아 볼 수 있습니다',
    'w_added_hint': '추가하면 「관심 목록」 탭에서 모아 볼 수 있습니다',
    'w_removed': '관심 목록에서 제거했습니다',
    'w_unfollow': '관심 해제',
    'w_remove_title': '@{user}을(를) 관심 목록에서 제거할까요?',
    'w_not_in_db': '아직 DB에 없음',
    'w_last_active': '최근 활동 {when}',
    'op_failed': '작업 실패',

    'cov_main': 'DB에 <b>{total}</b>개 계정이 있지만, 관련 게시물을 2건 이상 올린 계정은 <b>{multi}</b>개({pct}%)뿐이고 나머지는 한 번만 나타났습니다.<br><span style="color:var(--faint);font-size:12px">경쟁사 순위는 여러 차례 수집으로 쌓입니다. 수집을 거듭할수록 「지속적으로 올리는」 계정이 드러납니다. 핫 기준 = 게시물 1건 인터랙션 ≥ {th}.</span>',
    'tier_all': '전체',
    'tier_core': '핵심 모니터링',
    'tier_steady': '지속 작성',
    'tier_single': '단발 핫',
    'tier_casual': '간헐적 등장',

    'csv_nothing': '내보낼 결과가 없습니다',
    'csv_posts_file': 'threads_핫게시물_',
    'csv_authors_file': 'threads_경쟁계정_',
    'csv_watch_file': 'threads_관심목록_',
    'csv_rank': '순위',
    'csv_post_id': '게시물 ID',
    'csv_account': '계정',
    'csv_group': '그룹',
    'csv_score': '바이럴 점수',
    'csv_velocity': '상승 속도',
    'csv_likes': '좋아요',
    'csv_replies': '답글',
    'csv_reposts': '리포스트',
    'csv_quotes': '인용',
    'csv_inter': '총 인터랙션',
    'csv_avg_inter': '게시물당 평균',
    'csv_published': '게시 시각',
    'csv_kw': '일치 키워드',
    'csv_text': '본문',
    'csv_thumb': '썸네일',
    'csv_url': '링크',
    'csv_tier': '계층',
    'csv_posts': '관련 게시물 수',
    'csv_hits': '핫 게시물 수',
    'csv_rate': '핫 비율',
    'csv_best_score': '최고 점수',
    'csv_best_likes': '최다 좋아요',
    'csv_new': '이번 주기 신규',
    'csv_last': '최근 활동',
    'csv_active_days': '활동 일수',
    'csv_per_week': '주당 게시물',
    'csv_dirs': '주력 분야',
    'csv_note': '메모',
    'csv_added': '추가 시각',

    'probe_ok': '채널 정상\n{bytes} 바이트 수신, 게시물 {posts}건 파싱',
    'probe_fail': '채널 불통\n원인: {reason}\n{hint}\n\n{detail}',

    'ago_just': '방금',
    'ago_min': '{n}분 전',
    'ago_hour': '{n}시간 전',
    'ago_day': '{n}일 전',
    'ago_month': '{n}개월 전'
  }

  };

  /* 所有键都过一遍这条检查：键名里只准出现小写字母、数字、下划线或 -。
     中文键名（比如写字典时手滑打成 '品牌'）会让 T() 永远取不到值，
     而且在源码里看着还挺像那么回事——所以直接拦在加载阶段。 */
  var KEY_RE = /^[a-z0-9_-]+$/;

  /* ------------------------------------------------------------------ */
  /* 语言解析：localStorage → 浏览器语言 → 简体中文                       */
  /* ------------------------------------------------------------------ */
  var LANGS = ['zh', 'en', 'zh-TW', 'ja', 'ko'];
  var STORE_KEY = 'threads_radar_lang';

  /* 浏览器语言标签 → 本站五语之一。zh-Hant/zh-TW/zh-HK → zh-TW；其余 zh* → zh。 */
  function normalize(tag) {
    if (!tag) return null;
    var t = String(tag).toLowerCase();
    if (t.indexOf('zh') === 0) {
      if (/hant|tw|hk|mo/.test(t)) return 'zh-TW';
      return 'zh';
    }
    if (t.indexOf('en') === 0) return 'en';
    if (t.indexOf('ja') === 0) return 'ja';
    if (t.indexOf('ko') === 0) return 'ko';
    return null;
  }

  function detect() {
    var saved = null;
    try { saved = global.localStorage.getItem(STORE_KEY); } catch (e) {}
    if (saved && LANGS.indexOf(saved) >= 0) return saved;
    var nav = global.navigator || {};
    var cands = (nav.languages && nav.languages.length) ? nav.languages : [nav.language];
    for (var i = 0; i < cands.length; i++) {
      var hit = normalize(cands[i]);
      if (hit) return hit;
    }
    return 'zh';
  }

  var current = detect();

  /* 字典键名的合法性 —— 只在载入时跑一次，代价可忽略 */
  var badKeys = Object.keys(DICT.zh).filter(function (k) { return k[0] !== '_' && !KEY_RE.test(k); });
  if (badKeys.length && typeof console !== 'undefined' && console.warn) {
    console.warn('[i18n] 键名不合规，应为小写字母/数字/下划线：', badKeys);
  }

  /* 字典里带 {占位符} 的键，各语言占位符集合必须一致，
     否则某个语言会漏填参数（典型症状是界面上留一个 {n} 没收掉）。 */
  var varMismatch = [];
  Object.keys(DICT.zh).forEach(function (k) {
    if (k[0] === '_') return;
    var base = (String(DICT.zh[k]).match(/\{\w+\}/g) || []).sort().join(',');
    LANGS.forEach(function (l) {
      var v = DICT[l][k];
      if (v === undefined) return;
      var cur = (String(v).match(/\{\w+\}/g) || []).sort().join(',');
      if (cur !== base) varMismatch.push(l + '.' + k + ' [' + base + '] ≠ [' + cur + ']');
    });
  });
  if (varMismatch.length && typeof console !== 'undefined' && console.warn) {
    console.warn('[i18n] 占位符不一致：', varMismatch);
  }

  /* 取词 + {占位符} 替换。缺键时退回简体中文，再缺就直接把键名亮出来——
     宁可屏幕上出现 'th_score' 这种刺眼的东西，也不要静默显示空白。 */
  function T(key, vars) {
    var pack = DICT[current] || DICT.zh;
    var s = pack[key];
    if (s === undefined) s = DICT.zh[key];
    if (s === undefined) return key;
    if (vars) {
      s = s.replace(/\{(\w+)\}/g, function (m, k) {
        return (vars[k] === undefined || vars[k] === null) ? m : String(vars[k]);
      });
    }
    return s;
  }

  /* 当前语言是否是 CJK —— 用于决定「条 / 个」这类量词后缀要不要显示 */
  function isCJK() { return CJK_CODES.indexOf(current) === 0 || current === 'ja'; }

  /* JSON 里拿到的可能是 unicode 转义的字面串（如 \u5217），
     统一解回真实字符，避免拿它当字典键时对不上。 */
  function unesc(s) {
    if (!s || String(s).indexOf('\\u') < 0) return s;
    try { return JSON.parse('"' + String(s).replace(/"/g, '\\"') + '"'); }
    catch (e) { return s; }
  }

  /* ------------------------------------------------------------------ */
  /* DOM 应用层                                                          */
  /* ------------------------------------------------------------------ */

  /* 静态文案：<el data-i18n="key"> */
  function applyStatic(root) {
    var host = root || global.document;
    if (!host || !host.querySelectorAll) return;
    host.querySelectorAll('[data-i18n]').forEach(function (el) {
      var k = el.getAttribute('data-i18n');
      if (!k) return;
      el.innerHTML = T(k);
    });
    /* placeholder 单独一条属性，因为它不在 innerHTML 里 */
    host.querySelectorAll('[data-i18n-ph]').forEach(function (el) {
      var k = el.getAttribute('data-i18n-ph');
      if (k) el.setAttribute('placeholder', T(k));
    });
    /* title（悬停提示）。带 data-no-i18n 的元素一律跳过——语言名不能被翻译，
       否则切到日文后菜单里就找不到「简体中文」这一项了。 */
    host.querySelectorAll('[data-i18n-title]').forEach(function (el) {
      var k = el.getAttribute('data-i18n-title');
      if (k) el.setAttribute('title', T(k));
    });
  }

  function setLang(lang) {
    if (LANGS.indexOf(lang) < 0) return;
    current = lang;
    try { global.localStorage.setItem(STORE_KEY, lang); } catch (e) {}
    var d = global.document;
    if (d && d.documentElement) d.documentElement.setAttribute('lang', lang);
    if (d && d.title !== undefined) {
      /* 标题三语以上都按同一格式：品牌 · 副标题 */
      var titleKey = 'brand_sub';
      d.title = T('brand') + ' · ' + T(titleKey);
    }
  }

  /* 相对时间。用 Intl 让每种语言自己决定单复数与词序，
     比在字典里塞 4 个模板再手拼靠谱得多。 */
  var RTF = (typeof global.Intl !== 'undefined' && global.Intl.RelativeTimeFormat)
    ? global.Intl.RelativeTimeFormat : null;

  function agoText(seconds) {
    var d = seconds;
    var val, unit;
    if (d < 60) return T('ago_just');
    if (d < 3600) { val = Math.round(d / 60); unit = 'minute'; }
    else if (d < 86400) { val = Math.round(d / 3600); unit = 'hour'; }
    else if (d < 86400 * 30) { val = Math.round(d / 86400); unit = 'day'; }
    else { val = Math.round(d / 86400 / 30); unit = 'month'; }
    if (RTF) {
      try {
        return new RTF(current, { numeric: 'auto', style: 'short' }).format(-val, unit);
      } catch (e) { /* 落到下面的兜底模板 */ }
    }
    return unit === 'minute' ? T('ago_min', { n: val })
         : unit === 'hour' ? T('ago_hour', { n: val })
         : unit === 'day' ? T('ago_day', { n: val })
         : T('ago_month', { n: val });
  }

  /* 切换语言时要重跑的回调（各视图的 render 函数会注册进来） */
  var listeners = [];
  function onLangChange(fn) { if (typeof fn === 'function') listeners.push(fn); }
  function emit() { listeners.forEach(function (fn) { try { fn(); } catch (e) {} }); }

  /* 供语言下拉框用 */
  function langOptions() {
    return LANGS.map(function (l) { return { code: l, name: DICT[l]._name }; });
  }

  global.I18N = {
    T: T,
    setLang: setLang,
    getLang: function () { return current; },
    langs: LANGS,
    options: langOptions,
    applyStatic: applyStatic,
    onLangChange: onLangChange,
    emit: emit,
    ago: agoText,
    isCJK: isCJK,
    unesc: unesc,
    normalize: normalize,
    dict: DICT
  };
})(window);
