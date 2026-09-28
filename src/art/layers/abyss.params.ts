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
    /** first upscale step, times the buffer; then on to the full canvas */
    midFactor: 4,
  },

  /** OKLab lightness of each stop of the ramp (before growth). Deepest, darkest layer. */
  ladder: { void: 0.08, deep: 0.2, mid: 0.285, haze: 0.38, ember: 0.46 },
  /** fraction of the (already growth-toned) palette chroma that each stop keeps */
  chroma: { void: 0.7, deep: 0.52, mid: 0.47, haze: 0.5, ember: 0.55 },

  // ── noise fields ────────────────────────────────────────────────
  field: {
    /** base frequency of the deep fog, in cells per noise-unit (unit ≈ the frame's mean size) */
    freq: 2.3,
    /** how fast the fields breathe with the days (noise-z per day; frozen at the reveal) */
    driftPerDay: 0.017,
    /** warp field frequency relative to the fog and its strength (noise units) */
    warpFreq: 0.62,
    warpAmp: 0.7, warp2: 0.9,
    /** octaves for the fog / cloud fields and their gain */
    octFog: 4, gainFog: 0.5,
    octCloud: 4, gainCloud: 0.5,
    /** empirical norm: fbm ≈ ±0.42 → 0..1 */
    gain: 1.7,
    /** fraction of the way from void to deep fog that cloud coverage starts at (per-seed bias adds ±) */
    coverage: 0.5,
    /** mid clouds: only near the haze, plus a whisper everywhere */
    midAmt: 0.85, midFar: 0.1,
    /** soft silk filaments (gaussian of a noise value → smooth ribbons, no creases) */
    filament: 0.16, filamentWidth: 0.15, filamentFreq: 0.85,
    /** hue drift of the fog, degrees at ±1 field value (times glass-kind factor) */
    hueDrift: 40,
  },

  // ── haze glow ───────────────────────────────────────────────────
  glow: {
    /** overall opacity of the haze lerp (1 = the core reaches the haze stop) */
    alpha: 0.86,
    /** mix of gaussian core vs long tail */
    core: 0.62, tail: 0.38,
    /** how strongly the fog modulates the glow (0 = a clean lamp, 1 = fully cloud-broken) */
    fogMod: 0.75,
    /** noise displacement of the glow's shape, in units of R */
    shapeWarp: 0.22,
  },
  ember: {
    /** the faint ember glowing at the anchor — strongest, relatively, at the seed */
    strength: 0.5, radius: 0.24, at0: 1.8,
  },
  /** a distant second lobe of light — a whisper of the palette's spark */
  echo: { strength: 0.3, sparkMix: 0.4, radius: [0.3, 0.52], along: [0.55, 1.15], across: [-0.75, 0.75] },

  /** clouds lit from the horizon: slopes facing the anchor catch the haze */
  rim: { amt: 0.55, gain: 6.5, base: 0.3, mixA: 0.55 },

  // ── depth structure ─────────────────────────────────────────────
  troughs: { count: 3, depth: [0.14, 0.3], rx: [0.42, 0.78], ry: [0.24, 0.46], keepAway: 0.3, chromaKeep: 0.65 },
  /** value falloff away from the light, along its axis (radial: from the centre) */
  axisGrad: 0.26,

  // ── growth (seed → grown). Ramps use c.grow('abyss') ──────────────
  growth: {
    /** overall level of the ladder at the seed (× ladder L) */
    levelAt0: 0.5,
    contrastAt0: 0.55,
    /** frequency multiplier at the seed (>1 = smaller, tighter masses that swell outwards from the anchor) */
    freqAt0: 1.5,
    warpAt0: 0.35,
    chromaAt0: 0.72,
    /** haze strength & size at the seed */
    hazeAt0: 0.42, hazeSizeAt0: 0.66,
    /** the deep water lights up a little as the bloom opens */
    bloomGlow: 0.16,
  },
  /** daily breathing of the haze radius (fraction), driven by tl.drift only */
  breath: 0.025,

  // ── horizon character: how the fog lies and the light gathers ─────
  //   sPar/sPerp  noise wavelength stretch along / across the axis
  //   fwd/back/perp  glow half-widths (× R) ahead of / behind / across the anchor
  //   band  strength of the horizon-line glow, bandW its thickness (× R, along axis), bandLen its reach
  //   swirl  radians of twist at the centre (Nadir)   slant  rotation of the fog frame
  feel: [
    { sPar: 0.85, sPerp: 1.8, fwd: 0.78, back: 0.34, perp: 1.1, band: 0.5, bandW: 0.2, bandLen: 1.7, swirl: 0, slant: 0.03, grad: 1 },
    { sPar: 1.9, sPerp: 0.85, fwd: 1.05, back: 0.3, perp: 0.82, band: 0.55, bandW: 0.14, bandLen: 1.35, swirl: 0, slant: 0.16, grad: 1 },
    { sPar: 1.6, sPerp: 0.85, fwd: 1.0, back: 0.26, perp: 0.78, band: 0.45, bandW: 0.15, bandLen: 1.8, swirl: 0, slant: -0.05, grad: 1 },
    { sPar: 1.0, sPerp: 1.0, fwd: 0.92, back: 0.92, perp: 0.92, band: 0, bandW: 0.2, bandLen: 1, swirl: 1.15, slant: 0, grad: 0.9 },
  ],

  // ── body traits nudge the deep a little ──────────────────────────
  glassHue: { clear: 1, stained: 1.2, frosted: 0.6, prismatic: 2.1 } as Record<string, number>,
  glassContrast: { clear: 1, stained: 1.04, frosted: 0.86, prismatic: 1.02 } as Record<string, number>,
  ifaceTilt: { level: 0, leaning: 0.2, fan: 0.06, folded: -0.08 } as Record<string, number>,
  ifaceTrough: { level: 1, leaning: 1, fan: 0.9, folded: 1.35 } as Record<string, number>,

  // ── palettes that need special handling ──────────────────────────
  /** near-mono palettes (Blackglass): silver-blue fog, restrained */
  mono: { below: 0.055, hue: 252, floor: { void: 0.012, deep: 0.03, mid: 0.036, haze: 0.03, ember: 0.04 }, hueDrift: 9, hazeFrac: 0.4 },
  /** spectral palettes (Aurora Prism): hue walks across the frame */
  spectral: { span: 0.62, along: 0.9, noise: 0.5, driftPerDay: 0.0035, floor: { deep: 0.05, mid: 0.058, haze: 0.06, ember: 0.06 } },

  /** ±levels of triangular dither added at full resolution (kills 8-bit banding in the darks) */
  dither: 0.9,
};
