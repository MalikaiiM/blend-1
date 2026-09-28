// Trait audit — pure, fast, no browser. Are rare traits truly rare? Do the realised shares match the odds?
// Is the bloom independent of the keeper's horizon? Are the body traits independent of each other?
//
//   npm run audit:traits -- [--n 1000] [--big 20000]
//
// Seeds: seedFromText("halocline-audit-<i>"). Bloom traits are derived for every horizon with a per-seed rehearsal sky.
// Writes the "traits" section of docs/AUDIT.md and exits non-zero on any failed check.

import { PARAMS } from '../src/art/params.ts';
import { deriveTraits, tierOfScore } from '../src/art/traits.ts';
import { rehearsalSky, seedFromText } from '../src/art/index.ts';
import { pct, writeSection } from './lib-report.ts';

const argv = process.argv.slice(2);
const flag = (k: string, d: number) => { const i = argv.indexOf('--' + k); return i >= 0 ? Number(argv[i + 1]) : d; };
const N = flag('n', 1000);
const BIG = flag('big', 20000);

type Row = { key: string; label: string; value: string; expected: number };
const W = PARAMS.traits;
const names: Record<string, Record<string, string>> = PARAMS.names as any;
const table = (o: { v: unknown; w: number }[], name?: string): { value: string; expected: number }[] => {
  const tot = o.reduce((s, e) => s + e.w, 0);
  return o.map((e) => ({ value: name ? (names[name]?.[String(e.v)] ?? String(e.v)) : String(e.v), expected: e.w / tot }));
};
const spec: Record<string, { label: string; rows: { value: string; expected: number }[]; group: 'body' | 'bloom' }> = {
  palette: { label: 'Palette', group: 'body', rows: (() => { const tot = PARAMS.palettes.reduce((s, p) => s + p.weight, 0); return PARAMS.palettes.map((p) => ({ value: p.name, expected: p.weight / tot })); })() },
  sheets: { label: 'Sheets', group: 'body', rows: table(W.sheets) },
  interface: { label: 'Interface', group: 'body', rows: table(W.interface, 'interface') },
  growth: { label: 'Growth', group: 'body', rows: table(W.growth, 'growth') },
  glass: { label: 'Glass', group: 'body', rows: table(W.glass, 'glass') },
  grain: { label: 'Grain', group: 'body', rows: table(W.grain, 'grain') },
  dust: { label: 'Dust', group: 'body', rows: table(W.dust, 'dust') },
  form: { label: 'Form', group: 'bloom', rows: table(W.form, 'form') },
  petals: { label: 'Petals', group: 'bloom', rows: table(W.petals) },
  rings: { label: 'Rings', group: 'bloom', rows: table(W.rings) },
  light: { label: 'Light', group: 'bloom', rows: table(W.light, 'light') },
  inclusion: { label: 'Inclusion', group: 'bloom', rows: table(W.inclusion, 'inclusion') },
};

function collect(n: number, horizonOf: (i: number) => 0 | 1 | 2 | 3) {
  const counts: Record<string, Record<string, number>> = {};
  const scores: number[] = [];
  const seeds: string[] = [];
  for (let i = 0; i < n; i++) {
    const seed = seedFromText(`halocline-audit-${i}`);
    seeds.push(seed);
    const t = deriveTraits(seed, { horizon: horizonOf(i), sky: rehearsalSky(i) });
    for (const e of t.list) if (spec[e.key]) (counts[e.key] ??= {})[e.value] = (counts[e.key]![e.value] ?? 0) + 1;
    scores.push(t.score);
  }
  return { counts, scores, seeds };
}

const fails: string[] = [];
const warns: string[] = [];
const main = collect(N, (i) => (i % 4) as 0 | 1 | 2 | 3);
const big = collect(BIG, (i) => ((i * 7 + 3) % 4) as 0 | 1 | 2 | 3);

