// Gallery scenarios: the grid, a filter, the empty state, the detail view (stage, info, next, close), and two extreme widths.
//   node scripts/shoot.mjs --out screenshots/site/gallery --only gallery --sizes phone,desktop --settle 3500
export default async function ({ page, size, shot, settle }) {
  const phone = size === 'phone';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const tolerant = async (label, fn) => { try { await fn(); } catch (e) { console.log(`[gallery:${size}] ${label}: ${e.message.split('\n')[0]}`); } };
  const toBar = async () => {
    await page.evaluate(() => {
      const b = document.querySelector('.gal__bar');
      if (b) window.scrollTo({ top: b.getBoundingClientRect().top + scrollY - 96, behavior: 'instant' });
    });
  };
  const count = async () => (await page.textContent('.gal__count')) ?? '';

  await tolerant('grid', async () => {
    await page.evaluate(() => document.querySelector('#gallery')?.scrollIntoView({ behavior: 'instant' }));
    await sleep(settle);
    await toBar();
    await sleep(settle);
    await shot('gallery-grid');
    // a little further down: the middle of the grid
    await page.evaluate(() => window.scrollBy({ top: 620, behavior: 'instant' }));
    await sleep(settle);
    await shot('gallery-grid-scrolled');
    await toBar();
    await sleep(600);
  });

  await tolerant('filter', async () => {
    if (phone) { await page.click('.gal__ftoggle'); await sleep(500); await shot('gallery-filter-open'); }
    // Horizon: first two real chips (OR), then a Light chip (AND)
    const horizon = page.locator('.gal__group').nth(1).locator('.gal__chip');
    await horizon.nth(1).click();
    await sleep(900);
    await horizon.nth(2).click();
    await sleep(900);
    await shot('gallery-filtered-or');
    const light = page.locator('.gal__group').nth(3).locator('.gal__chip:not(.is-zero)');
    if (await light.count() > 1) await light.nth(1).click();
    await sleep(1400);
    console.log(`[gallery:${size}] ${await count()}`);
    await shot('gallery-filtered');
  });

  await tolerant('empty', async () => {
    // find a chip that would show nothing given the current selection and press it
    const z = page.locator('.gal__chip.is-zero').first();
    if (await z.count()) { await z.click(); await sleep(1200); }
    console.log(`[gallery:${size}] ${await count()}`);
    await shot('gallery-empty');
    const clear = page.locator('.gal__empty button');
    if (await clear.isVisible()) await clear.click();
    await sleep(1200);
    console.log(`[gallery:${size}] ${await count()}`);
    if (phone) {
      // the panel's own way out: "Show N pieces"
      await page.locator('.gal__done').scrollIntoViewIfNeeded();
      await sleep(500);
      await shot('gallery-filter-done');
      await page.click('.gal__done');
    }
    await sleep(400);
    await toBar();
    await sleep(settle);
  });

  await tolerant('detail', async () => {
    const first = page.locator('[data-gallery-item]:visible').first();
    await first.scrollIntoViewIfNeeded();
    await sleep(settle);
    await first.click();
    await sleep(700);
    await shot('gallery-detail-opening');
    await sleep(settle + 2500);
    await shot('gallery-detail');
    // a growth still swaps the plate
    const stills = page.locator('.gal-dlg__still');
    await stills.nth(0).scrollIntoViewIfNeeded();
    await sleep(600);
    await shot('gallery-detail-info');
    await stills.nth(1).click();
    await sleep(settle);
    await page.evaluate(() => { const d = document.querySelector('.gal-dlg'); d.scrollTo({ top: 0 }); const i = document.querySelector('.gal-dlg__info'); if (i) i.scrollTo({ top: 0 }); });
    await sleep(600);
    await shot('gallery-detail-stage');
    await stills.nth(6).click();
    await sleep(800);
    console.log(`[gallery:${size}] hash ${await page.evaluate(() => location.hash)}`);
    await page.keyboard.press('ArrowRight');
    await sleep(settle + 2500);
    console.log(`[gallery:${size}] hash after → ${await page.evaluate(() => location.hash)}`);
    await shot('gallery-detail-next');
    // the tail of the panel: traits + actions
    await page.evaluate(() => { const i = document.querySelector('.gal-dlg__info'); (i && i.scrollHeight > i.clientHeight ? i : document.querySelector('.gal-dlg')).scrollTo({ top: 9999 }); });
    await sleep(500);
    await shot('gallery-detail-actions');
    await page.keyboard.press('Escape');
    await sleep(1200);
    console.log(`[gallery:${size}] closed, hash '${await page.evaluate(() => location.hash)}', focus on ${await page.evaluate(() => document.activeElement?.className)}`);
    await shot('gallery-closed');
  });

  // resize: the narrowest and the widest
  await tolerant('extremes', async () => {
    const orig = page.viewportSize();
    for (const [w, h, name] of [[360, 720, '360'], [2560, 1300, '2560']]) {
      await page.setViewportSize({ width: w, height: h });
      await sleep(900);
      await toBar();
      await sleep(settle);
      await shot(`gallery-grid-${name}`);
      const first = page.locator('[data-gallery-item]:visible').first();
      await first.click();
      await sleep(settle + 3000);
      await shot(`gallery-detail-${name}`);
      await page.keyboard.press('Escape');
      await sleep(1000);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      console.log(`[gallery:${size}] width ${w}: horizontal overflow ${over}px`);
    }
    await page.setViewportSize(orig);
    await sleep(500);
  });
}
