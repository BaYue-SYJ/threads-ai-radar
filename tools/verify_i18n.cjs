/* ============================================================================
   UI 多语言端到端验证
   ----------------------------------------------------------------------------
   跑法（jsdom 在托管 node 工作区，必须显式设 NODE_PATH）：
     NODE_PATH=C:/Users/lianxiang/.workbuddy/binaries/node/workspace/node_modules \
       node tools/verify_i18n.cjs [http://127.0.0.1:8650]

   做四件事：
     1. 真的把 index.html 加载进 jsdom，真的执行 i18n.js 和内联脚本
     2. 逐个切五种语言，抓 <html lang> / <title> / 导航 / 表头 / 空状态 / 下拉项
     3. 断言渲染结果里不再有中文残留（英文页）、也不出现字典键名或 undefined
     4. 断言真实数据（帖子正文、账号名、分组名）在各语言下逐字不变
   ============================================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const BASE = process.argv[2] || 'http://127.0.0.1:8650';
const WEB = path.resolve(__dirname, '..', 'web');

const LANGS = ['zh', 'en', 'zh-TW', 'ja', 'ko'];
/* 各语言下「只能这么翻」的锚点词，用来证明切换真的生效了，而不是只换了 lang 属性 */
const ANCHOR = {
  zh:    { tab: '关键词雷达',  run: '立即采集',  score: '评分',   metric: '赞' },
  en:    { tab: 'Keyword Radar', run: 'Collect now', score: 'Score', metric: 'Like' },
  'zh-TW':{ tab: '關鍵詞雷達', run: '立即採集',  score: '評分',   metric: '讚' },
  ja:    { tab: 'キーワードレーダー', run: '今すぐ収集', score: 'スコア', metric: 'いいね' },
  ko:    { tab: '키워드 레이더', run: '지금 수집', score: '점수',  metric: '좋아요' }
};

/* 英文页允许保留汉字的地方 —— 每一条都要说得出理由，
   不然「无中文残留」这个断言就变成自欺欺人。 */
const CJK_OK_SELECTORS = [
  '#langSel',                       /* 语言名用各自语言写，本来就不该翻 */
  '#kwChips', '#catChips',          /* 关键词 / 分组芯片：内容是 keywords.txt 的数据值 */
  '.tx', '.txw',                    /* 帖子正文：用户自己发的中文 */
  '.p-text', '.dw-text',            /* 同上，卡片与详情里的正文 */
  '.tag', '.chip', '.dirs',         /* 分组 / 关键词 / 主攻方向：数据侧的值 */
  '.usr', '.acard-u', '.p-user',    /* 账号名 */
  '.kwlist', '.logbox', '.cv-s',    /* 关键词列表 / 日志正文 / 覆盖度卡片里的数据 */
  '#q', '#aq', '#wq',               /* 搜索框 placeholder 是给中文数据用的 */
  '#kwInput', '#kwGroup', '#wInput', '#wNote'
];
const CJK_OK_TEXT = [
  /^[\u4e00-\u9fff]{2,6}$/         /* 纯中文短标签：分组名、语言名等数据侧的枚举值 */
];

/* 属性上的中文：placeholder / title / aria-label / value 同样看得见。
   只看 textContent 会漏掉「搜索框提示没翻」这类问题。
   放行清单里的元素「以及它们内部的元素」都不查属性。 */
const CJK_OK_ATTR_SEL = [
  '#langSel',                        /* 语言名 */
  '#q', '#aq', '#wq',                /* 搜索框：提示语是给中文数据用的 */
  '#kwInput', '#kwGroup', '#wInput', '#wNote',
  '.note', '.dirs',                  /* 关注名单里用户自己写的备注（title 也是它） */
  '.tx', '.txw', '.p-text', '.dw-text',
  '.tag', '.chip', '.p-user', '.usr', '.acard-u',
  '#kwChips', '#catChips'
].join(', ');
const CJK_OK_ATTRS = new Set(['placeholder', 'title', 'aria-label']);
function cjkLeftoverAttrs(window) {
  const out = [];
  window.document.querySelectorAll('*').forEach(el => {
    if (el.closest(CJK_OK_ATTR_SEL)) return;
    for (const a of CJK_OK_ATTRS) {
      const v = el.getAttribute && el.getAttribute(a);
      if (v && /[\u4e00-\u9fff]/.test(v)) out.push(a + '="' + v.slice(0, 40) + '"');
    }
  });
  return out;
}

