#!/usr/bin/env node
// Canonical renders for metadata: final blooms (and optional growth stills) from a seeds file, in headless Chromium.
//
//   npm run render:canonical -- --seeds provenance-out/seeds.json --out out/canonical [--offset 0]
//        [--turns turns.json]   { "<tokenId>": 0..3 }  — the keepers' last turns (missing = drifted)
//        [--sky <hex64>|rehearsal] [--salt <hex64> --blockhash <hex64>]   real sky = keccak(salt, blockhash, tokenId)
//        [--ids 0-511] [--w 2400 --h 3000] [--stills]   also write seed/tide1..4/still/reveal/opening stills at 1200×1500
//
// Each token gets  <id>.png  and  <id>.json  (OpenSea-style metadata: name, description, attributes with rarity %).
// The dev server must be running (npm run dev) — the renderer is the same code the website uses. Pin the Chromium version
// you render with (playwright --version) and record it in your release notes: pixel output is exact per engine.

import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { devUrl } from './dev-url.mjs';

const args = {};
for (let i = 2; i < process.argv.length; i++) if (process.argv[i].startsWith('--')) { const k = process.argv[i].slice(2); args[k] = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : 'true'; }
const url = args.url ?? process.env.LAB_URL ?? devUrl();
const out = args.out ?? 'out/canonical';
const W = Number(args.w ?? 2400), H = Number(args.h ?? 3000);
const seedsFile = args.seeds;
if (!seedsFile) { console.error('--seeds <seeds.json> is required'); process.exit(1); }
const { seeds } = JSON.parse(readFileSync(seedsFile, 'utf8'));
const offset = Number(args.offset ?? 0);
const turns = args.turns ? JSON.parse(readFileSync(args.turns, 'utf8')) : {};
const [a, b] = (args.ids ?? `0-${seeds.length - 1}`).split('-').map(Number);

mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
await page.goto(`${url}/lab.html?w=64&h=80&quality=draft`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__lab, null, { timeout: 30000 });

const skyFor = async (id) => {
  if (args.salt && args.blockhash) return page.evaluate(([s, h, i]) => window.__lab.skyOf(s, h, i), [args.salt, args.blockhash, id]);
  if (args.sky && args.sky !== 'rehearsal') return args.sky;
  return `rehearsal:${id}`; // rehearsal only — NOT the real sky
};
const save = (dataUrl, file) => writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));

for (let id = a; id <= b; id++) {
  const seed = seeds[(id + offset) % seeds.length];
  const horizon = turns[id] ?? 'auto';
  const sky = await skyFor(id);
  const r = await page.evaluate((s) => window.__lab.dataURL(s), { seed, stage: 'bloomed', horizon, sky, w: W, h: H });
  save(r.url, join(out, `${id}.png`));
  const i = r.info;
  const meta = {
    name: `Halocline #${id}`,
    description: `${i.title} — a seed of the Glass Sea, bloomed toward ${i.horizon.name}${i.horizon.turned ? '' : ' by drift'}.`,
    image: `${id}.png`,
    seed,
    attributes: i.traits.map((t) => { const m = /^(.*?): (.*?)(?: \(([\d.]+)%\))?$/.exec(t); return { trait_type: m[1], value: m[2], ...(m[3] ? { rarity_percent: Number(m[3]) } : {}) }; }),
  };
  writeFileSync(join(out, `${id}.json`), JSON.stringify(meta, null, 1));
  if (args.stills) {
    for (const st of ['seed', 'tide1', 'tide2', 'tide3', 'tide4', 'still', 'reveal', 'opening']) {
      const s = await page.evaluate((sp) => window.__lab.dataURL(sp), { seed, stage: st, horizon, sky, w: 1200, h: 1500 });
      save(s.url, join(out, `${id}-${st}.png`));
    }
  }
  console.log(`token ${id}: ${i.title} · ${i.ms} ms`);
}
await browser.close();
