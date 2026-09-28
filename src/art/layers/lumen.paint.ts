// The Lumen · painters. Everything here draws with 'lighter' onto a transparent canvas; overlapping glass
// therefore blazes. Every function is deterministic and takes its randomness from the model.

import type { LayerCtx } from './types.ts';
import { adjust, css, mix, type RGB } from '../color.ts';
import { clamp, TAU } from '../math.ts';
import type { Frame, LP, Outline, Pal, Pose } from './lumen.model.ts';

export interface GlassK { body: number; edge: number; disp: number; soft: number; glare: number }

export interface Paint {
  g: CanvasRenderingContext2D;
  c: LayerCtx;
  LPar: LP;
  F: Frame;
  pal: Pal;
  /** overall intensity (o.intensity · knob) */
  k: number;
  /** false for the small glare passes: bodies only */
  detail: boolean;
  glass: GlassK;
  /** adaptive exposure: alpha gain (≥1) and line gain (≥1) for a bright backdrop */
  expo: number;
  lineGain: number;
}

export interface Style { hot: RGB; base: RGB; mid: RGB; tip: RGB; edge: RGB }

export function styleOf(pal: Pal, kf: number, hue: number): Style {
  // outer sheets are the deepest glass; the inner ones burn toward the light
  let tip: RGB;
  if (pal.spectral) tip = mix(pal.walk(hue), pal.hot, 0.3 * kf);
  else tip = kf < 0.66 ? mix(mix(pal.mid, pal.glass, 0.25), pal.glass, kf / 0.66) : mix(pal.glass, pal.hot, ((kf - 0.66) / 0.34) * 0.4);
  const hot = pal.spectral ? mix(pal.hot, tip, 0.14) : pal.hot;
  return { hot, base: mix(hot, tip, 0.45), mid: mix(hot, tip, 0.8), tip, edge: mix(tip, pal.white, 0.3) };
}

const A = (v: number) => Math.min(1, Math.max(0, v));
const smooth01 = (v: number) => { const t = Math.min(1, Math.max(0, v)); return t * t * (3 - 2 * t); };

// ── paths ───────────────────────────────────────────────────────────────────
function segs(p: Path2D, xs: number[], ys: number[], a: number, b: number, smooth: boolean) {
  const d = b > a ? 1 : -1;
  for (let i = a + d; ; i += d) {
    if (smooth && i !== b) p.quadraticCurveTo(xs[i]!, ys[i]!, (xs[i]! + xs[i + d]!) / 2, (ys[i]! + ys[i + d]!) / 2);
    else p.lineTo(xs[i]!, ys[i]!);
    if (i === b) break;
  }
}

export function silhouette(o: Outline): Path2D {
  const p = new Path2D();
  const smooth = !o.poly;
  p.moveTo(o.lx[0]!, o.ly[0]!);
  segs(p, o.lx, o.ly, 0, o.n, smooth);
  segs(p, o.rx, o.ry, o.n, 0, smooth);
  p.closePath();
  return p;
}

/** polyline along one side of the petal (side +1 = left/`l`, −1 = right/`r`), inset ∈ 0..1 of the local half-width */
function sideLine(o: Outline, side: number, inset: number, s0: number, s1: number): Path2D {
  const p = new Path2D();
  let first = true;
  for (let i = 0; i <= o.n; i++) {
    const s = o.s[i]!;
    if (s < s0 || s > s1) continue;
    const w = (side > 0 ? o.wl[i]! : o.wr[i]!) * o.W * inset * side;
    const x = o.cx[i]! + o.nx[i]! * w, y = o.cy[i]! + o.ny[i]! * w;
    if (first) { p.moveTo(x, y); first = false; } else p.lineTo(x, y);
  }
  return p;
}

const idxAt = (o: Outline, s: number) => Math.max(0, Math.min(o.n, Math.round(s * o.n)));

function radialFill(g: CanvasRenderingContext2D, x: number, y: number, r: number, stops: [number, RGB, number][]) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  for (const [t, col, a] of stops) gr.addColorStop(t, css(col, A(a)));
  g.fillStyle = gr;
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
}

