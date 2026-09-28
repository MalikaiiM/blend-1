// THE VEIL — foreground optics. The dust the light carries as it rises, seen up close.
//
// Bimodal in focus:
//   BOKEH  6–24 huge, out-of-focus discs. Brighter rim than centre, a hint of the lens's polygonal aperture,
//          a colour fringe, lit on the side that faces the bloom. Hugging the edges and the light.
//   DUST   150–1400 crisp motes, wildly uneven in brightness, streaming along the horizon's axis in beams
//          that run through the bloom, denser and brighter near it. A few carry tiny halos.
//   SPARKS rare motion-streaks along the flow; on Starfall a few large stars with four-point glints.
//
// It is drawn as emission ('lighter') on a transparent canvas and composed with 'screen'.
// Everything time-based hangs off c.grow('veil') and c.tl.drift (frozen at the reveal).
// Every random draw comes from a named stream, and ALL items are generated in a fixed order regardless
// of quality; draft draws the strongest ⌈N·q⌉ of them, so the composition matches.

import type { Cv, LayerCtx, LayerFn } from './types.ts';
import { adjust, css, type RGB } from '../color.ts';
import { clamp, lerp, smoothstep, TAU, DEG } from '../math.ts';
import type { Rng } from '../rng.ts';
import type { VeilKind } from './veil.params.ts';

const sq = (v: number) => v * v;
const mod = (n: number, m: number) => ((n % m) + m) % m;
const mixRGB = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function pickIndex(r: Rng, weights: readonly number[]): number {
  let tot = 0;
  for (const w of weights) tot += w;
  let x = r() * tot;
  for (let i = 0; i < weights.length; i++) {
    x -= weights[i]!;
    if (x < 0) return i;
  }
  return weights.length - 1;
}

// ─── flow: where things live and how they move ────────────────────────────
interface Flow {
  radial: boolean;
  w: number; h: number; cx: number; cy: number;
  ax: number; ay: number; nx: number; ny: number;
  /** linear: wrapped length along the axis, and total perpendicular extent (px) */
  L: number; Pt: number;
  /** radial: inner radius and wrapped span (px) */
  rmin: number; rspan: number;
  /** the anchor's perpendicular coordinate (px from the frame centre) */
  pA: number;
}
interface Pos { x: number; y: number; dx: number; dy: number; fade: number }

function makeFlow(c: LayerCtx, margin: number): Flow {
  const { w, h, lay } = c;
  const V = c.P.layers.veil;
  const ax = lay.ax, ay = lay.ay, nx = -ay, ny = ax;
  const Sw = Math.abs(w * ax) + Math.abs(h * ay);
  const Pw = Math.abs(w * ay) + Math.abs(h * ax);
  const corner = Math.max(
    Math.hypot(lay.cx, lay.cy), Math.hypot(w - lay.cx, lay.cy),
    Math.hypot(lay.cx, h - lay.cy), Math.hypot(w - lay.cx, h - lay.cy),
  );
  const rmin = lay.R * V.flow.radialHole;
  return {
    radial: lay.radial, w, h, cx: lay.cx, cy: lay.cy, ax, ay, nx, ny,
    L: Sw + 2 * margin, Pt: Pw + 2 * margin,
    rmin, rspan: Math.max(50, corner + margin - rmin),
    pA: (lay.cx - w / 2) * nx + (lay.cy - h / 2) * ny,
  };
}

/** s0 ∈ [0,1) along the flow, p = perpendicular (linear: −0.5..0.5 of the extent · radial: an angle), travel in px. */
function place(f: Flow, s0: number, p: number, travel: number, out: Pos): Pos {
  if (f.radial) {
    const r = f.rmin + mod(s0 * f.rspan + travel, f.rspan);
    const ca = Math.cos(p), sa = Math.sin(p);
    out.x = f.cx + ca * r; out.y = f.cy + sa * r; out.dx = ca; out.dy = sa;
    out.fade = smoothstep(0, 0.1 * f.rspan, r - f.rmin);
  } else {
    const s = mod(s0 * f.L + travel, f.L) - f.L / 2;
    const pp = p * f.Pt;
    out.x = f.w / 2 + f.ax * s + f.nx * pp;
    out.y = f.h / 2 + f.ay * s + f.ny * pp;
    out.dx = f.ax; out.dy = f.ay; out.fade = 1;
  }
  return out;
}

