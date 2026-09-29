// Pixel audit — render seeds small in headless Chromium, measure them, and fail the weak ones.
//
//   npm run audit:pixels -- [--n 1000] [--set main|holdout] [--stage bloomed] [--w 240 --h 300]
//                           [--seeds path/to/seeds.json] [--sheets] [--url http://localhost:5173]
//
// Needs the dev server (npm run dev). Writes docs/audit/pixels-<set>.json, the "pixels" section of docs/AUDIT.md,
// and (with --sheets) contact sheets of the best and worst renders to screenshots/audit/.
// Exit code 1 if any seed fails a gate.

import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { PARAMS } from '../src/art/params.ts';
import { pct, writeSection } from './lib-report.ts';

const argv = process.argv.slice(2);
const flag = (k: string) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : undefined; };
const has = (k: string) => argv.includes('--' + k);
const N = Number(flag('n') ?? 1000);
const SET = flag('set') ?? 'main';
const STAGE = flag('stage') ?? 'bloomed';
const W = Number(flag('w') ?? 240), H = Number(flag('h') ?? 300);
const URL = flag('url') ?? process.env.LAB_URL ?? 'http://localhost:5173';
const Q = PARAMS.quality;

const prefix = SET === 'holdout' ? 'halocline-holdout-' : 'halocline-audit-';
let specs: { seed: string; horizon: number; sky: string }[];
if (flag('seeds')) {
  const seeds: string[] = JSON.parse(readFileSync(flag('seeds')!, 'utf8')).seeds;
  specs = seeds.map((seed, i) => ({ seed, horizon: i % 4, sky: `rehearsal:${i}` }));
} else specs = Array.from({ length: N }, (_, i) => ({ seed: `${prefix}${i}`, horizon: i % 4, sky: `rehearsal:${i}` }));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
await page.goto(`${URL}/lab.html?w=64&h=80&quality=draft`, { waitUntil: 'load' });
await page.waitForFunction(() => (window as any).__lab, null, { timeout: 30000 });

const t0 = Date.now();
type R = { i: number; seed: string; horizon: number; ms: number; errors: string[]; traits: [string, string][]; title: string; m: any; tier: string | null };
const results: R[] = [];
const CHUNK = 25;
for (let a = 0; a < specs.length; a += CHUNK) {
  const part = specs.slice(a, a + CHUNK);
  const rs = await page.evaluate(([ss, stage, w, h]) => {
    const lab = (window as any).__lab;
    return (ss as any[]).map((s) => { const r = lab.metrics({ seed: s.seed, stage, horizon: s.horizon, sky: s.sky, w, h }); return { seed: lab.toSeed(s.seed), ...r }; });
  }, [part, STAGE, W, H] as const);
  rs.forEach((r: any, k: number) => results.push({ i: a + k, seed: r.seed, horizon: part[k]!.horizon, ms: r.ms, errors: r.errors, traits: r.traits, title: r.title, m: r.m, tier: r.tier }));
  process.stdout.write(`\r${results.length}/${specs.length}`);
}
process.stdout.write('\n');

