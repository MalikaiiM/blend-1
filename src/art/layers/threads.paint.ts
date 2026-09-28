// THE THREADS · painting — light through spun glass.
//
// Passes, all additive onto a transparent canvas that the piece then screens:
//   halo   a very small canvas (≈ 7 % of the frame) with fat, faint strokes  → the wide gathering of light
//   glow   a small canvas (20 %) with soft strokes + tip blobs               → the 6–14 px glow
//   body   full-resolution tapered ribbons, coloured chunk by chunk          → the filament itself
//   core   the same, a third as wide and nearly white                        → the crisp thin core
// Growth is a fraction of each filament's stored polyline; sway is a displacement along its normals (tl.drift).
// Crowds are levelled by an exposure map, so a ribbon of forty strands shows forty strands, not a white bar.
import type { Cv, LayerCtx } from './types.ts';
import type { Thread } from './threads.gen.ts';
import { adjust, css, lightness, mix, oklabToRgbRaw, rgbToOklab, type Lab, type RGB } from '../color.ts';
import { TAU, clamp, lerp, smoothstep } from '../math.ts';

/**
 * cheap, near-round blur of a small canvas: running means of offset copies along four directions
 * (H, V and both diagonals, source-over with alpha 1/(j+1)) — a plain H+V box blur leaves squares behind.
 */
function blur(c: LayerCtx, cv: Cv, r: number) {
  if (r <= 0) return;
  const tmp = c.makeCanvas(cv.width, cv.height);
  const a = cv.getContext('2d')!, b = tmp.getContext('2d')!;
  const taps: number[] = [];
  for (let i = -r; i <= r; i++) taps.push(i);
  const pass = (src: Cv, dst: CanvasRenderingContext2D, dx: number, dy: number) => {
    dst.globalCompositeOperation = 'copy';
    dst.globalAlpha = 1;
    dst.clearRect(0, 0, cv.width, cv.height);
    dst.globalCompositeOperation = 'source-over';
    taps.forEach((t, j) => {
      dst.globalAlpha = 1 / (j + 1);
      dst.drawImage(src, t * dx, t * dy);
    });
    dst.globalAlpha = 1;
  };
  pass(cv, b, 1, 0);
  pass(tmp, a, 0, 1);
  pass(cv, b, 1, 1);
  pass(tmp, a, 1, -1);
}

/** additive pass of a small canvas onto the layer, at strength possibly > 1 (repeated draws) */
function addUp(g: CanvasRenderingContext2D, cv: Cv, W: number, H: number, strength: number) {
  g.globalCompositeOperation = 'lighter';
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  let s = strength;
  while (s > 0.004) {
    g.globalAlpha = Math.min(1, s);
    g.drawImage(cv, 0, 0, W, H);
    s -= 1;
  }
  g.globalAlpha = 1;
}

const labToRgb = (l: Lab): RGB => {
  const c = oklabToRgbRaw(l[0], l[1], l[2]);
  return [clamp(c[0], 0, 255), clamp(c[1], 0, 255), clamp(c[2], 0, 255)];
};
const lerpRgb = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** a soft round blob (radial falloff) — round even on a tiny canvas, unlike a blurred dot */
function blob(g: CanvasRenderingContext2D, x: number, y: number, r: number, col: RGB, a: number) {
  if (a < 0.004) return;
  const R = Math.max(1.4, r);
  const gr = g.createRadialGradient(x, y, 0, x, y, R);
  gr.addColorStop(0, css(col, a));
  gr.addColorStop(0.45, css(col, a * 0.45));
  gr.addColorStop(1, css(col, 0));
  g.fillStyle = gr;
  g.fillRect(x - R, y - R, 2 * R, 2 * R);
}

interface Drawn {
  th: Thread; f: number; xg: number; act: number; cnt: number; off: number;
}

