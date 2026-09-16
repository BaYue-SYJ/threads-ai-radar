/* 五种语言下的界面文案抽样，用来人工过一眼翻译质量。
   （截图在这台机器上跑不通：headless Chrome 会挂住，所以改用文本抽样。）
   跑法：
     NODE_PATH=<托管 node 工作区>/node_modules node tools/i18n_sample.cjs
*/
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const BASE = process.argv[2] || 'http://127.0.0.1:8650';
const WEB = path.resolve(__dirname, '..', 'web');
const LANGS = ['zh', 'en', 'zh-TW', 'ja', 'ko'];

const SAMPLES = [
  ['导航标签',   w => [...w.document.querySelectorAll('#tabs button')].map(b => b.textContent.trim()).join(' | ')],
  ['状态栏',     w => w.document.querySelector('#stateText')?.textContent.trim()],
  ['采集间隔',   w => [...w.document.querySelectorAll('#intervalSel option')].map(o => o.textContent.trim()).join(' | ')],
  ['按钮组',     w => ['#collectBtn', '#probeBtn2', '#expPosts'].map(s => w.document.querySelector(s)?.textContent.trim()).join(' | ')],
  ['搜索占位',   w => w.document.querySelector('#q')?.getAttribute('placeholder')],
  ['过滤开关',   w => [...w.document.querySelectorAll('.sw')].map(e => e.textContent.trim()).join(' | ')],
  ['统计卡说明', w => [...w.document.querySelectorAll('.stat-t')].map(e => e.textContent.trim()).join(' | ')],
  ['结果计数',   w => w.document.querySelector('#rNote')?.textContent.trim()],
  ['排序下拉',   w => [...w.document.querySelectorAll('#sortSel option')].map(o => o.textContent.trim()).join(' | ')],
  ['卡片指标',   w => [...w.document.querySelectorAll('#stage .p-metrics span')].slice(0, 4).map(s => s.textContent.trim()).join(' | ')],
  ['卡片时间',   w => w.document.querySelector('#stage .p-time')?.textContent.trim()],
  ['语言下拉',   w => [...w.document.querySelectorAll('#langSel option')].map(o => o.textContent.trim()).join(' | ')],
];

(async () => {
  const htmlRaw = await (await fetch(BASE + '/')).text();
  const i18nSrc = fs.readFileSync(path.join(WEB, 'i18n.js'), 'utf8');
  const blocks = htmlRaw.match(/<script>([\s\S]*?)<\/script>/g) || [];
  const mainSrc = blocks.length ? blocks[blocks.length - 1].replace(/^<script>/, '').replace(/<\/script>$/, '') : '';
  const html = htmlRaw.replace(/<script src="i18n\.js"><\/script>\s*/i, '')
                       .replace(/<script>[\s\S]*?<\/script>\s*(?=<\/body>)/, '');

  const vc = new VirtualConsole();
  vc.on('jsdomError', () => {});
  const dom = new JSDOM(html, { url: BASE + '/', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc });
  const { window } = dom;
  window.fetch = (u, o) => fetch(String(u).startsWith('http') ? String(u) : BASE + u, o);
  window.EventSource = class { addEventListener() {} close() {} };
  window.eval(i18nSrc);
  window.eval(mainSrc);
  await new Promise(r => setTimeout(r, 2500));

  const rows = [];
  for (const L of LANGS) {
    const sel = window.document.getElementById('langSel');
    sel.value = L;
    sel.dispatchEvent(new window.Event('change'));
    await new Promise(r => setTimeout(r, 400));
    const rec = { lang: L, title: window.document.title, html: window.document.documentElement.getAttribute('lang') };
    SAMPLES.forEach(([name, fn]) => {
      try { const v = fn(window); if (v) rec[name] = String(v).slice(0, 160); } catch (e) { /* 忽略 */ }
    });
    /* 表格视图单独取（要点了才存在） */
    const tb = window.document.querySelector('#viewSeg button[data-v="table"]');
    if (tb) {
      tb.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await new Promise(r => setTimeout(r, 250));
      rec['表头'] = [...window.document.querySelectorAll('#stage thead th')].map(e => e.textContent.trim()).join(' | ');
      window.document.querySelector('#viewSeg button[data-v="card"]')
        ?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await new Promise(r => setTimeout(r, 150));
    }
    rows.push(rec);
  }

  const keys = ['title', 'html', ...SAMPLES.map(s => s[0])].filter(k => rows.some(r => r[k]));
  for (const k of keys) {
    console.log('\n■ ' + k);
    rows.forEach(r => console.log('   ' + r.lang.padEnd(6) + ' ' + (r[k] || '—')));
  }
  console.log('');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(2); });
