// Scenarios for "How it's made": collapsed, pulled apart, one layer isolated, a text seed, time and horizon, knobs,
// keyboard focus, and the extremes of width.
//
// The dev server reloads the page whenever any file changes (other people are editing while this runs), and sections
// above this one mount lazily and push it down. So every step is atomic: it opens the section, sets the state it needs,
// and only shoots if the page has not been reloaded since the step began; otherwise it starts the step again.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default async function ({ page, size, shot, settle }) {
  const wait = Math.max(2500, settle);
  const phone = size === 'phone';
  const sepSel = '#made .made__bar input[type=range]';
  const setRange = (sel, v) => page.$eval(sel, (el, v) => {
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, v);
  const click = (sel) => page.$eval(sel, (el) => el.click());
  const origin = () => page.evaluate(() => performance.timeOrigin);

  /** put the top of the grid just under the nav (+offset px further down the section); re-check until the layout stops moving */
  const toGrid = async (offset = 0) => {
    for (let i = 0; i < 8; i++) {
      await page.evaluate((o) => {
        const g = document.querySelector('.made__grid');
        if (g) window.scrollTo({ top: g.getBoundingClientRect().top + scrollY - 70 + o, behavior: 'instant' });
      }, offset);
      await sleep(400);
      const err = await page.evaluate((o) => {
        const g = document.querySelector('.made__grid');
        return g ? Math.abs(g.getBoundingClientRect().top - (70 - o)) : 999;
      }, offset);
      if (err < 3) return;
    }
  };
  const idle = async () => {
    await page.waitForFunction(() => document.querySelector('.made__plane canvas') && !document.querySelector('.made__stage.is-busy'), null, { timeout: 90000 }).catch(() => {});
    await sleep(700);
  };
  const ensure = async () => {
    const ok = await page.evaluate(() => !!document.querySelector('.made__stage .made__plane canvas') && !!window.__made).catch(() => false);
    if (!ok) {
      await page.evaluate(() => document.querySelector('#made')?.scrollIntoView({ behavior: 'instant' })).catch(() => {});
      await sleep(wait);
      await page.waitForSelector('.made__stage', { timeout: 60000 }).catch(() => {});
      await idle();
    }
    await toGrid();
  };
  const atomic = async (name, fn) => {
    for (let tries = 0; tries < 4; tries++) {
      let reloaded = false;
      try {
        await ensure();
        const o = await origin();
        const snap = async (n) => { if ((await origin()) !== o) { reloaded = true; throw new Error('reloaded'); } await shot(n); };
        await fn(snap);
        if ((await origin()) === o) return;
        reloaded = true;
      } catch (e) {
        if (!reloaded && !/context|navigat|destroyed|reloaded/i.test(e.message)) { console.log(`[made ${size}] step "${name}" failed: ${e.message.split('\n')[0]}`); return; }
      }
      console.log(`[made ${size}] step "${name}" interrupted by a reload; again`);
    }
  };
  /** the baseline every step starts from: default seed, pulled apart to `sep`, nothing isolated, full bloom */
  const baseline = async (sep) => {
    await page.evaluate(() => { const b = document.querySelector('#made .made__showall'); if (b && !b.disabled) b.click(); });
    await setRange(sepSel, sep);
    await sleep(900);
  };
  const setSeed = async (text) => {
    await page.fill('#made .made__seedin', text);
    await page.press('#made .made__seedin', 'Enter');
    await sleep(wait * 1.6);
    await idle();
  };

  await atomic('collapsed', async (snap) => {
    await baseline(0);
    await toGrid();
    await sleep(700);
    await snap('made-collapsed');
  });

  await atomic('near-flat', async (snap) => {
    await baseline(50);
    await toGrid();
    await sleep(1200);
    await snap('made-apart-0.05');
  });

  await atomic('apart', async (snap) => {
    await baseline(700);
    await toGrid();
    await sleep(1400);
    await snap('made-apart-0.7');
    await setRange(sepSel, 1000);
    await sleep(1200);
    await snap('made-apart-1.0');
  });

  await atomic('isolate', async (snap) => {
    await baseline(700);
    await click('#made .made__row[data-layer="threads"]');
    await toGrid();
    await sleep(1300);
    await snap('made-isolate-threads');
    await toGrid(phone ? 520 : 640);
    await sleep(500);
    await snap('made-isolate-threads-ladder');
    await click('#made .made__showall');
  });

  await atomic('pick', async (snap) => {
    if (phone) return;
    await baseline(700);
    await toGrid();
    // point at the middle of the frame: the lumen should be picked from the art itself, not from a label
    const box = await page.$eval('.made__stage', (e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    await page.mouse.move(box.x + box.w * 0.62, box.y + box.h * 0.5, { steps: 6 });
    await sleep(900);
    await snap('made-pick-by-pointing');
    await page.mouse.move(2, 400);
    await sleep(500);
  });

  await atomic('seed', async (snap) => {
    await baseline(700);
    await toGrid(phone ? 2100 : 1560);
    await sleep(500);
    await page.fill('#made .made__seedin', 'the quiet sea');
    await page.press('#made .made__seedin', 'Enter');
    await sleep(700);
    await snap('made-seed-box');
    await toGrid();
    await sleep(wait * 1.6);
    await idle();
    await snap('made-seed-text');
  });

  await atomic('moment', async (snap) => {
    await baseline(700);
    const id = await page.$eval('#made .made__krow input[type=range]', (e) => e.id);
    await setRange('#made #' + id, 380);
    await click('#made .made__chip:nth-child(3)');
    await sleep(wait * 1.6);
    await idle();
    await toGrid();
    await sleep(500);
    await snap('made-growth-38');
    await toGrid(phone ? 1000 : 900);
    await sleep(500);
    await snap('made-moment-panel');
  });

  await atomic('knob', async (snap) => {
    await baseline(700);
    await page.evaluate(() => { const d = document.querySelector('#made .made__kgroup[data-layer="lumen"]'); if (d) d.open = true; });
    await sleep(300);
    await page.evaluate(() => document.querySelector('#made .made__kgroup[data-layer="lumen"]')?.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await sleep(600);
    await snap('made-knobs');
    await setRange('#made input[data-path="layers.lumen.size"]', 1.2);
    await sleep(wait * 1.4);
    await idle();
    await snap('made-knob-changed');
    await click('#made .made__reset .btn');
    await sleep(wait);
    await idle();
  });

  await atomic('keyboard', async (snap) => {
    await baseline(700);
    await toGrid(phone ? 520 : 640);
    await page.evaluate(() => document.querySelector('#made .made__row[data-layer="strata"]')?.focus());
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await sleep(900);
    await snap('made-keyboard-focus');
  });

  if (!phone) {
    await atomic('w360', async (snap) => {
      const vp = page.viewportSize();
      await page.setViewportSize({ width: 360, height: 780 });
      await sleep(2500);
      await baseline(700);
      await toGrid();
      await sleep(wait);
      await idle();
      await snap('made-w360');
      await page.setViewportSize(vp);
      await sleep(800);
    });
    await atomic('w2560', async (snap) => {
      const vp = page.viewportSize();
      await page.setViewportSize({ width: 2560, height: 1300 });
      await sleep(2500);
      await baseline(700);
      await toGrid();
      await sleep(wait * 1.5);
      await idle();
      await snap('made-w2560');
      await page.setViewportSize(vp);
      await sleep(800);
    });
  }
}