// ── a petal of glass ───────────────────────────────────────────────────────
export interface PetalPaint {
  o: Outline;
  pose: Pose;
  st: Style;
  /** −1 | +1: which side catches the light */
  lit: number;
  kf: number;
  fav: boolean;
  /** mono palettes: this petal burns in the spark colour */
  hero: boolean;
  bright: number;
  /** final alpha of this petal (ring, count, glass, growth, opening …) */
  a: number;
  /** strength of the crisp lines (edges, veins) — the bud grows "taut" */
  line: number;
  idx: number;
}

export function paintPetalBody(P: Paint, it: PetalPaint) {
  const { g, LPar } = P;
  const PT = LPar.petal;
  const { o, st } = it;
  const a = it.a * it.bright;
  const path = silhouette(o);
  const bx = o.cx[0]!, by = o.cy[0]!, tx = o.cx[o.n]!, ty = o.cy[o.n]!;
  const gr = g.createLinearGradient(bx, by, tx, ty);
  const B = PT.body;
  gr.addColorStop(0, css(st.base, A(B[0]! * a)));
  gr.addColorStop(0.2, css(st.base, A(B[1]! * a)));
  gr.addColorStop(0.5, css(st.mid, A(B[2]! * a)));
  gr.addColorStop(0.8, css(st.tip, A(B[3]! * a)));
  gr.addColorStop(1, css(st.tip, A(B[4]! * a)));
  g.fillStyle = gr;
  g.fill(path);

  // the lit half: a crease of brighter glass between the midrib and the lit edge
  const half = new Path2D();
  half.moveTo(o.cx[0]!, o.cy[0]!);
  for (let i = 1; i <= o.n; i++) half.lineTo(o.cx[i]!, o.cy[i]!);
  const ex = it.lit > 0 ? o.lx : o.rx, ey = it.lit > 0 ? o.ly : o.ry;
  for (let i = o.n - 1; i >= 0; i--) half.lineTo(ex[i]!, ey[i]!);
  half.closePath();
  const hg = g.createLinearGradient(bx, by, tx, ty);
  hg.addColorStop(0, css(st.mid, 0));
  hg.addColorStop(0.3, css(st.mid, A(B[1]! * a * PT.lit)));
  hg.addColorStop(0.55, css(st.edge, A(B[2]! * a * PT.lit)));
  hg.addColorStop(1, css(st.tip, A(B[4]! * a * PT.lit)));
  g.fillStyle = hg;
  g.fill(half);

  // a luminous inner lens
  const lens = new Path2D();
  const kL = PT.lens.length, kW = PT.lens.width;
  const lp = (i: number, side: number) => {
    const w = (side > 0 ? o.wl[i]! : o.wr[i]!) * o.W * kW * side;
    return [bx + (o.cx[i]! - bx) * kL + o.nx[i]! * w, by + (o.cy[i]! - by) * kL + o.ny[i]! * w] as const;
  };
  let [x0, y0] = lp(0, 1);
  lens.moveTo(x0, y0);
  for (let i = 1; i <= o.n; i++) { [x0, y0] = lp(i, 1); lens.lineTo(x0, y0); }
  for (let i = o.n; i >= 0; i--) { [x0, y0] = lp(i, -1); lens.lineTo(x0, y0); }
  lens.closePath();
  const lg = g.createLinearGradient(bx, by, bx + (tx - bx) * kL, by + (ty - by) * kL);
  lg.addColorStop(0, css(st.hot, 0));
  lg.addColorStop(0.25, css(st.hot, A(PT.lens.alpha * a)));
  lg.addColorStop(1, css(st.mid, 0));
  g.fillStyle = lg;
  g.fill(lens);

  if (o.poly && it.pose.m > 0.85) paintFacets(P, it, a);
  return path;
}

