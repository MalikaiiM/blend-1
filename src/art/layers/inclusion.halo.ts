// Halo Rings — thin rings of light around the bloom's heart. Some are whole, some dashed or broken, some strung
// with pearls; their radii follow a golden or harmonic progression and they fade outward. Each is a rim of glass:
// a soft caustic inside, a hair of chromatic dispersion either side of the line, a dark shadow line beyond it.

import type { LayerCtx } from './types.ts';
import { adjust, css, mix, type RGB } from '../color.ts';
import { clamp, lerp, smoothstep, TAU } from '../math.ts';
import { blit, bloomRadius, isMono, lean, lightOf, pearl, smallCanvas } from './inclusion.util.ts';

type Style = 'solid' | 'dashed' | 'broken' | 'beaded' | 'double' | 'ticks';

interface Ring {
  r: number;
  style: Style;
  w: number;
  a: number;
  phase: number;
  tint: number;
  dash: number;
  gap: number;
  arcs: [number, number][];
  beadStep: number;
  beadR: number;
  ex: number;
  ey: number;
  jag: number[];
}

const MAXR = 12;
const PHI = 1.6180339887;

export function drawHalo(c: LayerCtx, g: CanvasRenderingContext2D, k: number) {
  const P = c.P.layers.inclusion.halo;
  const L = c.lay;
  const S = c.S;
  const R = bloomRadius(c);
  const rng = c.rng('inclusion/halo');
  const nz = c.noise('inclusion/halo');
  const { hot, white } = lightOf(c);
  const mono = isMono(c);
  const spectral = c.full.spectral;

  // ── the progression ──
  const kind = rng.weighted([{ v: 'golden', w: 4 }, { v: 'harmonic', w: 3 }, { v: 'root', w: 2 }]);
  const r0 = R * rng.range(P.r0[0]!, P.r0[1]!);
  const nWant = clamp(Math.round(P.count) + rng.int(-1, 1), 2, MAXR);
  const reachMax = Math.hypot(c.w, c.h) * 1.05;
  const radii: number[] = [];
  for (let i = 0; i < MAXR; i++) {
    const r = kind === 'golden' ? r0 * Math.pow(PHI, i * 0.62) : kind === 'harmonic' ? r0 * (1 + i * 0.62) : r0 * Math.sqrt(1 + i * 1.35);
    radii.push(r);
  }
  const rings: Ring[] = [];
  const styles: { v: Style; w: number }[] = [
    { v: 'solid', w: 4 }, { v: 'dashed', w: 3 }, { v: 'broken', w: 3 }, { v: 'beaded', w: 3 }, { v: 'double', w: 2 }, { v: 'ticks', w: 1.2 },
  ];
  for (let i = 0; i < MAXR; i++) {
    const style: Style = i === 0 ? 'solid' : i === 1 && rng() < 0.5 ? 'double' : rng.weighted(styles);
    const arcs: [number, number][] = [];
    const na = rng.int(2, 4);
    let a0 = rng.range(0, TAU);
    for (let q = 0; q < na; q++) {
      const len = rng.range(0.45, 1.3) * (TAU / na) * 0.8;
      arcs.push([a0, a0 + len]);
      a0 += TAU / na + rng.range(-0.3, 0.3);
    }
    const jag: number[] = [];
    for (let q = 0; q < 24; q++) jag.push(rng());
    rings.push({
      r: radii[i]!, style,
      w: rng.range(P.px[0]!, P.px[1]!) * (1 - 0.35 * (i / MAXR)),
      a: 1, phase: rng.range(0, TAU), tint: rng.range(0, 1),
      dash: rng.range(9, 26), gap: rng.range(5, 13), arcs,
      beadStep: rng.range(15, 30), beadR: rng.range(1.3, 2.7),
      ex: rng.range(-1, 1), ey: rng.range(-1, 1), jag,
    });
  }
  const n = Math.min(nWant, rings.filter((rg) => rg.r < reachMax).length || 2);
  const visible = rings.slice(0, n);

  // ── light on the ring: it is brightest on the side the bloom opens toward ──
  const envAt = (ang: number, ring: Ring) => {
    const lean0 = lean(c, ang, P.leanFloor);
    const w = 0.72 + 0.28 * ring.jag[Math.floor(((ang / TAU + 1) % 1) * 24) % 24]!;
    return lean0 * w;
  };
  const cenOf = (i: number, ring: Ring): [number, number] => {
    // the rings drift a little along the bloom's axis and off-square, like rims seen at a slight angle
    const t = i / Math.max(1, n - 1);
    return [L.cx + L.ax * R * P.drift * t + ring.ex * 3 * S, L.cy + L.ay * R * P.drift * t + ring.ey * 3 * S];
  };
  const colorOf = (t: number, ring: Ring): RGB => {
    if (mono) return t < 0.01 ? mix(white, c.pal.spark, 0.55) : mix(white, c.pal.glass, t * 0.6);
    if (spectral) return mix(c.pal.walk(ring.tint * 0.6 + t * 0.4), white, 0.35 * (1 - t));
    return mix(mix(hot, white, 0.5), mix(c.pal.glass, hot, 0.3), Math.pow(t, 0.8));
  };

  // ── time: rings come out one after another, moving out to their radius ──
  const timing = (i: number) => {
    const s0 = 0.02 + (i / Math.max(1, n)) * 0.52;
    const t = smoothstep(s0, s0 + 0.34, k);
    return { a: t, rr: lerp(0.78, 1, 1 - Math.pow(1 - t, 3)) };
  };

  // 1 · the soft caustic band inside each ring (small canvas → free blur)
  {
    const sm = smallCanvas(c, 3);
    sm.g.globalCompositeOperation = 'lighter';
    sm.g.lineCap = 'butt';
    for (let i = 0; i < n; i++) {
      const rg = visible[i]!;
      const tm = timing(i);
      if (tm.a < 0.02) continue;
      const [cx, cy] = cenOf(i, rg);
      const r = rg.r * tm.rr;
      const t = i / Math.max(1, n - 1);
      const fall = Math.pow(1 - 0.85 * t, 1.3);
      const col = colorOf(t, rg);
      const seg = Math.max(28, Math.round((TAU * r) / (18 * S)));
      for (let j = 0; j < seg; j++) {
        const a0 = (j / seg) * TAU, a1 = ((j + 1.05) / seg) * TAU;
        const e = envAt((a0 + a1) / 2, rg);
        for (const [wk, ak] of P.glowBands as number[][]) {
          sm.g.lineWidth = wk! * S;
          sm.g.strokeStyle = css(col, clamp(ak! * e * fall * tm.a * P.glow, 0, 1));
          sm.g.beginPath();
          sm.g.arc(cx, cy, r - wk! * S * 0.3, a0, a1);
          sm.g.stroke();
        }
      }
    }
    blit(g, sm.cv, c, 1, 'lighter');
  }

  // 2 · the rings themselves
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.lineCap = 'round';
  const conic = typeof (g as any).createConicGradient === 'function';
  for (let i = 0; i < n; i++) {
    const rg = visible[i]!;
    const tm = timing(i);
    if (tm.a < 0.02) continue;
    const [cx, cy] = cenOf(i, rg);
    const r = rg.r * tm.rr;
    const t = i / Math.max(1, n - 1);
    const fall = Math.pow(1 - 0.8 * t, 1.25) * tm.a;
    const col = colorOf(t, rg);
    const core = mix(col, white, 0.45);
    const aBase = P.alpha * fall;

    // angular light on the line: one conic gradient, so the ring brightens smoothly toward the bloom's side
    const style = (a: number, cc: RGB): CanvasGradient | string => {
      if (!conic) return css(cc, clamp(a * 0.6, 0, 1));
      const cg = (g as any).createConicGradient(0, cx, cy) as CanvasGradient;
      const NS = 32;
      for (let j = 0; j <= NS; j++) {
        const ang = (j / NS) * TAU;
        cg.addColorStop(j / NS, css(cc, clamp(a * envAt(ang, rg), 0, 1)));
      }
      return cg;
    };

    g.setLineDash([]);
    const arcPath = (rr: number, ang0 = 0, ang1 = TAU) => { g.beginPath(); g.arc(cx, cy, rr, ang0, ang1); };

    if (rg.style === 'solid' || rg.style === 'double') {
      g.lineWidth = rg.w * S;
      g.strokeStyle = style(aBase, core);
      arcPath(r);
      g.stroke();
      if (rg.style === 'double') {
        g.lineWidth = rg.w * S * 0.7;
        g.strokeStyle = style(aBase * 0.7, col);
        arcPath(r + 3.6 * S);
        g.stroke();
      }
    } else if (rg.style === 'dashed') {
      g.lineWidth = rg.w * S;
      g.strokeStyle = style(aBase, core);
      g.setLineDash([rg.dash * S, rg.gap * S]);
      g.lineDashOffset = rg.phase * 40;
      arcPath(r);
      g.stroke();
      g.setLineDash([]);
      g.lineWidth = rg.w * S * 0.5;
      g.strokeStyle = style(aBase * 0.28, col);
      arcPath(r);
      g.stroke();
    } else if (rg.style === 'broken') {
      g.lineWidth = rg.w * S * 1.1;
      g.strokeStyle = style(aBase, core);
      for (const [a0, a1] of rg.arcs) {
        arcPath(r, a0, a1);
        g.stroke();
      }
      g.lineWidth = rg.w * S * 0.5;
      g.strokeStyle = style(aBase * 0.22, col);
      arcPath(r);
      g.stroke();
    } else if (rg.style === 'beaded') {
      g.lineWidth = rg.w * S * 0.6;
      g.strokeStyle = style(aBase * 0.34, col);
      arcPath(r);
      g.stroke();
      const nb = Math.max(8, Math.round((TAU * r) / (rg.beadStep * S)));
      const nbDraw = Math.ceil(nb * (c.q < 1 ? 0.75 : 1));
      for (let j = 0; j < nb; j++) {
        if (j >= nbDraw && j % 2) continue;
        const ang = (j / nb) * TAU + rg.phase;
        const e = envAt(ang, rg);
        const big = 0.55 + 0.9 * (0.5 + 0.5 * nz.n2(j * 0.9 + i * 7.3, i * 3.1));
        pearl(g, cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, rg.beadR * S * big, col, white, clamp(aBase * 1.25 * e, 0, 1));
      }
    } else {
      // ticks: a fine dial around a faint line
      g.lineWidth = rg.w * S * 0.6;
      g.strokeStyle = style(aBase * 0.5, col);
      arcPath(r);
      g.stroke();
      const nt = Math.max(24, Math.round((TAU * r) / (7 * S)));
      g.lineWidth = 0.7 * S;
      for (let j = 0; j < nt; j++) {
        const ang = (j / nt) * TAU + rg.phase;
        const e = envAt(ang, rg);
        const long = j % 5 === 0;
        const len = (long ? 7 : 3.4) * S;
        g.strokeStyle = css(core, clamp(aBase * (long ? 0.9 : 0.5) * e, 0, 1));
        g.beginPath();
        g.moveTo(cx + Math.cos(ang) * (r - len), cy + Math.sin(ang) * (r - len));
        g.lineTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
        g.stroke();
      }
    }
    g.setLineDash([]);

    // the rim of the glass: a hair of dispersion either side of the line, and a dark shadow beyond it
    if (rg.style !== 'ticks' && rg.style !== 'beaded') {
      const dsp = P.dispersePx * S;
      if (!mono) {
        for (const [sg, dh] of [[-1, -P.disperseHue], [1, P.disperseHue]] as const) {
          g.lineWidth = rg.w * S * 0.6;
          g.strokeStyle = style(aBase * P.disperseA, adjust(col, { dh }));
          arcPath(r + sg * dsp * (0.8 + rg.w * 0.3));
          g.stroke();
        }
      }
      g.globalCompositeOperation = 'source-over';
      g.lineWidth = rg.w * S * 1.5;
      g.strokeStyle = css([2, 1, 4], clamp(P.shadowA * fall, 0, 1));
      arcPath(r + rg.w * S * 1.5 + dsp * 1.2);
      g.stroke();
      g.globalCompositeOperation = 'lighter';
    }
  }
  g.restore();
}
