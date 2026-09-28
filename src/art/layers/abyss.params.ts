import type { Compose, Knob } from './types.ts';

/**
 * THE ABYSS — every magic number of the deepest layer.
 * Plain JSON-serialisable data only (structuredClone'd for reset).
 * The four top-level numbers (haze, cloudScale, contrast, warp) are the sliders.
 */
export const abyssParams = {
  /** slider-able parameters the explainer exposes (2–4 per layer) */
  knobs: [
    { path: 'layers.abyss.haze', label: 'Haze', min: 0, max: 1.7, step: 0.05 },
    { path: 'layers.abyss.cloudScale', label: 'Cloud scale', min: 0.55, max: 1.9, step: 0.05 },
    { path: 'layers.abyss.contrast', label: 'Depth contrast', min: 0.35, max: 1.7, step: 0.05 },
    { path: 'layers.abyss.warp', label: 'Swirl', min: 0, max: 1.8, step: 0.05 },
  ] as Knob[],
  compose: { blend: 'source-over', alpha: 1, parallax: 0.12 } as Compose,

  // ── the four sliders ────────────────────────────────────────────
  /** strength of the haze gathered toward the horizon anchor (1 = as designed) */
  haze: 1,
  /** cloud-mass size: 1 = features ≈ 40–100 % of the frame; higher = smaller masses */
  cloudScale: 1,
  /** depth contrast between void, deep fog and mid cloud */
  contrast: 1,
  /** domain-warp amount — how far the fog is dragged into swirls */
  warp: 1,

  // ── the small buffer (everything is painted small, then upscaled twice) ──
  res: {
    /** buffer width in px (height follows the frame's aspect) */
    full: 104,
    draft: 64,
    /** never fewer than `min` columns nor more than `perPx` × the frame's width; and at most `maxPix` buffer pixels in all */
    min: 40, perPx: 0.45, maxPix: 15500,
    /** first upscale step, times the buffer; then on to the full canvas */
    midFactor: 4,
    /** [1 2 1] blur passes over the density fields (kills any edge thinner than a few buffer px) */
    blur: 2,
  },

  /** OKLab lightness of each stop of the ramp (before growth). Deepest, darkest layer. */
  ladder: { void: 0.082, deep: 0.192, mid: 0.265, haze: 0.385, ember: 0.47, shadow: 0.068 },
  /** minimum absolute OKLab chroma of each stop (× growth chroma), so chroma-poor palettes still carry colour */
  chromaFloor: { void: 0.012, deep: 0.058, mid: 0.076, haze: 0.092, ember: 0.098, shadow: 0.052 },
  /** dark yellow turns to olive mud: hues in [lo, hi] (degrees) are pulled toward umber (< mid) or emerald (> mid) by `pull` in the shadows */
  mud: { lo: 58, mid: 95, hi: 140, pull: 0.55 },
  /** a haze whose chroma fell below hazeKeepHi × the glass's is pulled back toward the glass, up to hazeKeep (at hazeKeepLo and below) */
  hazeKeep: 0.7, hazeKeepLo: 0.35, hazeKeepHi: 0.8,
  /** chroma-poor palettes (haze stop chroma < poorChroma) give their light up to `poorBoost` more strength */
  poorChroma: 0.1, poorBoost: 0.3,
  /** how far each fog stop's colour is pulled toward the role above it (deep → mid, mid → glass) */
  stopMix: { deep: 0.45, mid: 0.3 },
  /** fraction of the (already growth-toned) palette chroma that each stop keeps */
  chroma: { void: 0.9, deep: 0.72, mid: 0.62, haze: 0.62, ember: 0.66, shadow: 0.8 },

  // ── noise fields ────────────────────────────────────────────────
  field: {
    /** base frequency of the deep fog, in lattice cells per noise-unit (unit ≈ the frame's mean size) */
    freq: 1.05,
    /** how fast the fields breathe with the days (noise-z per day; frozen at the reveal) */
    driftPerDay: 0.017,
    /** warp field frequency relative to the fog, its strength (in lattice cells), and the second (fold) level */
    warpFreq: 0.6,
    /** flow warp: total advection in lattice cells, the number of steps, potential→velocity gain, and glow-shape coupling */
    warpAmp: 1.15, flowSteps: 5, flowGain: 1.2, shapeFlow: 0.16,
    /** octaves and gain of the fog / cloud fields (fine octaves are only whispers) */
    octFog: 4, gainFog: 0.3,
    octCloud: 4, gainCloud: 0.32,
    /** slope of the density curve, 0.5 + 0.5·tanh(soft · field): low = milky, high = hard-edged (keep it low) */
    softFog: 5.0, softCloud: 4.6,
    /** how much the per-seed coverage bias shifts the fog density */
    coverage: 0.5,
    /** mid clouds: mostly near the haze, plus a whisper everywhere */
    midAmt: 0.85, midFar: 0.12,
    /** soft silk filaments (a wide gaussian of a noise value → broad ribbons, no creases) */
    filament: 0.11, filamentWidth: 0.4, filamentFreq: 0.9,
    /** hue drift of the fog, degrees at ±1 field value (times glass-kind factor) */
    hueDrift: 58,
    /** hard limit (degrees, soft tanh) on how far the fog's hue may rotate from the palette's */
    hueMax: 62,
    /** weight of the second, cloud-following hue field */
    hueCloud: 1.0,
    /** painterly mottle: flow-following variation of lightness at ~10 % of the frame (fraction of L) */
    mottle: 0.1, mottleAdd: 0.02, mottleFreq: 2.4,
  },

  // ── haze glow ───────────────────────────────────────────────────
  glow: {
    /** overall opacity of the haze lerp (1 = the core reaches the haze stop) */
    alpha: 0.95,
    /** mix of gaussian core vs long tail */
    core: 0.68, tail: 0.32,
    /** how strongly the fog modulates the glow (0 = a clean lamp, 1 = fully cloud-broken) */
    fogMod: 0.55,
    /** a broad, faint wash of haze over the whole neighbourhood of the light (aerial perspective) */
    aura: 0.11,
    /** noise displacement of the glow's shape, in units of R */
    shapeWarp: 0.3,
    /** how far the fog drags the horizon-line band about, in units of R */
    bandWarp: 0.55,
  },
  ember: {
    /** the faint ember glowing at the anchor — strongest, relatively, at the seed */
    strength: 0.5, radius: 0.24, at0: 1.8,
  },
  /** a distant second lobe of light — a whisper of the palette's spark */
  echo: { strength: 0.3, sparkMix: 0.4, radius: [0.3, 0.52], along: [0.55, 1.15], across: [-0.75, 0.75] },

  /** clouds lit from the horizon: slopes facing the anchor catch the haze */
  rim: { amt: 0.55, gain: 1.7, base: 0.3, mixA: 0.55 },

  // ── depth structure ─────────────────────────────────────────────
  /** large soft dark shapes; the shadows lean toward the palette's spark (cool shadows under warm light) */
  troughs: { count: 3, depth: [0.14, 0.3], rx: [0.42, 0.78], ry: [0.24, 0.46], keepAway: 0.3, chromaKeep: 0.8, shadowMix: 0.6,
    /** cold wash far from the light: strength, and the glow-distance range it grows over */
    farTint: 0.5, farFrom: 0.7, farTo: 1.9,
    /** shadows lean from the deep hue toward this hue (degrees, OKLab) by at most coolShift degrees */
    coolHue: 262, coolShift: 55 },
  /** the contrast slider also deepens the troughs and the value falloff (exponents on the slider) */
  contrastTrough: 0.8, contrastAxis: 0.7,
  /** value falloff away from the light, along its axis (radial: from the centre) */
  axisGrad: 0.26,

  // ── growth (seed → grown). Ramps use c.grow('abyss') ──────────────
  growth: {
    /** overall level of the ladder at the seed (× ladder L) */
    levelAt0: 0.62,
    contrastAt0: 0.55,
    /** frequency multiplier at the seed (>1 = smaller, tighter masses that swell outwards from the anchor) */
    freqAt0: 1.5,
    warpAt0: 0.35,
    chromaAt0: 0.85,
    /** haze strength & size at the seed */
    hazeAt0: 0.56, hazeSizeAt0: 0.7,
    /** the deep water lights up a little as the bloom opens */
    bloomGlow: 0.16,
  },
  /** degrees the haze hue turns between the core and the fringe of the glow (sign is per seed) */
  haloHue: 18,
  /** frames more elongated than aspectRef grow the glow by (aspect/ref)^pow, up to aspectMax */
  aspectRef: 1.25, aspectPow: 0.9, aspectMax: 1.5,
  /** daily breathing of the haze radius (fraction), driven by tl.drift only */
  breath: 0.025,

  // ── horizon character: how the fog lies and the light gathers ─────
  //   sPar/sPerp  noise wavelength stretch along / across the axis
  //   fwd/back/perp  glow half-widths (× R) ahead of / behind / across the anchor
  //   band  strength of the horizon-line glow, bandW its thickness (× R, along axis), bandLen its reach
  //   swirl  radians of twist at the centre (Nadir)   slant  rotation of the fog frame
  feel: [
    { sPar: 0.85, sPerp: 1.8, fwd: 0.78, back: 0.34, perp: 1.1, band: 0.5, bandW: 0.26, bandLen: 1.5, swirl: 0, slant: 0.03, grad: 1 },
    { sPar: 1.9, sPerp: 0.85, fwd: 1.05, back: 0.3, perp: 0.82, band: 0.34, bandW: 0.42, bandLen: 0.7, swirl: 0, slant: 0.16, grad: 1 },
    { sPar: 1.6, sPerp: 0.85, fwd: 1.0, back: 0.26, perp: 0.78, band: 0.45, bandW: 0.26, bandLen: 1.3, swirl: 0, slant: -0.05, grad: 1 },
    { sPar: 1.0, sPerp: 1.0, fwd: 0.92, back: 0.92, perp: 0.92, band: 0, bandW: 0.2, bandLen: 1, swirl: 1.15, slant: 0, grad: 0.9 },
  ],

  // ── body traits nudge the deep a little ──────────────────────────
  glassHue: { clear: 1, stained: 1.2, frosted: 0.6, prismatic: 2.1 } as Record<string, number>,
  glassContrast: { clear: 1, stained: 1.04, frosted: 0.86, prismatic: 1.02 } as Record<string, number>,
  ifaceTilt: { level: 0, leaning: 0.2, fan: 0.06, folded: -0.08 } as Record<string, number>,
  ifaceTrough: { level: 1, leaning: 1, fan: 0.9, folded: 1.35 } as Record<string, number>,

  // ── palettes that need special handling ──────────────────────────
  /** near-mono palettes (Blackglass): silver-blue fog, restrained */
  mono: { below: 0.055, hue: 252, floor: { void: 0.012, deep: 0.03, mid: 0.036, haze: 0.03, ember: 0.04, shadow: 0.02 }, hueDrift: 9, hazeFrac: 0.4 },
  /** spectral palettes (Aurora Prism): hue walks across the frame */
  spectral: { span: 0.62, along: 0.9, noise: 0.5, driftPerDay: 0.0035, floor: { deep: 0.042, mid: 0.05, haze: 0.052, ember: 0.052 } },

  /** how much of the stops' own chroma survives when opposite hues overlap (0 = pure OKLab mix → grey, 1 = no cancellation) */
  hueRestore: 0.0,

  /** triangular dither, in 8-bit levels: `mid` is added to the float image before it is first rounded (the one that
   *  really prevents banding), `full` is a fine 1-px tile on top of the final upscale (its mean is taken off first) */
  dither: { mid: 0.85, full: 0.45 },
};