function paintFacets(P: Paint, it: PetalPaint, a: number) {
  const { g } = P;
  const { o, st } = it;
  const { l1, r1, rn } = o.vi;
  const tri = (pts: [number, number][], col: RGB, al: number) => {
    const p = new Path2D();
    p.moveTo(pts[0]![0], pts[0]![1]);
    for (let i = 1; i < pts.length; i++) p.lineTo(pts[i]![0], pts[i]![1]);
    p.closePath();
    g.fillStyle = css(col, A(al));
    g.fill(p);
  };
  const B: [number, number] = [o.cx[0]!, o.cy[0]!], T: [number, number] = [o.cx[o.n]!, o.cy[o.n]!];
  const Lv: [number, number] = [o.lx[l1]!, o.ly[l1]!], Cl: [number, number] = [o.cx[l1]!, o.cy[l1]!];
  const Rv: [number, number] = [o.rx[r1]!, o.ry[r1]!], Cr: [number, number] = [o.cx[r1]!, o.cy[r1]!];
  const Rn: [number, number] = [o.rx[rn]!, o.ry[rn]!];
  const hi = it.lit > 0;
  tri([B, Lv, Cl], st.edge, (hi ? 0.24 : 0.07) * a);
  tri([Lv, T, Cl], st.mid, (hi ? 0.15 : 0.04) * a);
  tri([B, Rv, Cr], st.edge, (hi ? 0.06 : 0.22) * a);
  tri([Rv, Rn, T, Cr], st.mid, (hi ? 0.03 : 0.13) * a);
  // the cleave line from shoulder to tip
  g.strokeStyle = css(st.edge, A(0.3 * a * it.line));
  g.lineWidth = 0.8 * P.F.S;
  g.beginPath();
  g.moveTo(Lv[0], Lv[1]); g.lineTo(T[0], T[1]);
  g.moveTo(Rv[0], Rv[1]); g.lineTo(Cr[0] + (T[0] - Cr[0]) * 0.4, Cr[1] + (T[1] - Cr[1]) * 0.4);
  g.stroke();
}

