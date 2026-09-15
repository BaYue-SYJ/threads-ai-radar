/* 三视图截图：桌面 / 平板 / 手机 */
const { loadPuppeteer, findChrome } = require('./_env.cjs');

const puppeteer = loadPuppeteer();
const CHROME = findChrome();
const BASE = 'http://127.0.0.1:8650/';
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();

  const shots = [
    [1440, 1000, 0, 'radar_1440', false],
    [1440, 1000, 1, 'peers_1440', false],
    [1440, 1000, 2, 'watch_1440', false],
    [1024, 1000, 2, 'watch_1024', false],
    [1024, 1000, 1, 'peers_1024', false],
    [390, 844, 2, 'watch_390', true],
    [390, 844, 1, 'peers_390', true],
  ];
  for (const [w, h, tab, name, full] of shots) {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    await page.goto(BASE, { waitUntil: 'networkidle2' });
    await wait(700);
    await page.evaluate(i => document.querySelectorAll('#tabs button')[i].click(), tab);
    await wait(1400);
    await page.screenshot({ path: `_shots/${name}.png`, fullPage: full });
    console.log('shot', name);
  }

  // 帖子抽屉 + 账号抽屉
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await page.goto(BASE, { waitUntil: 'networkidle2' });
  await wait(1000);
  await page.evaluate(() => document.querySelector('#stage [data-c]').click());
  await wait(1600);
  await page.screenshot({ path: '_shots/drawer_post_1440.png' });
  console.log('shot drawer_post_1440');
  await page.evaluate(() => document.getElementById('dwToAuthor').click());
  await wait(1600);
  await page.screenshot({ path: '_shots/drawer_author_1440.png' });
  console.log('shot drawer_author_1440');

  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
