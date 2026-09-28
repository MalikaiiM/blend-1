#!/usr/bin/env node
// Same seed → same image. Renders a set of specs in two separate browser sessions and compares SHA-256 of the PNGs;
// also checks that draft and full renders share a composition (mean colour of a 8×10 thumbnail within tolerance).
//   npm run test:determinism        (needs the dev server)
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';

const url = process.env.LAB_URL ?? 'http://localhost:5173';
const specs = [];
for (const seed of ['determinism-a', 'determinism-b', 'determinism-c']) {
  for (const [stage, horizon] of [['seed', 'dawn'], ['tide2', 'dusk'], ['still', 'zenith'], ['opening', 'nadir'], ['bloomed', 'auto'], ['bloomed', 'nadir']])
    specs.push({ seed, stage, horizon, sky: 'rehearsal:7', w: 400, h: 500 });
}
async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`${url}/lab.html?w=64&h=80&quality=draft`);
  await page.waitForFunction(() => window.__lab);
  const out = [];
  for (const s of specs) {
    const r = await page.evaluate((sp) => window.__lab.dataURL(sp), s);
    out.push(createHash('sha256').update(r.url).digest('hex').slice(0, 16));
  }
  const draft = await page.evaluate((ss) => ss.map((s) => {
    const a = window.__lab.tiny({ ...s, quality: 'full' }), b = window.__lab.tiny({ ...s, quality: 'draft' });
    let d = 0; for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]); return d / a.length;
  }), specs.slice(0, 8));
  await browser.close();
  return { out, draft };
}
const a = await run(), b = await run();
let bad = 0;
specs.forEach((s, i) => { if (a.out[i] !== b.out[i]) { bad++; console.log('MISMATCH', s, a.out[i], b.out[i]); } });
console.log(bad ? `FAIL: ${bad}/${specs.length} renders differ between sessions` : `PASS: ${specs.length} renders are byte-identical across two browser sessions`);
const worst = Math.max(...a.draft);
console.log(`draft vs full composition drift (mean |Δ| of 8×10 thumbnails): max ${worst.toFixed(3)} ${worst < 0.08 ? '✓' : '✗ (draft composition differs from full)'}`);
process.exit(bad || worst >= 0.08 ? 1 : 0);
