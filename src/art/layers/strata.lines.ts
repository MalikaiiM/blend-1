// THE SHEETS · lines — the halocline shimmer and the fine detail, drawn at full resolution.
//
// Where two sheets meet there is a hairline of light: crisp, a little broken by noise, with a breath of glow
// (drawn on a quarter-size canvas and upscaled). Behind the glass, the back edge of a sheet shows through the
// sheet in front as a faint displaced echo. Inside each sheet: hair-fine striations and a few caustic ribbons.
import type { Cv, LayerCtx } from './types.ts';
import type { Frame, Q, Stack } from './strata.geom.ts';
import { taperAt, type SheetInfo } from './strata.paint.ts';
import { css, oklchToRgb, mix, type RGB } from '../color.ts';
import { TAU, clamp, hash2 } from '../math.ts';

type F32 = Float32Array;
const sstep = (a: number, b: number, v: number) => { const t = (v - a) / (b - a); return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t); };

interface Curve { X: F32; Y: F32; NX: F32; NY: F32 }

function makeCurve(frame: Frame, tbl: F32, shift: number, off: number, M: number, q: Q): Curve {
  const T = M + 1;
  const X = new Float32Array(T), Y = new Float32Array(T), NX = new Float32Array(T), NY = new Float32Array(T);
  for (let j = 0; j < T; j++) {
    const fr = j / M;
    frame.toXY(fr, tbl[j]! + shift, q);
    frame.normal(fr, q);
    X[j] = q.x + q.nx * off; Y[j] = q.y + q.ny * off; NX[j] = q.nx; NY[j] = q.ny;
  }
  return { X, Y, NX, NY };
}

function strokeRuns(g: CanvasRenderingContext2D, X: F32, Y: F32, A: F32, col: RGB, width: number, run: number, w: number, h: number, mul = 1) {
  g.lineWidth = width; g.lineCap = 'butt'; g.lineJoin = 'round';
  const T = X.length;
  for (let j0 = 0; j0 < T - 1; j0 += run) {
    const j1 = Math.min(T - 1, j0 + run);
    const a0 = A[j0]! * mul, a1 = A[j1]! * mul;
    if (a0 < 0.005 && a1 < 0.005) continue;
    let inside = false;
    for (let j = j0; j <= j1; j++) if (X[j]! > -40 && X[j]! < w + 40 && Y[j]! > -40 && Y[j]! < h + 40) { inside = true; break; }
    if (!inside) continue;
    const x0 = X[j0]!, y0 = Y[j0]!, x1 = X[j1]!, y1 = Y[j1]!;
    if (Math.abs(x1 - x0) + Math.abs(y1 - y0) < 0.05) g.strokeStyle = css(col, Math.min(1, (a0 + a1) / 2));
    else {
      const gr = g.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, css(col, Math.min(1, a0))); gr.addColorStop(1, css(col, Math.min(1, a1)));
      g.strokeStyle = gr;
    }
    g.beginPath();
    g.moveTo(x0, y0);
    for (let j = j0 + 1; j <= j1; j++) g.lineTo(X[j]!, Y[j]!);
    g.stroke();
  }
}

/** a smooth path through the points (quadratic curves through the midpoints) */
function smoothPath(g: CanvasRenderingContext2D, X: number[], Y: number[]) {
  const n = X.length;
  g.beginPath();
  g.moveTo(X[0]!, Y[0]!);
  if (n < 3) { for (let i = 1; i < n; i++) g.lineTo(X[i]!, Y[i]!); return; }
  for (let i = 1; i < n - 1; i++) g.quadraticCurveTo(X[i]!, Y[i]!, (X[i]! + X[i + 1]!) / 2, (Y[i]! + Y[i + 1]!) / 2);
  g.lineTo(X[n - 1]!, Y[n - 1]!);
}

export interface DetailIn {
  c: LayerCtx; st: Stack; sheets: SheetInfo[]; cv: Cv;
  /** brightness of the light near the anchor while the bloom opens */
  bloomLift: number;
  fringe: RGB[];
  lead: RGB;
  spark: RGB;
}

