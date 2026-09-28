import type { Compose, Knob } from './types.ts';

/**
 * THE SHEETS — every magic number of the glass layer.
 * Plain JSON-serialisable data only (structuredClone'd for reset).
 * Lengths written "× H" are fractions of the frame height, "px" are design pixels (× S at render time).
 */
export const strataParams = {
  /** slider-able parameters the explainer exposes (2–4 per layer) */
  knobs: [
    { path: 'layers.strata.refraction', label: 'Refraction', min: 0, max: 2.2, step: 0.05 },
    { path: 'layers.strata.opacity', label: 'Sheet opacity', min: 0.4, max: 1.6, step: 0.05 },
    { path: 'layers.strata.waveAmp', label: 'Wave amplitude', min: 0, max: 2.2, step: 0.05 },
    { path: 'layers.strata.lineGlow', label: 'Line glow', min: 0, max: 2.2, step: 0.05 },
  ] as Knob[],
  compose: { blend: 'source-over', alpha: 1, parallax: 0.3 } as Compose,

  // ── the four sliders (1 = as designed) ─────────────────────────────
  /** how far the glass bends what lies beneath it */
  refraction: 1,
  /** tint strength of the sheet bodies */
  opacity: 1,
  /** internal-wave amplitude (the swell of every interface) */
  waveAmp: 1,
  /** brightness and bloom of the halocline lines */
  lineGlow: 1,

  // ── the small buffer: bodies are computed small and upscaled (free softness) ──
  res: { full: 250, draft: 168 },
  /** boundary samples along a sheet's length */
  samples: 420,

  // ── how the stack is laid ─────────────────────────────────────────
  stack: {
    /** stack thickness as a fraction of the across-extent of the frame */
    coverage: [0.66, 0.9],
    /** a sheet's thickness limits, × H */
    minThick: 0.085,
    maxThick: 0.34,
    /** how far a sheet dips under its neighbour, as a fraction of its own thickness */
    overlap: [0.2, 0.4],
    overlapWobble: 0.55,
    /** the stack's centre moves this fraction of the way from the frame centre to the anchor */
    lean: [0.3, 0.52],
    jitter: 0.03,
    /** radius of the open eye at the centre of a Nadir fan, × H */
    ringHole: [0.055, 0.12],
    /** soft floor between neighbouring boundaries after the waves, × H */
    minGap: 0.055,
    rhythm: [
      { v: 'even', w: 15 }, { v: 'swell', w: 22 }, { v: 'taper', w: 22 }, { v: 'pulse', w: 20 }, { v: 'ragged', w: 21 },
    ] as { v: string; w: number }[],
    /** painter's direction: +1 = top to bottom (lower sheets in front), −1 = the reverse */
    direction: [{ v: 1, w: 55 }, { v: -1, w: 45 }] as { v: number; w: number }[],
    /** colour order of the stack */
    colorOrder: [
      { v: 'rise', w: 20 }, { v: 'fall', w: 20 }, { v: 'centre', w: 18 }, { v: 'edge', w: 12 }, { v: 'alt', w: 12 }, { v: 'anchor', w: 18 },
    ] as { v: string; w: number }[],
  },

  // ── the internal waves ────────────────────────────────────────────
  waves: {
    count: [2, 3],
    /** amplitude of the first sinusoid, × H (later ones are weaker) */
    amp: [0.012, 0.03],
    /** cycles across the along-extent of the frame */
    freq: [0.6, 2.6],
    /** phase step between one boundary and the next (radians) */
    phaseStep: [0.25, 0.9],
    /** per-boundary amplitude variation (fraction) */
    ampSpread: 0.35,
    /** low-frequency noise added to every boundary, × H, and its cycles across the frame */
    noiseAmp: 0.014,
    noiseFreq: 1.35,
    /** radians per day of drift (frozen at the reveal) */
    phasePerDay: 0.021,
    /** interface kind → amplitude factor */
    kindAmp: { level: 1, leaning: 0.95, fan: 0.8, folded: 0.55 } as Record<string, number>,
    /** the big S-curves of a folded stack */
    fold: { amp: [0.075, 0.14], freq: [0.55, 1.05], second: 0.34, phaseStep: [0.1, 0.26] },
  },

  // ── how each interface kind lies (angles in degrees) ──────────────
  kinds: {
    level: { tilt: [-2.6, 2.6], fan: [0, 0.03] },
    leaning: { angle: [8, 24], fan: [0, 0.16] },
    folded: { tilt: [-9, 9] },
    fan: { margin: [0.16, 0.36], bend: [-0.32, 0.32], ringDrift: 0.035 },
  },

  /**
   * Horizon character, in the order Dawn · Dusk · Zenith · Nadir. Linear frames only —
   * fans get their lean from the anchor itself.
   *   bow    × H: negative lifts the sheets at the anchor, positive sags them
   *   droop  × H: sheets fall away toward the anchor side
   *   dome   × H: boundaries spread away from the stack centre around the anchor
   *   hem    × H: scalloped curtain hems (Zenith)
   *   tilt   degrees added to the base tilt (positive = descending toward +x)
   *   width  gaussian width of the bow along the sheet (fraction of the length)
   *   light  how strongly the sheets are lit near the anchor
   */
  horizon: [
    { bow: -0.05, droop: 0, dome: 0, hem: 0, tilt: 0, width: 0.4, light: 1.0 },
    { bow: 0, droop: 0.05, dome: 0, hem: 0, tilt: 3.4, width: 0.5, light: 1.0 },
    { bow: 0.05, droop: 0, dome: 0, hem: 0.03, tilt: 0, width: 0.46, light: 1.05 },
    { bow: 0, droop: 0, dome: 0.055, hem: 0, tilt: 0, width: 0.5, light: 1.1 },
  ],

  // ── growth: sheets settle one by one from the anchor side ───────────
  growth: {
    /** how far a sheet rises into place, × H, while it settles */
    rise: [0.025, 0.06],
    /** each sheet's window of the strata ramp (start spread, span) */
    stagger: 0.55,
    span: 0.45,
    /** faint ghost alphas of the first two sheets at the seed */
    ghost: [0.16, 0.05],
    /** young lines are brighter by up to this factor */
    youngLine: 0.7,
    /** young sheets refract less */
    youngRefract: 0.4,
  },

  // ── colour of the sheets (OKLab) ──────────────────────────────────
  color: {
    /** lightness range of a sheet's body colour, deepest to lightest */
    lightness: [0.16, 0.4],
    /** chroma relative to the palette's mid (medium saturation, 60–80 %) */
    chroma: [0.64, 0.8],
    /** lightness shift from a sheet's top edge to its bottom edge */
    topLift: 0.055,
    bottomDeepen: 0.075,
    hueShift: 7,
    /** mono palettes (Blackglass): how much chroma survives and the accent line */
    monoChroma: 0.55,
    /** chance of a single spark hairline in an ordinary palette; Blackglass always has one */
    sparkChance: 0.14,
    /** spectral palettes: chroma multiplier on the walked hue, and the hue-walk span across the stack */
    spectralChroma: 0.9,
    spectralSpan: 0.92,
    /** prismatic fringe hues (OKLCH degrees) and how far they mix toward the palette's glass */
    fringe: { hues: [212, 340, 92], chroma: 0.13, lightness: [0.82, 0.72, 0.9], toGlass: 0.22 },
  },

  // ── the four kinds of glass ───────────────────────────────────────
  //   tint      alpha of the body tint over the refracted view
  //   absorb    multiply-absorption of the view by the tint before mixing
  //   refract   × refraction strength;  blur px of the refracted view (frosted)
  //   milk      milky veil of the frosted glass
  //   dens      density mottling of the tint;  streak  bright striae ribbons in the body
  //   rim       [top, bottom] edge brightness;  rimW px falloff widths
  //   edgeDark  pigment pooling darkening at the edges (stained)
  //   inner     backlit emission in the body centre
  //   line      crisp-line gain;  glow   halo gain;  lineW width factor;  chroma  saturation factor
  //   disp      chromatic dispersion of the refracted view (prismatic)
  glass: {
    clear: { tint: [0.32, 0.44], absorb: 0.2, refract: 1, blur: 0, milk: 0, dens: 0.16, streak: 0.55, rim: [0.5, 0.2], rimW: [16, 30], edgeDark: 0, inner: 0.02, line: 1.05, glow: 1, lineW: 1, chroma: 0.95, disp: 0, striae: 1, caustic: 1 },
    stained: { tint: [0.6, 0.76], absorb: 0.62, refract: 0.55, blur: 0, milk: 0, dens: 0.42, streak: 0.18, rim: [0.26, 0.12], rimW: [12, 22], edgeDark: 0.3, inner: 0.13, line: 0.68, glow: 0.75, lineW: 0.9, chroma: 1.3, disp: 0, striae: 0.5, caustic: 0.25 },
    frosted: { tint: [0.34, 0.48], absorb: 0.1, refract: 0.4, blur: 26, milk: 0.34, dens: 0.24, streak: 0.06, rim: [0.42, 0.22], rimW: [40, 64], edgeDark: 0, inner: 0.05, line: 0.17, glow: 1.9, lineW: 2.2, chroma: 0.62, disp: 0, striae: 0.15, caustic: 0.1 },
    prismatic: { tint: [0.3, 0.42], absorb: 0.18, refract: 1.15, blur: 0, milk: 0, dens: 0.14, streak: 0.4, rim: [0.44, 0.2], rimW: [16, 30], edgeDark: 0, inner: 0.03, line: 0.85, glow: 0.9, lineW: 0.9, chroma: 0.92, disp: 0.42, striae: 0.7, caustic: 0.7 },
  } as Record<string, {
    tint: number[]; absorb: number; refract: number; blur: number; milk: number; dens: number; streak: number;
    rim: number[]; rimW: number[]; edgeDark: number; inner: number; line: number; glow: number; lineW: number;
    chroma: number; disp: number; striae: number; caustic: number;
  }>,

  // ── body shading ─────────────────────────────────────────────────
  body: {
    /** base refraction offset (px) along the sheet normal, and the along-thickness ramp */
    refract: 15,
    refractRamp: [0.55, 0.95],
    /** magnification of the refracted view about the anchor (fraction, > 0 = magnify) */
    magnify: 0.035,
    /** wobble of the refraction (fraction of it) */
    wobble: 0.55,
    /** noise wavelengths (px): streak along, streak across, mottle */
    streakAlong: 300, streakAcross: 64, mottle: 380,
    /** soft edge and bleed of the low-res coverage (in buffer pixels) */
    feather: 1.6, bleed: 1.3,
    /** how much of the milky/tint absorption piles up where two sheets overlap */
    doubleRich: 0.34,
    /** shadow a front sheet casts onto the one behind it: amount and reach (× H) */
    shadow: 0.2, shadowReach: 0.035,
    /** the tint gets more absorbing with depth in the sheet */
    depthTint: 0.32,
    /** light near the anchor: floor, gain, radius (× R) */
    lit: { floor: 0.58, gain: 0.55, radius: 1.05, bloom: 0.3 },
    /** noise-streak bright ribbons in the body */
    ribbonPow: 7, ribbonGain: 0.1,
    /** clamp of the body light-emission so sheets stay dark to mid */
    emitCap: 0.5,
  },

  // ── the halocline lines and the fine detail (full resolution) ───────
  lines: {
    /** crisp core width (px, × S but at least 1 device px) and alpha */
    width: 1.15, alpha: 0.6,
    /** echo of a sheet's back edge seen through the sheet in front */
    echoAlpha: 0.24, echoWidth: 0.8,
    /** the glow canvas is drawn at 1/glowScale resolution and upscaled */
    glowScale: 4,
    /** glow strokes: inner width, outer width (buffer px) and alphas */
    glowInner: [2.2, 0.075], glowOuter: [6.5, 0.028],
    /** run length (vertices) between alpha changes */
    run: 6,
    /** breakage of the lines by noise: threshold band and the alpha floor inside a gap */
    broken: [-0.1, 0.4], gapFloor: 0.16,
    breakFreq: 5.2,
    /** shimmer: amplitude, spatial cycles along the line, cycles per day of drift */
    shimmer: 0.42, shimmerFreq: 7.5, shimmerRate: 0.35,
    /** fraction of the light colour in a line (rest is glass) */
    lightMix: 0.38,
    /** how much of the sheet's own colour tints its line */
    sheetMix: 0.24,
    /** occlusion of earlier detail by the glass in front of it */
    occlude: 0.62,
    /** how far an echo is displaced by the glass in front (× refraction) */
    echoShift: 0.75,
    /** prismatic fringe offset (px) */
    fringe: 2.1,
    /** the spark hairline: alpha and width factor */
    spark: { alpha: 0.85, width: 1.3, glow: 2.4 },
  },

  striae: {
    /** faint hairline striations per sheet (drawn count scales with quality) */
    count: 34,
    alpha: [0.03, 0.085],
    width: [0.6, 1.5],
    length: [0.12, 0.62],
    dark: 0.4,
  },
  caustic: {
    /** soft bright ribbons per sheet, drawn into the glow canvas */
    count: 3,
    alpha: [0.05, 0.13],
    width: [1.8, 4.2],
    length: [0.25, 0.7],
    /** thin crisp filaments at full resolution */
    thin: 6, thinAlpha: [0.1, 0.26], thinLen: [0.05, 0.2],
  },
};