/** crisp edges, inner highlight, veins, fibres, dispersion — the fine detail that makes it glass */
export function paintPetalLines(P: Paint, it: PetalPaint, path: Path2D) {
  const { g, LPar, F, glass, pal, c } = P;
  const PT = LPar.petal;
  const { o, st } = it;
  const S = F.S;
  const bx = o.cx[0]!, by = o.cy[0]!, tx = o.cx[o.n]!, ty = o.cy[o.n]!;
  const a = it.a * it.bright;
  const ln = it.line;
  g.lineJoin = 'round';
  g.lineCap = 'round';

  // crisp outline: quiet at the base, sharp at the tip
  const eg = g.createLinearGradient(bx, by, tx, ty);
  const ea = glass.edge * ln * Math.min(1.4, 0.55 + a);
  eg.addColorStop(0, css(st.edge, A(PT.edge[0]! * ea)));
  eg.addColorStop(0.5, css(st.edge, A(PT.edge[1]! * ea)));
  eg.addColorStop(1, css(st.edge, A(PT.edge[2]! * ea)));
  if (glass.soft > 0) {
    g.lineWidth = 3.6 * S;
    g.strokeStyle = css(st.tip, A(0.07 * glass.soft * a * ln));
    g.stroke(path);
  }
  g.lineWidth = PT.edgePx * S;
  g.strokeStyle = eg;
  g.stroke(path);

  // prismatic fringes: the edge split into two hues, a hair apart
  if (glass.disp > 0.05 && P.detail) {
    const off = PT.dispersionPx * S * glass.disp;
    const nx = -Math.sin(o.a), ny = Math.cos(o.a);
    for (const sgn of [1, -1]) {
      g.save();
      g.translate(nx * off * sgn, ny * off * sgn);
      g.lineWidth = 0.8 * S;
      g.strokeStyle = css(adjust(st.edge, { dh: PT.dispersionHue * sgn }), A(0.32 * glass.disp * ea * 0.6));
      g.stroke(path);
      g.restore();
    }
  }
  if (!P.detail) return;

  // the inner-edge highlight along the lit side
  const ie = sideLine(o, it.lit, 0.7, 0.1, 0.94);
  const ig = g.createLinearGradient(bx, by, tx, ty);
  const ia = PT.innerEdge * ln * glass.edge * Math.min(1.3, 0.5 + a);
  ig.addColorStop(0, css(st.edge, 0));
  ig.addColorStop(0.45, css(st.edge, A(ia)));
  ig.addColorStop(1, css(st.edge, A(ia * 0.25)));
  g.lineWidth = PT.innerEdgePx * S;
  g.strokeStyle = ig;
  g.stroke(ie);

  // one accent thread on the favourite petals (spark is a rare accent; Blackglass makes it the hot one)
  if (it.fav) {
    const ag = g.createLinearGradient(bx, by, tx, ty);
    ag.addColorStop(0, css(pal.spark, 0));
    ag.addColorStop(0.5, css(pal.spark, A((pal.mono ? 0.75 : 0.34) * ln)));
    ag.addColorStop(1, css(pal.spark, A((pal.mono ? 0.55 : 0.2) * ln)));
    g.lineWidth = (pal.mono ? 1.5 : 1) * S;
    g.strokeStyle = ag;
    g.stroke(sideLine(o, -it.lit, 0.55, 0.2, 0.96));
  }

  // vein down the middle
  const vg = g.createLinearGradient(bx, by, tx, ty);
  vg.addColorStop(0, css(st.hot, A(PT.veinAlpha * ln)));
  vg.addColorStop(1, css(st.edge, 0));
  g.lineWidth = PT.veinPx * S;
  g.strokeStyle = vg;
  g.stroke(sideLine(o, 1, 0, 0.04, 0.88));

  if (c.q < 1) return; // draft: skip the finest hairs

  // side veins + fibres (from the petal's own shape numbers → deterministic, different per petal)
  const forms = LPar.forms[it.pose.form];
  const nv = it.pose.m > 0.6 ? forms.veins : 0;
  if (nv > 0) {
    const vp = new Path2D();
    for (let j = 0; j < nv; j++) {
      const s0 = 0.2 + j * (0.6 / nv);
      const i0 = idxAt(o, s0), i1 = idxAt(o, s0 + 0.13);
      for (const side of [1, -1]) {
        const w = (side > 0 ? o.wl[i1]! : o.wr[i1]!) * o.W * 0.82 * side;
        vp.moveTo(o.cx[i0]!, o.cy[i0]!);
        vp.lineTo(o.cx[i1]! + o.nx[i1]! * w, o.cy[i1]! + o.ny[i1]! * w);
      }
    }
    g.lineWidth = 0.6 * S;
    g.strokeStyle = css(st.edge, A(PT.sideVeinAlpha * ln));
    g.stroke(vp);
  }
  const fp = new Path2D();
  for (let f = 0; f < PT.fibres; f++) {
    const t = (((it.pose.shp[(f + 1) % 4]! * 7.31 + f * 0.37) % 1) - 0.5) * 1.3;
    let first = true;
    for (let i = idxAt(o, 0.1); i <= idxAt(o, 0.78); i++) {
      const w = (t > 0 ? o.wl[i]! : o.wr[i]!) * o.W * t;
      const x = o.cx[i]! + o.nx[i]! * w, y = o.cy[i]! + o.ny[i]! * w;
      if (first) { fp.moveTo(x, y); first = false; } else fp.lineTo(x, y);
    }
  }
  g.lineWidth = 0.7 * S;
  g.strokeStyle = css(st.mid, A(PT.fibreAlpha * ln));
  g.stroke(fp);
}

export function paintPearl(P: Paint, x: number, y: number, r: number, a: number, col?: RGB) {
  const { g, pal } = P;
  const c0 = col ?? pal.white;
  radialFill(g, x, y, r * 2.6, [[0, c0, a * 0.22], [0.35, pal.hot, a * 0.07], [1, pal.hot, 0]]);
  radialFill(g, x, y, r, [[0, pal.white, a], [0.6, c0, a * 0.7], [1, c0, 0]]);
}

