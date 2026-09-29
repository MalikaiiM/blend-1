// The art lab: a bare harness to develop, screenshot and audit the generator.
//   /lab.html?seed=…&stage=bloomed|seed|tide1…|block=N&horizon=0..3|dawn…&sky=…&w=800&h=1000&only=abyss,strata&quality=draft
// Automation talks to `window.__lab` (see scripts/lab.mjs).

import { measure } from './art/metrics.ts';
import {
  PARAMS, STAGES, REVEAL_BLOCK, BLOOM_END_BLOCK, GROWTH_BLOCKS, LAYER_ORDER, composite, deriveTraits,
  makeCanvas, normalizeSeed, randomSeed, renderPiece, resolvePiece, seedFromText, setParam, resetParams, rehearsalSky,
  timeline, skyOf, type Piece, type PieceState, type RenderOpts, type StageName,
} from './art/index.ts';

export interface Spec {
  seed: string;
  stage?: StageName | string;
  block?: number;
  horizon?: number | string | null;
  sky?: string | null;
  w?: number;
  h?: number;
  only?: string[];
  skip?: string[];
  quality?: 'draft' | 'full';
  solo?: string;
}

const HID = PARAMS.horizons.map((h) => h.id as string);

export function toSeed(s: string): string {
  return normalizeSeed(s) ?? seedFromText(s);
}
export function toState(spec: Spec): PieceState {
  let block = spec.block ?? 0;
  if (spec.block === undefined && spec.stage) block = (STAGES as any)[spec.stage] ?? Number(spec.stage) ?? 0;
  let horizon: number | null = null;
  if (spec.horizon !== undefined && spec.horizon !== null && spec.horizon !== '' && spec.horizon !== 'auto' && spec.horizon !== -1) {
    horizon = typeof spec.horizon === 'number' ? spec.horizon : HID.includes(spec.horizon) ? HID.indexOf(spec.horizon) : Number(spec.horizon);
  }
  let sky: string | null = spec.sky ?? null;
  if (sky && /^rehearsal:\d+$/.test(sky)) sky = rehearsalSky(Number(sky.split(':')[1]));
  return { block, horizon: horizon as any, sky };
}

function build(spec: Spec): Piece {
  const seed = toSeed(spec.seed);
  const w = spec.w ?? 800, h = spec.h ?? 1000;
  const opts: RenderOpts = { quality: spec.quality ?? 'full', only: spec.only as any, skip: spec.skip as any };
  return renderPiece(seed, toState(spec), w, h, opts);
}

function flat(piece: Piece, solo?: string): HTMLCanvasElement {
  const cv = makeCanvas(piece.w, piece.h);
  composite(cv.getContext('2d')!, piece, { solo: solo ?? null });
  return cv;
}

function summary(piece: Piece) {
  const t = piece.traits;
  return {
    seed: piece.seed, title: t.title, ms: piece.ms, timings: piece.timings, errors: piece.errors,
    phase: piece.tl.phase, t: +piece.tl.t.toFixed(3), bloom: +piece.tl.bloom.toFixed(3),
    horizon: t.horizon, tier: t.tier, score: +t.score.toFixed(2),
    traits: t.list.map((e) => `${e.label}: ${e.value}${Number.isNaN(e.share) ? '' : ` (${(e.share * 100).toFixed(1)}%)`}`),
  };
}