let pass = 0, fail = 0;
const failures = [];
function ok(cond, label, detail) {
  if (cond) { pass++; }
  else { fail++; failures.push(label + (detail ? '  →  ' + detail : '')); }
}

async function bootPage() {
  /* 只接管网络：/api/* 与 /i18n.js 都从真实服务拿，保证测的是线上那份代码 */
  const htmlRaw = await fetchText(BASE + '/');

  /* jsdom 的 HTML 解析器会自己把内联 <script> 执行掉，而它不会为
     <script src> 发请求 —— 结果内联脚本先跑、i18n.js 还没装载，
     在 window.I18N 上直接抛错。真实浏览器里 i18n.js 在 <head> 同步加载，
     顺序是对的。所以这里改写成「先注入 i18n.js、再手动跑内联脚本」，
     跟浏览器一致。改写在字符串上做，不改磁盘上的文件。 */
  const i18nSrc = fs.readFileSync(path.join(WEB, 'i18n.js'), 'utf8');
  const inlineBlocks = htmlRaw.match(/<script>([\s\S]*?)<\/script>/g) || [];
  const mainSrc = inlineBlocks.length
    ? inlineBlocks[inlineBlocks.length - 1].replace(/^<script>/, '').replace(/<\/script>$/, '')
    : '';
  const html = htmlRaw
    .replace(/<script src="i18n\.js"><\/script>\s*/i, '')
    .replace(/<script>[\s\S]*?<\/script>\s*(?=<\/body>)/, '');

  const vc = new VirtualConsole();
  const errors = [];
  vc.on('jsdomError', e => {
    const s = String((e && e.stack) || (e && e.message) || e);
    /* 只保留真正的页面错误，滤掉 jsdom 自己那些 not-implemented 噪音 */
    if (/not implemented/i.test(s)) return;
    errors.push(s.split('\n').slice(0, 3).join(' ⏎ '));
  });

  const dom = new JSDOM(html, {
    url: BASE + '/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc
  });
  const { window } = dom;

  /* jsdom 没有 fetch / EventSource，用 Node 的实现顶上 */
  window.fetch = (u, o) => {
    const url = String(u).startsWith('http') ? String(u) : BASE + u;
    return fetch(url, o);
  };
  window.EventSource = class { constructor() {} addEventListener() {} close() {} };

  /* 1) 先装载字典（等价于 <head> 里的 <script src="i18n.js">） */
  window.eval(i18nSrc);
  ok(!!window.I18N, 'i18n.js 在页面里挂上了 window.I18N');

  /* 2) 再跑主脚本 */
  window.eval(mainSrc);

  /* 等真实数据回来（fetchPosts/fetchWatch/status 都是异步的） */
  await new Promise(r => setTimeout(r, 2500));
  return { dom, window, errors };
}

async function fetchText(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(url + ' → HTTP ' + r.status);
  return r.text();
}

function txt(window, sel) {
  const el = window.document.querySelector(sel);
  return el ? el.textContent.trim() : null;
}
function allTxt(window, sel) {
  return Array.from(window.document.querySelectorAll(sel)).map(e => e.textContent.trim());
}

/* 页面里剩下的中文。用来验证英文页确实没有中文残留。
   CJK 扩展区按「有没有汉字」判定：只查 Basic CJK，避免把日文假名误伤。
   出现汉字的地方若是「非界面元素」，要能逐条说出它凭什么合法。 */
