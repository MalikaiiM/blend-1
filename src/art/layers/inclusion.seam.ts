// Kintsugi Seam — the glass has cracked from the bloom outward and the crack was filled with molten gold.
// A jagged fracture crosses the whole piece; either side of it the picture is sheared a few pixels
// (a displaced echo of the bloom, which is what breaks most visibly), and hairline offshoots branch away from it.

import type { LayerCtx } from './types.ts';
import { css, mix, rgbToOklch, type RGB } from '../color.ts';
import { clamp, lerp, smoothstep, TAU } from '../math.ts';
import { drawBloom } from './lumen.ts';
import { blit, bloomRadius, glow, GOLD, isMono, lightOf, linePath, smallCanvas, type Pt } from './inclusion.util.ts';

/** a fracture: straight-ish runs with abrupt turns, wandering around a heading until it leaves the frame */
function fracture(
  c: LayerCtx, rng: ReturnType<LayerCtx['rng']>, x0: number, y0: number, heading: number,
  segMin: number, segMax: number, wander: number, kink: number, maxLen: number, bounds: boolean,
): Pt[] {
  const S = c.S;
  const pts: Pt[] = [[x0, y0]];
  let x = x0, y = y0, w = 0, len = 0, bend = 0;
  const m = Math.max(c.w, c.h) * 0.15;
  for (let i = 0; i < 500; i++) {
    const step = S * rng.range(segMin, segMax);
    w = clamp(w * 0.7 + rng.gauss() * wander, -0.9, 0.9);
    if (rng() < kink) w += rng.sign() * rng.range(0.35, 0.8);
    bend = clamp(bend + rng.gauss() * (bounds ? 0.035 : 0.06), -0.7, 0.7);
    const a = heading + w + bend;
    x += Math.cos(a) * step;
    y += Math.sin(a) * step;
    len += step;
    pts.push([x, y]);
    if (len > maxLen) break;
    if (bounds && (x < -m || x > c.w + m || y < -m || y > c.h + m)) break;
  }
  return pts;
}

/** A vein: a polyline resampled evenly, with normals and arc length. */
interface Vein { pts: Pt[]; nx: number[]; ny: number[]; s: number[]; total: number }

function chaikin(pts: Pt[]): Pt[] {
  if (pts.length < 3) return pts;
  const out: Pt[] = [pts[0]!];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!, b = pts[i + 1]!;
    out.push([lerp(a[0], b[0], 0.22), lerp(a[1], b[1], 0.22)], [lerp(a[0], b[0], 0.78), lerp(a[1], b[1], 0.78)]);
  }
  out.push(pts[pts.length - 1]!);
  return out;
}

function makeVein(raw: Pt[], step: number): Vein {
  const src = chaikin(raw);
  const pts: Pt[] = [src[0]!];
  let carry = 0;
  for (let i = 1; i < src.length; i++) {
    const a = src[i - 1]!, b = src[i]!;
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (d < 1e-6) continue;
    let t = step - carry;
    while (t <= d) {
      pts.push([lerp(a[0], b[0], t / d), lerp(a[1], b[1], t / d)]);
      t += step;
    }
    carry = d - (t - step);
  }
  pts.push(src[src.length - 1]!);
  const n = pts.length;
  const nx = new Array<number>(n), ny = new Array<number>(n), s = new Array<number>(n);
  s[0] = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)]!, b = pts[Math.min(n - 1, i + 1)]!;
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    nx[i] = -(b[1] - a[1]) / d;
    ny[i] = (b[0] - a[0]) / d;
    if (i > 0) s[i] = s[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
  }
  return { pts, nx, ny, s, total: Math.max(1e-6, s[n - 1]!) };
}

/** A filled band along vein points [i0, i1] with per-point width and an optional sideways offset. */
function ribbon(v: Vein, i0: number, i1: number, w: number[], off?: number[], grow = 0): Path2D {
  const p = new Path2D();
  const at = (i: number, side: number): Pt => {
    const o = off ? off[i]! : 0;
    const hw = (w[i]! + grow) * 0.5 * side;
    return [v.pts[i]![0] + v.nx[i]! * (hw + o), v.pts[i]![1] + v.ny[i]! * (hw + o)];
  };
  let q = at(i0, 1);
  p.moveTo(q[0], q[1]);
  for (let i = i0 + 1; i <= i1; i++) { q = at(i, 1); p.lineTo(q[0], q[1]); }
  for (let i = i1; i >= i0; i--) { q = at(i, -1); p.lineTo(q[0], q[1]); }
  p.closePath();
  return p;
}

