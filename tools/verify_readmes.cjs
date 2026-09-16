/* ============================================================================
   多语言 README 一致性校验
   ----------------------------------------------------------------------------
   跑法：
     "C:/Users/lianxiang/.workbuddy/binaries/node/versions/22.22.2-3/node.exe" \
       tools/verify_readmes.cjs

   查四件事：
     1. 五份 README 内部锚点全部有效（含中文/日文/韩文标题的 slug 规则）
     2. 五份 README 结构一致：H2 数量、表格行数一致 —— 加了一节却漏翻另一份会当场暴露
     3. 顶部语言切换互相指得到，且都指向真实存在的文件
     4. 语言切换里恰好列出五种语言、没有自我指向（当前语言应当是不可点的纯文本）

   ⚠️ 关于 slug 规则（这块很容易踩坑，写清楚免得下次又试半天）
   GitHub 的锚点不是「连续空白压成一个连字符」，而是「每个空白字符各换一个连字符」。
   所以「## 部署 / 给别人用」删掉 `/` 后剩两个空格 → 两个连字符 → #部署--给别人用。
   这个规则是从线上已验证可用的链接反推出来的，不是猜的。
   ============================================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FILES = [
  { f: 'README.md',      lang: '简体中文' },
  { f: 'README.en.md',   lang: 'English' },
  { f: 'README.zh-TW.md',lang: '繁體中文' },
  { f: 'README.ja.md',   lang: '日本語' },
  { f: 'README.ko.md',   lang: '한국어' },
];

let fail = 0;
function check(ok, label, detail) {
  if (ok) console.log('  ✔ ' + label);
  else { fail++; console.log('  ✘ ' + label + (detail ? '\n      ' + detail : '')); }
}

/* GitHub 锚点规则：小写 → 删非字母数字（保留 _ - 空格）→ trim → 每个空白各换一个 - */
const slug = s => s.toLowerCase()
  .replace(/[^\p{L}\p{N}\p{M}\p{Pc}\- ]/gu, '')
  .replace(/^\s+|\s+$/g, '')
  .replace(/\s/g, '-');

const texts = {};
for (const { f } of FILES) texts[f] = fs.readFileSync(path.join(ROOT, f), 'utf8');

/* ---------- 1. 锚点 ---------- */
console.log('【1】内部锚点有效');
let totalAnchors = 0;
for (const { f } of FILES) {
  const t = texts[f];
  const heads = new Set([...t.matchAll(/^#{1,6}\s+(.+)$/gm)].map(m => slug(m[1])));
  const links = [...t.matchAll(/\]\(#([^)]+)\)/g)].map(m => m[1]);
  totalAnchors += links.length;
  const miss = [...new Set(links.filter(l => !heads.has(l)))];
  check(miss.length === 0, f + ' 的 ' + links.length + ' 条锚点全部有效',
        miss.length ? '断链：' + miss.slice(0, 6).join(', ') : '');
}

/* ---------- 2. 结构一致 ---------- */
console.log('\n【2】五份结构一致');
const stats = {};
for (const { f } of FILES) {
  const t = texts[f];
  stats[f] = {
    h1: (t.match(/^# /gm) || []).length,
    h2: (t.match(/^## /gm) || []).length,
    h3: (t.match(/^### /gm) || []).length,
    rows: (t.match(/^\|/gm) || []).length,
    imgs: (t.match(/!\[[^\]]*\]\([^)]+\)/g) || []).length,
    badges: (t.match(/img\.shields\.io/g) || []).length,
  };
}
const base = stats['README.md'];
for (const { f } of FILES) {
  const s = stats[f];
  const diff = Object.keys(base).filter(k => base[k] !== s[k])
    .map(k => k + ': zh=' + base[k] + ' ' + f + '=' + s[k]);
  check(diff.length === 0, f + ' 与 README.md 结构一致（H2=' + s.h2 + ' 表格行=' + s.rows + ' 图=' + s.imgs + ' 徽章=' + s.badges + '）',
        diff.join(' ／ '));
}

/* ---------- 3. 语言切换互链 ---------- */
console.log('\n【3】顶部语言切换');
for (const { f } of FILES) {
  const line = (texts[f].split('\n')[0] || '');
  /* 第一行应当形如：**简体中文** | [**English**](README.en.md) | ... */
  const linked = [...line.matchAll(/\[[^\]]*\]\(([^)]+\.md)\)/g)].map(m => m[1]);
  const others = FILES.filter(x => x.f !== f).map(x => x.f);
  const missing = others.filter(o => !linked.includes(o));
  check(missing.length === 0 && linked.length === 4,
        f + ' 顶部链接到其余 4 种语言', linked.length !== 4 ? '实得 ' + linked.length + ' 条' : '缺：' + missing.join(', '));
  /* 当前语言应当是纯文本（不可点），否则点自己会跳走 */
  const selfLinked = new RegExp('\\[[^\\]]*\\]\\(' + f.replace('.', '\\.') + '\\)').test(line);
  check(!selfLinked, f + ' 当前语言为纯文本（不自链接）');
}

/* ---------- 4. 五语齐全 ---------- */
console.log('\n【4】语言齐全');
const present = FILES.filter(x => fs.existsSync(path.join(ROOT, x.f))).map(x => x.lang);
check(present.length === 5, '五份 README 文件都存在', '实得：' + present.join(' / '));
const allText = Object.values(texts).join('\n');
const missingLang = ['简体中文', 'English', '繁體中文', '日本語', '한국어'].filter(l => !allText.includes(l));
check(missingLang.length === 0, '语言切换列出了全部五种语言', missingLang.length ? '缺：' + missingLang.join(', ') : '');

/* ---------- 汇总 ---------- */
console.log('');
console.log('─'.repeat(70));
if (fail) { console.log('失败 ' + fail + ' 项'); process.exit(1); }
console.log('✔ 五份 README 校验通过（' + totalAnchors + ' 条锚点、' + base.h2 + ' 个 H2、' +
            base.rows + ' 行表格、' + base.imgs + ' 张图）');
