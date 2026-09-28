// THE LUMEN — the lamp itself: glass petals around a hot core, seen through the dark sea.
//
//   render(c)     the layer (transparent canvas, composed with 'screen')
//   drawBloom(…)  one complete bloom onto any context — used for the primary bloom here and for the
//                 second, smaller bloom of a Twin Bloom by the inclusion layer.
//
// Before the sky opens (or while tl.bloom = 0) only the generic bud is drawn — a closed teardrop that
// never reads traits.bloom.* — and as tl.bloom goes 0 → 1 it unfolds into the sealed form.

import type { LayerCtx, LayerFn } from './types.ts';
import { clamp, DEG, lerp, smoothstep, TAU } from '../math.ts';
import { css, mix } from '../color.ts';
import {
  buildOutline, buildPetals, makePal, poseOf,
  type Frame, type LP, type Petal,
} from './lumen.model.ts';
import {
  glare, paintCore, paintCoreRing, paintGhosts, paintHalation, paintPearl, paintPearlRing, paintPetalBody, paintPetalLines, paintRays,
  paintStreak, paintWeb, styleOf,
  type GlassK, type Paint, type PetalPaint, type Ray, type Style,
} from './lumen.paint.ts';

export interface BloomOpts {
  cx: number;
  cy: number;
  R: number;
  axis: number;
  spread: number;
  /** 0 = bud … 1 = fully open */
  open: number;
  intensity?: number;
  rotation?: number;
  label?: string;
  hueShift?: number;
}

export interface Expo { gain: number; line: number; whiten: number }

// ── preparing petals ───────────────────────────────────────────────────────
function prepare(
  P: Paint, petals: Petal[], open: number, form: PetalPaint['pose']['form'],
  aBase: number, line: number, vis?: (p: Petal) => number,
): PetalPaint[] {
  const { LPar, F, pal } = P;
  const total = petals.length;
  const nOpen = clamp(Math.pow(24 / total, 0.72), 0.32, 1.02);
  const nClosed = clamp(Math.pow(21 / total, 0.7), 0.3, 2);
  const memo = new Map<number, Style>();
  const ld = LPar.layout.lightDir;
  const ringA = LPar.layout.ringAlpha;
  return petals.map((p) => {
    const pose = poseOf(p, F, open, form, LPar);
    const o = buildOutline(pose, LPar);
    let st: Style;
    if (pal.mono && p.hero) st = styleOf({ ...pal, glass: pal.spark, mid: pal.spark, hot: mix(pal.spark, pal.hot, 0.22) }, 0.55, p.hue);
    else if (pal.spectral) st = styleOf(pal, p.kf, p.hue);
    else {
      const key = Math.round(p.kf * 100);
      st = memo.get(key) ?? (memo.set(key, styleOf(pal, p.kf, p.hue)), memo.get(key)!);
    }
    const m = o.n >> 1;
    const lit = o.nx[m]! * ld[0]! + o.ny[m]! * ld[1]! >= 0 ? 1 : -1;
    // while the petals are still piled together they would sum to a white blob: dip the glass a little mid-unfold
    const formK = lerp(1, LPar.forms[form].alpha, pose.m);
    const dip = 1 - LPar.layout.open.dip * Math.sin(Math.PI * pose.eLen);
    const a = aBase * lerp(ringA[0]!, ringA[1]!, p.kf) * lerp(nClosed, nOpen, pose.eLen) * dip * formK * (vis ? vis(p) : 1);
    return { o, pose, st, lit, kf: p.kf, fav: p.fav, hero: p.hero && pal.mono, bright: p.bright, a: a * (pal.mono && p.hero ? 1.3 : 1), line, idx: p.idx };
  });
}

const scaled = (items: PetalPaint[], k: number): PetalPaint[] => items.map((it) => ({ ...it, a: it.a * k }));

function paintPetals(P: Paint, items: PetalPaint[]) {
  for (const it of items) {
    if (it.a < 0.003) continue;
    const path = paintPetalBody(P, it);
    if (P.detail) paintPetalLines(P, it, path);
  }
}