// ── gates ──
const inR = (v: number, [lo, hi]: number[]) => v >= lo! && v <= hi!;
const fail = (r: R): string[] => {
  const m = r.m, f: string[] = [];
  const mono = Q.mono.palettes.some((id) => r.traits.some(([k, v]) => k === 'palette' && v.toLowerCase().replace(/\s+/g, '') === id));
  if (r.errors.length) f.push('render error: ' + r.errors[0]);
  if (!inR(m.meanLum, Q.meanLum)) f.push(`meanLum ${m.meanLum.toFixed(3)}`);
  if (!inR(m.lumStd, Q.lumStd)) f.push(`lumStd ${m.lumStd.toFixed(3)}`);
  if (!inR(m.colorfulness, mono ? Q.mono.colorfulness : Q.colorfulness)) f.push(`colorfulness ${m.colorfulness.toFixed(3)}`);
  if (!inR(m.litCoverage, Q.litCoverage)) f.push(`litCoverage ${m.litCoverage.toFixed(3)}`);
  if (!inR(m.bloomContrast, Q.bloomContrast)) f.push(`bloomContrast ${m.bloomContrast.toFixed(3)}`);
  if (!inR(m.edgeEnergy, Q.edgeEnergy)) f.push(`edgeEnergy ${m.edgeEnergy.toFixed(4)}`);
  if (m.darkClip > Q.darkClipMax) f.push(`darkClip ${m.darkClip.toFixed(2)}`);
  if (m.whiteClip > Q.whiteClipMax) f.push(`whiteClip ${m.whiteClip.toFixed(2)}`);
  if (m.hueBins < (mono ? Q.mono.hueBinsMin : Q.hueBinsMin)) f.push(`hueBins ${m.hueBins}`);
  return f;
};
const failing = results.map((r) => ({ r, why: fail(r) })).filter((x) => x.why.length);

// ── near duplicates (nearest neighbour on 16×20 RGB thumbnails) ──
const dist = (a: number[], b: number[]) => { let s = 0; for (let i = 0; i < a.length; i++) s += (a[i]! - b[i]!) ** 2; return Math.sqrt(s); };
const nn: number[] = new Array(results.length).fill(Infinity);
const nnIdx: number[] = new Array(results.length).fill(-1);
for (let i = 0; i < results.length; i++) for (let j = i + 1; j < results.length; j++) {
  const d = dist(results[i]!.m.tiny, results[j]!.m.tiny);
  if (d < nn[i]!) { nn[i] = d; nnIdx[i] = j; }
  if (d < nn[j]!) { nn[j] = d; nnIdx[j] = i; }
}
const nearDup = results.map((r, i) => ({ r, d: nn[i]!, j: nnIdx[i]! })).filter((x) => x.d < Q.nearDuplicate);

// ── quality score for ranking (percentile-rank blend) ──
const rank = (get: (r: R) => number) => { const s = results.map(get).sort((a, b) => a - b); return (r: R) => s.findIndex((v) => v >= get(r)) / s.length; };
const rC = rank((r) => r.m.colorfulness), rS = rank((r) => r.m.lumStd), rB = rank((r) => r.m.bloomContrast), rH = rank((r) => r.m.hueBins);
const rq = (r: R) => 0.3 * rC(r) + 0.25 * rS(r) + 0.3 * rB(r) + 0.15 * rH(r) - Math.abs(r.m.meanLum - 0.22) * 1.2;
const ranked = [...results].sort((a, b) => rq(b) - rq(a));

// ── distribution table ──
const stat = (get: (r: R) => number) => { const v = results.map(get).sort((a, b) => a - b); const q = (p: number) => v[Math.min(v.length - 1, Math.floor(p * v.length))]!; return [v[0]!, q(0.05), q(0.5), q(0.95), v[v.length - 1]!]; };
const rows: [string, (r: R) => number, string][] = [
  ['meanLum', (r) => r.m.meanLum, JSON.stringify(Q.meanLum)], ['lumStd', (r) => r.m.lumStd, JSON.stringify(Q.lumStd)],
  ['colorfulness', (r) => r.m.colorfulness, JSON.stringify(Q.colorfulness)], ['litCoverage', (r) => r.m.litCoverage, JSON.stringify(Q.litCoverage)],
  ['bloomContrast', (r) => r.m.bloomContrast, JSON.stringify(Q.bloomContrast)], ['edgeEnergy', (r) => r.m.edgeEnergy, JSON.stringify(Q.edgeEnergy)],
  ['darkClip', (r) => r.m.darkClip, `≤ ${Q.darkClipMax}`], ['whiteClip', (r) => r.m.whiteClip, `≤ ${Q.whiteClipMax}`], ['hueBins', (r) => r.m.hueBins, `≥ ${Q.hueBinsMin}`],
  ['render ms @ ' + W + '×' + H, (r) => r.ms, '—'],
];
let md = `### Pixels — ${results.length.toLocaleString()} seeds (${SET} set, stage \`${STAGE}\`, ${W}×${H}, horizons cycled)\n\n| metric | min | p5 | median | p95 | max | gate |\n|---|---:|---:|---:|---:|---:|---|\n`;
for (const [name, get, gate] of rows) md += `| ${name} | ${stat(get).map((x) => (Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(3))).join(' | ')} | ${gate} |\n`;

