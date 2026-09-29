// Scenarios for the timeline, mint and footer sections (owner: timeline agent).
//   node scripts/shoot.mjs --out screenshots/site/timeline --only timeline --sizes phone,desktop --settle 4500
// Shots (scn-*.png): the section head, the rail with a card lit, the Reveal, the mint block and its commitments,
// the footer with a keyboard focus ring, viewport extremes (360 and 2560 wide), and the countdown states mid-schedule.

import { join, resolve } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Where shoot.mjs writes for this run (parsed from argv, since shot() hides it). */
function outDir(size) {
  const i = process.argv.indexOf('--out');
  return join(resolve(i > 0 ? process.argv[i + 1] : 'screenshots/shoot'), size);
}

async function scrollToSel(page, sel, offset = 0, wait = 1200) {
  await page.evaluate(([s, o]) => {
    const e = document.querySelector(s);
    if (!e) return;
    const r = e.getBoundingClientRect();
    window.scrollTo({ top: Math.max(0, r.top + scrollY - o), behavior: 'instant' });
  }, [sel, offset]);
  await sleep(wait);
}

/** Wait until the lazy sections have mounted and the 7 timeline frames + the mint image have painted (or give up). */
async function ready(page, settle) {
  await scrollToSel(page, '#timeline', 60, 600);
  await page.waitForSelector('#timeline .tl__item', { timeout: 15000 }).catch(() => {});
  await page.waitForFunction(() => document.querySelectorAll('#timeline .tl__frame.is-ready').length >= 2, null, { timeout: 30000 }).catch(() => {});
  await sleep(Math.min(settle, 2500));
}

export default async function ({ page, size, shot, settle }) {
  const desktop = size === 'desktop';
  const step = async (name, fn) => { try { await fn(); } catch (e) { console.log(`[${size}] timeline scenario "${name}" skipped: ${e.message.split('\n')[0]}`); } };

  await step('ready', () => ready(page, settle));

  // 1 — the head with the live countdown
  await step('head', async () => { await scrollToSel(page, '#timeline', 60); await shot('timeline-head'); });

  // 2 — desktop: hovering a card lights its numeral on the to-scale rail
  if (desktop) {
    await step('hover', async () => {
      await scrollToSel(page, '.tl__scale', 130, 400);
      await page.hover('#tl-3 .tl__title');
      await sleep(700);
      await shot('timeline-hover');
      await page.mouse.move(2, 2);
    });
  }

  // 3 — the Reveal, emphasised
  await step('reveal', async () => { await scrollToSel(page, '#tl-6', desktop ? 90 : 70, 3500); await shot('timeline-reveal'); });

  // 4 — the last three milestones (Still Hour, Reveal, Bloom) on desktop; the tail of the rail on phone
  await step('bloom', async () => { await scrollToSel(page, '#tl-7', desktop ? 90 : 70, 3500); await shot('timeline-bloom'); });

  // 5 — mint: the numbers, then the commitments and the disabled button
  await step('mint-top', async () => { await scrollToSel(page, '#mint', 60, 3500); await shot('mint-top'); });
  await step('mint-commit', async () => { await scrollToSel(page, '#mint .mint__commit', desktop ? 300 : 120, 1500); await shot('mint-commitments'); });
  await step('mint-cta', async () => { await scrollToSel(page, '.mint__cta', desktop ? 380 : 200, 1200); await shot('mint-button'); });

  // 6 — footer, and a keyboard focus ring on a footer link
  await step('footer', async () => {
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
    await sleep(900);
    await shot('footer');
    await page.focus('.foot__nav a');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await sleep(300);
    await shot('footer-focus');
  });

  // 7 — desktop: viewport extremes
  if (desktop) {
    for (const w of [360, 2560]) {
      await step(`w${w}`, async () => {
        await page.setViewportSize({ width: w, height: w < 600 ? 800 : 1300 });
        await sleep(1400);
        await scrollToSel(page, '#timeline', 60, 2500);
        await shot(`timeline-w${w}`);
        await scrollToSel(page, '#tl-6', 60, 2500);
        await shot(`timeline-w${w}-reveal`);
        await scrollToSel(page, '#mint', 60, 3000);
        await shot(`mint-w${w}`);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        console.log(`[desktop] viewport ${w}: horizontal overflow ${overflow}px${overflow > 0 ? '  <-- PROBLEM' : ''}`);
      });
    }
    await step('restore', async () => { await page.setViewportSize({ width: 1440, height: 900 }); await sleep(600); });
  }

  // 8 — the countdown mid-schedule and after the reveal date (a second page with a fixed clock)
  await step('clock', async () => {
    const ctx = page.context();
    for (const [name, iso] of [['begun', '2026-11-25T09:00:00Z'], ['past', '2026-12-20T09:00:00Z']]) {
      const p2 = await ctx.newPage();
      try {
        await p2.clock.setFixedTime(new Date(iso));
        await p2.goto(page.url(), { waitUntil: 'load' });
        await scrollToSel(p2, '#timeline', 60, 1500);
        await p2.waitForSelector('#timeline .tl__count', { timeout: 15000 });
        await sleep(1500);
        await p2.screenshot({ path: join(outDir(size), `scn-timeline-clock-${name}.png`) });
        const txt = await p2.$eval('#timeline .tl__count', (e) => e.textContent);
        const btn = await p2.evaluate(() => (document.querySelector('.mint__cta') || {}).textContent);
        console.log(`[${size}] clock ${iso}: "${txt}" — mint button reads "${btn}"`);
      } finally { await p2.close(); }
    }
  });

  // 9 — mounting twice must not duplicate anything
  await step('twice', async () => {
    const counts = await page.evaluate(async () => {
      const root = document.querySelector('#timeline');
      const mod = await import('/src/site/sections/timeline.ts');
      await mod.default(root); await mod.default(root);
      const m = document.querySelector('#mint');
      const mm = await import('/src/site/sections/mint.ts');
      await mm.default(m); await mm.default(m);
      return { tl: root.querySelectorAll('.tl').length, items: root.querySelectorAll('.tl__item').length, mint: m.querySelectorAll('.mint').length };
    });
    console.log(`[${size}] mounted twice → ${JSON.stringify(counts)} (expect tl 1, items 7, mint 1)`);
  });
}
