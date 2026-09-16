/* ============================================================================
   多语言字典静态校验（不需要起服务，毫秒级）
   ----------------------------------------------------------------------------
   跑法：
     "C:/Users/lianxiang/.workbuddy/binaries/node/versions/22.22.2-3/node.exe" \
       tools/verify_i18n_static.cjs

   查五件事（任何一条不过就退出码 1）：
     1. 五种语言的键集合完全一致 —— 少一条就是某语言会显示成键名
     2. 同一条文案里的占位符 {name} 在五种语言下完全一致 —— 少一个 {n} 会渲染出 undefined
     3. index.html 里 T('key') / data-i18n*="key" 引用的键都真实存在 —— 防拼写错
     4. 字典里没有「谁都不引用」的孤儿键 —— 防改了代码忘了删词条
     5. 键名格式合规（小写字母/数字/下划线），占位符写法统一
   ============================================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const I18N = path.join(ROOT, 'web', 'i18n.js');
const HTML = path.join(ROOT, 'web', 'index.html');
const LANGS = ['zh', 'en', 'zh-TW', 'ja', 'ko'];
const BASE = 'zh';

let fail = 0;
const errs = [];
function check(ok, label, detail) {
  if (ok) console.log('  ✔ ' + label);
  else { fail++; errs.push(label + (detail ? '\n      ' + detail : '')); console.log('  ✘ ' + label + (detail ? '\n      ' + detail : '')); }
}

/* ---------- 1. 把字典从 i18n.js 里取出来（不执行，直接抓 module.exports 那一段） ---------- */
const src = fs.readFileSync(I18N, 'utf8');
const marker = 'window.I18N = {';
/* 用 Node 的 vm 在伪 window 里跑一遍，拿到和浏览器里一模一样的对象 ——
   比正则抠字面量可靠得多，也不受注释、转义、模板串影响。 */
const vm = require('vm');
const sandbox = { window: {}, document: { documentElement: {}, title: '' }, navigator: { languages: ['zh-CN'] },
  localStorage: { getItem: () => null, setItem: () => {} }, console: { warn: () => {} } };
sandbox.window.localStorage = sandbox.localStorage;
sandbox.window.navigator = sandbox.navigator;
sandbox.window.document = sandbox.document;
sandbox.window.console = sandbox.console;
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: 'i18n.js' });
const I18N_OBJ = sandbox.window.I18N;
if (!I18N_OBJ) { console.error('i18n.js 没有挂上 window.I18N'); process.exit(2); }
const DICT = I18N_OBJ.dict;

console.log('字典：' + LANGS.map(l => l + '=' + Object.keys(DICT[l] || {}).length).join('  '));
console.log('');

/* ---------- 2. 键集合一致 ---------- */
console.log('【1】五种语言键集合一致');
const baseKeys = Object.keys(DICT[BASE]).filter(k => k[0] !== '_');
for (const L of LANGS) {
  if (L === BASE) continue;
  const cur = Object.keys(DICT[L] || {}).filter(k => k[0] !== '_');
  const missing = baseKeys.filter(k => !cur.includes(k));
  const extra = cur.filter(k => !baseKeys.includes(k));
  check(missing.length === 0 && extra.length === 0,
        L + ' 与 ' + BASE + ' 键集合一致（' + cur.length + ' 条）',
        [missing.length ? '缺 ' + missing.length + '：' + missing.slice(0, 8).join(',') : '',
         extra.length ? '多 ' + extra.length + '：' + extra.slice(0, 8).join(',') : ''].filter(Boolean).join(' ／ '));
}

/* ---------- 3. 占位符一致 ---------- */
console.log('\n【2】占位符 {x} 跨语言一致');
const varsOf = s => (String(s).match(/\{\w+\}/g) || []).sort().join(',');
const mismatch = [];
for (const k of baseKeys) {
  const base = varsOf(DICT[BASE][k]);
  for (const L of LANGS) {
    if (L === BASE || !(k in DICT[L])) continue;
    const cur = varsOf(DICT[L][k]);
    if (cur !== base) mismatch.push(L + '.' + k + '  [' + base + '] vs [' + cur + ']');
  }
}
check(mismatch.length === 0, '占位符全部对齐（' + baseKeys.length + ' 条 × ' + (LANGS.length - 1) + ' 语言）',
      mismatch.length ? mismatch.slice(0, 12).join('\n      ') : '');