// ── webs: caustic lace between neighbouring petals ─────────────────────────
export function paintWeb(P: Paint, a: OutlineRef, b: OutlineRef, alpha: number) {
  const { g, LPar, F } = P;
  const W = LPar.web;
  g.lineWidth = W.px * F.S;
  for (const t of W.tiers) {
    const i = idxAt(a.o, t);
    // right side of a, left side of b
    const ax = a.o.rx[i]!, ay = a.o.ry[i]!, bx = b.o.lx[i]!, by = b.o.ly[i]!;
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    const dx = F.cx - mx, dy = F.cy - my;
    const dl = Math.hypot(dx, dy) || 1;
    const gapD = Math.hypot(bx - ax, by - ay);
    const sag = gapD * W.sag;
    // only where the glass really neighbours: wide gaps get no lace
    const near = 1 - smooth01((gapD / Math.max(1, a.o.L)  - W.gap[0]!) / (W.gap[1]! - W.gap[0]!));
    if (near < 0.02) continue;
    g.strokeStyle = css(a.st.edge, A(W.alpha * alpha * near * (1.1 - t * 0.5)));
    g.beginPath();
    g.moveTo(ax, ay);
    g.quadraticCurveTo(mx + (dx / dl) * sag, my + (dy / dl) * sag, bx, by);
    g.stroke();
  }
}
export interface OutlineRef { o: Outline; st: Style }

// ── light ──────────────────────────────────────────────────────────────────
export function paintHalation(P: Paint, x: number, y: number, radius: number, a: number, stretch = 1, angle = 0) {
  const { g, pal } = P;
  if (a <= 0.002 || radius < 1) return;
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.scale(stretch, 1);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, radius);
  const ramp = [pal.hot, mix(pal.hot, pal.glass, 0.5), pal.glass, mix(pal.glass, pal.mid, 0.6), pal.mid];
  const at = [0, 0.14, 0.38, 0.72, 1];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    let j = 0;
    while (j < at.length - 2 && t > at[j + 1]!) j++;
    const col = mix(ramp[j]!, ramp[j + 1]!, clamp((t - at[j]!) / (at[j + 1]! - at[j]!)));
    gr.addColorStop(t, css(col, A(a * Math.pow(1 - t, 2.2) * (0.16 + 0.84 * Math.exp(-5 * t)))));
  }
  g.fillStyle = gr;
  g.beginPath();
  g.arc(0, 0, radius, 0, TAU);
  g.fill();
  g.restore();
}

export function paintCore(P: Paint, x: number, y: number, rc: number, glow: number, k: number) {
  const { pal } = P;
  const g = P.g;
  radialFill(g, x, y, rc * glow, [[0, pal.hot, 0.42 * k], [0.32, pal.hot, 0.17 * k], [0.7, pal.glass, 0.05 * k], [1, pal.glass, 0]]);
  if (pal.mono) radialFill(g, x, y, rc * 2.5, [[0, pal.spark, 0], [0.34, pal.spark, 0], [0.5, pal.spark, 0.34 * k], [0.75, pal.spark, 0.08 * k], [1, pal.spark, 0]]);
  radialFill(g, x, y, rc * 1.55, [[0, pal.white, 0.7 * k], [0.45, pal.hot, 0.32 * k], [1, pal.hot, 0]]);
  radialFill(g, x, y, rc, [[0, pal.white, 1], [0.18, pal.white, 0.92 * k], [0.45, pal.white, 0.55 * k], [0.75, pal.hot, 0.16 * k], [1, pal.hot, 0]]);
}

export interface Ray { ang: number; len: number; w: number; a: number; hue: number }