function paintWebs(P: Paint, items: PetalPaint[], alpha: number) {
  if (alpha < 0.02 || P.c.q < 1) return;
  const ring = items.filter((it) => it.kf === 0).sort((a, b) => a.idx - b.idx);
  const n = ring.length;
  for (let i = 0; i < (P.F.radial ? n : n - 1); i++) {
    const a = ring[i]!, b = ring[(i + 1) % n]!;
    paintWeb(P, a, b, alpha * Math.min(a.a, b.a) * 2.2);
  }
  // and the second ring, quieter
  const r2 = items.filter((it) => it.kf > 0 && it.kf < 0.6).sort((a, b) => a.idx - b.idx);
  if (r2.length > 2) {
    const m = r2.length;
    for (let i = 0; i < (P.F.radial ? m : m - 1); i++) paintWeb(P, r2[i]!, r2[(i + 1) % m]!, alpha * 0.6);
  }
}

function paintPearls(P: Paint, items: PetalPaint[], a: number) {
  if (a < 0.02) return;
  const { F, LPar, pal } = P;
  for (const it of items) {
    const { pose } = it;
    const off = F.S * 7 * (1 - 0.4 * it.kf);
    const x = pose.bx + Math.cos(pose.a) * off, y = pose.by + Math.sin(pose.a) * off;
    const accent = pal.mono && it.fav ? pal.spark : undefined;
    paintPearl(P, x, y, LPar.petal.pearlPx * F.S * (0.75 + 0.5 * it.bright) * (0.8 + 0.4 * it.kf), a * LPar.petal.pearlAlpha, accent);
  }
}

function paintWash(P: Paint, radius: number, a: number, angle: number) {
  const { g, pal, F } = P;
  if (a < 0.003) return;
  const gr = g.createRadialGradient(F.cx, F.cy, 0, F.cx, F.cy, radius);
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    gr.addColorStop(t, css(mix(pal.mid, pal.glass, 0.25 * (1 - t)), Math.min(1, a * Math.pow(1 - t, 2.4))));
  }
  g.save();
  g.fillStyle = gr;
  g.fillRect(0, 0, g.canvas.width, g.canvas.height);
  g.restore();
}

/** tiny specular glints at the tips of the outer sheets */
function paintGlints(P: Paint, items: PetalPaint[], a: number) {
  if (a < 0.02) return;
  const { F, LPar } = P;
  for (const it of items) {
    if (it.kf > 0.55 || it.pose.q < 0.85) continue;
    const o = it.o;
    const x = o.cx[o.n]!, y = o.cy[o.n]!;
    const r = LPar.petal.glintPx * F.S * (0.7 + 0.6 * it.bright) * (it.fav ? 1.5 : 1);
    paintPearl(P, x, y, r, a * LPar.petal.glintAlpha * (0.6 + 0.4 * (1 - it.kf)), undefined);
  }
}

// ── rays ────────────────────────────────────────────────────────────────────
function makeRays(c: LayerCtx, F: Frame, cls: LP['light']['lamp'], label: string): Ray[] {
  const LPar = c.P.layers.lumen;
  const rng = c.rng('lumen/rays/' + label);
  const out: Ray[] = [];
  const over = F.radial ? 1 : LPar.ray.over;
  const [w0, w1] = LPar.ray.widthDeg as [number, number];
  const [s0, s1] = LPar.ray.shaftDeg as [number, number];
  for (let i = 0; i < cls.rays; i++) {
    const u = F.radial ? rng.range(-1, 1) : clamp(rng.gauss() * 0.42, -1.1, 1.1);
    const len = lerp(cls.rayLen[0]!, cls.rayLen[1]!, rng()) * (1 - 0.22 * Math.abs(u));
    const w = lerp(w0, w1, Math.pow(rng(), 2)) * DEG;
    const a = lerp(cls.rayA[0]!, cls.rayA[1]!, rng());
    out.push({ ang: F.axis + F.rotation + u * F.half * over, len, w, a, hue: clamp(0.5 + u * 0.5) });
  }
  for (let i = 0; i < cls.shafts; i++) {
    const u = rng.range(-0.9, 0.9);
    out.push({
      ang: F.axis + F.rotation + u * F.half * over, len: lerp(1.4, 2.4, rng()),
      w: lerp(s0, s1, rng()) * DEG, a: LPar.ray.shaftA * lerp(0.7, 1.2, rng()), hue: clamp(0.5 + u * 0.5),
    });
  }
  return out;
}