const ALLOWED_CJK = [
  { why: '语言下拉里的语言名本身（此语言的自称）', test: t => /^(简体中文|繁體中文|日本語)$/.test(t) },
  { why: '搜索框 placeholder：用户数据里就是中文关键词', test: () => true, selector: '#q, #aq, #wq, #kwInput, #kwGroup, #wInput, #wNote' },
  { why: '分组名 / 关键词 / 账号 / 正文：来自 keywords.txt 与抓取结果，是数据不是界面', test: () => true, selector: '.tag, .chip, .tx, .p-text, .usr, .acard-u, .dirs, .hint' }
];
function cjkLeftovers(window) {
  const out = [];
  const walk = (el, depth) => {
    if (depth > 24) return;
    for (const n of el.childNodes) {
      if (n.nodeType === 3) {
        const t = n.textContent.trim();
        if (/[\u4e00-\u9fff]/.test(t)) out.push({ t: t.slice(0, 70), el });
      } else if (n.nodeType === 1) {
        const tag = n.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE') continue;
        walk(n, depth + 1);
      }
    }
  };
  walk(window.document.body, 0);

  return out.filter(({ t, el }) => {
    /* 落在数据容器里的一律放行。注意要从 el 自身开始查 ——
       关键词芯片的文案就在 <button class="chip"> 自己的文本结点上，
       若只从 parentElement 起查，chip 这一层会被整个跳过。 */
    let p = el, guard = 0;
    while (p && guard++ < 14) {
      if (p.nodeType === 1) {
        const cls = p.className && typeof p.className === 'string' ? p.className : '';
        if (cls && CJK_OK_SELECTORS.some(s => {
          if (s[0] === '#') return false;
          return new RegExp('(^|\\s)' + s.slice(1) + '(\\s|$)').test(cls);
        })) return false;
        if (p.id && CJK_OK_SELECTORS.includes('#' + p.id)) return false;
      }
      p = p.parentElement;
    }
    /* 属性上的中文也算残留：placeholder / title / value 都是用户看得见的 */
    /* 纯中文短标签（分组名 / 语言名 / 账号名）放行；
       带空格或标点的长句就说明是没翻的界面文案。 */
    if (CJK_OK_TEXT.some(re => re.test(t))) return false;
    return true;
  }).map(x => x.t);
}

/* 收集真实数据样本：帖子正文、账号名、分组名 —— 这些在任何语言下都不能变。
   只取前 20 条：页面每 60s 会自动重拉一次数据，样本越长越可能横跨两次刷新，
   拿来逐字比对就成了假失败。只比「同一批帖子」，才是真的在测翻译。 */
const SAMPLE_N = 20;
function dataSamples(window) {
  const s = { posts: [], authors: [], groups: [], keywords: [] };
  const cards = Array.from(window.document.querySelectorAll('#stage .post')).slice(0, SAMPLE_N);
  cards.forEach(c => {
    const u = c.querySelector('.p-user'); if (u) s.authors.push(u.textContent.trim());
    const t = c.querySelector('.p-text'); if (t) s.posts.push(t.textContent.trim());
    const g = c.querySelector('.p-foot .tag'); if (g) s.groups.push(g.textContent.trim());
  });
  window.document.querySelectorAll('#kwChips .chip').forEach(c => {
    s.keywords.push(c.textContent.replace(/\d+$/, '').trim());
  });
  return s;
}

