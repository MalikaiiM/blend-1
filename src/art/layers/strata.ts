// THE SHEETS — stacked, settled sheets of coloured glass in the dark sea: haloclines.
//
// Light does not drown in the Glass Sea, it settles: sheet on sheet, each a different age and colour, laid down so
// exactly that they never mix. The shimmer where two sheets meet is the halocline.
//
//   geometry  strata.geom.ts   the frame (rotated, or rings around the anchor), thickness rhythm, internal waves
//   body      strata.paint.ts  each sheet looks through itself at what lies beneath (refract, absorb, tint, edge-light)
//   lines     strata.lines.ts  crisp broken hairlines with a breath of glow, echoes, striations, caustics
//   growth    c.grow('strata'): sheets settle one by one from the anchor side, rising a little as they fade in;
//             the lines are brighter and shimmer more while young. Only tl.drift moves things afterwards.
//   glass     clear · stained · frosted · prismatic (see params.glass)
//   sealed    nothing here reads traits.bloom.*; only the un-sealed light (tl.bloom) warms the glass near the anchor.
import type { Cv, LayerFn } from './types.ts';
import { buildStack, type Stack } from './strata.geom.ts';
import { paintBody, type Look, type SheetInfo } from './strata.paint.ts';
import { drawDetails } from './strata.lines.ts';
import { css, mix, oklchToRgb, rgbToOklch, type RGB } from '../color.ts';
import { clamp, lerp, smootherstep, smoothstep } from '../math.ts';