/** a hue between green and cyan would read as verdigris, not gold */
function goldOf(c: LayerCtx): RGB {
  const { light } = lightOf(c);
  let g = mix(GOLD, light, 0.2);
  if (isMono(c)) g = mix(g, c.pal.spark, 0.28);
  const h = rgbToOklch(g)[2];
  return h > 100 && h < 215 ? GOLD : g;
}

export function drawSeam(c: LayerCtx, g: CanvasRenderingContext2D, k: number) {
  const P = c.P.layers.inclusion.seam;
  const L = c.lay;
  const S = c.S;
  const R = bloomRadius(c);
  const rng = c.rng('inclusion/seam');
  const rp = c.rng('inclusion/seam/path');
  const rb = c.rng('inclusion/seam/branch');
  const rf = c.rng('inclusion/seam/fleck');
  const rq = c.rng('inclusion/seam/pool');
  const nz = c.noise('inclusion/seam');
  const gold = goldOf(c);
  const { white } = lightOf(c);
  const hotGold = mix(gold, white, 0.55);
  const body = mix(P.bodyRGB as RGB, gold, 0.4);
  const deep = mix(P.deepRGB as RGB, gold, 0.2);
  const prism = c.traits.body.glass === 'prismatic' || c.full.spectral;

  // ── where it runs: through a point near the bloom, on a diagonal ──
  const along = rng.range(P.along[0]!, P.along[1]!) * R;
  const across = rng.range(P.across[0]!, P.across[1]!) * R;
  const ang = rng.range(P.angleDeg[0]!, P.angleDeg[1]!) * (Math.PI / 180) * rng.sign();
  const px = L.cx + L.ax * along - L.ay * across, py = L.cy + L.ay * along + L.ax * across;
  const heading = ang + (rng() < 0.5 ? 0 : Math.PI);
  const phi = rng.range(P.shearTurn[0]!, P.shearTurn[1]!) * (Math.PI / 180) * rng.sign();
  const shift0 = rng.range(P.shift[0]!, P.shift[1]!);
  const span = Math.hypot(c.w, c.h) * 1.4;
  const rawF = fracture(c, rp, px, py, heading, P.seg[0]!, P.seg[1]!, P.wander, P.kink, span, true);
  const rawB = fracture(c, rp, px, py, heading + Math.PI, P.seg[0]!, P.seg[1]!, P.wander, P.kink, span, true);
  const arms = [makeVein(rawF, 4.5 * S), makeVein(rawB, 4.5 * S)];
  const full: Pt[] = [...rawB.slice().reverse(), ...rawF.slice(1)];

  // ── branches: hairline offshoots, some with a twig of their own ──
  interface Branch { v: Vein; w: number; a: number; at: number }
  const branches: Branch[] = [];
  for (let i = 0; i < P.branches; i++) {
    const arm = arms[rb() < 0.5 ? 0 : 1]!;
    const u = rb.range(0.04, 0.86);
    const idx = Math.min(arm.pts.length - 2, Math.floor(u * (arm.pts.length - 1)));
    const p = arm.pts[idx]!, q = arm.pts[idx + 1]!;
    const dir = Math.atan2(q[1] - p[1], q[0] - p[0]);
    const side = rb.sign();
    const bang = dir + side * rb.range(P.branchAng[0]!, P.branchAng[1]!) * (Math.PI / 180);
    const blen = R * rb.range(P.branchLen[0]!, P.branchLen[1]!) * (1 - 0.35 * u);
    const bp = fracture(c, rb, p[0], p[1], bang, 10, 34, P.wander * 1.2, P.kink * 0.6, blen, false);
    const inFrame = p[0] > -20 && p[0] < c.w + 20 && p[1] > -20 && p[1] < c.h + 20;
    const bw = rb.range(0.55, 1.0);
    const ba = inFrame ? rb.range(0.6, 1) : 0;
    const at = arm.s[idx]! / arm.total;
    branches.push({ v: makeVein(bp, 3.5 * S), w: bw, a: ba, at });
    const twig = rb() < P.twigChance;
    const tj = rb.range(0.3, 0.7), tang = rb.sign() * rb.range(0.4, 0.9);
    if (twig && bp.length > 4) {
      const j = Math.floor(tj * (bp.length - 1));
      const a2 = Math.atan2(bp[j + 1]![1] - bp[j]![1], bp[j + 1]![0] - bp[j]![0]) + tang;
      branches.push({ v: makeVein(fracture(c, rb, bp[j]![0], bp[j]![1], a2, 8, 22, P.wander, 0.1, blen * 0.42, false), 3 * S), w: 0.5, a: ba * 0.85, at });
    }
  }

  // ── pools: where the gold gathered ──
  const pools: { arm: number; s: number; w: number; sig: number }[] = [];
  for (let i = 0; i < P.pools; i++) {
    pools.push({ arm: rq() < 0.5 ? 0 : 1, s: rq.range(0.03, 0.8), w: rq.range(P.poolPx[0]!, P.poolPx[1]!), sig: rq.range(7, 16) });
  }

  // ── time: the crack runs outward from the bloom, hot at its tips, then cools to gold ──
  const run = smoothstep(0.02, 0.78, k);
  const fade = smoothstep(0, 0.18, k);
  const heat = 1 - smoothstep(0.35, 1, k);

  // ── the sheared glass either side of the crack ──
  // The bloom is the crispest thing in the picture, so it is what visibly breaks: draw it once more, and lay a copy
  // on each side of the fracture, slid a few pixels along it (and a hair apart), fading into the picture with distance.
  if (k > 0.02) {
    const open = smoothstep(0.05, 0.9, k);
    const shift = S * shift0 * open;
    const gapOpen = S * P.gapShift * open;
    const dx = Math.cos(heading), dy = Math.sin(heading);
    const nx = -dy, ny = dx;
    // the two halves slide past each other along a line turned a little off the crack, so petals across it break too
    const sx = Math.cos(heading + phi), sy = Math.sin(heading + phi);
    // each half is clipped to a strip along the crack, just wider than the feathered band
    const halfBand = P.band * S * 0.55;
    const nf = full.length;
    const nrm: Pt[] = full.map((p, i) => {
      const a = full[Math.max(0, i - 1)]!, b = full[Math.min(nf - 1, i + 1)]!;
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      return [-(b[1] - a[1]) / d, (b[0] - a[0]) / d];
    });
    // (drawn at half size and cheaper: an echo does not need the fine detail, and this is the dearest thing in the layer)
    const hs = P.ghostScale;
    const B = c.makeCanvas(Math.max(2, Math.round(c.w * hs)), Math.max(2, Math.round(c.h * hs)));
    const bg = B.getContext('2d')!;
    bg.scale(B.width / c.w, B.height / c.h);
    drawBloom(bg, { ...c, q: Math.min(c.q, P.ghostQ) }, {
      cx: L.cx, cy: L.cy, R, axis: L.axis, spread: L.radial ? TAU : L.spread, open: k, intensity: P.ghostA, label: 'main',
    });
    // the feathered band along the crack, on a small canvas (the upscale is the blur)
    const band = smallCanvas(c, 5);
    band.g.lineCap = 'round';
    band.g.lineJoin = 'round';
    band.g.globalCompositeOperation = 'lighter';
    const bw = P.band * S;
    const path = linePath(full);
    const NB = 20;
    for (let i = 0; i < NB; i++) {
      band.g.lineWidth = bw * Math.pow(1 - i / NB, 1.3);
      band.g.strokeStyle = css([255, 255, 255], 1.25 / NB);
      band.g.stroke(path);
    }
    // each half: the band, cut to one side of the fracture; the bloom's echo, slid along it, shown through that mask
    g.save();
    g.globalAlpha = fade;
    g.globalCompositeOperation = 'lighter';
    for (const side of [1, -1]) {
      const m = smallCanvas(c, 5);
      m.g.drawImage(band.cv, 0, 0, c.w, c.h);
      m.g.globalCompositeOperation = 'destination-in';
      m.g.fillStyle = '#fff';
      m.g.beginPath();
      m.g.moveTo(full[0]![0], full[0]![1]);
      for (let i = 1; i < nf; i++) m.g.lineTo(full[i]![0], full[i]![1]);
      for (let i = nf - 1; i >= 0; i--) m.g.lineTo(full[i]![0] + nrm[i]![0] * side * halfBand, full[i]![1] + nrm[i]![1] * side * halfBand);
      m.g.closePath();
      m.g.fill();
      const T = c.makeCanvas(B.width, B.height);
      const tg = T.getContext('2d')!;
      tg.scale(B.width / c.w, B.height / c.h);
      tg.imageSmoothingQuality = 'high';
      tg.drawImage(B, sx * shift * side + nx * gapOpen * side, sy * shift * side + ny * gapOpen * side, c.w, c.h);
      tg.globalCompositeOperation = 'destination-in';
      tg.imageSmoothingQuality = 'high';
      tg.drawImage(m.cv, 0, 0, c.w, c.h);
      g.drawImage(T, 0, 0, c.w, c.h);
    }
    g.restore();
  }

  // ── the gold ──
  const bloomLit = (x: number, y: number) => 1 + P.bloomLift * Math.exp(-(((x - L.cx) ** 2 + (y - L.cy) ** 2) / (0.6 * R) ** 2));
  const drawVein = (v: Vein, o: { base: number; noiseKey: number; pools?: typeof pools; taper: number; a: number; glow: boolean }) => {
    const n = v.pts.length;
    const iEnd = Math.min(n - 1, Math.max(1, Math.floor((n - 1) * o.a)));
    if (iEnd < 2) return;
    // width along the vein: poured metal — thin runs, fat runs, and pools
    const w = new Array<number>(n), lit = new Array<number>(n), off = new Array<number>(n), val = new Array<number>(n);
    for (let i = 0; i < n; i++) {
      const s = v.s[i]!;
      const big = 0.5 + 0.5 * nz.fbm(s * 0.0065 + o.noiseKey, o.noiseKey * 1.7, 2);
      const fine = 0.5 + 0.5 * nz.fbm(s * 0.05 + o.noiseKey * 3.1, 9.3, 2);
      let ww = o.base * S * (0.34 + 1.05 * big) * (0.82 + 0.36 * fine);
      for (const pl of o.pools ?? []) ww += pl.w * S * Math.exp(-(((s - pl.s * v.total) / (pl.sig * S)) ** 2));
      const tip = 1 - o.taper * smoothstep(0.55, 1, s / v.total);
      w[i] = Math.max(0.5 * S, ww * tip);
      lit[i] = bloomLit(v.pts[i]![0], v.pts[i]![1]);
      val[i] = clamp(0.25 + 0.95 * big * (0.7 + 0.3 * fine), 0, 1.2);
      // the ridge of light rides the side that faces the bloom
      const dxb = L.cx - v.pts[i]![0], dyb = L.cy - v.pts[i]![1];
      const db = Math.hypot(dxb, dyb) || 1;
      off[i] = ((dxb * v.nx[i]! + dyb * v.ny[i]!) / db) * w[i]! * 0.2;
    }
    // 1 · soft glow, on a small canvas (free blur), varying with the brightness of the metal and the bloom
    if (o.glow) {
      const small = smallCanvas(c, 3);
      small.g.globalCompositeOperation = 'lighter';
      small.g.lineCap = 'round';
      small.g.lineJoin = 'round';
      const cs = 10;
      for (let i = 0; i < iEnd; i += cs) {
        const j = Math.min(iEnd, i + cs + 1);
        const seg = linePath(v.pts.slice(i, j + 1));
        const mid = Math.min(n - 1, i + (cs >> 1));
        for (let q = 0; q < P.glowPx.length; q++) {
          small.g.lineWidth = P.glowPx[q]! * S * (0.75 + 0.35 * val[mid]!);
          small.g.strokeStyle = css(mix(gold, c.pal.glass, 0.1 * (1 - q / P.glowPx.length)), clamp(P.glowA[q]! * P.glow * lit[mid]! * val[mid]! * fade, 0, 1));
          small.g.stroke(seg);
        }
      }
      blit(g, small.cv, c, 1, 'lighter');
    }
    // 2 · the groove: dark, wider, pushed a little to the shadow side
    g.save();
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = css([2, 1, 3], P.gapAlpha * fade);
    g.fill(ribbon(v, 0, iEnd, w, off.map((x) => -x * 1.4), P.gapPx * S));
    // 3 · the gold, in runs so its colour can wander from deep ochre to bright
    const run8 = 8;
    for (let i = 0; i < iEnd; i += run8) {
      const j = Math.min(iEnd, i + run8 + 1);
      let vs = 0;
      for (let q = i; q <= j; q++) vs += val[q]!;
      vs /= j - i + 1;
      g.fillStyle = css(mix(deep, mix(body, hotGold, heat * 0.6), clamp(0.25 + 0.75 * vs, 0, 1)), 0.97 * fade);
      g.fill(ribbon(v, i, j, w));
    }
    // 4 · the ridge of light
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < iEnd; i += run8) {
      const j = Math.min(iEnd, i + run8 + 1);
      const mid = Math.min(n - 1, i + (run8 >> 1));
      g.fillStyle = css(mix(hotGold, white, 0.35 + 0.4 * heat), clamp(0.8 * fade * (0.45 + 0.55 * val[mid]!) * Math.min(1.25, lit[mid]! / (1 + P.bloomLift * 0.4)), 0, 1));
      g.fill(ribbon(v, i, j, w.map((x) => x * 0.34), off.map((x, q) => x + w[q]! * 0.08)));
    }
    g.restore();
    // 5 · chromatic fringe where the glass parts (prismatic and spectral glass split the light)
    if (prism && o.glow) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.lineWidth = 0.9 * S;
      const path = linePath(v.pts.slice(0, iEnd + 1));
      const off2 = P.fringePx * S;
      for (const [sg, col] of [[1, [255, 90, 120]], [-1, [90, 170, 255]]] as const) {
        g.save();
        g.translate(v.nx[0]! * off2 * sg, v.ny[0]! * off2 * sg);
        g.strokeStyle = css(col as unknown as RGB, 0.32 * fade);
        g.stroke(path);
        g.restore();
      }
      g.restore();
    }
    // the molten head
    if (o.glow && run < 0.999) {
      const h = v.pts[iEnd]!;
      glow(g, h[0], h[1], 46 * S, hotGold, 0.55 * (1 - run), 3);
      glow(g, h[0], h[1], 12 * S, white, 0.9 * (1 - run), 2.4);
    }
  };
  arms.forEach((v, i) => drawVein(v, { base: P.corePx, noiseKey: 3.1 + i * 5.7, pools: pools.filter((p) => p.arm === i), taper: 0.75, a: run, glow: true }));

  // ── offshoots, tapering to nothing ──
  const nBr = branches.length;
  for (let bi = 0; bi < nBr; bi++) {
    const b = branches[bi]!;
    if (b.a <= 0) continue;
    if (bi > Math.ceil(nBr * Math.max(c.q, 0.7))) continue; // the finest twigs are the first to go in draft
    const grow = smoothstep(b.at * 0.75, b.at * 0.75 + 0.3, run) * fade;
    if (grow <= 0.01) continue;
    drawVein(b.v, { base: P.twigPx * b.w, noiseKey: 11.3 + bi * 2.9, taper: 0.95, a: grow, glow: false });
    const p0 = b.v.pts[0]!;
    glow(g, p0[0], p0[1], 9 * S * b.w, hotGold, 0.5 * b.a * fade, 2.4);
  }

  // ── flecks of gold leaf caught in the crack ──
  const nf = P.flecks;
  const nfDraw = Math.ceil(nf * c.q);
  for (let i = 0; i < nf; i++) {
    const arm = arms[rf() < 0.5 ? 0 : 1]!;
    const t = rf();
    const lat = rf.gauss() * 26 * S;
    const r = rf.range(P.fleckPx[0]!, P.fleckPx[1]!) * S;
    const tw = rf();
    if (i >= nfDraw) continue;
    const j = Math.min(arm.pts.length - 1, Math.floor(t * (arm.pts.length - 1)));
    const x = arm.pts[j]![0] + arm.nx[j]! * lat, y = arm.pts[j]![1] + arm.ny[j]! * lat;
    if (x < -10 || x > c.w + 10 || y < -10 || y > c.h + 10) continue;
    const reach = smoothstep(0, 0.12, run - t * 0.85);
    const a = (0.35 + 0.65 * tw) * reach * fade * Math.exp(-Math.abs(lat) / (60 * S));
    if (a < 0.02) continue;
    glow(g, x, y, r * 6, gold, 0.22 * a, 3);
    glow(g, x, y, r * 1.4, hotGold, 0.9 * a, 2.2);
    if (tw > 0.7) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = css(hotGold, 0.55 * a);
      g.lineWidth = 0.7 * S;
      g.beginPath();
      g.moveTo(x - r * 5, y); g.lineTo(x + r * 5, y);
      g.moveTo(x, y - r * 5); g.lineTo(x, y + r * 5);
      g.stroke();
      g.restore();
    }
  }

  // ── the bloom pours light into the crack where they meet ──
  {
    let best = Infinity, bx = px, by = py;
    for (const p of full) {
      const d = (p[0] - L.cx) ** 2 + (p[1] - L.cy) ** 2;
      if (d < best) { best = d; bx = p[0]; by = p[1]; }
    }
    const near = Math.exp(-best / (0.9 * R) ** 2);
    glow(g, bx, by, R * 0.42, gold, P.pour * near * fade * P.glow, 2.6);
  }
}