const lab = {
  toSeed, randomSeed, STAGES, REVEAL_BLOCK, BLOOM_END_BLOCK, GROWTH_BLOCKS, LAYER_ORDER,
  summary(spec: Spec) { return summary(build(spec)); },
  dataURL(spec: Spec) {
    const p = build(spec);
    return { url: flat(p, spec.solo).toDataURL('image/png'), info: summary(p) };
  },
  /** Pixel metrics for the quality audit (see src/art/metrics.ts). */
  metrics(spec: Spec) {
    const p = build(spec);
    const cv = flat(p);
    const d = cv.getContext('2d')!.getImageData(0, 0, cv.width, cv.height);
    const m = measure(d.data, cv.width, cv.height, { x: p.lay.cx, y: p.lay.cy, r: p.lay.unit * 0.3 });
    return { m, ms: p.ms, errors: p.errors, traits: p.traits.list.map((e) => [e.key, e.value]), tier: p.traits.tier, score: p.traits.score, horizon: p.traits.horizon.index, title: p.traits.title, bloomR: p.lay.R / p.lay.unit };
  },
  /** 8×10 average-colour thumbnail (0..1) — used to compare draft vs full composition. */
  tiny(spec: Spec) {
    const p = build(spec);
    const cv = flat(p);
    const t = makeCanvas(8, 10);
    const g = t.getContext('2d')!;
    g.imageSmoothingQuality = 'high';
    g.drawImage(cv, 0, 0, 8, 10);
    return Array.from(g.getImageData(0, 0, 8, 10).data).filter((_, i) => i % 4 !== 3).map((v) => v / 255);
  },
  PARAMS,
  skyOf,
  /** Every layer alone, over black (or over a checker for transparency), for close inspection. */
  layers(spec: Spec) {
    const p = build(spec);
    const out: Record<string, string> = {};
    for (const L of p.layers) {
      const cv = makeCanvas(p.w, p.h);
      const g = cv.getContext('2d')!;
      g.fillStyle = '#000'; g.fillRect(0, 0, p.w, p.h);
      g.globalCompositeOperation = L.blend === 'multiply' || L.blend === 'overlay' || L.blend === 'soft-light' ? 'source-over' : L.blend;
      g.globalAlpha = 1;
      if (L.blend === 'multiply' || L.blend === 'overlay' || L.blend === 'soft-light') { g.fillStyle = '#808080'; g.fillRect(0, 0, p.w, p.h); g.globalCompositeOperation = L.blend; }
      g.globalAlpha = L.alpha;
      g.drawImage(L.canvas, 0, 0);
      out[L.id] = cv.toDataURL('image/png');
    }
    return { layers: out, info: summary(p) };
  },
  /** Contact sheet: many specs in a grid with a caption under each. */
  sheet(specs: Spec[], o: { cols?: number; cw?: number; ch?: number; captions?: string[] } = {}) {
    const cols = o.cols ?? 4, cw = o.cw ?? 300, ch = o.ch ?? 375, cap = 22;
    const rows = Math.ceil(specs.length / cols);
    const sheet = makeCanvas(cols * cw, rows * (ch + cap));
    const g = sheet.getContext('2d')!;
    g.fillStyle = '#07080c'; g.fillRect(0, 0, sheet.width, sheet.height);
    g.font = '11px ui-monospace, monospace'; g.textBaseline = 'middle';
    const infos: unknown[] = [];
    specs.forEach((s, i) => {
      const p = build({ ...s, w: cw, h: ch });
      const x = (i % cols) * cw, y = Math.floor(i / cols) * (ch + cap);
      g.drawImage(flat(p, s.solo), x, y);
      g.fillStyle = '#9aa0b0';
      const t = p.traits;
      g.fillText(o.captions?.[i] ?? `${t.title} · ${t.horizon.name} · ${t.colors.def.name}`, x + 6, y + ch + cap / 2);
      infos.push(summary(p));
    });
    return { url: sheet.toDataURL('image/png'), infos };
  },
  /** One seed through time. */
  strip(spec: Spec, stages: (StageName | number)[], o: { cw?: number; ch?: number } = {}) {
    const cw = o.cw ?? 260, ch = o.ch ?? 325, cap = 22;
    const sheet = makeCanvas(stages.length * cw, ch + cap);
    const g = sheet.getContext('2d')!;
    g.fillStyle = '#07080c'; g.fillRect(0, 0, sheet.width, sheet.height);
    g.font = '11px ui-monospace, monospace'; g.textBaseline = 'middle'; g.fillStyle = '#9aa0b0';
    stages.forEach((st, i) => {
      const s: Spec = { ...spec, w: cw, h: ch };
      if (typeof st === 'number') { s.block = st; s.stage = undefined; } else { s.stage = st; s.block = undefined; }
      const p = build(s);
      g.drawImage(flat(p), i * cw, 0);
      const tl = p.tl;
      g.fillText(`${typeof st === 'number' ? 'block ' + st : st} · t=${tl.t.toFixed(2)} · b=${tl.bloom.toFixed(2)}`, i * cw + 6, ch + cap / 2);
    });
    return { url: sheet.toDataURL('image/png') };
  },
  setParam, resetParams, deriveTraits, resolvePiece, timeline,
};
(window as any).__lab = lab;

