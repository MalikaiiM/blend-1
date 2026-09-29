import type { Compose, Knob } from './types.ts';

/**
 * THE SHEETS — every magic number of the glass layer.
 * Plain JSON-serialisable data only (structuredClone'd for reset).
 * Lengths written "× H" are fractions of the frame height, "px" are design pixels (× S at render time),
 * "buffer px" are pixels of the small (≈250 px wide) working buffer that is upscaled at the end.
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
    /** some sheets are tongues that reach in from one side and fade out */
    tongue: { chance: 0.34, from: [0.14, 0.5], to: [0.5, 0.86], fade: [0.1, 0.26], towardAnchor: 0.72, arc: [0.3, 0.44], arcFade: [0.06, 0.14] },
  },

  // ── the internal waves ────────────────────────────────────────────
  waves: {
    count: [2, 3],
    /** amplitude of the first sinusoid, × H (later ones are weaker) */
    amp: [0.010, 0.024],
    /** cycles across the along-extent of the frame */
    freq: [0.6, 2.6],
    /** phase step between one boundary and the next (radians) */
    phaseStep: [0.25, 0.9],
    /** per-boundary amplitude variation (fraction) */
    ampSpread: 0.35,
    /** low-frequency noise added to every boundary, × H, and its cycles across the frame */
    noiseAmp: 0.011,
    noiseFreq: 1.35,
    /** tiny irregularities on the edge: amplitude × H and cycles */
    ripple: { amp: 0.0022, freq: [7, 11] },
    /** radians per day of drift (frozen at the reveal) */
    phasePerDay: 0.021,
    /** interface kind → amplitude factor */
    kindAmp: { level: 1, leaning: 0.95, fan: 0.8, folded: 0.55 } as Record<string, number>,
    /** the big S-curves of a folded stack */
    fold: { amp: [0.12, 0.21], freq: [0.7, 1.3], second: 0.34, phaseStep: [0.1, 0.26] },
  },

  // ── how each interface kind lies (angles in degrees) ──────────────
  kinds: {
    level: { tilt: [-2.6, 2.6], fan: [0, 0.03] },
    leaning: { angle: [8, 24], fan: [0, 0.16] },
    /** folded drapery: the shear that makes waves lean over (× H) and its wavelength across the stack (× H) */
    folded: { tilt: [-9, 9], shear: [0.09, 0.18], shearWave: [0.5, 0.95] },
    /** back: how far behind the anchor the rings are centred (× H); asp: ring squash; egg: bulge toward the axis (× H);
     *  inner: how far inside the anchor the first ring begins (× H); ringDrift: ring wobble */
    fan: { back: [0, 0.5], asp: [0.86, 1.18], egg: [0.02, 0.06], inner: [0, 0.25], ringDrift: 0.004 },
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
   */
  horizon: [
    { bow: -0.05, droop: 0, dome: 0, hem: 0, tilt: 0, width: 0.4 },
    { bow: 0, droop: 0.05, dome: 0, hem: 0, tilt: 3.4, width: 0.5 },
    { bow: 0.05, droop: 0, dome: 0, hem: 0.04, tilt: 0, width: 0.46 },
    { bow: 0, droop: 0, dome: 0.055, hem: 0, tilt: 0, width: 0.5 },
  ],

  // ── growth: sheets settle one by one from the anchor side ───────────
  growth: {
    /** how far a sheet rises into place, × H, while it settles */
    rise: [0.025, 0.06],
    /** each sheet's window of the strata ramp (start spread, span) */
    stagger: 0.55,
    span: 0.45,
    /** faint ghost alphas of the first two sheets at the seed */
    ghost: [0.3, 0.1],
    /** young sheets refract less */
    youngRefract: 0.4,
  },

  // ── colour of the sheets (OKLab) ──────────────────────────────────
  color: {
    /** lightness range of a sheet's body colour, deepest to lightest (deep jewel tones: the sea is dark, the bloom is not) */
    lightness: [0.12, 0.32],
    /** chroma relative to the palette's mid (medium saturation, 60–80 %) */
    chroma: [0.74, 0.94],
    /** lightness shift from a sheet's top edge to its bottom edge */
    topLift: 0.055,
    bottomDeepen: 0.075,
    hueShift: 8,
    /** the hue travels this many degrees (from…to, either direction) across the stack */
    hueSpan: [40, 70],
    /** palettes whose mid hue lies in this range (yellow-olive) always travel toward amber */
    warmHue: [55, 108],
    /** mono palettes (Blackglass): how much chroma survives, and how much horizon haze */
    monoChroma: 0.55,
    monoHaze: 0.3,
    /** chance of a single spark hairline in an ordinary palette; Blackglass always has one */
    sparkChance: 0.14,
    /** spectral palettes: chroma multiplier on the walked hue, and the hue-walk span across the stack */
    spectralChroma: 0.9,
    spectralSpan: 0.92,
    spectralAlong: 0.14,
    /** prismatic fringe hues (OKLCH degrees) and how far they mix toward the palette's glass */
    fringe: { hues: [212, 340, 92], chroma: 0.13, lightness: [0.82, 0.72, 0.9], toGlass: 0.22 },
    /** rim and line colours: glass→light mix, and how much of the sheet's own hue they keep */
    rimLightMix: 0.3, rimTint: 0.3,
  },

  // ── the four kinds of glass ───────────────────────────────────────
  //   tint      alpha of the body tint over the refracted view
  //   absorb    multiply-absorption of the view by the tint before mixing
  //   refract   × refraction strength;  blur px of the refracted view (frosted)
  //   milk      milky veil of the frosted glass
  //   dens      density mottling of the tint;  streak  bright striae ribbons in the body
  //   rim       [front, back] edge brightness;  rimW px falloff widths
  //   edgeDark  pigment pooling darkening at the edges (stained)
  //   inner     backlit emission in the body centre
  //   line      crisp-line gain;  glow   halo gain;  lineW width factor;  chroma  saturation factor
  //   disp      chromatic dispersion of the refracted view (prismatic)
  //   lift      × lightness of the sheet colours
  glass: {
    clear: { tint: [0.3, 0.42], absorb: 0.2, refract: 1, blur: 0, milk: 0, dens: 0.16, streak: 0.55, rim: [0.38, 0.15], rimW: [16, 30], edgeDark: 0, inner: 0.02, line: 1.05, glow: 1, lineW: 1, chroma: 0.95, disp: 0, striae: 1, caustic: 1, lift: 1, soft: 1, sheen: 1, lamina: 1, frost: 0, bubbles: 1 },
    stained: { tint: [0.5, 0.68], absorb: 0.62, refract: 0.55, blur: 0, milk: 0, dens: 0.42, streak: 0.18, rim: [0.26, 0.12], rimW: [12, 22], edgeDark: 0.3, inner: 0.13, line: 0.68, glow: 0.75, lineW: 0.9, chroma: 1.3, disp: 0, striae: 0.5, caustic: 0.25, lift: 0.9, soft: 1, sheen: 0.5, lamina: 1.3, frost: 0, bubbles: 1.5 },
    frosted: { tint: [0.34, 0.48], absorb: 0.1, refract: 0.4, blur: 26, milk: 0.34, dens: 0.24, streak: 0.06, rim: [0.6, 0.3], rimW: [40, 64], edgeDark: 0, inner: 0.05, line: 0.17, glow: 3.0, lineW: 2.2, chroma: 0.86, disp: 0, striae: 0.15, caustic: 0.1, lift: 1.05, soft: 2.6, sheen: 0.2, lamina: 0.3, frost: 0.06, bubbles: 0.2 },
    prismatic: { tint: [0.3, 0.42], absorb: 0.18, refract: 1.15, blur: 0, milk: 0, dens: 0.14, streak: 0.4, rim: [0.44, 0.2], rimW: [16, 30], edgeDark: 0, inner: 0.03, line: 0.85, glow: 0.9, lineW: 0.9, chroma: 0.92, disp: 0.42, striae: 0.7, caustic: 0.7, lift: 1, soft: 1, sheen: 1.7, lamina: 0.9, frost: 0, bubbles: 0.8 },
  } as Record<string, {
    tint: number[]; absorb: number; refract: number; blur: number; milk: number; dens: number; streak: number;
    rim: number[]; rimW: number[]; edgeDark: number; inner: number; line: number; glow: number; lineW: number;
    chroma: number; disp: number; striae: number; caustic: number; lift: number; soft: number; sheen: number; lamina: number; frost: number; bubbles: number;
  }>,

  // ── body shading ─────────────────────────────────────────────────
  body: {
    /** base refraction offset (px) along the sheet normal, and the along-thickness ramp */
    refract: 36,
    refractRamp: [0.55, 0.95],
    /** magnification of the refracted view about the anchor (fraction, > 0 = magnify) */
    magnify: 0.055,
    /** wobble of the refraction (fraction of it) */
    wobble: 0.55,
    /** noise wavelengths (px): streak along, streak across, mottle, broad brightness drift */
    streakAlong: 300, streakAcross: 64, mottle: 380, broad: 700,
    /** soft edge (front) and bleed (back, under the neighbour) of the low-res coverage, in buffer pixels */
    feather: 1.5, bleed: 2.4,
    /** how much of the absorption / darkness piles up where two sheets overlap */
    doubleRich: 0.34, doubleDark: 0.12,
    /** shadow a front sheet casts onto the one behind it: amount and reach (× H) */
    shadow: 0.35, shadowReach: 0.04,
    /** the tint gets more absorbing with depth in the sheet */
    depthTint: 0.32,
    /** light near the anchor: floor, gain, radius (× R), extra while the bloom opens, horizon haze mixed into the tint */
    lit: { floor: 0.28, gain: 0.72, radius: 1.05, bloom: 0.25, haze: 0.16 },
    /** luminance shoulder (0..255): the body's brightness saturates toward cap, the knee is this fraction of it */
    cap: 84, knee: 0.55,
    /** how much of the tint is emitted (backlit) rather than merely filtering the view */
    emit: 0.6,
    /** broad polished sheen */
    sheen: 0.09,
    /** how the tint varies with the streak field and the broad drift field */
    streakGain: 0.26, driftGain: 0.22,
    /** laminae: pinstripe wavelength (px) and strength */
    lamina: 24, laminaGain: 0.16,
    /** noise-ridge bright ribbons in the body */
    ribbonPow: 7, ribbonGain: 0.14,
    /** edge light: gain, and the floor of its dependence on the anchor light */
    rimGain: 0.5, rimLit: 0.55,
  },

  // ── the halocline lines and the fine detail (full resolution) ───────
  lines: {
    /** crisp core width (px, × S but at least 1 device px) and alpha */
    width: 1.15, alpha: 0.72,
    /** echo of a sheet's back edge seen through the sheet in front */
    echoAlpha: 0.24, echoWidth: 0.8,
    /** the glow canvas is drawn at 1/glowScale resolution and upscaled */
    glowScale: 4,
    /** glow strokes: inner width, outer width (buffer px) and alphas */
    glowInner: [2.2, 0.06], glowOuter: [6.5, 0.022],
    /** run length (vertices) between alpha changes */
    run: 8,
    /** breakage of the lines by noise: threshold band and the alpha floor inside a gap */
    broken: [-0.1, 0.4], gapFloor: 0.16,
    breakFreq: 5.2,
    /** shimmer: amplitude, spatial cycles along the line, cycles per day of drift */
    shimmer: 0.34, shimmerFreq: 7.5, shimmerRate: 0.35,
    /** fraction of the light colour in a line (rest is glass), and how much of the sheet's own colour tints it */
    lightMix: 0.5, sheetMix: 0.24,
    /** how far an echo is displaced by the glass in front (× refraction) */
    echoShift: 1.2,
    /** prismatic fringe offset (px) */
    fringe: 3.0,
    /** the spark hairline: alpha and width factor, glow factor */
    spark: { alpha: 0.85, width: 1.3, glow: 2.4 },
    /** young lines are brighter by up to this factor */
    youngLine: 0.7,
    /** strength floor of the first two sheets' lines while they are still ghosts */
    ghostLine: [0.6, 0.25],
    /** lines dim away from the anchor: radius (× R) and floor */
    litRadius: 1.25, litFloor: 0.55,
    /** the dark 'came' of stained glass */
    leadAlpha: 0.5,
  },

  striae: {
    /** faint hairline striations per sheet (drawn count scales with quality) */
    count: 70,
    alpha: [0.04, 0.12],
    width: [0.6, 1.4],
    length: [0.12, 0.62],
    dark: 0.4,
  },
  /** seeds and bubbles trapped in the glass (per sheet; the drawn count scales with quality) */
  bubbles: { count: 22, radius: [1.1, 4.2], elong: [1, 3.4], alpha: [0.18, 0.5] },
  caustic: {
    /** soft bright ribbons per sheet, drawn into the glow canvas */
    count: 3,
    alpha: [0.1, 0.26],
    width: [1.8, 4.2],
    length: [0.25, 0.7],
    /** thin crisp filaments at full resolution */
    thin: 6, thinAlpha: [0.1, 0.26], thinLen: [0.05, 0.2],
  },
};