export function paint(c: LayerCtx, list: Thread[]): Cv {
  const T = c.P.layers.threads;
  const D = T.draw, CL = T.color;
  const { w: W, h: H, S, tl, lay } = c;
  const draft = c.quality === 'draft';
  const out = c.makeCanvas();
  const g = out.getContext('2d')!;
  // small canvases of fixed height: the same glow at every output size
  const gl = c.makeCanvas(Math.max(8, Math.round(D.glowRows * W / H)), D.glowRows);
  const ha = c.makeCanvas(Math.max(8, Math.round(D.haloRows * W / H)), D.haloRows);
  const gg = gl.getContext('2d')!, hg = ha.getContext('2d')!;
  gg.globalCompositeOperation = 'screen'; hg.globalCompositeOperation = 'screen';
  gg.lineJoin = 'round'; hg.lineJoin = 'round'; hg.lineCap = 'round'; gg.lineCap = 'butt';
  g.globalCompositeOperation = 'lighter';
  const gsx = gl.width / W, gsy = gl.height / H, hsx = ha.width / W, hsy = ha.height / H;

  const pal = c.pal;
  const spectral = c.full.spectral;
  const capL = (col: RGB, mul: number, maxL: number, chroma: number): RGB => {
    const L = Math.max(0.02, lightness(col));
    return adjust(col, { l: Math.min(maxL, L * mul) / L, c: chroma });
  };
  const tipMid = capL(pal.mid, CL.tipLift, CL.tipMaxL, CL.tipChroma);
  const glassHot = capL(pal.glass, 1, 0.9, 1.06);
  const sparkHot = capL(pal.spark, 1.12, 0.86, 1.1);
  const labLight = rgbToOklab(pal.light), labGlass = rgbToOklab(glassHot), labMid = rgbToOklab(tipMid), labSpark = rgbToOklab(sparkHot);

  const g01 = c.grow('threads');
  // the seed's stubs stir a little through the first tide, before the threads' own window opens
  const stirring = 1 + D.stubGrow * smoothstep(0, 0.22, tl.t);
  const drawFrac = c.q + (1 - c.q) * T.draftFloor;
  const nDraw = Math.min(list.length, Math.ceil(list.length * clamp(drawFrac, 0, 1)));
  // fewer filaments are drawn at draft quality: each is a little brighter, so the picture keeps its weight
  const qGain = 1 + (1 - clamp(drawFrac, 0, 1)) * T.draftGain;

  const fam = T.families[c.traits.body.growth] as unknown as { densMax?: number; glow?: number };
  const dmax = fam.densMax ?? D.densMax;
  const famGlow = fam.glow ?? 1;
  const glowK = T.glow;
  const centreR = T.centre.radius * lay.unit;
  const attAt = (x: number, y: number) => lerp(T.centre.minAlpha, 1, smoothstep(0, centreR, Math.hypot(x - lay.cx, y - lay.cy)));
  const minW = D.minWidth * S;

  // ── pass 1: what is drawn of every filament (growth + sway), and how crowded the frame is ──
  let total = 0;
  for (let i = 0; i < nDraw; i++) total += list[i]!.n + 2;
  const PX = new Float32Array(total), PY = new Float32Array(total), PW = new Float32Array(total);
  const drawn: Drawn[] = [];
  const cellPx = D.densCell * S;
  const gw = Math.max(2, Math.ceil(W / cellPx)), gh = Math.max(2, Math.ceil(H / cellPx));
  let dens = new Float32Array(gw * gh);
  let off = 0;
  for (let ti = 0; ti < nDraw; ti++) {
    const th = list[ti]!;
    const xg = clamp((g01 - th.start) / Math.max(1e-3, 1 - th.start));
    const stub = Math.min(0.5, th.stub * stirring);
    const f = stub + (1 - stub) * (1 - Math.pow(1 - xg, 1.8));
    if (f < 0.004) continue;
    const act = lerp(1, D.tipRest, smoothstep(0.72, 1, xg));
    const m = f * th.n;
    const iF = Math.min(th.n, Math.floor(m));
    const part = m - iF;
    const cnt = iF + 1 + (part > 1e-4 && iF < th.n ? 1 : 0);
    if (cnt < 2) continue;
    const ph = th.swayPh + TAU * th.swayF * tl.drift;
    const sk = th.swayK / th.n;
    const per = th.len / th.n / cellPx;
    for (let i = 0; i <= iF; i++) {
      const d = th.swayA * th.env[i]! * Math.sin(ph + sk * i);
      const x = th.x[i]! + th.nx[i]! * d, y = th.y[i]! + th.ny[i]! * d;
      PX[off + i] = x; PY[off + i] = y; PW[off + i] = Math.max(minW, th.w0 * th.prof[i]!);
      const gx = Math.floor(x / cellPx), gy = Math.floor(y / cellPx);
      if (gx >= 0 && gy >= 0 && gx < gw && gy < gh) dens[gy * gw + gx] += th.a * (1 - D.tipFade * (i / th.n)) * per;
    }
    if (cnt > iF + 1) {
      const i = iF, j = iF + 1, s = m / th.n;
      const d = th.swayA * Math.pow(s, th.swayP) * Math.sin(ph + th.swayK * s);
      const nx = lerp(th.nx[i]!, th.nx[j]!, part), ny = lerp(th.ny[i]!, th.ny[j]!, part);
      PX[off + iF + 1] = lerp(th.x[i]!, th.x[j]!, part) + nx * d;
      PY[off + iF + 1] = lerp(th.y[i]!, th.y[j]!, part) + ny * d;
      PW[off + iF + 1] = Math.max(minW, th.w0 * lerp(th.prof[i]!, th.prof[j]!, part));
    }
    drawn.push({ th, f, xg, act, cnt, off });
    off += cnt;
  }
  // smooth the crowding map, then read it back as an exposure factor (tanh: sparse stays 1, crowds level off)
  for (let pass = 0; pass < 2; pass++) {
    const nd = new Float32Array(gw * gh);
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      let sum = 0, wsum = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= gw || yy >= gh) continue;
        const wt = dx === 0 && dy === 0 ? 2 : 1;
        sum += dens[yy * gw + xx]! * wt; wsum += wt;
      }
      nd[y * gw + x] = sum / wsum;
    }
    dens = nd;
  }
  const expo = (x: number, y: number) => {
    const fx = clamp(x / cellPx - 0.5, 0, gw - 1.001), fy = clamp(y / cellPx - 0.5, 0, gh - 1.001);
    const ix = Math.floor(fx), iy = Math.floor(fy), rx = fx - ix, ry = fy - iy;
    const d = lerp(lerp(dens[iy * gw + ix]!, dens[iy * gw + ix + 1]!, rx), lerp(dens[(iy + 1) * gw + ix]!, dens[(iy + 1) * gw + ix + 1]!, rx), ry);
    const t = d / dmax;
    return t < 1e-3 ? 1 : Math.tanh(t) / t;
  };

  // ── pass 2: paint ─────────────────────────────────────────────
  const lab3 = [0, 0, 0] as Lab;
  const rgbAt = (c0: Lab, c1: Lab, c2: Lab, u: number): RGB => {
    const split = 0.42;
    if (u < split) { const t = u / split; lab3[0] = c0[0] + (c1[0] - c0[0]) * t; lab3[1] = c0[1] + (c1[1] - c0[1]) * t; lab3[2] = c0[2] + (c1[2] - c0[2]) * t; }
    else { const t = (u - split) / (1 - split); lab3[0] = c1[0] + (c2[0] - c1[0]) * t; lab3[1] = c1[1] + (c2[1] - c1[1]) * t; lab3[2] = c1[2] + (c2[2] - c1[2]) * t; }
    return labToRgb(lab3);
  };
  const cw = D.coreWidth;
  const tipWhite = pal.light;

  for (const dr of drawn) {
    const { th, f, act, cnt, off: o } = dr;
    const last = cnt - 1;
    const X = (i: number) => PX[o + i]!, Y = (i: number) => PY[o + i]!;

    // ── colour ramp ────────────────────────────────────────────────
    let c0: Lab, c1: Lab, c2: Lab;
    if (spectral) {
      c0 = rgbToOklab(mix(pal.walk(th.hueT), pal.light, 0.2));
      c1 = rgbToOklab(pal.walk(th.hueT + 0.07));
      c2 = rgbToOklab(pal.walk(th.hueT + CL.walkSpan));
    } else {
      const rl = lerp(CL.rootLight[0], CL.rootLight[1], th.colK);
      c0 = [lerp(labGlass[0], labLight[0], rl), lerp(labGlass[1], labLight[1], rl), lerp(labGlass[2], labLight[2], rl)];
      const hm = th.hueT * 0.34;
      c1 = [lerp(labGlass[0], labMid[0], hm), lerp(labGlass[1], labMid[1], hm), lerp(labGlass[2], labMid[2], hm)];
      c2 = labMid;
    }
    if (th.spark) {
      c1 = [lerp(c1[0], labSpark[0], 0.3), lerp(c1[1], labSpark[1], 0.3), lerp(c1[2], labSpark[2], 0.3)];
      c2 = labSpark;
    }

    // ── chunks: colour + brightness set piece by piece ─────────────
    const k = draft ? Math.max(2, Math.ceil(th.k * 0.6)) : th.k;
    const B = th.n / k;
    const glowRad = D.glowRadius * S * (0.55 + 0.75 * th.a);
    const wantCore = !draft || th.a > 0.4;
    let tipCol: RGB = [255, 255, 255];
    let tipA = 0;
    for (let ci = 0; ci < k; ci++) {
      const i0 = Math.round(ci * B), i1 = Math.min(last, Math.round((ci + 1) * B));
      if (i0 >= last) break;
      if (i1 <= i0) continue;
      const iMid = (i0 + i1) >> 1;
      const u = (ci + 0.5) / k;
      const col = rgbAt(c0, c1, c2, u);
      const fl = 1 + D.flicker * (th.flick[ci % 9]! - 0.5) * 2;
      const mx = X(iMid), my = Y(iMid);
      let A = th.a * qGain * D.gain * (1 - D.tipFade * u) * fl * attAt(mx, my) * expo(mx, my);
      if (i1 >= last) A *= 1 + 0.55 * act;
      A = clamp(A);
      tipCol = col; tipA = A;

      // halo (faint, very wide) — only from the brighter filaments
      if (th.a > 0.22) {
        hg.strokeStyle = css(col, clamp(A * D.haloAlpha * famGlow * (0.4 + th.a)));
        hg.lineWidth = Math.max(0.5, D.haloRadius * S * (0.7 + 0.8 * th.a) * 0.5 * hsx);
        hg.beginPath();
        hg.moveTo(X(i0) * hsx, Y(i0) * hsy);
        for (let i = i0 + 2; i < i1; i += 2) hg.lineTo(X(i) * hsx, Y(i) * hsy);
        hg.lineTo(X(i1) * hsx, Y(i1) * hsy);
        hg.stroke();
      }
      // glow (soft)
      gg.strokeStyle = css(col, clamp(A * D.glowAlpha * famGlow));
      gg.lineWidth = Math.max(0.5, (PW[o + iMid]! + glowRad * 0.9) * gsx);
      gg.beginPath();
      gg.moveTo(X(i0) * gsx, Y(i0) * gsy);
      for (let i = i0 + 1; i <= i1; i++) gg.lineTo(X(i) * gsx, Y(i) * gsy);
      gg.stroke();

      // body ribbon
      g.fillStyle = css(col, clamp(A * 0.86));
      g.beginPath();
      g.moveTo(X(i0) + th.nx[i0]! * PW[o + i0]! * 0.5, Y(i0) + th.ny[i0]! * PW[o + i0]! * 0.5);
      for (let i = i0 + 1; i <= i1; i++) g.lineTo(X(i) + th.nx[i]! * PW[o + i]! * 0.5, Y(i) + th.ny[i]! * PW[o + i]! * 0.5);
      for (let i = i1; i >= i0; i--) g.lineTo(X(i) - th.nx[i]! * PW[o + i]! * 0.5, Y(i) - th.ny[i]! * PW[o + i]! * 0.5);
      g.closePath();
      g.fill();
      // core
      if (wantCore) {
        g.fillStyle = css(lerpRgb(col, tipWhite, D.coreTint), clamp(A * D.coreGain));
        g.beginPath();
        g.moveTo(X(i0) + th.nx[i0]! * PW[o + i0]! * 0.5 * cw, Y(i0) + th.ny[i0]! * PW[o + i0]! * 0.5 * cw);
        for (let i = i0 + 1; i <= i1; i++) g.lineTo(X(i) + th.nx[i]! * PW[o + i]! * 0.5 * cw, Y(i) + th.ny[i]! * PW[o + i]! * 0.5 * cw);
        for (let i = i1; i >= i0; i--) g.lineTo(X(i) - th.nx[i]! * PW[o + i]! * 0.5 * cw, Y(i) - th.ny[i]! * PW[o + i]! * 0.5 * cw);
        g.closePath();
        g.fill();
      }
    }

    // ── the tip: a fibre-optic end that glows while it grows ───────
    const tx = X(last), ty = Y(last);
    const tipLight = lerpRgb(tipCol, tipWhite, 0.5);
    const tipAmt = clamp(tipA * (0.35 + 0.65 * act) * D.tipGlow);
    if (tipAmt > 0.02) {
      const r = Math.max(0.6 * S, PW[o + last]! * 0.6 + 0.25 * S) * (1 + 0.35 * act);
      g.fillStyle = css(tipLight, clamp(tipAmt * 0.95));
      g.beginPath(); g.arc(tx, ty, r, 0, TAU); g.fill();
      blob(gg, tx * gsx, ty * gsy, (2.4 + 4 * th.a) * S * gsx * (0.6 + 0.5 * act), tipCol, clamp(tipAmt * 0.4));
    }

    // ── beads (reed seed-heads, coral polyps) ──────────────────────
    const bloomP = smoothstep(0.82, 1, f);
    if (th.tipR > 0 && bloomP > 0.01) {
      const r = th.tipR * (0.35 + 0.65 * bloomP);
      g.fillStyle = css(lerpRgb(tipCol, tipWhite, 0.6), clamp(0.5 + 0.5 * th.a) * bloomP);
      g.beginPath(); g.arc(tx, ty, r, 0, TAU); g.fill();
      blob(gg, tx * gsx, ty * gsy, r * 2.8 * gsx, tipCol, clamp(0.36 * (0.4 + th.a)) * bloomP);
    }
    for (let bi = 0; bi < th.beads.length; bi++) {
      const p = th.beads[bi]!;
      if (p > f - 0.01) continue;
      const q = smoothstep(p, p + 0.07, f);
      const ii = Math.min(last, Math.round(p * th.n));
      const r = Math.max(0.6 * S, th.tipR * 0.5 * (1 - 0.12 * bi));
      g.fillStyle = css(lerpRgb(tipCol, tipWhite, 0.5), clamp(0.35 + 0.5 * th.a) * q);
      g.beginPath(); g.arc(X(ii), Y(ii), r, 0, TAU); g.fill();
      blob(gg, X(ii) * gsx, Y(ii) * gsy, r * 4 * gsx, tipCol, clamp(0.3 * (0.4 + th.a)) * q);
    }
    // ── glints: pin-points of light travelling in the fibre ────────
    for (let gi = 0; gi < th.glints.length; gi++) {
      const p = th.glints[gi]!;
      if (p > f - 0.02) continue;
      const q = smoothstep(p, p + 0.05, f);
      const ii = Math.min(last, Math.round(p * th.n));
      const r = (0.6 + 0.9 * th.a) * S;
      g.fillStyle = css(lerpRgb(glassHot, tipWhite, 0.7), clamp(0.55 * (0.4 + th.a)) * q);
      g.beginPath(); g.arc(X(ii), Y(ii), r, 0, TAU); g.fill();
      blob(gg, X(ii) * gsx, Y(ii) * gsy, r * 3.6 * gsx, glassHot, clamp(0.3 * (0.4 + th.a)) * q);
    }
  }

  blur(c, ha, D.blurHalo);
  blur(c, gl, D.blurGlow);
  addUp(g, ha, W, H, glowK);
  addUp(g, gl, W, H, glowK);
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
  return out;
}