// ── realised vs expected (binomial z, 4σ tolerance on the 20k run; the N run is reported as-is) ──
let md = `### Traits — ${N.toLocaleString()} seeds (+ ${BIG.toLocaleString()} for statistics)\n\nRealised share vs the odds in \`PARAMS.traits\`. **Rare** = expected < 5 %, **Epic** < 4 %, **Mythic** < 1 %.\n\n`;
for (const [key, s] of Object.entries(spec)) {
  md += `**${s.label}** (${s.group})\n\n| value | odds | ${N.toLocaleString()} seeds | ${BIG.toLocaleString()} seeds | z |\n|---|---:|---:|---:|---:|\n`;
  for (const r of s.rows) {
    const c1 = main.counts[key]?.[r.value] ?? 0, c2 = big.counts[key]?.[r.value] ?? 0;
    const sd = Math.sqrt(BIG * r.expected * (1 - r.expected));
    const z = sd ? (c2 - BIG * r.expected) / sd : 0;
    md += `| ${r.value} | ${pct(r.expected, 2)} | ${c1} (${pct(c1 / N, 1)}) | ${c2} (${pct(c2 / BIG, 2)}) | ${z.toFixed(1)} |\n`;
    if (Math.abs(z) > 4.5) fails.push(`${s.label}=${r.value}: realised ${pct(c2 / BIG, 2)} vs odds ${pct(r.expected, 2)} (z=${z.toFixed(1)})`);
    if (r.expected >= 0.005 && c1 === 0) warns.push(`${s.label}=${r.value} (odds ${pct(r.expected, 2)}) never appeared in the first ${N} seeds`);
  }
  md += '\n';
}

// ── horizon independence of the bloom (chi-square across the four horizons, same seeds+sky) ──
md += `### Horizon independence\n\nFor each of ${BIG.toLocaleString()} seeds the bloom is derived under all four horizons with the same sky; every horizon must show the same distribution.\n\n| trait | χ² (df) | verdict |\n|---|---:|---|\n`;
const perH: Record<number, Record<string, Record<string, number>>> = { 0: {}, 1: {}, 2: {}, 3: {} };
for (let i = 0; i < BIG; i++) {
  const seed = seedFromText(`halocline-audit-${i}`);
  for (const h of [0, 1, 2, 3] as const) {
    const t = deriveTraits(seed, { horizon: h, sky: rehearsalSky(i) });
    for (const e of t.list) if (spec[e.key]?.group === 'bloom') ((perH[h]![e.key] ??= {})[e.value] = (perH[h]![e.key]![e.value] ?? 0) + 1);
  }
}
for (const [key, s] of Object.entries(spec).filter(([, s]) => s.group === 'bloom')) {
  let chi = 0, df = 0;
  for (const r of s.rows) {
    const exp = BIG * r.expected;
    if (exp < 5) continue;
    for (const h of [0, 1, 2, 3]) { const o = perH[h]![key]?.[r.value] ?? 0; chi += ((o - exp) ** 2) / exp; }
    df += 3;
  }
  // crude 99.9% bound for chi-square with df degrees: df + 3.3*sqrt(2df) + small
  const bound = df + 3.5 * Math.sqrt(2 * df) + 5;
  const ok = chi < bound;
  md += `| ${s.label} | ${chi.toFixed(1)} (${df}) | ${ok ? 'independent ✓' : 'DEPENDENT ✗'} |\n`;
  if (!ok) fails.push(`bloom trait ${s.label} looks dependent on horizon (χ²=${chi.toFixed(1)}, bound ${bound.toFixed(1)})`);
}