(async () => {
  console.log('目标：' + BASE);
  console.log('─'.repeat(78));

  const { window, errors } = await bootPage();

  ok(errors.length === 0, '页面加载无 JS 报错', errors.slice(0, 3).join(' | '));

  /* ---------- 语言下拉框存在且含五项 ---------- */
  const opts = allTxt(window, '#langSel option');
  ok(opts.length === 5, '导航栏语言下拉有 5 个选项', '实得 ' + opts.length + '：' + opts.join('/'));
  ok(opts.join('|') === '简体中文|English|繁體中文|日本語|한국어',
     '语言名以各语言自身写法列出（不随当前语言翻译）', opts.join('|'));

  /* ---------- 逐语言切换 ---------- */
  const perLang = {};
  for (const L of LANGS) {
    const sel = window.document.getElementById('langSel');
    sel.value = L;
    sel.dispatchEvent(new window.Event('change'));
    await new Promise(r => setTimeout(r, 350));

    const A = ANCHOR[L];
    const gotTab = allTxt(window, '#tabs button').join('|');
    const gotRun = txt(window, '#collectBtn');

    ok(gotTab.includes(A.tab), '[' + L + '] 标签页译成目标语言', '实得：' + gotTab);
    ok(gotRun === A.run, '[' + L + '] 「立即采集」按钮译成目标语言', '实得：' + gotRun);

    /* 卡片视图下的互动指标行（赞/回覆/转发/引用 + 数字）。
       注意必须趁卡片视图还开着先取 —— 表格视图里 .p-metrics 不存在。
       每格形如「赞<b>123</b>」，取 span 的 textContent 即可拿到「赞123」。 */
    const cardMetric = allTxt(window, '#stage .p-metrics span').join('|');
    ok(cardMetric.includes(A.metric),
       '[' + L + '] 卡片互动指标译成「' + A.metric + '」',
       '实得 ' + allTxt(window, '#stage .p-metrics span').length + ' 格：' + cardMetric.slice(0, 80));

    /* 表头只在表格视图下存在。页面默认是卡片视图，所以先切到表格再取表头 ——
       否则断言测的是一个空集合，永远不成立。取完再切回来保持一致起始状态。 */
    const tblBtn = window.document.querySelector('#viewSeg button[data-v="table"]');
    if (tblBtn) {
      tblBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await new Promise(r => setTimeout(r, 250));
    }
    const ths = allTxt(window, '#stage thead th');
    ok(ths.includes(A.score), '[' + L + '] 表格视图表头译成「' + A.score + '」', '实得：' + ths.join(','));
    const cardBtn = window.document.querySelector('#viewSeg button[data-v="card"]');
    if (cardBtn) {
      cardBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await new Promise(r => setTimeout(r, 120));
    }

    ok(window.document.documentElement.getAttribute('lang') === L,
       '[' + L + '] <html lang> 同步为 ' + L);
    ok((window.document.title || '').length > 0 && !/undefined/.test(window.document.title),
       '[' + L + '] 文档标题已本地化且无 undefined', window.document.title);
    ok(!!window.localStorage.getItem('threads_radar_lang'), '[' + L + '] 语言写入 localStorage');

    /* 全页扫一遍：不该出现字典键名（说明有漏翻的键）或 undefined */
    const body = window.document.body.textContent;
    const leaked = body.match(/\b(?:th_|dw_|csv_|flt_|sort_|w_stat_|stat_|meta_|empty_|ago_)[a-z_]+\b/g);
    ok(!leaked, '[' + L + '] 没有字典键名泄漏到界面', leaked ? leaked.slice(0, 6).join(',') : '');
    ok(!/\bundefined\b/.test(body), '[' + L + '] 界面没有 undefined');

    perLang[L] = {
      samples: dataSamples(window),
      stateText: txt(window, '#stateText'),
      intervalFirst: allTxt(window, '#intervalSel option')[0],
      navBrand: txt(window, '.brand-mark')
    };
  }

  /* ---------- 英文页不应再出现汉字 ---------- */
  window.document.getElementById('langSel').value = 'en';
  window.document.getElementById('langSel').dispatchEvent(new window.Event('change'));
  await new Promise(r => setTimeout(r, 400));
  const left = cjkLeftovers(window);
  ok(left.length === 0, '切到英文后界面无中文残留', left.slice(0, 8).join(' ／ '));
  const leftAttr = cjkLeftoverAttrs(window);
  ok(leftAttr.length === 0, '切到英文后属性（placeholder/title）无中文残留',
     leftAttr.slice(0, 8).join(' ／ '));

  /* ---------- 数据不因切语言而变 ---------- */
  const zhS = perLang.zh.samples, enS = perLang.en.samples, jaS = perLang.ja.samples;
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const n = Math.min(zhS.posts.length, enS.posts.length, jaS.posts.length);
  ok(n > 0, '取到了足够的帖子样本用于跨语言比对', 'n=' + n);
  ok(same(zhS.authors.slice(0, n), enS.authors.slice(0, n)),
     '账号名跨语言逐字不变',
     'zh=' + zhS.authors[0] + ' en=' + enS.authors[0]);
  ok(same(zhS.posts.slice(0, n), jaS.posts.slice(0, n)),
     '帖子正文跨语言逐字不变',
     'zh=' + (zhS.posts[0] || '').slice(0, 24) + ' ja=' + (jaS.posts[0] || '').slice(0, 24));

  /* 分组名分两类：
       (a) keywords.txt / categories.json 里的数据值（模型 / 生图 / 提示词 / 视频 / Agent 与工具…）
           —— 这是用户写进文件里的字符串，跨语言必须逐字不变。译了反而让用户
           拿界面上的词去文件里搜不到。
       (b) 后端兜底的「未分组」—— 不是用户写的，只是占位符，必须跟界面语言走。
     两类分别断言。第 (a) 项的判定用「出现在 zh 侧且不是兜底词」来识别。 */
  const UI_GROUP_WORDS = new Set(
    Object.keys(window.I18N.dict).map(l => window.I18N.dict[l].cat_ungrouped).filter(Boolean)
  );
  const isUI = g => UI_GROUP_WORDS.has(g);
  const m = Math.min(zhS.groups.length, enS.groups.length);
  ok(m > 0, '取到了足够的分组样本用于跨语言比对', 'm=' + m);
  /* 逐位比对：第 i 张卡在两种语言下必须是同一个分组。兜底词两侧归一化后再比，
     这样比的是「有没有错位」，而不是被兜底词的合法翻译干扰。 */
  const slot = g => (isUI(g) ? '<UI:ungrouped>' : g);
  const zhSlots = zhS.groups.slice(0, m).map(slot);
  const enSlots = enS.groups.slice(0, m).map(slot);
  const firstBad = zhSlots.findIndex((v, i) => v !== enSlots[i]);
  ok(firstBad < 0, '同一张卡的归属分组跨语言一致（数据值逐字不变）',
     firstBad < 0 ? '' : '第 ' + firstBad + ' 张：zh=' + zhSlots[firstBad] + ' en=' + enSlots[firstBad]);

  /* 数据值没有被误译：英文页里所有非兜底的分组名，都应当能在 zh 页的同位置找到同样的字 */
  const zhReal = zhSlots.filter(s => s !== '<UI:ungrouped>');
  const enReal = enSlots.filter(s => s !== '<UI:ungrouped>');
  ok(same(zhReal, enReal), '分组名（数据值）没有被翻译掉',
     'zh=' + zhReal.slice(0, 4).join(',') + ' en=' + enReal.slice(0, 4).join(','));

  /* 兜底词确实被译了：位置对齐 + 英文页不出现中文兜底词 */
  const zhUIPos = zhS.groups.slice(0, m).map((g, i) => isUI(g) ? i : -1).filter(i => i >= 0);
  const enUIPos = enS.groups.slice(0, m).map((g, i) => isUI(g) ? i : -1).filter(i => i >= 0);
  ok(same(zhUIPos, enUIPos), '「未分组」在各语言下出现位置一致（被译了，而不是消失了）',
     'zh=' + zhUIPos.slice(0, 6) + ' en=' + enUIPos.slice(0, 6));
  if (zhUIPos.length) {
    ok(enS.groups[zhUIPos[0]] === window.I18N.dict.en.cat_ungrouped,
       '「未分组」在英文下渲染为 ' + window.I18N.dict.en.cat_ungrouped,
       '实得：' + enS.groups[zhUIPos[0]]);
    ok(!enS.groups.slice(0, m).some(g => g === window.I18N.dict.zh.cat_ungrouped),
       '英文页不再出现中文兜底词「未分组」');
  }

  /* ---------- 状态栏 / 间隔选项确实换了语言 ---------- */
  ok(perLang.zh.intervalFirst !== perLang.en.intervalFirst &&
     perLang.zh.intervalFirst !== perLang.ko.intervalFirst,
     '采集间隔选项随语言变化',
     'zh=' + perLang.zh.intervalFirst + ' en=' + perLang.en.intervalFirst + ' ko=' + perLang.ko.intervalFirst);

  /* ---------- 其余两个标签页 ---------- */
  window.document.getElementById('langSel').value = 'ja';
  window.document.getElementById('langSel').dispatchEvent(new window.Event('change'));
  await new Promise(r => setTimeout(r, 200));
  for (const [tab, label] of [['peers', '同行监控'], ['watch', '关注名单']]) {
    const btn = Array.from(window.document.querySelectorAll('#tabs button'))
      .find(b => b.dataset.t === tab);
    btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await new Promise(r => setTimeout(r, 900));
    const head = window.document.querySelector(tab === 'peers' ? '#aStage' : '#wStage');
    const t = head ? head.textContent : '';
    const leaked = t.match(/\b(?:th_|dw_|csv_|flt_|sort_|w_stat_|stat_|meta_|empty_)[a-z_]+\b/g);
    ok(!leaked, '日文「' + label + '」页无键名泄漏', leaked ? leaked.slice(0, 5).join(',') : '');
    ok(!/\bundefined\b/.test(t), '日文「' + label + '」页无 undefined');
  }

  /* ---------- 汇总 ---------- */
  console.log('通过 ' + pass + ' ／ 失败 ' + fail);
  if (fail) {
    console.log('\n失败项：');
    failures.forEach(f => console.log('  ✗ ' + f));
  } else {
    console.log('✔ 全部通过');
  }
  console.log('─'.repeat(78));
  console.log('抽样（各语言导航/状态）：');
  LANGS.forEach(L => {
    const p = perLang[L];
    console.log('  ' + L.padEnd(6) + ' | ' + String(p.navBrand).padEnd(14) + ' | ' +
                String(p.stateText).padEnd(16) + ' | ' + p.intervalFirst);
  });
  process.exit(fail ? 1 : 0);
})().catch(e => {
  console.error('运行失败：', e);
  process.exit(2);
});