/** Perpendicular density (0..1): bands from noise, a beam through the bloom, and a floor of `flat`. */
function makeDensity(c: LayerCtx, f: Flow, flat: number, beamK: number): (p: number) => number {
  const nz = c.noise('veil/streams');
  const F = c.P.layers.veil.flow;
  if (f.radial) {
    return (a) => {
      const band = 0.5 + 0.5 * nz.fbm(Math.cos(a) * 1.7 + 5.2, Math.sin(a) * 1.7 + 9.1, F.bandOctaves);
      return flat + (1 - flat) * clamp(0.15 + 0.85 * band * band);
    };
  }
  return (p) => {
    const pp = p * f.Pt;
    const band = 0.5 + 0.5 * nz.fbm(p * F.bandFreq + 2.3, 7.1, F.bandOctaves);
    const beam = Math.exp(-sq((pp - f.pA) / (F.beamSigma * f.Pt)));
    const d = 0.16 + 0.44 * Math.pow(band, 1.3) + 0.6 * F.beam * beamK * beam;
    return flat + (1 - flat) * clamp(d);
  };
}

function sampleP(f: Flow, r: Rng, dens: (p: number) => number, tries = 5): number {
  let p = 0;
  for (let k = 0; k < tries; k++) {
    p = f.radial ? r() * TAU : r() - 0.5;
    if (r() < dens(p)) break;
  }
  return p;
}

// ─── items ────────────────────────────────────────────────────────────────
interface Bokeh {
  x0: number; y0: number; diam: number; strength: number; soft: number; alpha: number;
  centre: number; rim: number; lit: number; mottle: number; ap: number;
  fx: number; fy: number; fz: number; p1: number; p2: number; p3: number;
  colA: RGB; colB: RGB;
  sway: number; period: number; ph1: number; ph2: number;
  th: number; span: number; base: number; rank: number;
}
/** where a dust item lives: either field dust wrapping along the flow, or a plume rising out of the anchor */
interface Src { plume: boolean; s0: number; p: number; ang: number; speed: number }
interface Mote extends Src {
  sp: number; size: number; b: number; cs: number; tw: number;
  halo: boolean; flake: boolean; th: number; span: number; early: boolean; phase: number; rate: number; sw: number;
}
interface Streak extends Src {
  len: number; wid: number; jit: number; b: number; cs: number; th: number; span: number; rank: number;
}
interface Star {
  x0: number; y0: number; size: number; halo: number; b: number; cs: number; glint: number; arm: number; tilt: number;
  th: number; span: number; rank: number; sway: number; period: number; ph1: number; ph2: number;
}

/** ramp of an item's appearance with growth; `base` is how much already shows at the dim seed */
const appear = (g: number, th: number, span: number, base: number) => base + (1 - base) * smoothstep(th, th + span, g);

// ─── bokeh sprite ─────────────────────────────────────────────────────────
const EXT = 1.45;

function bokehSprite(c: LayerCtx, B: Bokeh, Rpx: number, focus: number, n: number, rot: number, lx: number, ly: number): Cv {
  const V = c.P.layers.veil, bs = V.bokehShape;
  const N = clamp(Math.round((2 * EXT * Rpx) / bs.cell), bs.minRes, bs.maxRes);
  const cv = c.makeCanvas(N, N);
  const g = cv.getContext('2d')!;
  const img = g.createImageData(N, N);
  const data = img.data;

  const seg = TAU / n, cosH = Math.cos(seg / 2);
  const soft = Math.min(0.55, B.soft + (1 - focus) * bs.unfocusSoft);
  const e0 = 1 - soft, e1 = 1 + soft * 0.7;
  const rimAmp = B.rim * Math.pow(focus, 1.6);
  const norm = 1 / (B.centre + B.rim);
  const rimAt = bs.rimAt, invW = 1 / bs.rimWidth;
  const halation = bs.halation, focusLoss = 0.5 * (1 - focus);
  const [ar, ag, ab] = B.colA, [br, bg, bb] = B.colB;
  const step = (2 * EXT) / N;
  const m = B.ap;

  for (let j = 0; j < N; j++) {
    const v = (j + 0.5) * step - EXT;
    for (let i = 0; i < N; i++) {
      const u = (i + 0.5) * step - EXT;
      const rr = Math.sqrt(u * u + v * v);
      if (rr >= EXT) continue;
      let dd = rr;
      if (m > 0.001) {
        let phi = (Math.atan2(v, u) - rot) % seg;
        if (phi < 0) phi += seg;
        phi -= seg / 2;
        dd = rr / (1 + m * (cosH / Math.cos(phi) - 1));
      }
      // soft outer edge (smoothstep e0 → e1, inverted)
      let e = (dd - e0) / (e1 - e0);
      e = e <= 0 ? 0 : e >= 1 ? 1 : e * e * (3 - 2 * e);
      const edge = 1 - e;
      const ring = rimAmp * Math.exp(-sq((dd - rimAt) * invW));
      const mott = 1 + B.mottle * (Math.sin(u * B.fx + B.p1) * Math.sin(v * B.fy + B.p2) + 0.5 * Math.sin((u + v) * B.fz + B.p3));
      const lit = 1 + B.lit * (u * lx + v * ly);
      const disc = clamp((B.centre + ring) * norm * mott * lit * edge);
      const hal = halation * (1 - smoothstep(0.5, EXT - 0.02, dd)) * (1 - focusLoss);
      const a = disc + hal * (1 - disc);
      let t = (dd - 0.5) / 0.52;
      t = t <= 0 ? 0 : t >= 1 ? 0.9 : 0.9 * t * t * (3 - 2 * t);
      const k = 4 * (j * N + i);
      data[k] = ar + (br - ar) * t;
      data[k + 1] = ag + (bg - ag) * t;
      data[k + 2] = ab + (bb - ab) * t;
      data[k + 3] = a * 255;
    }
  }
  g.putImageData(img, 0, 0);
  return cv;
}