// ── body traits mutually independent (Cramér's V) ──
md += `\n### Body-trait independence\n\nCramér's V between every pair of body traits over ${BIG.toLocaleString()} seeds (0 = independent). Flagged above 0.06.\n\n`;
const bodyKeys = Object.keys(spec).filter((k) => spec[k]!.group === 'body');
const cols: Record<string, string[]> = Object.fromEntries(bodyKeys.map((k) => [k, [] as string[]]));
for (let i = 0; i < BIG; i++) {
  const t = deriveTraits(big.seeds[i]!);
  for (const e of t.list) if (cols[e.key]) cols[e.key]!.push(e.value);
}
let maxV = 0, maxPair = '';
for (let a = 0; a < bodyKeys.length; a++) for (let b = a + 1; b < bodyKeys.length; b++) {
  const A = cols[bodyKeys[a]!]!, B = cols[bodyKeys[b]!]!;
  const ka = [...new Set(A)], kb = [...new Set(B)];
  const m = new Map<string, number>();
  const ra = new Map<string, number>(), rb = new Map<string, number>();
  for (let i = 0; i < A.length; i++) { const k = A[i] + '|' + B[i]; m.set(k, (m.get(k) ?? 0) + 1); ra.set(A[i]!, (ra.get(A[i]!) ?? 0) + 1); rb.set(B[i]!, (rb.get(B[i]!) ?? 0) + 1); }
  let chi = 0;
  for (const x of ka) for (const y of kb) { const e = (ra.get(x)! * rb.get(y)!) / A.length; if (e > 0) chi += ((m.get(x + '|' + y) ?? 0) - e) ** 2 / e; }
  const v = Math.sqrt(chi / (A.length * (Math.min(ka.length, kb.length) - 1)));
  if (v > maxV) { maxV = v; maxPair = `${bodyKeys[a]}×${bodyKeys[b]}`; }
  if (v > 0.06) fails.push(`body traits ${bodyKeys[a]} × ${bodyKeys[b]} correlated (V=${v.toFixed(3)})`);
}
md += `Largest V: **${maxV.toFixed(3)}** (${maxPair}) — ${maxV <= 0.06 ? 'all independent ✓' : 'CORRELATED ✗'}\n`;

// ── tiers ──
const sorted = [...big.scores].sort((a, b) => a - b);
const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
const tiers: Record<string, number> = {};
for (const s of big.scores) tiers[tierOfScore(s)] = (tiers[tierOfScore(s)] ?? 0) + 1;
md += `\n### Rarity tiers\n\nScore = Σ −ln(share) over the 12 traits. Quantiles over ${BIG.toLocaleString()} seeds: p50 ${q(0.5).toFixed(2)} · p60 ${q(0.6).toFixed(2)} · p85 ${q(0.85).toFixed(2)} · p96 ${q(0.96).toFixed(2)} · p99.2 ${q(0.992).toFixed(2)}.\n\nSuggested cutoffs for ≈ 60 / 25 / 11 / 3.2 / 0.8 % (common/uncommon/rare/epic/mythic): uncommon ${q(0.6).toFixed(1)}, rare ${q(0.85).toFixed(1)}, epic ${q(0.96).toFixed(1)}, mythic ${q(0.992).toFixed(1)}.\n\nCurrent cutoffs (${JSON.stringify(PARAMS.rarity.tierCutoffs)}) give: ${['common', 'uncommon', 'rare', 'epic', 'mythic'].map((t) => `${t} ${pct((tiers[t] ?? 0) / BIG, 1)}`).join(' · ')}.\n`;
{
  const c = PARAMS.rarity.tierCutoffs;
  const share = (t: string) => (tiers[t] ?? 0) / BIG;
  if (share('mythic') > 0.015 || share('mythic') < 0.002) warns.push(`mythic tier is ${pct(share('mythic'), 2)} of seeds — retune PARAMS.rarity.tierCutoffs (suggested mythic ≥ ${q(0.992).toFixed(1)})`);
  if (share('epic') > 0.06) warns.push(`epic tier is ${pct(share('epic'), 1)} — too common`);
  void c;
}

md += `\n### Verdict\n\n${fails.length ? '**FAIL**\n' + fails.map((f) => `- ✗ ${f}`).join('\n') : '**PASS** — realised shares match the odds; the bloom is independent of the horizon; body traits are mutually independent.'}\n${warns.length ? '\nWarnings:\n' + warns.map((w) => `- ${w}`).join('\n') : ''}\n`;
writeSection('docs/AUDIT.md', 'traits', md);
console.log(md.split('### Verdict')[1]);
process.exit(fails.length ? 1 : 0);
