/* 关注名单 / 星标 / 双向跳转 / CSV 导出 —— 端到端回归 */
const fs = require('fs');
const path = require('path');
const { loadPuppeteer, findChrome } = require('./_env.cjs');

const puppeteer = loadPuppeteer();
const CHROME = findChrome();
const BASE = 'http://127.0.0.1:8650';
const DL = path.resolve('_shots/_dl');
const API = (u, opt) => fetch(BASE + u, opt).then(r => r.json());

const wait = ms => new Promise(r => setTimeout(r, ms));
const P = [];
const check = (name, cond, extra) => {
  P.push({ ok: !!cond, name, extra: extra === undefined ? '' : String(extra) });
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra !== undefined ? '   ' + extra : ''));
};

(async () => {
  fs.rmSync(DL, { recursive: true, force: true });
  fs.mkdirSync(DL, { recursive: true });

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  // 控制台只说「404」不说是哪个 URL，这里补上，否则没法查
  page.on('response', r => {
    if (r.status() >= 400) errs.push('http ' + r.status() + ': ' + r.url());
  });
  const client = await page.target().createCDPSession();
  await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: DL });

  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await page.goto(BASE + '/', { waitUntil: 'networkidle2' });
  await wait(1000);

  /* ---------- 1. 星标：同行页一键关注 ---------- */
  await page.evaluate(() => document.querySelectorAll('#tabs button')[1].click());
  await wait(1400);
  const firstUser = await page.evaluate(() => {
    const tr = document.querySelector('#aStage tbody tr');
    return tr ? tr.dataset.u : null;
  });
  check('同行页有账号行', !!firstUser, firstUser);

  const before = await API('/api/watchlist');
  const beforeNames = new Set(before.accounts.map(a => a.username));
  const target = firstUser;
  const wasWatched = beforeNames.has(target);
  await page.evaluate(u => {
    const tr = document.querySelector(`#aStage tbody tr[data-u="${CSS.escape(u)}"]`);
    tr.querySelector('[data-w]').click();
  }, target);
  await wait(900);
  const after = await API('/api/watchlist');
  const nowWatched = after.accounts.some(a => a.username === target);
  check('星标切换写入了关注名单', nowWatched !== wasWatched, `${target}: ${wasWatched} -> ${nowWatched}`);

  const starOn = await page.evaluate(u => {
    const tr = document.querySelector(`#aStage tbody tr[data-u="${CSS.escape(u)}"]`);
    const b = tr && tr.querySelector('[data-w]');
    return b ? b.classList.contains('on') : null;
  }, target);
  check('星标图标状态同步', starOn === nowWatched, 'on=' + starOn);

  const drawerOpened = await page.evaluate(() =>
    document.getElementById('drawer').classList.contains('on'));
  check('点星标没有误开账号抽屉', !drawerOpened);

  // 再点一次还原，测试不留副作用
  await page.evaluate(u => {
    const tr = document.querySelector(`#aStage tbody tr[data-u="${CSS.escape(u)}"]`);
    tr.querySelector('[data-w]').click();
  }, target);
  await wait(900);
  const restored = await API('/api/watchlist');
  check('星标可反向切回（测试不留副作用）',
    restored.accounts.some(a => a.username === target) === wasWatched, target);

  /* ---------- 2. 关注名单页 ---------- */
  await page.evaluate(() => document.querySelectorAll('#tabs button')[2].click());
  await wait(1200);
  const wview = await page.evaluate(() => ({
    rows: document.querySelectorAll('#wStage tbody tr').length,
    stats: document.querySelectorAll('#wStats .cv-s').length,
    main: document.getElementById('wMain').textContent.trim().slice(0, 40),
    count: document.getElementById('wCount').textContent,
  }));
  check('关注名单表格渲染', wview.rows > 0, 'rows=' + wview.rows);
  check('关注名单概览 6 项指标', wview.stats === 6, 'stats=' + wview.stats);
  check('概览文案非空', wview.main.length > 4, wview.main);

  // 表单新增
  const newUser = 'e2e_check_' + Date.now().toString(36);
  await page.type('#wInput', '@' + newUser);
  await page.type('#wNote', '自动化测试');
  await page.evaluate(() => document.getElementById('wAdd').click());
  await wait(1000);
  const added = await API('/api/watchlist');
  const addedRow = added.accounts.find(a => a.username === newUser);
  check('表单新增关注成功', !!addedRow, newUser);
  check('新增账号备注已存', addedRow && addedRow.note === '自动化测试', addedRow && addedRow.note);
  check('未入库账号标记 has_posts=false', addedRow && addedRow.has_posts === false);
  const zeroShown = await page.evaluate(u => {
    const tr = document.querySelector(`#wStage tbody tr[data-u="${CSS.escape(u)}"]`);
    return !!tr;
  }, newUser);
  check('未入库账号也显示在名单里', zeroShown);

  const fileHas = fs.readFileSync('watchlist.txt', 'utf8').includes(newUser);
  check('watchlist.txt 已回写', fileHas);

  // 只看有新帖
  await page.evaluate(() => { const c = document.getElementById('wOnlyNew');
    c.checked = true; c.onchange({ target: c }); });
  await wait(500);
  const onlyNew = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#wStage tbody tr')];
    return { n: rows.length, allNew: rows.every(tr =>
      tr.querySelector('.wnew')) };
  });
  check('只看有新帖：过滤后每行都有新增', onlyNew.allNew, 'rows=' + onlyNew.n);
  await page.evaluate(() => { const c = document.getElementById('wOnlyNew');
    c.checked = false; c.onchange({ target: c }); });
  await wait(400);

  // 移除
  page.on('dialog', async d => { await d.accept(); });
  await page.evaluate(u => {
    const b = document.querySelector(`#wStage [data-rm="${CSS.escape(u)}"]`);
    b.click();
  }, newUser);
  await wait(900);
  const afterRm = await API('/api/watchlist');
  check('取消关注生效', !afterRm.accounts.some(a => a.username === newUser), newUser);
  check('watchlist.txt 已同步删除',
    !fs.readFileSync('watchlist.txt', 'utf8').includes(newUser));

  /* ---------- 3. 帖子 ⇄ 账号 双向跳转 ---------- */
  await page.evaluate(() => document.querySelectorAll('#tabs button')[0].click());
  await wait(1200);
  const postAuthor = await page.evaluate(() => {
    const el = document.querySelector('#stage [data-c]');
    if (!el) return null;
    el.click();
    return { code: el.dataset.c };
  });
  await wait(1400);
  const drawerInfo = await page.evaluate(() => ({
    title: document.getElementById('dwTitle').textContent,
    hasToAuthor: !!document.getElementById('dwToAuthor'),
    hasStar: !!document.querySelector('#dwBody [data-w]'),
  }));
  check('帖子抽屉有「看全部相关帖」入口', drawerInfo.hasToAuthor, drawerInfo.title);
  check('帖子抽屉有星标', drawerInfo.hasStar);

  await page.evaluate(() => document.getElementById('dwToAuthor').click());
  await wait(1500);
  const authorDrawer = await page.evaluate(() => ({
    title: document.getElementById('dwTitle').textContent,
    posts: document.querySelectorAll('#dwBody [data-c]').length,
    hasFollow: !!document.getElementById('dwFollow'),
  }));
  check('跳转到账号抽屉', authorDrawer.title.startsWith('@'),
    `${drawerInfo.title} -> ${authorDrawer.title}`);
  check('账号抽屉列出相关帖', authorDrawer.posts > 0, 'posts=' + authorDrawer.posts);
  check('账号抽屉有关注按钮', authorDrawer.hasFollow);

  const back = await page.evaluate(() => {
    const el = document.querySelector('#dwBody [data-c]');
    const c = el.dataset.c;
    el.click();
    return c;
  });
  await wait(1400);
  const backState = await page.evaluate(() => ({
    title: document.getElementById('dwTitle').textContent,
    isPost: !!document.getElementById('dwToAuthor'),
    follower: document.getElementById('dwToAuthor')
      ? document.getElementById('dwToAuthor').textContent : '',
  }));
  // 帖子抽屉的标题是「作者名」，不是帖子 ID —— 别拿 code 去比
  check('从账号点回帖子详情（无路由冲突）',
    backState.isPost && backState.title === authorDrawer.title,
    `${back} -> ${backState.title}`);
  check('回到的是帖子抽屉而非账号抽屉', backState.isPost);
  await page.evaluate(() => document.getElementById('dwClose').click());
  await wait(300);

  /* ---------- 4. CSV 导出（浏览器下载） ---------- */
  async function download(name, clickSel, tabIdx) {
    await page.evaluate(i => document.querySelectorAll('#tabs button')[i].click(), tabIdx);
    await wait(1200);
    await page.evaluate(s => document.querySelector(s).click(), clickSel);
    for (let i = 0; i < 30; i++) {
      await wait(200);
      const f = fs.readdirSync(DL).filter(x => x.endsWith('.csv') && !x.endsWith('.crdownload'));
      if (f.length) {
        const p = path.join(DL, f[0]);
        const buf = fs.readFileSync(p);
        check(name + ' 下载成功', true, f[0] + ' ' + buf.length + 'B');
        check(name + ' 带 UTF-8 BOM', buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF);
        const txt = buf.toString('utf8').replace(/^\ufeff/, '');
        check(name + ' 用 CRLF 行尾', txt.includes('\r\n'));
        const lines = txt.split('\r\n').filter(Boolean);
        check(name + ' 表头为中文', /[\u4e00-\u9fa5]/.test(lines[0]), lines[0].slice(0, 30));
        check(name + ' 有数据行', lines.length > 1, 'lines=' + lines.length);
        fs.unlinkSync(p);
        return true;
      }
    }
    check(name + ' 下载成功', false, '超时未见文件');
    return false;
  }
  await download('雷达页导出CSV', '#expPosts', 0);
  await download('同行页导出CSV', '#expAuthors', 1);
  await download('关注名单导出CSV', '#wExport', 2);

  /* ---------- 5. 截图 ---------- */
  await page.evaluate(() => document.querySelectorAll('#tabs button')[2].click());
  await wait(900);
  await page.screenshot({ path: '_shots/watch_list_1440.png', fullPage: true });
  await page.evaluate(() => document.querySelectorAll('#tabs button')[1].click());
  await wait(1300);
  await page.screenshot({ path: '_shots/peers_star_1440.png', fullPage: true });
  await page.setViewport({ width: 390, height: 900, deviceScaleFactor: 1 });
  await page.evaluate(() => document.querySelectorAll('#tabs button')[2].click());
  await wait(900);
  await page.screenshot({ path: '_shots/watch_390.png', fullPage: true });

  check('无 JS 报错', errs.length === 0, errs.slice(0, 4).join(' | '));

  const failed = P.filter(x => !x.ok);
  console.log('\n===== 汇总 =====');
  console.log(`通过 ${P.length - failed.length}/${P.length}`);
  if (failed.length) console.log('失败项：\n' + failed.map(f => '  - ' + f.name + '  ' + f.extra).join('\n'));
  await browser.close();
  process.exit(failed.length ? 2 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
