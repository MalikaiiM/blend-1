#!/usr/bin/env node
// Screenshot the whole site at phone and desktop sizes.
//
//   node scripts/shoot.mjs --out screenshots/round-1 [--url http://localhost:5173] [--sizes phone,desktop] [--only hero,gallery]
//                          [--settle 2600] [--max-slices 9] [--no-scenarios]
//
// 1. Generic pass: each [data-section] is scrolled through and captured in viewport-sized slices
//    →  <out>/<size>/<NN>-<section>-<k>.png   (lazy sections get time to mount and render)
// 2. Scenario pass: every scripts/shoot/*.mjs default-exports  async ({ page, size, shot, settle })  which drives
//    interactive states (open a gallery detail, turn a seed, pull layers apart …) and calls  await shot('name').
//    →  <out>/<size>/scn-<name>.png
// Console errors and page errors are printed and written to <out>/console.txt.

import { chromium } from 'playwright';
import { mkdirSync, readdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { devUrl } from './dev-url.mjs';
import { pathToFileURL } from 'node:url';

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) {
    const k = a.slice(2);
    const v = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : 'true';
    args[k] = v;
  }
}
const url = args.url ?? process.env.SITE_URL ?? devUrl();
const out = resolve(args.out ?? 'screenshots/shoot');
const settle = Number(args.settle ?? 2600);
const maxSlices = Number(args['max-slices'] ?? 14);
const only = args.only ? args.only.split(',') : null;
const SIZES = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const sizes = (args.sizes ?? 'phone,desktop').split(',');

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'console.txt'), '');
// Vite's HMR client reloads the page or shows an error overlay whenever any file changes — fatal when several people
// edit at once. Screenshots stub it out (pass --hmr to keep it).
const STUB = `
const sheets = new Map();
export function createHotContext() { return { accept() {}, dispose() {}, prune() {}, invalidate() {}, on() {}, send() {}, data: {} }; }
export function updateStyle(id, css) { let s = sheets.get(id); if (!s) { s = document.createElement('style'); s.setAttribute('data-vite-dev-id', id); document.head.appendChild(s); sheets.set(id, s); } s.textContent = css; }
export function removeStyle(id) { const s = sheets.get(id); if (s) { s.remove(); sheets.delete(id); } }
export function injectQuery(u) { return u; }
export const ErrorOverlay = class {};
`;
const browser = await chromium.launch();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const name of sizes) {
  const cfg = SIZES[name];
  const dir = join(out, name);
  mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext({ ...cfg, reducedMotion: args['reduced-motion'] ? 'reduce' : 'no-preference' });
  if (!args.hmr) await ctx.route('**/@vite/client*', (r) => r.fulfill({ contentType: 'text/javascript', body: STUB }));
  const page = await ctx.newPage();
  const log = (line) => { console.log(line); appendFileSync(join(out, 'console.txt'), line + '\n'); };
  page.on('pageerror', (e) => log(`[${name}] pageerror: ${e.message}`));
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) log(`[${name}] console.${m.type()}: ${m.text()}`); });
  page.on('requestfailed', (r) => log(`[${name}] requestfailed: ${r.url()}`));

  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'load' });
  await sleep(settle);
  log(`[${name}] loaded in ${Date.now() - t0} ms`);

  // ── generic pass ────────────────────────────────────────────────
  const sections = await page.$$eval('[data-section]', (els) => els.map((e) => ({ id: e.dataset.section, sel: e.id ? `#${e.id}` : `[data-section="${e.dataset.section}"]` })));
  let idx = 0;
  for (const s of sections) {
    idx++;
    if (only && !only.includes(s.id)) continue;
    const box = await page.$eval(s.sel, (e) => { const r = e.getBoundingClientRect(); return { top: r.top + scrollY, height: r.height }; });
    const vh = cfg.viewport.height;
    const step = Math.round(vh * 0.9);
    const n = Math.max(1, Math.min(maxSlices, Math.ceil(box.height / step)));
    for (let k = 0; k < n; k++) {
      const y = Math.max(0, Math.round(box.top + k * step - (s.id === 'hero' ? 0 : 60)));
      await page.evaluate((yy) => window.scrollTo({ top: yy, behavior: 'instant' }), y);
      await sleep(k === 0 ? settle : Math.round(settle * 0.6));
      const file = join(dir, `${String(idx).padStart(2, '0')}-${s.id}-${k + 1}.png`);
      await page.screenshot({ path: file });
    }
    log(`[${name}] ${s.id}: ${n} slice(s), section height ${Math.round(box.height)}px`);
  }
  const docH = await page.evaluate(() => document.documentElement.scrollHeight);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  log(`[${name}] document height ${docH}px, horizontal overflow ${overflow}px${overflow > 0 ? '  <-- PROBLEM' : ''}`);

  // ── scenarios ───────────────────────────────────────────────────
  if (!args['no-scenarios']) {
    const sdir = resolve('scripts/shoot');
    for (const f of readdirSync(sdir).filter((f) => f.endsWith('.mjs')).sort()) {
      if (only && !only.some((o) => f.includes(o))) continue;
      try {
        const mod = await import(pathToFileURL(join(sdir, f)).href);
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
        await sleep(400);
        await mod.default({
          page, size: name, settle,
          shot: async (nm) => { await page.screenshot({ path: join(dir, `scn-${nm}.png`) }); log(`[${name}] scenario shot ${nm}`); },
        });
      } catch (e) {
        log(`[${name}] scenario ${f} failed: ${e.message}`);
      }
    }
  }
  await ctx.close();
}
await browser.close();
console.log('done →', out);
