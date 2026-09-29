// Scenarios for the mechanic section: scrub, turn, refuse, reveal, bloom, keyboard, resize, reduced motion.
//   node scripts/shoot.mjs --out screenshots/site/mechanic --only mechanic --sizes phone,desktop --settle 3500
// Shots: scn-mech-*.png

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default async function ({ page, size, shot, settle }) {
  const wait = Math.max(2400, settle);
  const phone = size === 'phone';
  const $ = (sel) => `#mechanic ${sel}`;

  // Bring the simulator to the top of the viewport (phone: just below the nav, so the pinned stage is in place).
  async function toSim(extra = 0) {
    await page.evaluate(async (dy) => {
      const el = document.querySelector('#mechanic .mech__sim');
      const y = el.getBoundingClientRect().top + scrollY - 72 + dy;
      scrollTo({ top: y, behavior: 'instant' });
    }, extra);
    await sleep(600);
  }
  async function scrollToSel(sel, off = 96) {
    await page.evaluate(async ([s, o]) => {
      const el = document.querySelector(s);
      scrollTo({ top: el.getBoundingClientRect().top + scrollY - o, behavior: 'instant' });
    }, [sel, off]);
    await sleep(700);
  }
  const jump = async (id) => { await page.click($(`[data-jump="${id}"]`), { timeout: 8000 }); await sleep(wait); };
  const blockText = async () => page.$eval($('.mech__scrub-block'), (e) => e.textContent).catch(() => '?');

  try {
    await page.waitForSelector($('.mech__sim'), { timeout: 20000 });
  } catch (e) {
    await page.evaluate(() => document.querySelector('#mechanic')?.scrollIntoView({ behavior: 'instant' }));
    await page.waitForSelector($('.mech__sim'), { timeout: 20000 });
  }

  // 1 — block 0: the dim, half-formed seed
  await toSim();
  await jump('seed');
  await shot('mech-1-seed');

  // 2 — Tide II
  await jump('tide2');
  await shot('mech-2-tide2');

  // 3 — press Dusk (the piece leans), then look at the turn panel + log
  await scrollToSel($('.mech__turn'), phone ? 470 : 110);
  await page.click($('[data-horizon="1"]'));
  await sleep(wait);
  await shot('mech-3-dusk');

  // 4 — Still Hour: the buttons are closed; pressing Zenith is refused
  await toSim();
  await jump('still');
  await scrollToSel($('.mech__turn'), phone ? 470 : 110);
  await page.click($('[data-horizon="2"]'), { force: true });
  await sleep(900);
  await shot('mech-4-refused');

  // 5 — the reveal, then the bloom, with the horizons row
  await toSim();
  await jump('reveal');
  await shot('mech-5-reveal');
  await jump('bloomed');
  await scrollToSel($('.mech__sky'), phone ? 470 : 96);
  await sleep(wait);
  await shot('mech-6-bloomed-sky');
  await scrollToSel($('.mech__hzband'), 90);
  await sleep(wait * 2);
  await shot('mech-7-horizons');

  // rules + the contract block
  await scrollToSel($('.mech__rules'), 80);
  await sleep(900);
  await shot('mech-8-rules');
  await scrollToSel($('.mech__fair'), 100);
  await sleep(900);
  await shot('mech-9-fair');

  // keyboard: focus the scrubber, walk with the arrows and page keys (aria-valuetext shows in the readout)
  await toSim();
  await jump('seed');
  await page.focus($('.mech__range'));
  for (const k of ['ArrowRight', 'ArrowRight', 'ArrowRight', 'PageUp', 'PageUp']) { await page.keyboard.press(k); await sleep(120); }
  await sleep(wait);
  const vt = await page.$eval($('.mech__range'), (e) => e.getAttribute('aria-valuetext'));
  console.log(`[${size}] keyboard: after 3×Arrow + 2×PageUp → ${await blockText()} · "${vt}"`);
  await shot('mech-10-keyboard');

  // play: user-initiated; a couple of seconds, then pause
  await page.click($('.mech__play'));
  await sleep(2600);
  await page.click($('.mech__play'));
  await sleep(wait);
  console.log(`[${size}] play/pause → ${await blockText()}`);
  await shot('mech-11-played');

  // rehearse the sky from before the reveal (jumps to the reveal and plays the bloom)
  await jump('tide3');
  await page.click($('.mech__rehearse'));
  await sleep(6500);
  await shot('mech-12-rehearsed');

  // resize: 360 and 2560 wide
  if (size === 'desktop') {
    const vp = page.viewportSize();
    await page.setViewportSize({ width: 360, height: 780 });
    await sleep(1200);
    await toSim();
    await jump('tide4');
    await shot('mech-13-w360');
    const o1 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    console.log(`[${size}] overflow at 360: ${o1}px`);
    await page.setViewportSize({ width: 2560, height: 1300 });
    await sleep(1400);
    await toSim();
    await sleep(wait);
    await shot('mech-14-w2560');
    const o2 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    console.log(`[${size}] overflow at 2560: ${o2}px`);
    await page.setViewportSize(vp);
    await sleep(800);
  }
}
