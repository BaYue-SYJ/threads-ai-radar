/* 关注名单页：JS 报错 + 三视图横向溢出 扫描 */
const { loadPuppeteer, findChrome } = require('./_env.cjs');

const puppeteer = loadPuppeteer();
const CHROME = findChrome();
const URL = 'http://127.0.0.1:8650/';
const WIDTHS = [1680, 1440, 1280, 1180, 1100, 1080, 1060, 1040, 1024, 1000,
                960, 900, 860, 820, 768, 600, 480, 390];
const TABS = [
  ['radar', 0],
  ['peers', 1],
  ['watch', 2],
];

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  let bad = [], checked = 0;
  for (const w of WIDTHS) {
    await page.setViewport({ width: w, height: 1000, deviceScaleFactor: 1 });
    await page.goto(URL, { waitUntil: 'networkidle2' });
    for (const [name, idx] of TABS) {
      await page.evaluate(i => document.querySelectorAll('#tabs button')[i].click(), idx);
      await new Promise(r => setTimeout(r, 700));
      const m = await page.evaluate(() => {
        const de = document.documentElement;
        const drawer = document.getElementById('drawer');
        const drawerOpen = drawer.classList.contains('on');
        const over = [];
        document.querySelectorAll('body *').forEach(el => {
          // 关闭状态的抽屉是靠 translateX(100%) 挪到屏幕外的，属于刻意行为，
          // 不是布局溢出——不排掉的话每个宽度都会误报 5 个元素。
          if (!drawerOpen && drawer.contains(el)) return;
          if (el === drawer) return;
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.right > de.clientWidth + 1.5) {
            over.push((el.tagName.toLowerCase()) + '.' + (el.className || '').toString().slice(0, 40)
              + ' right=' + Math.round(r.right));
          }
        });
        return { scrollW: de.scrollWidth, clientW: de.clientWidth,
                 over: over.slice(0, 4), overN: over.length };
      });
      checked++;
      const o = m.scrollW > m.clientW + 1;
      if (o || m.overN) bad.push(`w=${w} ${name}: scrollW=${m.scrollW} clientW=${m.clientW} over=${m.overN} ${m.over.join(' | ')}`);
    }
  }

  // 功能：关注名单页渲染 + 星标切换
  await page.setViewport({ width: 1440, height: 1100, deviceScaleFactor: 1 });
  await page.goto(URL, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 900));
  await page.evaluate(() => document.querySelectorAll('#tabs button')[2].click());
  await new Promise(r => setTimeout(r, 900));
  const watch = await page.evaluate(() => ({
    rows: document.querySelectorAll('#wStage tr').length,
    cards: document.querySelectorAll('#wStage .acard').length,
    main: (document.getElementById('wMain') || {}).textContent || '',
    stats: document.querySelectorAll('#wStats .cv-s').length,
    stars: document.querySelectorAll('#wStage [data-rm]').length,
    wEmpty: (document.querySelector('#wStage .empty') || {}).textContent || '',
  }));
  await page.screenshot({ path: '_shots/watch_1440.png', fullPage: true });

  // 同行页星标是否存在
  await page.evaluate(() => document.querySelectorAll('#tabs button')[1].click());
  await new Promise(r => setTimeout(r, 1200));
  const peers = await page.evaluate(() => ({
    rows: document.querySelectorAll('#aStage tr').length,
    stars: document.querySelectorAll('#aStage [data-w]').length,
    onStars: document.querySelectorAll('#aStage [data-w].on').length,
  }));
  await page.screenshot({ path: '_shots/peers_star_1440.png', fullPage: true });

  // 卡片视图
  await page.evaluate(() => document.querySelector('#pViewSeg button[data-v="card"]').click());
  await new Promise(r => setTimeout(r, 400));
  const peerCard = await page.evaluate(() => ({
    cards: document.querySelectorAll('#aStage .acard').length,
    stars: document.querySelectorAll('#aStage [data-w]').length,
  }));
  await page.screenshot({ path: '_shots/peers_star_card_1440.png', fullPage: true });

  console.log(JSON.stringify({ checked, badCount: bad.length, bad,
                               errs: errs.slice(0, 10), errN: errs.length,
                               watch, peers, peerCard }, null, 2));
  console.log('\n===== 汇总 =====');
  console.log(`组合 ${checked} 个（${WIDTHS.length} 宽度 × ${TABS.length} 视图），溢出 ${bad.length} 个`);
  await browser.close();
  process.exit(bad.length || errs.length ? 2 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