// ── the generic bud ────────────────────────────────────────────────────────
function drawBud(g: CanvasRenderingContext2D, c: LayerCtx, F: Frame, o: BloomOpts, glassK: GlassK, w: number, ex: Expo) {
  const LPar = c.P.layers.lumen;
  const B = LPar.bud;
  const g01 = c.grow('bud');
  const ease = 1 - (1 - g01) * (1 - g01);
  const scale = lerp(B.minScale, 1, ease);
  const Fb: Frame = { ...F, R: F.R * scale };
  const pal = makePal(c, o.hueShift ?? 0, B.ember * (1 - g01), ex.whiten);
  const kx = (o.intensity ?? 1) * w;
  const P: Paint = { g, c, LPar, F: Fb, pal, k: kx, detail: true, glass: glassK, expo: ex.gain, lineGain: ex.line };
  const taut = 0.32 + 0.68 * g01;
  const label = o.label ?? 'main';

  const petals = buildPetals(c, Fb, { form: 'teardrop', petals: B.petals, rings: B.rings }, 'bud:' + label);
  // half-formed at the start: the outer sheets are still settling
  const vis = (p: Petal) => (p.kf < 0.34 ? 0.3 + 0.7 * smoothstep(0.05, 0.7, g01) : p.kf < 0.7 ? 0.55 + 0.45 * smoothstep(0, 0.5, g01) : 1);
  const items = prepare(P, petals, 0, 'teardrop', LPar.petalAlpha * glassK.body * taut * kx * B.alpha * ex.gain, (0.25 + 0.75 * g01) * ex.line, vis);

  // the heart sits inside the bud, a little way up its length
  const ax = F.axis + F.rotation;
  const hx = F.cx + Math.cos(ax) * F.R * B.length * scale * B.coreShift;
  const hy = F.cy + Math.sin(ax) * F.R * B.length * scale * B.coreShift;
  const haloR = F.R * B.halo * lerp(0.5, 1, ease);
  paintHalation(P, hx, hy, haloR, B.haloA * (0.3 + 0.7 * g01) * LPar.halation * kx, 1, 0);
  const rc = F.R * B.core * lerp(0.55, 1, ease);
  glare(P, B.glare * glassK.glare * (0.4 + 0.6 * g01) * LPar.halation * kx, 3, (sp) => {
    paintPetals(sp, scaled(items, LPar.glare.bodyK));
    paintCore(sp, hx, hy, rc, 2.6, kx);
  });
  paintPetals(P, items);
  paintPearls(P, items, taut * kx * 0.7);

  // the wick: a hair of light pointing at the horizon it faces
  if (B.wick.alpha > 0 && g01 > 0.05) {
    const tip = F.R * B.length * scale;
    const len = F.R * B.wick.len * Math.pow(g01, 1.6);
    const wr: Ray = { ang: F.axis + F.rotation, len: 1.2, w: 0.5 * DEG, a: B.wick.alpha * g01, hue: 0.5 };
    g.save();
    g.globalAlpha = 1;
    paintRays(P, [wr, { ...wr, w: 1.6 * DEG, a: wr.a * 0.4 }], 1, Math.max(1, len * 0.75), F.cx + Math.cos(wr.ang) * tip * 0.55, F.cy + Math.sin(wr.ang) * tip * 0.55);
    g.restore();
  }
  paintCore(P, hx, hy, rc, 2.6, kx * (0.5 + 0.5 * g01));
}