export const render: LayerFn = (c) => {
  const P = c.P.layers.strata;
  const { w, h, pal, tl, traits } = c;
  const GK = P.glass[traits.body.glass]!;
  const CL = P.color;
  const GR = P.growth;
  const N = traits.body.sheets;
  const spectral = c.full.spectral;
  const mono = c.full.id === 'blackglass';

  const st: Stack = buildStack(c);
  const dimK = c.tone.dim * (1 + c.P.clock.pulseAmp * tl.pulse);

  // ── growth: who settles when ─────────────────────────────────────────
  const g = c.grow('strata');
  const rg = c.rng('strata/growth');
  const jit: number[] = [], rise: number[] = [];
  for (let i = 0; i < N; i++) { jit.push(rg.range(-1, 1)); rise.push(rg.range(GR.rise[0]!, GR.rise[1]!)); }
  const ranked = st.mid.map((m, i) => ({ i, d: Math.abs(m - st.anchorU) + 0.06 * h * jit[i]! })).sort((a, b) => a.d - b.d);
  const rank = new Array<number>(N).fill(0);
  ranked.forEach((r, k) => { rank[r.i] = k; });

  // ── tongues ──────────────────────────────────────────────────────────
  const rt = c.rng('strata/taper');
  const TG = P.stack.tongue;

  // ── colours ──────────────────────────────────────────────────────────
  const rs = c.rng('strata/color');
  const rampCol = (t: number): RGB => (t < 0.5 ? mix(pal.deep, pal.mid, t * 2) : mix(pal.mid, pal.glass, (t - 0.5) * 2));
  const Cref = rgbToOklch(pal.mid)[1];
  // the colour order is a property of the whole stack: draw it once
  const orderKind = (() => {
    const r = c.rng('strata/order');
    return r.weighted(P.stack.colorOrder);
  })();
  const pv0: number[] = [];
  const maxd = Math.max(1, ...st.mid.map((m) => Math.abs(m - st.anchorU)));
  for (let i = 0; i < N; i++) {
    const t = N > 1 ? i / (N - 1) : 0.5;
    let v: number;
    switch (orderKind) {
      case 'rise': v = t; break;
      case 'fall': v = 1 - t; break;
      case 'centre': v = 1 - Math.abs(2 * t - 1); break;
      case 'edge': v = Math.abs(2 * t - 1); break;
      case 'alt': v = i % 2 ? 0.18 : 0.86; break;
      default: v = 1 - Math.abs(st.mid[i]! - st.anchorU) / maxd;
    }
    pv0.push(v);
  }
  const pmin = Math.min(...pv0), pmax = Math.max(...pv0);
  const pv = pv0.map((v) => (pmax - pmin < 0.05 ? 0.5 : (v - pmin) / (pmax - pmin)));

  // hue travels across the stack — but yellows are pushed toward amber, never toward olive
  const midHue = rgbToOklch(pal.mid)[2];
  const hueSign = rs.sign();
  const hueSpan = lerp(CL.hueSpan[0]!, CL.hueSpan[1]!, rs.range(0, 1)) * (midHue > CL.warmHue[0]! && midHue < CL.warmHue[1]! ? -1 : hueSign);
  const rsp = c.rng('strata/spark');
  const hasSpark = mono || rsp() < CL.sparkChance;
  const sparkRank = rsp() < 0.6 ? 0 : 1;

  const sheets: SheetInfo[] = [];
  const order: number[] = [];
  for (let k = 0; k < N; k++) order.push(st.dir === 1 ? k : N - 1 - k);
  const ordOf = new Array<number>(N).fill(0);
  order.forEach((i, o) => { ordOf[i] = o; });

  for (let i = 0; i < N; i++) {
    // growth
    const start = GR.stagger * (N > 1 ? rank[i]! / (N - 1) : 0);
    const e = smootherstep(start, start + GR.span, g);
    const ghost = rank[i]! === 0 ? GR.ghost[0]! : rank[i]! === 1 ? GR.ghost[1]! : 0;
    const alpha = ghost + (1 - ghost) * e;
    const shift = st.frame.riseSign * rise[i]! * h * (1 - e);

    // tongue
    const roll = rt(), sidePick = rt(), va = rt(), vb = rt();
    let tpOn = false, tpA = -1, tpB = 2, tpF = 0.2;
    if (roll < TG.chance) {
      tpOn = true;
      if (st.frame.polar) {
        tpA = st.axisFr; tpB = lerp(TG.arc[0]!, TG.arc[1]!, va); tpF = lerp(TG.arcFade[0]!, TG.arcFade[1]!, vb);
      } else {
        const toward = sidePick < TG.towardAnchor;
        const highSide = toward ? st.anchorFr > 0.5 : st.anchorFr <= 0.5;
        tpF = lerp(TG.fade[0]!, TG.fade[1]!, vb);
        if (highSide) tpA = lerp(TG.from[0]!, TG.from[1]!, va); else tpB = lerp(TG.to[0]!, TG.to[1]!, va);
      }
    }

    // colour
    const jv = rs.range(-1, 1), jh = rs.range(-1, 1), jc = rs.range(0, 1), jt = rs.range(0, 1), jw = rs.range(0, 1);
    const p = clamp(pv[i]! + 0.07 * jv, 0, 1);
    const L0 = lerp(CL.lightness[0]!, CL.lightness[1]!, p) * GK.lift * dimK;
    let hueA: number, hueB: number, C: number;
    if (spectral) {
      const tw = clamp(0.02 + CL.spectralSpan * (N > 1 ? (order[0] === 0 ? i : N - 1 - i) / (N - 1) : 0.5) * 0.9 + 0.05 * jh);
      const wa = pal.walk(tw), wb = pal.walk(clamp(tw + CL.spectralAlong));
      hueA = rgbToOklch(wa)[2]; hueB = rgbToOklch(wb)[2];
      C = Math.max(0.03, rgbToOklch(wa)[1] * CL.spectralChroma * lerp(0.7, 0.95, jc)) * GK.chroma;
    } else {
      const base = rampCol(lerp(0.08, 0.8, p));
      const along = N > 1 ? (i / (N - 1)) * 2 - 1 : 0;
      hueA = rgbToOklch(base)[2] + CL.hueShift * jh + hueSpan * along * (mono ? 0.3 : 1) * 0.5;
      hueB = hueA + 4 * jw;
      C = Cref * lerp(CL.chroma[0]!, CL.chroma[1]!, jc) * GK.chroma * (mono ? CL.monoChroma : 1);
    }
    const dTop = CL.topLift * dimK, dBot = CL.bottomDeepen * dimK;
    const topA = oklchToRgb(L0 + dTop, C, hueA), botA = oklchToRgb(L0 - dBot, C * 1.06, hueA + 4);
    const topB = oklchToRgb(L0 + dTop, C, hueB), botB = oklchToRgb(L0 - dBot, C * 1.06, hueB + 4);
    const midT = mix(topA, botA, 0.5);
    const mx = Math.max(1, midT[0], midT[1], midT[2]);
    const filt: RGB = [midT[0] / mx, midT[1] / mx, midT[2] / mx];
    const bright = oklchToRgb(Math.min(0.82, (0.7 * dimK + 0.1) * (0.9 + 0.2 * p)), C * 1.3, hueA);
    const glassLight = mix(pal.glass, pal.light, CL.rimLightMix);
    const rim = spectral ? mix(oklchToRgb(0.82 * (0.4 + 0.6 * dimK), 0.11, hueA), pal.light, 0.15) : mix(glassLight, bright, CL.rimTint);
    const line = spectral
      ? mix(oklchToRgb(0.86 * (0.4 + 0.6 * dimK), 0.09, hueA), pal.light, 0.3)
      : mix(mix(mix(pal.glass, pal.light, P.lines.lightMix), bright, P.lines.sheetMix), pal.light, mono ? 0.2 : 0);
    const milk = oklchToRgb((CL.lightness[1]! + 0.08) * dimK, C * 0.75, hueA);
    const lit = oklchToRgb(Math.min(0.7, L0 + 0.12 * dimK), C * 1.1, hueA);

    const o: number[] = [];
    const ro = c.rng('strata/offs/' + i);
    for (let n = 0; n < 9; n++) o.push(ro.range(-40, 40));
    const B = st.B;
    const lo = new Float32Array(B[0]!.length), hi = new Float32Array(B[0]!.length);
    for (let j = 0; j < lo.length; j++) {
      if (st.dir === 1) { lo[j] = B[i]![j]!; hi[j] = B[i + 1]![j]! + st.OV[i]![j]!; }
      else { lo[j] = B[i]![j]! - st.OV[i]![j]!; hi[j] = B[i + 1]![j]!; }
    }
    sheets.push({
      i, ord: ordOf[i]!, lo, hi, frontLo: st.dir === 1,
      e, alpha, shift, refK: lerp(GR.youngRefract, 1, e),
      tpOn, tpA, tpB, tpF,
      tintAlpha: lerp(GK.tint[0]!, GK.tint[1]!, jt),
      topA, botA, topB, botB, filt, rim, milk, line, lit, o,
      spark: hasSpark && rank[i]! === sparkRank,
      ghostLine: rank[i]! === 0 ? P.lines.ghostLine[0]! : rank[i]! === 1 ? P.lines.ghostLine[1]! : 0,
      shC: (o[0]! * 0.137 + 0.5) - Math.floor(o[0]! * 0.137 + 0.5), shW: lerp(0.12, 0.3, (o[1]! * 0.11 + 0.5) - Math.floor(o[1]! * 0.11 + 0.5)),
    });
  }
  sheets.sort((a, b) => a.ord - b.ord);

  // ── the scene beneath (the abyss), on the small buffer ────────────────────
  const bw = Math.max(16, Math.min(w, c.quality === 'draft' ? P.res.draft : P.res.full));
  const bh = Math.max(8, Math.round((bw * h) / w));
  const sceneCv = c.makeCanvas(bw, bh);
  const sg = sceneCv.getContext('2d', { willReadFrequently: true })!;
  sg.imageSmoothingEnabled = true; sg.imageSmoothingQuality = 'high';
  sg.fillStyle = css(pal.void);
  sg.fillRect(0, 0, bw, bh);
  const below = c.below();
  if (below) sg.drawImage(below, 0, 0, bw, bh);
 
  const sd = sg.getImageData(0, 0, bw, bh).data;
  const scene0 = new Float32Array(bw * bh * 3);
  for (let k = 0, n = bw * bh; k < n; k++) { scene0[k * 3] = sd[k * 4]!; scene0[k * 3 + 1] = sd[k * 4 + 1]!; scene0[k * 3 + 2] = sd[k * 4 + 2]!; }

  const bloomLift = P.body.lit.bloom * smoothstep(0, 1, tl.bloom);
  const haze = mono ? mix(pal.glass, [255, 255, 255], 0.15) : pal.haze;
  const look: Look = { haze, hazeK: mono ? CL.monoHaze : 1, bloomLift };
 
  const small = paintBody(c, st, sheets, scene0, bw, bh, look);

  // ── upscale (twice, for a perfectly smooth body), then the fine detail on top ────
  const cv: Cv = c.makeCanvas();
  const cg = cv.getContext('2d')!;
  cg.imageSmoothingEnabled = true; cg.imageSmoothingQuality = 'high';
  const mw = bw * 2;
  if (mw < w) {
    const mid = c.makeCanvas(mw, Math.round((mw * h) / w));
    const mg = mid.getContext('2d')!;
    mg.imageSmoothingEnabled = true; mg.imageSmoothingQuality = 'high';
    mg.drawImage(small, 0, 0, mid.width, mid.height);
    cg.drawImage(mid, 0, 0, w, h);
  } else cg.drawImage(small, 0, 0, w, h);

 
  const FH = CL.fringe;
  const fringe: RGB[] = FH.hues.map((hu, k) => {
    const col = oklchToRgb(FH.lightness[k]!, FH.chroma, hu);
    const m = mix(col, pal.glass, FH.toGlass);
    const s = Math.pow(dimK, 0.8);
    return [m[0] * s, m[1] * s, m[2] * s] as RGB;
  });
  drawDetails({
    c, st, sheets, cv, bloomLift, fringe,
    lead: mix(pal.void, pal.deep, 0.3),
    spark: pal.spark,
  });

 
  return { id: 'strata', canvas: cv, ...P.compose };
};