export function drawDetails(inp: DetailIn) {
  const { c, st, sheets, cv } = inp;
  const P = c.P.layers.strata;
  const { w, h, lay, tl } = c;
  const S = c.S;
  const L = P.lines;
  const GK = P.glass[c.traits.body.glass]!;
  const glassKind = c.traits.body.glass;
  const frame = st.frame;
  const polar = frame.polar;
  const M = st.M, T = M + 1;
  const N = st.N;
  const q: Q = { fr: 0, u: 0, a1: 0, a2: 0, x: 0, y: 0, nx: 0, ny: 0 };
  const g = cv.getContext('2d')!;
  const nzL = c.noise('strata/line');
  const rho = L.breakFreq / TAU;
  const rhoS = L.shimmerFreq / TAU;
  const glowK = P.lineGlow;
  const invR2 = 1 / ((lay.R * L.litRadius) ** 2);
  const width = Math.max(1, L.width * S * GK.lineW);
  const byOrd = [...sheets].sort((a, b) => a.ord - b.ord);

  // glow canvas: a quarter-size layer that is upscaled (free blur)
  const gs = L.glowScale;
  const gw = Math.max(8, Math.ceil(w / gs)), gh = Math.max(8, Math.ceil(h / gs));
  const glowCv = c.makeCanvas(gw, gh);
  const gg = glowCv.getContext('2d')!;
  gg.setTransform(1 / gs, 0, 0, 1 / gs, 0, 0);
  gg.globalCompositeOperation = 'lighter';
  // caustic ribbons get their own quarter-size canvas, composited after the line glow
  const cauCv = c.makeCanvas(gw, gh);
  const gc = cauCv.getContext('2d')!;
  gc.setTransform(1 / gs, 0, 0, 1 / gs, 0, 0);
  gc.globalCompositeOperation = 'lighter';

  /** per-vertex alpha profile of a line */
  const profile = (sh: SheetInfo, key: number, strength: number, young: number): F32 => {
    const A = new Float32Array(T);
    for (let j = 0; j < T; j++) {
      const fr = j / M;
      const tp = sh.tpOn ? taperAt(sh, fr, polar) : 1;
      const nb = polar
        ? nzL.n3(Math.cos(TAU * fr) * rho + key * 3.7, Math.sin(TAU * fr) * rho, key * 1.3 + 3.1)
        : nzL.n3(fr * L.breakFreq + key * 3.7, key * 1.3, 3.1);
      const brk = L.gapFloor + (1 - L.gapFloor) * sstep(L.broken[0]!, L.broken[1]!, nb);
      const zt = tl.drift * L.shimmerRate;
      const nsh = polar
        ? nzL.n3(Math.cos(TAU * fr) * rhoS + key * 4.2, Math.sin(TAU * fr) * rhoS + 11, zt)
        : nzL.n3(fr * L.shimmerFreq + key * 4.2, key * 2.9 + 11, zt);
      const sm = Math.max(0.15, 1 + L.shimmer * (1 + 0.9 * young) * nsh);
      A[j] = strength * tp * brk * sm;
    }
    return A;
  };
  /** multiply a profile by the light falling at each vertex */
  const lightAlong = (A: F32, cu: Curve) => {
    for (let j = 0; j < T; j++) {
      const d2 = ((cu.X[j]! - lay.cx) ** 2 + (cu.Y[j]! - lay.cy) ** 2) * invR2;
      A[j] = A[j]! * (L.litFloor + (1 - L.litFloor) * Math.exp(-1.7 * d2) * (1 + inp.bloomLift));
    }
  };

  const lineList: { cu: Curve; A: F32; col: RGB; glow: number; core: number; isSpark: boolean; lead: boolean }[] = [];
  const nextInOrder = (sh: SheetInfo) => byOrd[sh.ord + 1];

  for (const sh of byOrd) {
    const key = sh.i + 1;
    const young = 1 - sh.e;
    const gain = Math.max(sh.alpha, sh.ghostLine * young) * (1 + L.youngLine * young);
    const frontTbl = sh.frontLo ? sh.lo : sh.hi;
    const backTbl = sh.frontLo ? sh.hi : sh.lo;
    // the front edge: where this sheet begins on top of the one behind it
    const cuF = makeCurve(frame, frontTbl, sh.shift, 0, M, q);
    const AF = profile(sh, key, L.alpha * GK.line * gain * (sh.spark ? L.spark.alpha / L.alpha : 1), young);
    lightAlong(AF, cuF);
    lineList.push({ cu: cuF, A: AF, col: sh.spark ? inp.spark : sh.line, glow: (sh.spark ? L.spark.glow : 1), core: sh.spark ? L.spark.width : 1, isSpark: sh.spark, lead: glassKind === 'stained' });
    // the back edge: a real line when nothing lies in front (outer edge of the stack), else a displaced echo
    const front = nextInOrder(sh);
    if (!front) {
      const cuB = makeCurve(frame, backTbl, sh.shift, 0, M, q);
      const AB = profile(sh, key + 50, L.alpha * GK.line * gain * 0.8, young);
      lightAlong(AB, cuB);
      lineList.push({ cu: cuB, A: AB, col: sh.line, glow: 0.8, core: 0.9, isSpark: false, lead: glassKind === 'stained' });
    } else {
      const refr = (P.body.refract * S * P.refraction * GK.refract * front.refK) * P.lines.echoShift * 0.75;
      const cuE = makeCurve(frame, backTbl, sh.shift, -refr * (frame.polar ? 1 : 1), M, q);
      const AE = profile(sh, key + 90, L.echoAlpha * GK.line * Math.min(gain, front.alpha) * Math.min(1, front.alpha), young);
      // the echo is only seen where the front sheet actually lies
      for (let j = 0; j < T; j++) AE[j] = AE[j]! * (front.tpOn ? taperAt(front, j / M, polar) : 1);
      lightAlong(AE, cuE);
      lineList.push({ cu: cuE, A: AE, col: sh.line, glow: 0, core: L.echoWidth, isSpark: false, lead: false });
    }
  }

  const glowW1 = L.glowInner[0]! * GK.lineW, glowW2 = L.glowOuter[0]! * GK.lineW;
  for (const ln of lineList) {
    // glow (screen-like, on the small canvas)
    if (ln.glow > 0) {
      const gmul = GK.glow * glowK * ln.glow;
      strokeRuns(gg, ln.cu.X, ln.cu.Y, ln.A, ln.col, glowW1 * gs, L.run, w, h, L.glowInner[1]! * gmul / L.alpha);
      strokeRuns(gg, ln.cu.X, ln.cu.Y, ln.A, ln.col, glowW2 * gs, L.run, w, h, L.glowOuter[1]! * gmul / L.alpha);
      if (GK.lineW > 1.5) strokeRuns(gg, ln.cu.X, ln.cu.Y, ln.A, ln.col, glowW2 * 2.6 * gs, L.run, w, h, L.glowOuter[1]! * gmul * 0.8 / L.alpha);
    }
  }
  // composite the glow, then the crisp cores
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(glowCv, 0, 0, w, h);
  g.restore();

  g.save();
  g.lineCap = 'round';
  for (const ln of lineList) {
    const wd = width * ln.core;
    if (ln.lead) {
      // leaded glass: a dark came laid along the edge, a hair off the bright line
      g.globalCompositeOperation = 'source-over';
      strokeRuns(g, ln.cu.X, ln.cu.Y, ln.A, inp.lead, Math.max(1.4, wd * 2.4), L.run, w, h, 0.85 * L.leadAlpha / L.alpha);
    }
    g.globalCompositeOperation = 'lighter';
    if (glassKind === 'prismatic' && ln.glow > 0 && !ln.isSpark) {
      const f = L.fringe * S;
      const cols = inp.fringe;
      for (let ci = 0; ci < 3; ci++) {
        const off = (ci - 1) * f;
        const cu = ln.cu;
        const Xo = new Float32Array(T), Yo = new Float32Array(T);
        for (let j = 0; j < T; j++) { Xo[j] = cu.X[j]! + cu.NX[j]! * off; Yo[j] = cu.Y[j]! + cu.NY[j]! * off; }
        strokeRuns(g, Xo, Yo, ln.A, cols[ci]!, Math.max(1, wd * 0.95), L.run, w, h, 0.72);
      }
      strokeRuns(g, ln.cu.X, ln.cu.Y, ln.A, ln.col, Math.max(1, wd * 0.6), L.run, w, h, 0.4);
    } else {
      strokeRuns(g, ln.cu.X, ln.cu.Y, ln.A, ln.col, wd, L.run, w, h, ln.isSpark ? 1 : 1 + 0.35 * (glowK - 1));
    }
  }
  g.restore();

  // ── striations and caustics, inside each sheet's visible part ─────────────
  const SR = P.striae, CA = P.caustic;
  const stroke = (X: number[], Y: number[], col: RGB, a: number, wd: number) => {
    g.strokeStyle = css(col, a);
    g.lineWidth = wd;
    g.beginPath();
    g.moveTo(X[0]!, Y[0]!);
    for (let i = 1; i < X.length; i++) g.lineTo(X[i]!, Y[i]!);
    g.stroke();
  };
  const bodyCol = (sh: SheetInfo) => mix(sh.line, sh.rim, 0.5);
  for (const sh of byOrd) {
    const front = nextInOrder(sh);
    const own = sh.frontLo ? sh.lo : sh.hi;
    const sgn = sh.frontLo ? 1 : -1;
    const nxt = front ? (front.frontLo ? front.lo : front.hi) : null;
    const nShift = front ? front.shift : 0;
    const visible = (j: number) => {
      // distance from this sheet's front edge to where the sheet in front begins (or its own back edge)
      const d = nxt ? sgn * ((nxt[j]! + nShift) - (own[j]! + sh.shift)) : Math.abs(sh.hi[j]! - sh.lo[j]!);
      return d > 0 ? d : 0;
    };
    const at = (fr: number, v: number, o: { x: number; y: number }) => {
      const tt = fr * M; let j0 = tt | 0; if (j0 >= M) j0 = M - 1;
      const ft = tt - j0;
      const u0 = own[j0]! + (own[j0 + 1]! - own[j0]!) * ft + sh.shift;
      const vis = visible(j0) + (visible(j0 + 1) - visible(j0)) * ft;
      frame.toXY(fr, u0 + sgn * v * vis, q);
      o.x = q.x; o.y = q.y;
    };
    const pt = { x: 0, y: 0 };
    const rs = c.rng('strata/striae/' + sh.i);
    const nS = SR.count;
    const drawN = Math.ceil(nS * GK.striae * c.q);
    const seg = 10;
    const ind = Math.min(1, sh.alpha) * (0.55 + 0.45 * sh.e);
    for (let n = 0; n < nS; n++) {
      const v = rs.range(0.05, 0.95), f0 = rs.range(-0.05, 1.0), len = rs.range(SR.length[0]!, SR.length[1]!) * (polar ? 0.6 : 1);
      const al = rs.range(SR.alpha[0]!, SR.alpha[1]!), wd = rs.range(SR.width[0]!, SR.width[1]!), dark = rs.chance(SR.dark), wob = rs.range(-1, 1);
      if (n >= drawN) continue;
      const col = dark ? inp.lead : bodyCol(sh);
      g.globalCompositeOperation = dark ? 'source-over' : 'lighter';
      const X: number[] = [], Y: number[] = [], fr0 = f0;
      let lastA = 0;
      for (let s = 0; s <= seg; s++) {
        const fr = polar ? ((fr0 + (len * s) / seg) % 1 + 1) % 1 : clamp(fr0 + (len * s) / seg, 0, 1);
        at(fr, v + 0.07 * wob * (s / seg - 0.5), pt);
        X.push(pt.x); Y.push(pt.y);
        const tp = sh.tpOn ? taperAt(sh, fr, polar) : 1;
        lastA = tp;
      }
      // one stroke per striation, faded by a gradient along its length
      const grad = g.createLinearGradient(X[0]!, Y[0]!, X[seg]!, Y[seg]!);
      const a = al * ind * lastA * (dark ? 0.9 : 1);
      grad.addColorStop(0, css(col, 0)); grad.addColorStop(0.5, css(col, a)); grad.addColorStop(1, css(col, 0));
      g.strokeStyle = grad; g.lineWidth = Math.max(0.7, wd * S * 1.15);
      smoothPath(g, X, Y);
      g.stroke();
    }
    // seeds and bubbles: the pinpricks of air that old glass keeps, drawn out along the flow
    {
      const BU = P.bubbles;
      const rbb = c.rng('strata/bubbles/' + sh.i);
      const bN = BU.count, bDraw = Math.ceil(bN * GK.bubbles * c.q);
      const p2 = { x: 0, y: 0 };
      for (let n = 0; n < bN; n++) {
        const fr = rbb.range(0.02, 0.98), v = rbb.range(0.1, 0.9), rad = rbb.range(BU.radius[0]!, BU.radius[1]!);
        const el = rbb.range(BU.elong[0]!, BU.elong[1]!), al = rbb.range(BU.alpha[0]!, BU.alpha[1]!), hl = rbb.range(0.3, 0.7);
        if (n >= bDraw) continue;
        if (sh.tpOn && taperAt(sh, fr, polar) < 0.5) continue;
        at(fr, v, pt); at(Math.min(1, fr + 0.006), v, p2);
        if (pt.x < -10 || pt.x > w + 10 || pt.y < -10 || pt.y > h + 10) continue;
        const rot = Math.atan2(p2.y - pt.y, p2.x - pt.x);
        const d2 = ((pt.x - lay.cx) ** 2 + (pt.y - lay.cy) ** 2) * invR2;
        const a = al * ind * (0.45 + 0.55 * Math.exp(-1.2 * d2)) * (1 + 0.5 * inp.bloomLift);
        const rx = rad * el * S, ry = rad * S;
        g.globalCompositeOperation = 'source-over';
        g.fillStyle = css(inp.lead, 0.22 * a * 2);
        g.beginPath(); g.ellipse(pt.x, pt.y, rx, ry, rot, 0, TAU); g.fill();
        g.globalCompositeOperation = 'lighter';
        g.strokeStyle = css(sh.line, a * 0.55); g.lineWidth = Math.max(0.7, 0.75 * S);
        g.beginPath(); g.ellipse(pt.x, pt.y, rx, ry, rot, 0, TAU); g.stroke();
        // a small bright glint on the side facing the light
        const gx = Math.cos(rot) * rx * 0.45, gy = Math.sin(rot) * rx * 0.45;
        g.fillStyle = css(sh.line, a * hl);
        g.beginPath(); g.ellipse(pt.x - gx, pt.y - gy - ry * 0.25, Math.max(0.5, rx * 0.22), Math.max(0.5, ry * 0.22), rot, 0, TAU); g.fill();
      }
    }
    // caustic ribbons: broad soft ones on the glow canvas, thin crisp filaments at full size
    const rk = c.rng('strata/caustic/' + sh.i);
    const cN = CA.count, cDraw = Math.ceil(cN * GK.caustic * c.q);
    for (let n = 0; n < cN; n++) {
      const v = rk.range(0.12, 0.88), f0 = rk.range(0, 1), len = rk.range(CA.length[0]!, CA.length[1]!) * (polar ? 0.6 : 1);
      const al = rk.range(CA.alpha[0]!, CA.alpha[1]!), wd = rk.range(CA.width[0]!, CA.width[1]!), wob = rk.range(-1, 1);
      if (n >= cDraw) continue;
      const X: number[] = [], Y: number[] = [];
      for (let s = 0; s <= seg; s++) {
        const fr = polar ? ((f0 + (len * s) / seg) % 1 + 1) % 1 : clamp(f0 + (len * s) / seg, 0, 1);
        at(fr, v + 0.1 * wob * (s / seg - 0.5), pt);
        X.push(pt.x); Y.push(pt.y);
      }
      const grad = gc.createLinearGradient(X[0]!, Y[0]!, X[seg]!, Y[seg]!);
      const col = sh.rim;
      const a = al * ind * GK.caustic * (0.5 + 0.5 * glowK);
      grad.addColorStop(0, css(col, 0)); grad.addColorStop(0.5, css(col, a)); grad.addColorStop(1, css(col, 0));
      gc.strokeStyle = grad; gc.lineWidth = wd * S * gs * 1.0;
      gc.lineCap = 'round';
      smoothPath(gc, X, Y);
      gc.stroke();
    }
    const rf = c.rng('strata/filament/' + sh.i);
    const fN = CA.thin, fDraw = Math.ceil(fN * GK.caustic * c.q);
    for (let n = 0; n < fN; n++) {
      const v = rf.range(0.1, 0.9), f0 = rf.range(0, 1), len = rf.range(CA.thinLen[0]!, CA.thinLen[1]!) * (polar ? 0.6 : 1);
      const al = rf.range(CA.thinAlpha[0]!, CA.thinAlpha[1]!), wob = rf.range(-1, 1);
      if (n >= fDraw) continue;
      const X: number[] = [], Y: number[] = [];
      for (let s = 0; s <= 5; s++) {
        const fr = polar ? ((f0 + (len * s) / 5) % 1 + 1) % 1 : clamp(f0 + (len * s) / 5, 0, 1);
        at(fr, v + 0.06 * wob * (s / 5 - 0.5), pt);
        X.push(pt.x); Y.push(pt.y);
      }
      g.globalCompositeOperation = 'lighter';
      const grad = g.createLinearGradient(X[0]!, Y[0]!, X[5]!, Y[5]!);
      const a = al * ind * GK.caustic;
      grad.addColorStop(0, css(sh.line, 0)); grad.addColorStop(0.5, css(sh.line, a)); grad.addColorStop(1, css(sh.line, 0));
      g.strokeStyle = grad; g.lineWidth = Math.max(0.8, 1.0 * S);
      smoothPath(g, X, Y);
      g.stroke();
    }
  }
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(cauCv, 0, 0, w, h);
  g.restore();
  // frosted glass: a sandblasted tooth, only where there is glass
  if (GK.frost > 0) {
    const T2 = 96;
    const tile = c.makeCanvas(T2, T2);
    const tg = tile.getContext('2d')!;
    const td = tg.createImageData(T2, T2);
    const fs = Math.floor(c.rng('strata/frost')() * 1e9);
    for (let y = 0; y < T2; y++) for (let x = 0; x < T2; x++) {
      const v = hash2(x, y, fs);
      const o = (y * T2 + x) * 4;
      const on = v > 0.5;
      const a = Math.abs(v - 0.5) * 2;
      td.data[o] = on ? 255 : 0; td.data[o + 1] = on ? 255 : 0; td.data[o + 2] = on ? 255 : 0; td.data[o + 3] = Math.round(255 * a * a);
    }
    tg.putImageData(td, 0, 0);
    g.save();
    g.globalCompositeOperation = 'source-atop';
    g.globalAlpha = GK.frost * (0.25 + 0.75 * Math.min(1, c.tone.dim));
    g.fillStyle = g.createPattern(tile, 'repeat')!;
    g.fillRect(0, 0, w, h);
    g.restore();
  }
  void oklchToRgb;
}