// ── the open bloom ─────────────────────────────────────────────────────────
function drawOpen(g: CanvasRenderingContext2D, c: LayerCtx, F: Frame, o: BloomOpts, glassK: GlassK, open: number, w: number, ex: Expo) {
  const LPar = c.P.layers.lumen;
  const bl = c.traits.bloom; // only reached when revealed && open > 0
  const cls = LPar.light[bl.light];
  const B = LPar.bud;
  const pal = makePal(c, o.hueShift ?? 0, 0, ex.whiten);
  const kx = (o.intensity ?? 1) * w;
  const P: Paint = { g, c, LPar, F, pal, k: kx, detail: true, glass: glassK, expo: ex.gain, lineGain: ex.line };
  const label = o.label ?? 'main';
  const hz = LPar.horizon[c.traits.horizon.id as keyof LP['horizon']];

  const gate = smoothstep(0.12, 0.92, open); // class-wide light arrives as the petals do
  const gateFx = smoothstep(0.38, 1, open); // rays, streak, ghosts, webs come last
  const petals = buildPetals(c, F, { form: bl.form, petals: bl.petals, rings: bl.rings }, label);
  const aBase = LPar.petalAlpha * glassK.body * kx * ex.gain;
  const items = prepare(P, petals, open, bl.form, aBase, ex.line);

  // the heart starts inside the bud and settles onto the anchor as the petals part
  const ax = F.axis + F.rotation;
  const hs = F.R * B.length * B.coreShift * (1 - smoothstep(0, 0.45, open));
  const hx = F.cx + Math.cos(ax) * hs, hy = F.cy + Math.sin(ax) * hs;

  // 1 · halation — broad, soft, leaning into the fan
  const haloR = F.R * lerp(B.halo * 0.8, cls.halo, gate);
  const haloA = lerp(B.haloA, cls.haloA, gate) * LPar.halation * kx;
  paintWash(P, F.R * LPar.wash.radius * lerp(0.5, 1, gate), LPar.wash.alpha * gate * LPar.halation * kx, 0);
  paintHalation(P, hx, hy, haloR, haloA, 1, 0);
  if (!F.radial) {
    paintHalation(P, F.cx + Math.cos(ax) * F.R * hz.halo, F.cy + Math.sin(ax) * F.R * hz.halo, haloR * 0.72, haloA * 0.5, 1.28, ax);
  }

  // 2 · rays fan through the sheets
  paintRays(P, makeRays(c, F, cls, label), gateFx * LPar.rays * kx, F.R, F.cx, F.cy);

  // 3 · glare from the glass itself
  const rc = F.R * lerp(B.core, cls.core, smoothstep(0.05, 0.9, open));
  const depth = bl.light === 'nova' ? 5 : bl.light === 'blazing' ? 4 : LPar.glare.depth[0]!;
  glare(P, cls.glare * glassK.glare * LPar.halation * kx, depth, (sp) => {
    paintPetals(sp, scaled(items, LPar.glare.bodyK));
    paintCore(sp, hx, hy, rc, cls.coreGlow, kx);
  });

  // 4 · the glass, outer ring first
  paintPetals(P, items);
  paintWebs(P, items, gateFx * kx);
  paintPearls(P, items, smoothstep(0.1, 0.6, open) * kx);
  paintGlints(P, items, gateFx * kx);

  if (bl.form === 'coronet') {
    const ringR = F.R * (LPar.layout.baseOffset + LPar.coronet.baseRing) * 0.94;
    paintPearlRing(P, bl.petals * LPar.coronet.pearls, ringR, smoothstep(0.15, 0.7, open) * kx);
  }

  // 5 · the heart
  paintCore(P, hx, hy, rc, cls.coreGlow, kx);

  // 6 · lens artefacts
  paintCoreRing(P, hx, hy, rc, cls.ring * gateFx * kx);
  paintStreak(P, F.cx, F.cy, F.R, cls.streak * gateFx * kx);
  paintGhosts(P, F.cx, F.cy, F.R, F.axis + F.rotation, cls.ghosts, gateFx * kx);
}

// ── public ─────────────────────────────────────────────────────────────────
export function drawBloom(g: CanvasRenderingContext2D, c: LayerCtx, o: BloomOpts): void {
  const LPar = c.P.layers.lumen;
  const open = clamp(o.open, 0, 1);
  const radial = o.spread >= TAU * 0.99;
  const F: Frame = {
    cx: o.cx, cy: o.cy, R: o.R, axis: o.axis,
    spread: radial ? TAU : o.spread, radial, half: radial ? Math.PI : o.spread / 2,
    rotation: o.rotation ?? 0,
    S: c.S * clamp(Math.sqrt(o.R / c.lay.R), 0.5, 1.2),
  };
  const glassK = LPar.glass[c.traits.body.glass];
  // exposure: the glass must stand above a sea that is already lit around the anchor (threads are born there)
  const E = LPar.expose;
  const ex: Expo = { gain: E.gain, line: E.edge, whiten: E.white };
  // bud → bloom crossfade (weights sum to 1, so brightness never surges)
  const x = c.traits.revealed && open > 0 ? smoothstep(0, 0.16, open) : 0;
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = 1;
  if (x < 1) drawBud(g, c, F, o, glassK, 1 - x, ex);
  if (x > 0) drawOpen(g, c, F, o, glassK, open, x, ex);

  g.restore();
}

export const render: LayerFn = (c) => {
  const cv = c.makeCanvas();
  const g = cv.getContext('2d')!;
  const L = c.P.layers.lumen;
  // half-eased: the bud stirs from the first hours and settles gently at the end
  const b = c.tl.bloom;
  const open = c.traits.revealed ? lerp(b, smoothstep(0, 1, b), 0.5) : 0;
  drawBloom(g, c, {
    cx: c.lay.cx, cy: c.lay.cy, R: c.lay.R * L.size, axis: c.lay.axis, spread: c.lay.spread, open,
  });
  return { id: 'lumen', canvas: cv, ...L.compose };
};

