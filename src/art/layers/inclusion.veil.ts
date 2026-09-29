// Aurora Veil — slow curtains of chromatic light hang through the frame in front of the sheets: tall wavering
// ribbons made of many fine vertical streaks, bright at the hem nearest the bloom's horizon and fading away,
// their hues walking the palette. A soft hole is left around the bloom so it is never buried.

import type { LayerCtx } from './types.ts';
import { adjust, css, mix, type RGB } from '../color.ts';
import { clamp, lerp, smoothstep, TAU } from '../math.ts';
import { blit, bloomRadius, isMono, lightOf, smallCanvas } from './inclusion.util.ts';

interface Curtain {
  x0: number;
  half: number;
  slope: number;
  a1: number;
  l1: number;
  p1: number;
  a2: number;
  l2: number;
  p2: number;
  hue: number;
  phase: number;
  hem: number;
  reach: number;
  start: number;
}

export function drawVeil(c: LayerCtx, g: CanvasRenderingContext2D, k: number) {
  const P = c.P.layers.inclusion.veil;
  const L = c.lay;
  const S = c.S;
  const W = c.w, H = c.h;
  const R = bloomRadius(c);
  const rng = c.rng('inclusion/veil');
  const rs = c.rng('inclusion/veil/streaks');
  const nz = c.noise('inclusion/veil');
  const { white } = lightOf(c);
  const mono = isMono(c);
  const spectral = c.full.spectral;

  const n = clamp(Math.round(P.count) + rng.int(-1, 1), 2, 9);
  // the light climbs (dawn), pours (zenith), leans sideways (dusk) or wells from the middle (nadir)
  const vert = Math.abs(L.ay) > 0.5 && !L.radial;
  const dirSign = vert ? Math.sign(L.ay) : 0; // +1: the bloom opens downward, so the curtains hang from the top
  const cs: Curtain[] = [];
  for (let i = 0; i < 9; i++) {
    const x0 = ((i + 0.5) / n + rng.range(-0.11, 0.11)) * W;
    const half = rng.range(P.half[0]!, P.half[1]!) * W;
    cs.push({
      x0, half,
      slope: ((L.cx - x0) / W) * P.lean * rng.range(0.4, 1.3) + rng.range(-0.08, 0.08),
      a1: rng.range(0.03, 0.085) * W, l1: rng.range(0.85, 1.6) * H, p1: rng.range(0, TAU),
      a2: rng.range(0.006, 0.02) * W, l2: rng.range(0.22, 0.42) * H, p2: rng.range(0, TAU),
      hue: rng.range(-1, 1), phase: rng.range(0, 1),
      hem: rng.range(-0.1, 0.1), reach: rng.range(0.55, 1.0), start: rng.range(0, 0.25),
    });
  }
  const used = cs.slice(0, n);

  const spine = (cu: Curtain, y: number, sway: number) =>
    cu.x0 + cu.slope * (y - H / 2)
    + cu.a1 * Math.sin((y / cu.l1) * TAU + cu.p1 + sway)
    + cu.a2 * Math.sin((y / cu.l2) * TAU + cu.p2 - sway * 1.7)
    + nz.n2(y * 0.0022, cu.x0 * 0.003) * cu.a1 * 0.6;

  const hemY = (cu: Curtain) => clamp(L.cy + cu.hem * H, H * 0.04, H * 0.96);
  const colAtRaw = (cu: Curtain, u: number): RGB => {
    // u: 0 at the bright hem → 1 far from it
    if (mono) return mix(mix(white, c.pal.glass, u * 0.7), c.pal.spark, 0.06 + 0.1 * cu.phase * (1 - u));
    if (spectral) return mix(c.pal.walk((cu.phase + u * 0.4) % 1), white, 0.18 * (1 - u));
    const base = adjust(c.pal.glass, { dh: cu.hue * P.hueSwing });
    const far = adjust(mix(c.pal.mid, c.pal.deep, 0.3), { dh: cu.hue * P.hueSwing * 1.5 });
    return u < 0.35 ? mix(mix(base, c.pal.light, 0.42), base, u / 0.35) : mix(base, far, (u - 0.35) / 0.65);
  };

  // colours are looked up from a small per-curtain table (the OKLab mixes are dear, and the same few are asked for hundreds of times)
  const table = new Map<Curtain, RGB[]>();
  const colAt = (cu: Curtain, u: number): RGB => {
    let t = table.get(cu);
    if (!t) { t = []; for (let i = 0; i <= 20; i++) t.push(colAtRaw(cu, i / 20)); table.set(cu, t); }
    return t[Math.round(clamp(u) * 20)]!;
  };
  const hemTable = new Map<Curtain, RGB>();
  const hemOf = (cu: Curtain): RGB => {
    let h = hemTable.get(cu);
    if (!h) { h = mix(colAtRaw(cu, 0), white, 0.18); hemTable.set(cu, h); }
    return h;
  };

  // ── draw: every curtain is a sheet of many soft vertical columns, each with its own brightness and hem ──
  const body = smallCanvas(c, 4);
  const fine = smallCanvas(c, P.fineDiv);
  body.g.globalCompositeOperation = 'lighter';
  fine.g.globalCompositeOperation = 'lighter';
  body.g.lineCap = 'butt';
  fine.g.lineCap = 'round';

  for (let ci = 0; ci < used.length; ci++) {
    const cu = used[ci]!;
    const f = smoothstep(cu.start * 0.6, cu.start * 0.6 + 0.7, k); // this curtain's own progress
    if (f <= 0.005) continue;
    const grow = 1 - Math.pow(1 - f, 2.2);
    const sway = (1 - f) * 0.9;
    const cols = P.columns;
    // (every column is drawn at any quality: they are cheap, and thinning them changes the light of the curtain)
    for (let j = 0; j < cols; j++) {
      // all draws first, so the stream is the same at any quality
      const u = ((j + rs()) / cols) * 2 - 1;
      const strength = rs.range(0.25, 1);
      const hemJ = rs.range(-1, 1);
      const reachJ = rs.range(0.6, 1.25);
      const wd = rs.range(0.7, 1.5);
      const acc = rs();
      const fx = rs.range(0.7, 1.3);
      const dirRand = rs() < 0.5 ? 1 : -1;
      const bell = Math.pow(Math.max(0, 1 - u * u), 0.7);
      const streak = 0.45 + 0.55 * (0.5 + 0.5 * nz.n2(u * 6.5 + cu.x0 * 0.01, ci * 3.7));
      const amp = bell * streak * strength;
      if (amp < 0.03) continue;
      const hy = clamp(hemY(cu) + hemJ * 0.05 * H, 0, H);
      const dirs = vert ? [dirSign] : [dirRand];
      for (const dir of dirs) {
        const span = cu.reach * reachJ * H * 0.9 * grow;
        const back = 0.07 * H;
        const ya = hy - dir * back, yb = hy + dir * span;
        const N = 14;
        const xs: number[] = [], ys: number[] = [];
        for (let q = 0; q <= N; q++) {
          const y = lerp(ya, yb, q / N);
          const fl = 1 + 0.34 * Math.sin((y / (0.36 * H)) * Math.PI + cu.p2) * fx;
          xs.push(spine(cu, y, sway) + u * cu.half * fl);
          ys.push(y);
        }
        const tHem = back / (back + span);
        const cHem = acc < 0.06 && !mono ? c.pal.spark : hemOf(cu);
        for (const [cv, wk, ak] of [[fine, wd, 1], [body, wd * 4.6, P.bodyK]] as const) {
          if (cv === body && j % 2) continue;
          const gr = cv.g.createLinearGradient(xs[0]!, ya, xs[N]!, yb);
          const A = P.streakA * amp * ak * P.opacity * (mono ? P.monoK : 1) * (0.35 + 0.65 * f);
          gr.addColorStop(0, css(cHem, 0));
          gr.addColorStop(clamp(tHem * 0.95, 0, 0.98), css(cHem, clamp(A * 0.55, 0, 1)));
          gr.addColorStop(clamp(tHem, 0.001, 0.99), css(cHem, clamp(A, 0, 1)));
          gr.addColorStop(clamp(tHem + (1 - tHem) * 0.18, 0.002, 0.995), css(colAt(cu, 0.2), clamp(A * 0.8, 0, 1)));
          gr.addColorStop(clamp(tHem + (1 - tHem) * 0.55, 0.003, 0.996), css(colAt(cu, 0.55), clamp(A * 0.32, 0, 1)));
          gr.addColorStop(1, css(colAt(cu, 1), 0));
          cv.g.strokeStyle = gr;
          cv.g.lineWidth = wk * S * cu.half * 0.021 * (cols / 64);
          cv.g.beginPath();
          cv.g.moveTo(xs[0]!, ys[0]!);
          for (let q = 1; q <= N; q++) cv.g.lineTo(xs[q]!, ys[q]!);
          cv.g.stroke();
        }
      }
    }

    // the hem: a soft luminous edge where the curtain is brightest
    for (let hgi = 0; hgi < 3; hgi++) {
      const t = (hgi + 0.5) / 3;
      const hy = hemY(cu) + (t - 0.5) * 0.06 * H;
      const hx = spine(cu, hy, sway) + (t - 0.5) * cu.half * 0.9;
      body.g.save();
      body.g.translate(hx, hy);
      body.g.scale(cu.half * 1.25, H * 0.045);
      const gr = body.g.createRadialGradient(0, 0, 0, 0, 0, 1);
      const cc = mix(colAt(cu, 0), white, 0.2);
      gr.addColorStop(0, css(cc, clamp(P.hemA * f * P.opacity * (mono ? P.monoK : 1), 0, 1)));
      gr.addColorStop(0.5, css(cc, clamp(P.hemA * f * P.opacity * (mono ? P.monoK : 1) * 0.35, 0, 1)));
      gr.addColorStop(1, css(cc, 0));
      body.g.fillStyle = gr;
      body.g.fillRect(-1, -1, 2, 2);
      body.g.restore();
    }
  }

  // ── leave the bloom clear: a soft hole around its heart, on both canvases ──
  for (const cv of [body, fine]) {
    const gg = cv.g;
    gg.globalCompositeOperation = 'destination-out';
    const r = R * P.holeR;
    const gr = gg.createRadialGradient(L.cx, L.cy, 0, L.cx, L.cy, r);
    gr.addColorStop(0, css([0, 0, 0], P.hole));
    gr.addColorStop(0.5, css([0, 0, 0], P.hole * 0.62));
    gr.addColorStop(1, css([0, 0, 0], 0));
    gg.fillStyle = gr;
    gg.fillRect(L.cx - r, L.cy - r, r * 2, r * 2);
  }
  blit(g, body.cv, c, 1, 'lighter');
  blit(g, fine.cv, c, 1, 'lighter');
}
