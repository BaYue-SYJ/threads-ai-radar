/* ============================================================
 *  tools/ 公共辅助 —— 定位 puppeteer-core 与 Chrome 可执行文件
 * ------------------------------------------------------------
 *  这里的脚本都是「改了项目之后跑一遍，确认没改坏」的回归工具，
 *  不是运行本项目所必需的。想跑它们需要 Node + puppeteer-core。
 *
 *  两个环境变量可以覆盖自动探测：
 *    PUPPETEER_PATH   puppeteer-core 的目录（其下应有 package.json）
 *    CHROME_PATH      Chrome / Chromium 可执行文件路径
 *
 *  用法示例（Windows）：
 *    set PUPPETEER_PATH=C:\path\to\node_modules\puppeteer-core
 *    set CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
 *    node tools/check_e2e.cjs
 * ============================================================ */
const fs = require('fs');
const os = require('os');
const path = require('path');

function loadPuppeteer() {
  for (const cand of [process.env.PUPPETEER_PATH, 'puppeteer-core']) {
    if (!cand) continue;
    try { return require(cand); } catch (e) { /* 试下一个 */ }
  }
  console.error('[错误] 找不到 puppeteer-core。');
  console.error('  方式一：cd 到项目根目录，执行  npm i -D puppeteer-core');
  console.error('  方式二：用 PUPPETEER_PATH 指向已有的 node_modules/puppeteer-core');
  process.exit(1);
}

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const home = os.homedir();
  const candidates = [
    // 本项目开发时用的 playwright 下载版
    path.join(home, 'AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe'),
    // Windows 常见安装位置
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    path.join(home, 'AppData/Local/Google/Chrome/Application/chrome.exe'),
    // macOS
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    // Linux
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  for (const c of candidates) {
    try { if (fs.existsSync(c)) return c; } catch (e) { /* 继续 */ }
  }
  console.error('[错误] 找不到 Chrome / Chromium。');
  console.error('  请用 CHROME_PATH 环境变量指定可执行文件路径。');
  process.exit(1);
}

module.exports = { loadPuppeteer, findChrome };