// ─── the layer ────────────────────────────────────────────────────────────
export const render: LayerFn = (c) => {
  const V = c.P.layers.veil;
  const { w, h, S, lay, tl, pal } = c;
  const kind: VeilKind = V.kinds[c.traits.body.dust] ?? V.kinds.drifting!;
  const cv = c.makeCanvas();
  const g = cv.getContext('2d')!;
  g.globalCompositeOperation = 'lighter';
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';

  const grow = c.grow('veil');
  const days = tl.drift;
  const margin = V.frame.margin * S;
  const flow = makeFlow(c, margin);
  const aspect = w / h;
  const areaK = clamp(aspect / 0.8, V.frame.areaLo, V.frame.areaHi);
  const dens = clamp(V.dustDensity, 0, 4);
  const blackglass = c.full.id === 'blackglass';
  const spectral = c.full.spectral;

  // ── colour tables ──
  const slots: RGB[] = [pal.light, pal.glass, pal.bloomLight, pal.spark];
  const LUT: RGB[] = spectral ? Array.from({ length: 33 }, (_, i) => pal.walk(i / 32)) : [];
  const walkAt = (x: number, y: number, jitter: number): RGB => {
    const t = clamp(0.06 + 0.52 * (x / w) + 0.34 * (y / h) + 0.16 * jitter);
    return LUT[Math.round(t * 32)]!;
  };

  // ── the light: how much the bloom lifts the dust around it ──
  const L = V.light;
  const bloomK = smoothstep(0, 1, tl.bloom);
  const lightClass = c.traits.revealed ? lerp(1, L.lightClass[c.traits.bloom.light] ?? 1, bloomK) : 1;
  const reach = lay.R * (L.reach + L.reachBud * lay.bud);
  const clearScale = 0.5 + 0.5 * lay.bud;
  const clearA = lay.R * L.clear * clearScale, clearB = lay.R * L.clearEnd * clearScale;
  const lightAt = (x: number, y: number) => {
    const dx = x - lay.cx, dy = y - lay.cy;
    const dist = Math.hypot(dx, dy);
    const near = Math.exp(-L.sharp * sq(dist / reach));
    let front = 1;
    if (!flow.radial && dist > 1e-3) front = 0.55 + 0.45 * smoothstep(-0.45, 0.75, (dx * lay.ax + dy * lay.ay) / dist);
    const clear = lerp(L.floor, 1, smoothstep(clearA, clearB, dist));
    const boost = (1 + L.bloomLift * bloomK * near) * lightClass;
    return { near, w: (L.base + L.gain * near * front) * clear * boost, clear };
  };

  const pos: Pos = { x: 0, y: 0, dx: 1, dy: 0, fade: 1 };

  // ── resting places for the few, large things (bokeh, stars): near the light · hugging an edge · anywhere ──
  const unit = Math.min(w, h);
  const spot = (r: Rng, mode: number, hero: boolean, minR: number, out: [number, number]) => {
    let x = 0, y = 0;
    for (let tries = 0; tries < 6; tries++) {
      if (mode === 0) {
        const a = flow.radial ? r() * TAU : Math.atan2(lay.ay, lay.ax) + r.gauss() * lay.spread * 0.22;
        const d = lay.R * (0.3 + 0.75 * Math.pow(r(), 1.15));
        x = lay.cx + Math.cos(a) * d; y = lay.cy + Math.sin(a) * d;
      } else if (mode === 1) {
        const e = r() * 2 * (w + h);
        const inset = hero ? r.range(-0.06, 0.07) * unit : (-0.07 + 0.3 * sq(r())) * unit;
        if (e < w) { x = e; y = inset; }
        else if (e < w + h) { x = w - inset; y = e - w; }
        else if (e < 2 * w + h) { x = e - w - h; y = h - inset; }
        else { x = inset; y = e - 2 * w - h; }
      } else {
        x = r.range(-0.03, 1.03) * w; y = r.range(-0.03, 1.03) * h;
      }
      if (Math.hypot(x - lay.cx, y - lay.cy) > minR) break;
    }
    out[0] = x; out[1] = y;
    return out;
  };
  /** a slow, bounded sway around a resting place, along (and across) the flow */
  const swayed = (x0: number, y0: number, sway: number, period: number, ph1: number, ph2: number, out: [number, number]) => {
    let dirx = flow.ax, diry = flow.ay;
    if (flow.radial) {
      const d = Math.hypot(x0 - lay.cx, y0 - lay.cy) || 1;
      dirx = (x0 - lay.cx) / d; diry = (y0 - lay.cy) / d;
    }
    const ph = TAU * (days / period);
    const s1 = Math.sin(ph1 + ph), s2 = Math.sin(ph2 + ph * 0.73);
    out[0] = x0 + (dirx * s1 - diry * 0.5 * s2) * sway * S;
    out[1] = y0 + (diry * s1 + dirx * 0.5 * s2) * sway * S;
    return out;
  };
  const tmp: [number, number] = [0, 0];

  // ════════════════════════════════════════════════════════════════════════
  //  BOKEH
  // ════════════════════════════════════════════════════════════════════════
  {
    const bs = V.bokehShape;
    const lens = c.rng('veil/lens');
    const nRoll = lens.int(kind.bokeh[0], kind.bokeh[1]);
    // a wide frame gets more discs, and bigger ones, so it does not read as polka dots
    const nBokeh = clamp(Math.round(nRoll * Math.pow(areaK, bs.areaCount)), 4, 24);
    const wideK = Math.pow(areaK, bs.areaSize);
    const blades = lens.pick(bs.blades);
    const rot = lens.range(0, TAU);
    const apBase = lens.range(bs.aperture[0], bs.aperture[1]);
    const hotIdx = blackglass ? 1 % nBokeh : -1;
    // each seed leans its own way: mostly small or a few big discs, and one colour family a little favoured
    const skew = bs.skew * lens.range(bs.skewSeed[0], bs.skewSeed[1]);
    const colorW = bs.colors.slice();
    colorW[lens.int(0, 4)]! *= bs.favour;
    if (blackglass) colorW[5] = 0;

    const r = c.rng('veil/bokeh');
    const list: Bokeh[] = [];
    for (let i = 0; i < nBokeh; i++) {
      const rolled = pickIndex(r, bs.where);
      const hero = i < bs.heroes;
      spot(r, hero ? 1 : rolled, hero, lay.R * 0.27, tmp);
      const x = tmp[0], y = tmp[1];
      const u = r();
      const diam = hero ? lerp(bs.heroDiam[0], bs.heroDiam[1], u) : lerp(bs.diam[0], bs.diam[1], Math.pow(u, skew));
      const sizeN = (diam - bs.diam[0]) / (bs.diam[1] - bs.diam[0]);
      const strength = r();
      const styleRoll = r();
      const st = styleRoll < bs.glowChance ? bs.glow : styleRoll < bs.glowChance + bs.ringChance ? bs.ring : { centre: 1, rim: 1, soft: 1 };
      const soft = r.range(kind.bokehSoft[0], kind.bokehSoft[1]) * st.soft * lerp(bs.sizeSoft[0], bs.sizeSoft[1], sizeN);
      const ci = hotIdx === i ? 5 : pickIndex(r, colorW);
      const jit = r();
      const hueJit = r() < bs.hueJitter ? r.range(-bs.hueRange, bs.hueRange) : (r(), 0);
      const fringe = r.sign() * r.range(bs.fringeHue[0], bs.fringeHue[1]);
      const lit = r.range(bs.litSide[0], bs.litSide[1]);
      const mottle = r.range(bs.mottle[0], bs.mottle[1]);
      const ap = apBase * r.range(0.35, 1) * (kind.bokehSoft[0] > 0.2 ? 0.6 : 1);
      const fx = r.range(3, 7), fy = r.range(3, 7), fz = r.range(4, 9);
      const p1 = r.range(0, TAU), p2 = r.range(0, TAU), p3 = r.range(0, TAU);
      const sway = r.range(bs.sway[0], bs.sway[1]), period = r.range(bs.period[0], bs.period[1]);
      const ph1 = r.range(0, TAU), ph2 = r.range(0, TAU);
      const th = r.range(0.02, 0.62), span = r.range(0.26, 0.36);
      // the same light spread over a bigger disc is dimmer: small discs are brighter and crisper
      const alpha = lerp(bs.alpha[0], bs.alpha[1], strength) * lerp(bs.sizeGain[0], bs.sizeGain[1], sizeN) * (hero ? bs.heroGain : 1);
      const centre = r.range(bs.centre[0], bs.centre[1]) * st.centre;
      const rim = r.range(bs.rim[0], bs.rim[1]) * st.rim;
      // colour
      let colA: RGB;
      if (spectral && ci !== 5) colA = walkAt(x, y, jit - 0.5);
      else if (ci === 0) colA = pal.glass;
      else if (ci === 1) colA = pal.mid;
      else if (ci === 2) colA = spectral ? walkAt(x, y, jit - 0.5) : mixRGB(pal.light, pal.glass, bs.lightTint);
      else if (ci === 3) colA = pal.haze;
      else if (ci === 4) colA = pal.bloomLight;
      else colA = pal.spark;
      if (hueJit !== 0 && !blackglass) colA = adjust(colA, { dh: hueJit });
      // the deep, saturated "mid" glass needs a lift to glow
      if (ci === 1 && !spectral) colA = adjust(colA, { l: 1.35, c: 1.05 });
      else if (ci !== 2 && !blackglass) colA = adjust(colA, { c: bs.chromaBoost });
      const colB = adjust(colA, { dh: fringe, c: bs.fringeChroma });
      list.push({
        x0: x, y0: y, diam, strength, soft, alpha, centre, rim, lit, mottle, ap: ap > 0.04 ? ap : 0,
        fx, fy, fz, p1, p2, p3, colA, colB, sway, period, ph1, ph2, th, span, base: 0,
        rank: alpha * diam * (0.5 + strength),
      });
    }
    // strongest first: draft keeps the top ⌈N·q⌉, and the two strongest ghost in at the dim seed
    list.sort((a, b) => b.rank - a.rank);
    for (let i = 0; i < Math.min(bs.ghosts, list.length); i++) { list[i]!.base = bs.ghostAmount; list[i]!.th = 0.05; }
    // bokeh carry the low-frequency composition and are cheap, so draft keeps most of them
    const nDraw = Math.ceil(nBokeh * (bs.draftKeep + (1 - bs.draftKeep) * c.q));

    for (let i = 0; i < nDraw && i < list.length; i++) {
      const B = list[i]!;
      const pr = appear(grow, B.th, B.span, B.base);
      if (pr <= 0.003) continue;
      // resting place plus a slow sway along the flow
      swayed(B.x0, B.y0, B.sway, B.period, B.ph1, B.ph2, tmp);
      const x = tmp[0], y = tmp[1];

      const Rpx = 0.5 * B.diam * V.bokehSize * wideK * S * (1 + bs.unfocusRadius * (1 - pr));
      if (x < -Rpx * bs.cull || x > w + Rpx * bs.cull || y < -Rpx * bs.cull || y > h + Rpx * bs.cull) continue;

      const lt = lightAt(x, y);
      const k = Math.hypot(x - lay.cx, y - lay.cy) / lay.R;
      const coreDim = lerp(bs.coreFloor, 1, smoothstep(0.06, bs.coreClear, k / clearScale));
      const ba = clamp(B.alpha * V.bokehGlow * kind.bokehAlpha * lerp(0.7, 1.3, lt.near) * coreDim * (0.25 + 0.75 * pr) * (0.9 + 0.1 * lightClass * (1 + 0.5 * bloomK)), 0, 1);
      if (ba <= 0.004) continue;

      // direction to the light, for the lit side of the disc
      let lx = lay.cx - x, ly = lay.cy - y;
      const ll = Math.hypot(lx, ly) || 1;
      lx /= ll; ly /= ll;
      const sprite = bokehSprite(c, B, Rpx, pr, blades, rot, lx, ly);
      g.globalAlpha = ba;
      g.drawImage(sprite, x - EXT * Rpx, y - EXT * Rpx, 2 * EXT * Rpx, 2 * EXT * Rpx);
    }
    g.globalAlpha = 1;
  }

  // ── where a dust item is: field dust wraps along the flow · plume dust rises out of the anchor ──
  const PL = V.plume;
  const plumeLen = lay.R * PL.len;
  const plumeStart = lay.R * PL.start;
  const axisA = Math.atan2(lay.ay, lay.ax);
  const sigmaA = flow.radial ? 0 : lay.spread * PL.fan;
  const warp = c.noise('veil/plume');
  const locate = (it: Src, out: Pos): Pos => {
    if (!it.plume) return place(flow, it.s0, it.p, it.speed * S * days, out);
    const u = mod(it.s0 + (it.speed * S * days) / plumeLen, 1);
    const a = flow.radial ? it.p : axisA + it.ang * sigmaA;
    const d = plumeStart + (plumeLen - plumeStart) * u;
    const ca = Math.cos(a), sa = Math.sin(a);
    let x = lay.cx + ca * d, y = lay.cy + sa * d;
    const wf = PL.wanderFreq / S, wa = PL.wander * S * smoothstep(0, 0.25, u);
    x += warp.n2(x * wf + 3.1, y * wf + 8.7) * wa;
    y += warp.n2(x * wf + 41.3, y * wf + 17.9) * wa;
    out.x = x; out.y = y; out.dx = ca; out.dy = sa;
    out.fade = Math.pow(1 - u, PL.fade) * smoothstep(0, 0.06, u);
    return out;
  };
  const makeSrc = (r: Rng, plumeShare: number, dens: (p: number) => number): Src => {
    const s0 = r();
    const plume = r() < plumeShare;
    const ang = r.gauss();
    const p = plume ? (flow.radial ? r() * TAU : 0) : sampleP(flow, r, dens);
    return { plume, s0, p, ang, speed: 0 };
  };

  // ════════════════════════════════════════════════════════════════════════
  //  DUST
  // ════════════════════════════════════════════════════════════════════════
  const D = V.dust;
  const halo = (x: number, y: number, R: number, col: RGB, a: number, flat = false) => {
    if (a <= 0.004 || R < 0.6) return;
    g.setTransform(1, 0, 0, 1, x, y);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, R);
    if (flat) {
      gr.addColorStop(0, css(col, a * 0.75)); gr.addColorStop(0.5, css(col, a * 0.66));
      gr.addColorStop(0.82, css(col, a * 0.24)); gr.addColorStop(1, css(col, 0));
    } else {
      gr.addColorStop(0, css(col, a)); gr.addColorStop(0.16, css(col, a * 0.5));
      gr.addColorStop(0.42, css(col, a * 0.16)); gr.addColorStop(0.74, css(col, a * 0.04)); gr.addColorStop(1, css(col, 0));
    }
    g.fillStyle = gr;
    g.fillRect(-R, -R, 2 * R, 2 * R);
    g.setTransform(1, 0, 0, 1, 0, 0);
  };

  {
    const nMotes = clamp(Math.round(kind.motes * areaK * dens), 0, D.maxMotes);
    const r = c.rng('veil/dust');
    const density = makeDensity(c, flow, kind.flat, 1);
    const motes: Mote[] = [];
    for (let i = 0; i < nMotes; i++) {
      const src = makeSrc(r, kind.plume, density);
      const b = Math.pow(r(), kind.moteGamma);
      const sp = r();
      const size0 = lerp(kind.moteSize[0], kind.moteSize[1], Math.pow(r(), 1.8)) * (0.6 + 0.55 * b);
      const cs = pickIndex(r, src.plume ? PL.colors : kind.colors);
      const tw = r();
      const halo_ = r() < kind.halo + 0.3 * b;
      const flake = r() < kind.flakes;
      const th = r.range(D.appear[0], D.appear[1]), span = r.range(D.span[0], D.span[1]);
      const early = r() < D.early;
      const phase = r(), rate = r.range(D.twinkleRate[0], D.twinkleRate[1]);
      const sw = r() * TAU;
      src.speed = lerp(kind.speed[0], kind.speed[1], sp);
      motes.push({
        ...src, sp, size: flake ? lerp(D.flakeSize[0], D.flakeSize[1], sq(sp)) : size0,
        b: flake ? 0.4 : b, cs, tw, halo: halo_, flake, th, span, early, phase, rate, sw,
      });
    }
    // brightest first: draft keeps the strongest ⌈N·q⌉
    const order = motes.map((m, i) => i).sort((a, b2) => (motes[b2]!.b * (0.6 + motes[b2]!.size) - motes[a]!.b * (0.6 + motes[a]!.size)) || a - b2);
    const nDraw = Math.ceil(nMotes * c.q);

    for (let oi = 0; oi < nDraw; oi++) {
      const m = motes[order[oi]!]!;
      const pr = appear(grow, m.th, m.span, m.early ? D.earlyAmount : 0);
      if (pr <= 0.003) continue;
      locate(m, pos);
      let x = pos.x, y = pos.y;
      if (kind.sway > 0) {
        const sw = Math.sin(m.sw + TAU * days * 0.32) * kind.sway * S;
        x += -pos.dy * sw; y += pos.dx * sw;
      }
      if (x < -8 || x > w + 8 || y < -8 || y > h + 8) continue;
      const lt = lightAt(x, y);
      const base: RGB = spectral && m.cs !== 0 && m.cs !== 3 ? walkAt(x, y, m.tw - 0.5) : slots[m.cs]!;
      const twk = 1 - D.twinkle * (0.5 + 0.5 * Math.sin(TAU * (m.phase + m.rate * days))) * smoothstep(0.35, 0.75, m.b);
      const a0 = (D.a0 + D.a1 * m.b) * lt.w * pos.fade * kind.bright * V.brilliance * pr * twk;
      if (a0 <= 0.004) continue;

      if (m.flake) {
        const R = m.size * S * (0.6 + 0.4 * pr);
        halo(x, y, R, mixRGB(base, pal.light, 0.35), clamp(D.flakeAlpha * lt.w * pos.fade * V.brilliance * pr * kind.bright, 0, 0.6), true);
        continue;
      }
      const col = m.b > 0.25 ? mixRGB(base, pal.light, D.whiten * Math.pow(m.b, 0.8)) : base;
      let rpx = m.size * S * (0.75 + 0.25 * pr);
      let a = a0;
      if (rpx < D.minPx) { a *= rpx / D.minPx; rpx = D.minPx; }
      a = clamp(a, 0, 1);
      // tiny soft halo for the special ones — and the light scatters off everything near the bloom
      if (m.halo || lt.near * m.b > 0.16) {
        const R = rpx * lerp(D.haloMin, D.haloMax, m.b);
        halo(x, y, R, base, clamp(a * D.haloAlpha * (0.5 + m.b) * (m.halo ? 1 : 0.6), 0, 0.5));
      }
      g.fillStyle = css(col, a);
      g.beginPath();
      const el = 1 + kind.elong * (m.sp * 0.75 + 0.25) * (1 - m.b * 0.3);
      if (el > 1.3 && rpx >= 0.55) {
        const se = Math.sqrt(el);
        g.ellipse(x, y, rpx * se, rpx / se, Math.atan2(pos.dy, pos.dx), 0, TAU);
      } else g.arc(x, y, rpx, 0, TAU);
      g.fill();
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  //  SPARKS — motion streaks
  // ════════════════════════════════════════════════════════════════════════
  {
    const SK = V.streak;
    const r = c.rng('veil/streak');
    const nRoll = r.int(kind.streaks[0], kind.streaks[1]);
    const n = kind.streaks[1] > 0 ? Math.round(nRoll * areaK * clamp(dens, 0.5, 2)) : 0;
    const density = makeDensity(c, flow, 0.15, SK.beam);
    const lenR = kind.streaks[0] >= 10 ? SK.lenStarfall : SK.len;
    const list: Streak[] = [];
    for (let i = 0; i < n; i++) {
      const src = makeSrc(r, Math.min(0.9, kind.plume + 0.3), density);
      const len = lerp(lenR[0], lenR[1], Math.pow(r(), 1.5));
      const wid = r.range(SK.width[0], SK.width[1]);
      const jit = r.gauss() * SK.jitter * DEG;
      const b = r.range(SK.alpha[0], SK.alpha[1]);
      const cs = pickIndex(r, SK.colors);
      const th = r.range(0.05, 0.66), span = r.range(0.22, 0.32);
      src.speed = lerp(kind.speed[0], kind.speed[1], r());
      list.push({ ...src, len, wid, jit, b, cs, th, span, rank: b * len });
    }
    list.sort((a, b) => b.rank - a.rank);
    const nDraw = Math.ceil(n * c.q);
    for (let i = 0; i < nDraw; i++) {
      const s = list[i]!;
      const pr = appear(grow, s.th, s.span, 0);
      if (pr <= 0.003) continue;
      locate(s, pos);
      const { x, y } = pos;
      if (x < -20 || x > w + 20 || y < -20 || y > h + 20) continue;
      const lt = lightAt(x, y);
      const a = clamp(s.b * (0.4 + 0.75 * lt.w) * (0.35 + 0.65 * pos.fade) * pr * V.brilliance, 0, 1);
      if (a <= 0.01) continue;
      const base: RGB = s.cs === 0 ? pal.spark : s.cs === 1 ? pal.light : spectral ? walkAt(x, y, 0) : pal.glass;
      const hot = mixRGB(base, pal.light, 0.55);
      const ang = Math.atan2(pos.dy, pos.dx) + s.jit;
      const ux = Math.cos(ang), uy = Math.sin(ang);
      const L2 = s.len * S * (0.55 + 0.45 * pr);
      const tx = x - ux * L2, ty = y - uy * L2;
      const half = 0.5 * s.wid * S;
      const gr = g.createLinearGradient(tx, ty, x, y);
      gr.addColorStop(0, css(base, 0));
      gr.addColorStop(0.55, css(base, a * 0.22));
      gr.addColorStop(0.92, css(hot, a * 0.8));
      gr.addColorStop(1, css(hot, a));
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(tx, ty);
      g.lineTo(x - uy * half, y + ux * half);
      g.lineTo(x + ux * half * 0.8, y + uy * half * 0.8);
      g.lineTo(x + uy * half, y - ux * half);
      g.closePath();
      g.fill();
      // bright head with a small halo
      g.fillStyle = css(hot, a);
      g.beginPath(); g.arc(x, y, Math.max(0.55, half * 1.05), 0, TAU); g.fill();
      halo(x, y, half * 9 + 3 * S, base, a * 0.24);
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  //  STARS — Starfall only: a few large stars, some with four-point glints
  // ════════════════════════════════════════════════════════════════════════
  if (kind.stars[1] > 0) {
    const ST = V.star;
    const r = c.rng('veil/star');
    const nRoll = r.int(kind.stars[0], kind.stars[1]);
    const n = Math.round(nRoll * areaK * clamp(dens, 0.6, 1.6));
    const list: Star[] = [];
    for (let i = 0; i < n; i++) {
      const mode = pickIndex(r, ST.where);
      spot(r, mode, false, lay.R * ST.minReach, tmp);
      const x0 = tmp[0], y0 = tmp[1];
      const size = r.range(ST.size[0], ST.size[1]);
      const halo_ = r.range(ST.halo[0], ST.halo[1]);
      const b = r.range(0.62, 1);
      const cs = pickIndex(r, [55, 25, 12, 8]);
      const arm = r.range(ST.glintLen[0], ST.glintLen[1]);
      const tilt = r.range(-ST.tilt, ST.tilt) * DEG;
      const th = r.range(0.1, 0.7), span = r.range(0.22, 0.3);
      const sway = r.range(ST.sway[0], ST.sway[1]), period = r.range(ST.period[0], ST.period[1]);
      const ph1 = r.range(0, TAU), ph2 = r.range(0, TAU);
      list.push({ x0, y0, size, halo: halo_, b, cs, glint: 0, arm, tilt, th, span, sway, period, ph1, ph2, rank: b * arm + size });
    }
    list.sort((a, b) => b.rank - a.rank);
    for (let i = 0; i < Math.min(kind.glints, list.length); i++) list[i]!.glint = i < ST.diagonals ? 2 : 1;
    const nDraw = Math.ceil(n * c.q);
    for (let i = 0; i < nDraw; i++) {
      const s = list[i]!;
      const pr = appear(grow, s.th, s.span, 0);
      if (pr <= 0.003) continue;
      swayed(s.x0, s.y0, s.sway, s.period, s.ph1, s.ph2, tmp);
      const x = tmp[0], y = tmp[1];
      if (x < -60 || x > w + 60 || y < -60 || y > h + 60) continue;
      const lt = lightAt(x, y);
      const a = clamp(s.b * (0.7 + 0.3 * Math.min(1, lt.w)) * pr * V.brilliance, 0, 1);
      const base: RGB = s.cs === 0 ? pal.light : s.cs === 1 ? (spectral ? walkAt(x, y, 0) : pal.glass) : s.cs === 2 ? pal.bloomLight : pal.spark;
      const hot = mixRGB(base, [255, 255, 255], 0.35);
      halo(x, y, s.halo * S * (0.6 + 0.4 * pr), base, a * 0.5);
      g.fillStyle = css(hot, a);
      g.beginPath(); g.arc(x, y, s.size * S * (0.7 + 0.3 * pr), 0, TAU); g.fill();
      if (s.glint) {
        const arm = s.arm * S * (0.5 + 0.5 * pr);
        const wd = ST.glintWidth * S;
        g.save();
        g.translate(x, y);
        g.rotate(s.tilt);
        const arms = s.glint === 2 ? 2 : 1;
        for (let k = 0; k < 2 * arms; k++) {
          const diag = k >= 2;
          const L2 = diag ? arm * 0.42 : arm;
          const aa = diag ? a * 0.5 : a * 0.9;
          g.save();
          g.rotate((diag ? Math.PI / 4 : 0) + (k % 2) * (Math.PI / 2));
          const gr = g.createLinearGradient(-L2, 0, L2, 0);
          gr.addColorStop(0, css(hot, 0));
          gr.addColorStop(0.36, css(hot, aa * 0.14));
          gr.addColorStop(0.5, css(hot, aa));
          gr.addColorStop(0.64, css(hot, aa * 0.14));
          gr.addColorStop(1, css(hot, 0));
          g.fillStyle = gr;
          g.beginPath();
          g.moveTo(-L2, 0); g.lineTo(0, wd * (diag ? 0.7 : 1)); g.lineTo(L2, 0); g.lineTo(0, -wd * (diag ? 0.7 : 1));
          g.closePath();
          g.fill();
          g.restore();
        }
        g.restore();
      }
    }
  }

  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
  return { id: 'veil', canvas: cv, ...V.compose };
};
