// Hero scenarios: the first bloom, two clicks (each shot after the crossfade settles), a keyboard draw with the
// focus ring, and the two requested framings (1280x720 landscape, 390x844 portrait) plus the extremes (360, 2560).
//
//   node scripts/shoot.mjs --out screenshots/site/hero --only hero --sizes phone,desktop --settle 3500 [--reduced-motion true]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// arbitrary but fixed 64-hex seeds (sha256 of a word) for the dev hook window.__hero.show(seed, horizon, sky)
import { createHash } from 'node:crypto';
const FIXED = ['dawn', 'ember', 'lantern', 'tarn', 'quartz', 'oxide', 'cobalt', 'orchid'].map((w) => createHash('sha256').update('hero-qa-' + w).digest('hex'));

async function ready(page, timeout = 60000) {
  await page.waitForFunction(() => document.querySelector('#hero')?.dataset.heroReady === '1', null, { timeout });
}
async function nextReady(page, timeout = 60000) {
  await page.waitForFunction(() => document.querySelector('#hero')?.dataset.heroNext === 'ready', null, { timeout });
}
async function seedOf(page) { return page.evaluate(() => document.querySelector('#hero')?.dataset.heroSeed ?? ''); }
async function caption(page) {
  return page.evaluate(() => document.querySelector('.hero__meta')?.innerText.replace(/\s+/g, ' ').trim());
}
async function draw(page, size) {
  const before = await seedOf(page);
  if (size === 'phone') await page.tap('.hero__hit'); else await page.mouse.click(720, 400);
  await page.waitForFunction((b) => document.querySelector('#hero')?.dataset.heroSeed !== b, before, { timeout: 90000 });
}
async function settleFade(page, settle) { await sleep(Math.max(1800, settle)); }

export default async function ({ page, size, shot, settle }) {
  try {
    await ready(page);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' })); // (a dev reload can restore an old scroll)
    await settleFade(page, settle);
    await shot('hero-first');
    console.log('  caption:', await caption(page));

    // click 1 (waits for the idle pre-render when there is one)
    try { await nextReady(page, 30000); } catch { /* clicking without a pre-render is a valid path too */ }
    await draw(page, size);
    await settleFade(page, settle);
    await shot('hero-click1');
    console.log('  caption:', await caption(page));

    // click 2, right away (exercises "pre-render not ready yet" -> "developing")
    await draw(page, size);
    await sleep(500);
    await shot('hero-click2-mid');
    await settleFade(page, settle);
    await shot('hero-click2');
    console.log('  caption:', await caption(page));
  } catch (e) { console.log('  hero clicks failed:', e.message); }

  // 'developing': ask for a seed the instant the previous one lands (no pre-render exists yet)
  try {
    await page.evaluate((seed) => window.__hero?.show(seed, 0, 'e'.repeat(64)), FIXED[0]);
    await ready(page);
    const before = await seedOf(page);
    await page.evaluate(() => { window.__hero.freeze = true; document.querySelector('.hero__hit').click(); }); // hold the waiting state
    await sleep(700);
    console.log('  developing caption:', await caption(page));
    await shot('hero-developing');
    await page.evaluate(() => { window.__hero.freeze = false; document.querySelector('.hero__hit').click(); }); // (a second click while waiting must be a no-op)
    await page.waitForFunction((b) => document.querySelector('#hero')?.dataset.heroSeed !== b, before, { timeout: 90000 });
    await settleFade(page, settle);
  } catch (e) { console.log('  hero developing failed:', e.message); }

  // stress (HERO_STRESS=1): bright blooms in every horizon, to judge type legibility over the worst art
  if (process.env.HERO_STRESS) {
    for (let i = 0; i < FIXED.length; i++) {
      try {
        await page.evaluate(([seed, h]) => window.__hero?.show(seed, h, 'a'.repeat(63) + String(h)), [FIXED[i], i % 4]);
        await sleep(600);
        await ready(page);
        await sleep(1900);
        await shot(`hero-stress-${i}`);
        console.log(`  stress ${i}:`, await caption(page));
      } catch (e) { console.log('  stress failed:', e.message); }
    }
  }

  // keyboard: Tab from the top of the page to the art, ring visible, Enter draws
  try {
    await page.evaluate(() => { window.scrollTo({ top: 0, behavior: 'instant' }); document.querySelector('.skip')?.focus(); });
    let found = false;
    for (let i = 0; i < 16 && !found; i++) {
      await page.keyboard.press('Tab');
      found = await page.evaluate(() => document.activeElement?.classList.contains('hero__hit'));
    }
    console.log('  focus reached the art by keyboard:', found);
    await sleep(300);
    await shot('hero-focus');
    const before = await seedOf(page);
    await page.keyboard.press('Enter');
    await page.waitForFunction((b) => document.querySelector('#hero')?.dataset.heroSeed !== b, before, { timeout: 60000 });
    console.log('  keyboard Enter drew a new seed; live region:', await page.evaluate(() => document.querySelector('#hero [role=status]')?.textContent));
    await settleFade(page, settle);
    const before2 = await seedOf(page);
    await page.keyboard.press('Space');
    await page.waitForFunction((b) => document.querySelector('#hero')?.dataset.heroSeed !== b, before2, { timeout: 60000 });
    console.log('  keyboard Space drew another seed');
    await settleFade(page, settle);
  } catch (e) { console.log('  hero keyboard failed:', e.message); }

  if (size !== 'desktop') return;

  // framings: landscape 1280x720, portrait 390x844, then the extremes
  const frames = [
    ['1280x720', 1280, 720], ['390x844', 390, 844], ['360x740', 360, 740], ['844x390', 844, 390], ['820x1180', 820, 1180], ['1024x768', 1024, 768], ['2560x1440', 2560, 1440], ['1440x900', 1440, 900],
  ];
  for (const [name, w, h] of frames) {
    try {
      await page.setViewportSize({ width: w, height: h });
      await sleep(900); // debounce (320 ms) + start of the re-render
      await page.waitForFunction(() => !document.querySelector('#hero')?.dataset.heroResizing, null, { timeout: 90000 });
      await sleep(Math.max(1500, settle * 0.5));
      await shot(`hero-${name}`);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      const dims = await page.evaluate(() => { const c = document.querySelector('.hero__cv'); return `${c.width}x${c.height} (css ${c.clientWidth}x${c.clientHeight})`; });
      console.log(`  ${name}: canvas ${dims}, overflow ${over}px`);
    } catch (e) { console.log(`  frame ${name} failed:`, e.message); }
  }
}