// by-trait means, to spot systematically weak groups
md += `\n**Weakest trait groups** (lowest mean quality rank; a group is worth a look if it is far below 0.5):\n\n| trait = value | n | mean rank | fail rate |\n|---|---:|---:|---:|\n`;
const groups = new Map<string, R[]>();
for (const r of results) for (const [k, v] of r.traits) { const g = `${k} = ${v}`; if (!groups.has(g)) groups.set(g, []); groups.get(g)!.push(r); }
const failSet = new Set(failing.map((x) => x.r.i));
const gl = [...groups.entries()].filter(([, v]) => v.length >= 8).map(([k, v]) => ({ k, n: v.length, q: v.reduce((s, r) => s + rq(r), 0) / v.length, f: v.filter((r) => failSet.has(r.i)).length / v.length }));
const meanQ = results.reduce((s, r) => s + rq(r), 0) / results.length;
for (const g of gl.sort((a, b) => a.q - b.q).slice(0, 8)) md += `| ${g.k} | ${g.n} | ${(g.q - meanQ).toFixed(3)} vs mean | ${pct(g.f)} |\n`;

md += `\n### Verdict\n\n${failing.length === 0 ? `**PASS** — all ${results.length.toLocaleString()} renders are inside the gates` : `**FAIL** — ${failing.length} of ${results.length} renders are outside the gates`}; near-duplicates (thumbnail distance < ${Q.nearDuplicate}): ${nearDup.length}.\n`;
if (failing.length) md += '\n| seed | horizon | why |\n|---|---|---|\n' + failing.slice(0, 40).map(({ r, why }) => `| \`${r.seed.slice(0, 12)}…\` (#${r.i}) | ${r.horizon} | ${why.join('; ')} |`).join('\n') + '\n';
writeSection('docs/AUDIT.md', 'pixels-' + SET, md);
mkdirSync('docs/audit', { recursive: true });
writeFileSync(`docs/audit/pixels-${SET}.json`, JSON.stringify(results.map((r) => ({ i: r.i, seed: r.seed, horizon: r.horizon, title: r.title, ms: r.ms, tier: r.tier, traits: Object.fromEntries(r.traits), m: { ...r.m, tiny: undefined }, q: +rq(r).toFixed(4), why: fail(r) })), null, 0));

if (has('sheets')) {
  mkdirSync('screenshots/audit', { recursive: true });
  const sheet = async (list: R[], file: string) => {
    const s = list.map((r) => ({ seed: r.seed, stage: STAGE, horizon: r.horizon, sky: specs[r.i]!.sky }));
    const caps = list.map((r) => `#${r.i} ${r.title}`);
    const out = await page.evaluate(([ss, o]) => (window as any).__lab.sheet(ss, o), [s, { cols: 6, cw: 240, ch: 300, captions: caps }] as const);
    writeFileSync(file, Buffer.from(out.url.split(',')[1], 'base64'));
    console.log('wrote', file);
  };
  await sheet(ranked.slice(0, 24), 'screenshots/audit/best.png');
  await sheet(ranked.slice(-24).reverse(), 'screenshots/audit/worst.png');
  if (failing.length) await sheet(failing.slice(0, 24).map((x) => x.r), 'screenshots/audit/failing.png');
}
await browser.close();
console.log(md.split('### Verdict')[1]);
console.log(`(${((Date.now() - t0) / 1000).toFixed(0)} s)`);
process.exit(failing.length ? 1 : 0);
