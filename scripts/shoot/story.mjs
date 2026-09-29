// Scenarios for the story section: every passage, the scroll-linked stops, the horizons, the phone stills,
// keyboard focus, a resize to 360 and 2560, and a second mount.
//   node scripts/shoot.mjs --out screenshots/site/story --only story --sizes phone,desktop --settle 3500
//   add --reduced-motion true to check the discrete-stills path.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default async function ({ page, size, shot, settle }) {
  const desktop = size === 'desktop';
  const wait = (k = 1) => sleep(Math.max(1800, settle) * k);
  const safe = async (name, fn) => { try { await fn(); } catch (e) { console.log(`[story:${size}] ${name} skipped: ${e.message.split('\n')[0]}`); } };

  /** Scroll so passage i is what the reader is looking at. p (0..1) positions inside a scroll-linked passage. */
  const go = (i, p = 0) =>
    page.evaluate(({ i, p }) => {
      const li = document.querySelector(`.story__passage[data-i="${i}"]`);
      if (!li) throw new Error('no passage ' + i);
      const desktop = !!document.querySelector('.story--stage');
      const tx = li.querySelector('.story__text');
      const lr = li.getBoundingClientRect();
      const top = lr.top + scrollY;
      let y;
      if (!desktop) y = top - 76;
      else if (li.classList.contains('story__passage--scrub')) {
        const pin = parseFloat(getComputedStyle(tx).top) || 0;
        y = top - pin + p * (lr.height - tx.getBoundingClientRect().height);
      } else y = top + lr.height / 2 - innerHeight / 2;
      scrollTo({ top: Math.round(y), behavior: 'instant' });
    }, { i, p });

  // let the section mount and its first frames land
  await safe('intro', async () => {
    await page.evaluate(() => document.querySelector('#story').scrollIntoView({ behavior: 'instant' }));
    await wait(1.4);
    await shot('story-00-head');
  });

  const names = ['glass', 'seed', 'tides', 'turning', 'bloom'];
  for (let i = 0; i < 5; i++) {
    await safe(`passage ${i}`, async () => {
      await go(i, 0);
      await wait(i === 0 ? 1.6 : 1.1);
      await shot(`story-${i + 1}-${names[i]}`);
    });
  }

  if (desktop) {
    // scroll-linked stops inside III and V
    for (const p of [0.3, 0.55, 0.8, 1]) {
      await safe(`III at ${p}`, async () => { await go(2, p); await wait(0.9); await shot(`story-3-tides-p${Math.round(p * 100)}`); });
    }
    for (const p of [0.25, 0.6, 1]) {
      await safe(`V at ${p}`, async () => { await go(4, p); await wait(0.9); await shot(`story-5-bloom-p${Math.round(p * 100)}`); });
    }
  } else {
    // tap through the tides and the bloom
    await safe('tap tides', async () => {
      await go(2);
      await wait(0.8);
      const steps = await page.$$('.story__passage[data-i="2"] .story__step');
      for (const k of [0, 2, 4]) {
        await steps[k].tap();
        await wait(0.6);
        await page.evaluate(() => document.querySelector('.story__passage[data-i="2"]').scrollIntoView({ behavior: 'instant', block: 'start' }));
        await page.evaluate(() => scrollBy(0, -76));
        await sleep(300);
        await shot(`story-3-tides-tap${k}`);
      }
    });
    await safe('tap bloom', async () => {
      await go(4);
      await wait(0.8);
      const steps = await page.$$('.story__passage[data-i="4"] .story__step');
      for (const k of [0, 1]) {
        await steps[k].tap();
        await wait(0.6);
        await page.evaluate(() => document.querySelector('.story__passage[data-i="4"]').scrollIntoView({ behavior: 'instant', block: 'start' }));
        await page.evaluate(() => scrollBy(0, -76));
        await sleep(300);
        await shot(`story-5-bloom-tap${k}`);
      }
    });
  }

  // the four horizons
  await safe('horizons', async () => {
    await go(3);
    await wait(0.8);
    const chips = await page.$$('.story__chip');
    for (const k of [1, 2, 3]) {
      if (desktop) await chips[k].click(); else await chips[k].tap();
      await wait(1);
      if (!desktop) {
        await page.evaluate(() => document.querySelector('.story__passage[data-i="3"]').scrollIntoView({ behavior: 'instant', block: 'start' }));
        await page.evaluate(() => scrollBy(0, -76));
        await sleep(300);
      }
      await shot(`story-4-turning-h${k}`);
    }
  });

  // hover (fine pointers only) turns the seed after a short dwell
  if (desktop) {
    await safe('hover', async () => {
      await go(3);
      await wait(0.6);
      const chips = await page.$$('.story__chip');
      const box = await chips[0].boundingBox();
      await page.mouse.move(box.x + box.width / 2 - 40, box.y - 60);
      const box2 = await chips[2].boundingBox();
      await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2, { steps: 8 });
      await sleep(500);
      const pressed = await page.evaluate(() => [...document.querySelectorAll('.story__chip')].map((b) => b.getAttribute('aria-pressed')).join(','));
      console.log(`[story:${size}] pressed after hover on Zenith: ${pressed}`);
      await wait(0.8);
      await shot('story-4-turning-hover');
    });
  }

  // the bloom follows the turn
  await safe('bloom after turn', async () => {
    await go(4, desktop ? 1 : 0);
    await wait(1.5);
    await shot('story-5-bloom-after-turn');
  });

  // keyboard: tab to the chips, arrow along them
  await safe('keyboard', async () => {
    await go(3);
    await sleep(600);
    await page.focus('.story__chip[aria-pressed="true"]');
    await page.keyboard.press('ArrowRight');
    await wait(0.8);
    await shot('story-4-turning-keyboard');
  });

  // resize: 360 and 2560, then back
  await safe('resize', async () => {
    const orig = page.viewportSize();
    for (const [w, h, nm] of [[360, 740, '360'], [768, 1024, '768'], [1280, 640, '1280x640'], [1920, 1080, '1920'], [2560, 1440, '2560']]) {
      await page.setViewportSize({ width: w, height: h });
      await sleep(900);
      await page.evaluate(() => document.querySelector('#story').scrollIntoView({ behavior: 'instant' }));
      await go(2, 0.5);
      await wait(1.8);
      await shot(`story-resize-${nm}`);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      console.log(`[story:${size}] overflow at ${w}px: ${over}px`);
    }
    await page.setViewportSize(orig);
    await sleep(700);
  });

  // mounting twice must not duplicate anything
  await safe('mount twice', async () => {
    const before = await page.evaluate(() => document.querySelectorAll('#story .story__passage').length);
    await page.evaluate(async () => {
      const m = await import('/src/site/sections/story.ts');
      await m.default(document.querySelector('#story'));
    });
    const after = await page.evaluate(() => document.querySelectorAll('#story .story__passage').length);
    console.log(`[story:${size}] passages before/after second mount: ${before}/${after}`);
  });
}
