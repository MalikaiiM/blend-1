#!/usr/bin/env node
// Lab CLI — render the generator in headless Chromium and write PNGs you can look at.
//
//   node scripts/lab.mjs shot   --seed foo --stage bloomed --horizon dawn --w 800 --h 1000 --out /tmp/a.png
//                               [--only abyss,strata] [--skip veil] [--solo lumen] [--sky rehearsal:3] [--block N] [--quality draft]
//   node scripts/lab.mjs layers --seed foo --stage bloomed --outdir /tmp/layers      (each layer alone on black)
//   node scripts/lab.mjs sheet  --n 12 --base foo --stage bloomed --cols 4 --cw 300 --ch 375 --out /tmp/s.png [--horizon rand]
//   node scripts/lab.mjs strip  --seed foo --horizon 1 --out /tmp/strip.png [--stages seed,tide1,tide2,tide3,tide4,still,reveal,opening,bloomed]
//   node scripts/lab.mjs info   --seed foo --stage bloomed                               (traits + timings as JSON)
//
// Needs the dev server:  npm run dev   (default http://localhost:5173, override with --url or LAB_URL)

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const [cmd = 'shot', ...rest] = process.argv.slice(2);
const args = {};
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith('--')) {
    const k = rest[i].slice(2);
    const v = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : 'true';
    args[k] = v;
  }
}
const base = args.url ?? process.env.LAB_URL ?? 'http://localhost:5173';

const num = (v, d) => (v === undefined ? d : Number(v));
const list = (v) => (v ? v.split(',').filter(Boolean) : undefined);
const specOf = (seed) => ({
  seed,
  stage: args.block ? undefined : args.stage ?? 'bloomed',
  block: args.block ? Number(args.block) : undefined,
  horizon: args.horizon ?? 'auto',
  sky: args.sky ?? null,
  w: num(args.w, 800), h: num(args.h, 1000),
  only: list(args.only), skip: list(args.skip), quality: args.quality ?? 'full', solo: args.solo,
});

function save(dataUrl, file) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log('wrote', file);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.error(`[console.${m.type()}]`, m.text()); });
await page.goto(`${base}/lab.html?w=64&h=80&quality=draft`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__lab, null, { timeout: 30000 });

try {
  if (cmd === 'shot') {
    const r = await page.evaluate((s) => window.__lab.dataURL(s), specOf(args.seed ?? 'halocline-lab-1'));
    save(r.url, args.out ?? 'screenshots/lab-shot.png');
    console.log(JSON.stringify(r.info, null, 1));
  } else if (cmd === 'layers') {
    const r = await page.evaluate((s) => window.__lab.layers(s), specOf(args.seed ?? 'halocline-lab-1'));
    const dir = args.outdir ?? 'screenshots/layers';
    for (const [id, url] of Object.entries(r.layers)) save(url, join(dir, `${id}.png`));
    console.log(JSON.stringify(r.info, null, 1));
  } else if (cmd === 'sheet') {
    const n = num(args.n, 12), b = args.base ?? 'halocline-sheet';
    const specs = Array.from({ length: n }, (_, i) => {
      const seed = `${b}-${i}`;
      const s = specOf(seed);
      if (args.horizon === 'rand') s.horizon = i % 4;
      s.w = num(args.cw, 300); s.h = num(args.ch, 375);
      return s;
    });
    const r = await page.evaluate(([s, o]) => window.__lab.sheet(s, o), [specs, { cols: num(args.cols, 4), cw: num(args.cw, 300), ch: num(args.ch, 375) }]);
    save(r.url, args.out ?? 'screenshots/lab-sheet.png');
    if (args.info) console.log(JSON.stringify(r.infos, null, 1));
  } else if (cmd === 'strip') {
    const stages = list(args.stages) ?? ['seed', 'tide1', 'tide2', 'tide3', 'tide4', 'still', 'reveal', 'opening', 'bloomed'];
    const s = specOf(args.seed ?? 'halocline-lab-1');
    const r = await page.evaluate(([sp, st, o]) => window.__lab.strip(sp, st, o), [s, stages.map((x) => (/^\d+$/.test(x) ? Number(x) : x)), { cw: num(args.cw, 240), ch: num(args.ch, 300) }]);
    save(r.url, args.out ?? 'screenshots/lab-strip.png');
  } else if (cmd === 'info') {
    console.log(JSON.stringify(await page.evaluate((s) => window.__lab.summary(s), specOf(args.seed ?? 'halocline-lab-1')), null, 1));
  } else {
    console.error('unknown command', cmd);
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}
