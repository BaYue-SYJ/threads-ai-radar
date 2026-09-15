/* 扫描 node_modules 里 main/exports 指向的文件缺失的包（npm 缓存被截断的典型症状） */
const fs = require('fs'), path = require('path');
const root = process.argv[2] || 'node_modules';
let ok = 0;
const broken = [];

function firstExisting(dir, cands) {
  for (const c of cands) {
    if (typeof c !== 'string') continue;
    try { if (fs.existsSync(path.join(dir, c))) return true; } catch (e) { /* ignore */ }
  }
  return false;
}

function checkDir(dir) {
  let pj;
  try { pj = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')); }
  catch (e) { return; }
  const cands = [];
  const ex = pj.exports;
  if (typeof ex === 'string') cands.push(ex);
  else if (ex && typeof ex === 'object') {
    const r = ex['.'] || ex;
    if (typeof r === 'string') cands.push(r);
    else if (r && typeof r === 'object') {
      for (const k of ['require', 'import', 'node', 'default']) {
        if (typeof r[k] === 'string') cands.push(r[k]);
      }
      // 形如 {"./x": {...}} 的多入口，递归一层
      for (const v of Object.values(r)) {
        if (typeof v === 'string') cands.push(v);
        else if (v && typeof v === 'object') {
          for (const k of ['require', 'import', 'default']) {
            if (typeof v[k] === 'string') cands.push(v[k]);
          }
        }
      }
    }
  }
  if (pj.main) cands.push(pj.main);
  if (pj.module) cands.push(pj.module);
  if (!cands.length) return;
  if (firstExisting(dir, cands)) { ok++; return; }
  broken.push(`${pj.name}@${pj.version}`);
}

for (const e of fs.readdirSync(root)) {
  if (e.startsWith('.')) continue;
  const p = path.join(root, e);
  if (!fs.statSync(p).isDirectory()) continue;
  if (e.startsWith('@')) {
    for (const s of fs.readdirSync(p)) {
      if (fs.statSync(path.join(p, s)).isDirectory()) checkDir(path.join(p, s));
    }
  } else checkDir(p);
}

console.log(JSON.stringify({ ok, brokenCount: broken.length, broken }, null, 2));