// ── interactive UI ────────────────────────────────────────────────
const q = new URLSearchParams(location.search);
const spec: Spec = {
  seed: q.get('seed') ?? 'halocline-lab-1',
  stage: q.get('stage') ?? (q.get('block') ? undefined : 'bloomed'),
  block: q.get('block') ? Number(q.get('block')) : undefined,
  horizon: q.get('horizon') ?? 'auto',
  sky: q.get('sky'),
  w: Number(q.get('w') ?? 800), h: Number(q.get('h') ?? 1000),
  only: q.get('only')?.split(',').filter(Boolean),
  skip: q.get('skip')?.split(',').filter(Boolean),
  quality: (q.get('quality') as any) ?? 'full',
  solo: q.get('solo') ?? undefined,
};

const bar = document.getElementById('bar')!;
const cv = document.getElementById('cv') as HTMLCanvasElement;
const info = document.getElementById('info')!;
let block = spec.block ?? (STAGES as any)[spec.stage ?? 'bloomed'] ?? 0;

bar.innerHTML = `
  <label>seed <input id="seed" type="text" value="${spec.seed}"></label>
  <button id="rand">random</button>
  <label>block <input id="block" type="range" min="0" max="${BLOOM_END_BLOCK + 2000}" value="${block}"><span id="bv"></span></label>
  <label>horizon <select id="hz"><option value="auto">drift</option>${PARAMS.horizons.map((h, i) => `<option value="${i}">${h.name}</option>`).join('')}</select></label>
  <label>solo <select id="solo"><option value="">all</option>${['abyss','strata','threads','lumen','inclusion','veil','grain','vignette','grade'].map((l) => `<option>${l}</option>`).join('')}</select></label>
  <label>quality <select id="qual"><option>full</option><option>draft</option></select></label>`;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
$('hz').setAttribute('value', String(spec.horizon));
($('hz') as HTMLSelectElement).value = String(spec.horizon ?? 'auto');

function draw() {
  const s: Spec = {
    seed: ($('seed') as HTMLInputElement).value,
    block: Number(($('block') as HTMLInputElement).value),
    horizon: ($('hz') as HTMLSelectElement).value,
    sky: spec.sky, w: spec.w, h: spec.h, only: spec.only, skip: spec.skip,
    quality: ($('qual') as HTMLSelectElement).value as any,
    solo: ($('solo') as HTMLSelectElement).value || undefined,
  };
  cv.width = s.w!; cv.height = s.h!;
  const p = build(s);
  composite(cv.getContext('2d')!, p, { solo: s.solo ?? null });
  $('bv').textContent = ` ${s.block} · ${p.tl.phase}`;
  info.textContent = JSON.stringify(summary(p), null, 2);
  (window as any).__ready = true;
}
$('seed').addEventListener('change', draw);
$('rand').addEventListener('click', () => { ($('seed') as HTMLInputElement).value = randomSeed(); draw(); });
for (const id of ['block', 'hz', 'solo', 'qual']) $(id).addEventListener('input', draw);
draw();