/* ---------- 4. index.html 引用的键都存在 ---------- */
console.log('\n【3】index.html 引用的键都存在');
const html = fs.readFileSync(HTML, 'utf8');
const refs = new Set();
let m;
/* T('key')  /  T("key") */
const reT = /\bT\(\s*['"]([a-zA-Z0-9_-]+)['"]/g;
while ((m = reT.exec(html))) refs.add(m[1]);
/* data-i18n="key" / data-i18n-ph="key" / data-i18n-title="key" */
const reA = /data-i18n(?:-ph|-title)?\s*=\s*["']([a-zA-Z0-9_-]+)["']/g;
while ((m = reA.exec(html))) refs.add(m[1]);
/* em('key') —— 单位词走这个 helper，参数同样是字典键，别漏了 */
const reEm = /\bem\(\s*['"]([a-zA-Z0-9_-]+)['"]/g;
while ((m = reEm.exec(html))) refs.add(m[1]);
const refList = [...refs].sort();
const missingKeys = refList.filter(k => !(k in DICT[BASE]));
check(missingKeys.length === 0,
      '引用的 ' + refList.length + ' 个键全部存在于字典',
      missingKeys.length ? '缺：' + missingKeys.join(', ') : '');

/* 反向：每种语言都得有这些键（复用第 1 项的结论，但这里针对“被引用”这个子集再确认一次） */
const langMiss = [];
for (const L of LANGS) {
  refList.forEach(k => { if (!(k in DICT[L])) langMiss.push(L + '.' + k); });
}
check(langMiss.length === 0, '被引用的键在五种语言下都存在',
      langMiss.length ? langMiss.slice(0, 12).join(', ') : '');

/* ---------- 5. 孤儿键（谁都不引用） ---------- */
console.log('\n【4】字典无孤儿键');
/* 运行时才会用到的键：由代码里的映射表间接引用，静态抓不到。逐条写明理由。 */
const RUNTIME_ONLY = new Set([
  'lang_label',                                    /* 由 i18n.js 自己用在语言下拉的 title */
  'ago_just', 'ago_min', 'ago_hour', 'ago_day', 'ago_month',  /* i18n.js 的 ago() 兜底模板 */
  'cat_ungrouped', 'cat_model', 'cat_image', 'cat_prompt', 'cat_video', 'cat_agent',
  /* 上面这批：分组名不翻译，但兜底词 cat_ungrouped 是运行时拼的；
     其余 5 个留作「万一将来要显示译文名」的备用词条 —— 若确认永不用，可删。 */
  'w_unfollow', 'w_star_off', 'kw_del_title',      /* 由 JS 生成 title 时用 T() 包着，正则会漏 */
]);
const orphans = baseKeys.filter(k => !refs.has(k) && !RUNTIME_ONLY.has(k));
check(orphans.length === 0, '无孤儿键（未被引用 ' + orphans.length + ' 条）',
      orphans.length ? orphans.join(', ') : '');

/* ---------- 6. 键名格式 ---------- */
console.log('\n【5】键名格式与空值');
const badName = baseKeys.filter(k => !/^[a-z0-9_]+$/.test(k));
check(badName.length === 0, '键名均为小写字母/数字/下划线',
      badName.length ? badName.join(', ') : '');
/* 允许「故意留空」的译文。空串在这里是一个有含义的值：
   「这个语言不需要这个词」。逐条写明理由，否则空译文这个断言就没价值了。
   注意 unit_posts / unit_accounts 只允许 en 为空 —— 其他语言空着就是漏翻。 */
const INTENTIONALLY_EMPTY = new Set([
  'en.unit_posts',      /* 英文「3 results」不写量词；中文「3 条」要写 */
  'en.unit_accounts'    /* 同上 */
]);
const empties = [];
for (const L of LANGS) {
  for (const k of Object.keys(DICT[L])) {
    if (k[0] === '_') continue;
    if (!DICT[L][k] || !String(DICT[L][k]).trim()) {
      if (!INTENTIONALLY_EMPTY.has(L + '.' + k)) empties.push(L + '.' + k);
    }
  }
}
check(empties.length === 0, '没有意外为空的译文（允许 ' + INTENTIONALLY_EMPTY.size + ' 条有意留空）',
      empties.length ? empties.slice(0, 12).join(', ') : '');
/* 反向：不该留空的语言若也留了空，得能发现 */
const wrongEmpty = [];
for (const L of LANGS) {
  if (L === 'en') continue;
  for (const k of ['unit_posts', 'unit_accounts']) {
    if (!String(DICT[L][k] || '').trim()) wrongEmpty.push(L + '.' + k);
  }
}
check(wrongEmpty.length === 0, 'unit_posts / unit_accounts 只有英文允许留空',
      wrongEmpty.length ? wrongEmpty.join(', ') : '');

/* ---------- 汇总 ---------- */
console.log('');
console.log('─'.repeat(70));
if (fail) {
  console.log('失败 ' + fail + ' 项：');
  errs.forEach(e => console.log('  ✘ ' + e));
  process.exit(1);
}
console.log('✔ 静态校验全部通过（' + baseKeys.length + ' 键 × ' + LANGS.length + ' 语言 = ' +
            baseKeys.length * LANGS.length + ' 条译文）');