export function paintRays(P: Paint, rays: Ray[], strength: number, R: number, x: number, y: number) {
  const { g, pal, c, LPar } = P;
  if (strength <= 0.002 || !rays.length) return;
  const step = c.q < 1 ? Math.round(1 / c.q) : 1;
  const boost = Math.sqrt(step);
  const r0 = R * LPar.ray.start;
  const reach = [0.85, 1.45, 2.5, 3.4];
  const grads: CanvasGradient[] = [];
  const mkGrad = (r1: number, col: RGB) => {
    const gr = g.createRadialGradient(x, y, r0, x, y, r1);
    gr.addColorStop(0, css(mix(pal.hot, col, 0.15), 1));
    gr.addColorStop(0.22, css(mix(pal.hot, col, 0.5), 0.55));
    gr.addColorStop(0.6, css(col, 0.16));
    gr.addColorStop(1, css(col, 0));
    return gr;
  };
  if (!pal.spectral) for (const r of reach) grads.push(mkGrad(R * r, pal.glass));
  rays.forEach((ray, i) => {
    if (step > 1 && i % step !== 0) return;
    const gi = ray.len < 1.0 ? 0 : ray.len < 1.7 ? 1 : ray.len < 2.7 ? 2 : 3;
    const r1 = R * reach[gi]!;
    g.fillStyle = pal.spectral ? mkGrad(r1, pal.walk(ray.hue)) : grads[gi]!;
    const cs = Math.cos(ray.ang), sn = Math.sin(ray.ang);
    const layers: [number, number][] = [[1, 0.32], [0.55, 0.36], [0.24, 0.42]];
    for (const [wk, ak] of layers) {
      const w = ray.w * wk;
      g.globalAlpha = A(ray.a * ak * strength * boost * LPar.ray.gain);
      g.beginPath();
      g.moveTo(x + cs * r0 * 0.5, y + sn * r0 * 0.5);
      g.lineTo(x + Math.cos(ray.ang - w) * r1, y + Math.sin(ray.ang - w) * r1);
      g.lineTo(x + Math.cos(ray.ang + w) * r1, y + Math.sin(ray.ang + w) * r1);
      g.closePath();
      g.fill();
    }
  });
  g.globalAlpha = 1;
}

/** anamorphic lens streak: a thin horizontal sliver of light through the heart */
export function paintStreak(P: Paint, x: number, y: number, R: number, amount: number) {
  const { g, pal, LPar, F } = P;
  if (amount <= 0.003) return;
  const S = LPar.streak;
  const len = R * S.len * (0.7 + 0.3 * amount);
  const drawE = (lenK: number, thick: number, a: number, col: RGB) => {
    g.save();
    g.translate(x, y);
    g.scale(len * lenK, thick);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    gr.addColorStop(0, css(col, A(a)));
    gr.addColorStop(0.18, css(col, A(a * 0.62)));
    gr.addColorStop(0.55, css(col, A(a * 0.16)));
    gr.addColorStop(1, css(col, 0));
    g.fillStyle = gr;
    g.beginPath();
    g.arc(0, 0, 1, 0, TAU);
    g.fill();
    g.restore();
  };
  const cool = mix(pal.glass, pal.hot, 0.35);
  drawE(1, S.glowPx * F.S, S.glowAlpha * amount, cool);
  drawE(0.85, S.thickPx * 2.2 * F.S, S.alpha * 0.45 * amount, mix(pal.hot, pal.glass, 0.3));
  drawE(0.6, S.thickPx * 0.6 * F.S, S.alpha * amount, pal.white);
}

export function paintGhosts(P: Paint, x: number, y: number, R: number, axis: number, count: number, amount: number) {
  const { g, pal, LPar, c } = P;
  if (count <= 0 || amount <= 0.003) return;
  const G = LPar.ghost;
  const cols = [pal.glass, pal.hot, pal.spark, mix(pal.glass, pal.white, 0.5), pal.hot];
  for (let i = 0; i < Math.min(count, G.at.length); i++) {
    const d = R * G.at[i]!;
    const r = R * G.size[i]!;
    const gx = x + Math.cos(axis) * d, gy = y + Math.sin(axis) * d;
    if (gx < -r || gx > c.w + r || gy < -r || gy > c.h + r) continue;
    const col = pal.spectral ? pal.walk(i / 4) : cols[i]!;
    const a = G.alpha[i]! * amount;
    g.save();
    g.translate(gx, gy);
    g.rotate(axis + (i % 2) * (Math.PI / 6));
    g.beginPath();
    for (let j = 0; j < 6; j++) {
      const t = (j / 6) * TAU;
      j ? g.lineTo(Math.cos(t) * r, Math.sin(t) * r) : g.moveTo(Math.cos(t) * r, Math.sin(t) * r);
    }
    g.closePath();
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, r);
    gr.addColorStop(0, css(col, 0));
    gr.addColorStop(0.62, css(col, A(a * 0.25)));
    gr.addColorStop(1, css(mix(col, pal.white, 0.3), A(a)));
    g.fillStyle = gr;
    g.fill();
    g.lineWidth = 0.9 * P.F.S;
    g.strokeStyle = css(mix(col, pal.white, 0.5), A(a * 1.3));
    g.stroke();
    g.restore();
  }
}

// ── glare: draw small, blur by halving, add back ───────────────────────────
export function glare(P: Paint, strength: number, depth: number, draw: (sp: Paint) => void) {
  if (strength <= 0.003) return;
  const { g, c, LPar } = P;
  const W = g.canvas.width, H = g.canvas.height;
  const div = LPar.glare.div;
  const sw = Math.max(8, Math.ceil(W / div)), sh = Math.max(8, Math.ceil(H / div));
  const base = c.makeCanvas(sw, sh);
  const sg = base.getContext('2d')!;
  sg.setTransform(sw / W, 0, 0, sh / H, 0, 0);
  sg.globalCompositeOperation = 'lighter';
  draw({ ...P, g: sg, detail: false, k: P.k * LPar.glare.bodyK });
  sg.setTransform(1, 0, 0, 1, 0, 0);

  const wts = LPar.glare.levels;
  const lv: HTMLCanvasElement[] = [base];
  for (let i = 1; i < depth; i++) {
    const p = lv[i - 1]!;
    const n = c.makeCanvas(Math.max(2, Math.ceil(p.width / 2)), Math.max(2, Math.ceil(p.height / 2)));
    const ng = n.getContext('2d')!;
    ng.imageSmoothingQuality = 'high';
    ng.drawImage(p, 0, 0, n.width, n.height);
    lv.push(n);
  }
  let acc = c.makeCanvas(lv[depth - 1]!.width, lv[depth - 1]!.height);
  {
    const ag = acc.getContext('2d')!;
    ag.globalAlpha = wts[depth - 1]!;
    ag.drawImage(lv[depth - 1]!, 0, 0);
  }
  for (let i = depth - 2; i >= 0; i--) {
    const n = c.makeCanvas(lv[i]!.width, lv[i]!.height);
    const ng = n.getContext('2d')!;
    ng.imageSmoothingEnabled = true;
    ng.drawImage(acc, 0, 0, n.width, n.height);
    ng.globalCompositeOperation = 'lighter';
    ng.globalAlpha = wts[i]!;
    ng.drawImage(lv[i]!, 0, 0);
    acc = n;
  }
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = clamp(strength, 0, 1.5);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(acc, 0, 0, W, H);
  g.restore();
}



/** the coronet's ring of pearls, with a hairline circle through them */
export function paintPearlRing(P: Paint, count: number, radius: number, a: number) {
  const { g, F, LPar, pal } = P;
  if (a < 0.02) return;
  const half = F.radial ? Math.PI : F.spread / 2;
  const a0 = F.axis + F.rotation - half, a1 = F.axis + F.rotation + half;
  const n = F.radial ? count : count;
  g.lineWidth = 0.8 * F.S;
  g.strokeStyle = css(pal.hot, A(LPar.coronet.ringAlpha * a));
  g.beginPath();
  g.arc(F.cx, F.cy, radius, a0, a1);
  g.stroke();
  for (let i = 0; i < n; i++) {
    const t = F.radial ? i / n : (i + 0.5) / n;
    const ang = a0 + (a1 - a0) * t;
    const big = i % 2 === 0;
    paintPearl(P, F.cx + Math.cos(ang) * radius, F.cy + Math.sin(ang) * radius, LPar.coronet.pearlPx * F.S * (big ? 1.25 : 0.8), a * (big ? 1 : 0.7));
  }
}

/** a thin lens-like corona ring around a blown-out core, so the highlight has an edge */
export function paintCoreRing(P: Paint, x: number, y: number, rc: number, a: number) {
  const { g, pal, F } = P;
  if (a < 0.02) return;
  const col = mix(pal.glass, pal.white, 0.55);
  g.save();
  for (const [k, px, al] of [[1.95, 7, 0.12], [1.95, 1.2, 0.5], [3.3, 1, 0.2]] as [number, number, number][]) {
    g.lineWidth = px * F.S;
    g.strokeStyle = css(k > 3 ? pal.glass : col, A(al * a));
    g.beginPath();
    g.arc(x, y, rc * k, 0, TAU);
    g.stroke();
  }
  g.restore();
}
