import type { Compose, Knob } from './types.ts';

/**
 * THE LUMEN — every number of the bloom lives here (plain JSON-serialisable data).
 * Lengths are fractions of R (the full-bloom radius from geometry.ts) unless a name says "px" (design px).
 */
export const lumenParams = {
  /** slider-able parameters the explainer exposes */
  knobs: [
    { path: 'layers.lumen.size', label: 'Bloom size', min: 0.6, max: 1.25, step: 0.01 },
    { path: 'layers.lumen.petalAlpha', label: 'Petal glass', min: 0.35, max: 1.7, step: 0.01 },
    { path: 'layers.lumen.halation', label: 'Halation', min: 0, max: 2, step: 0.01 },
    { path: 'layers.lumen.rays', label: 'Light rays', min: 0, max: 2, step: 0.01 },
  ] as Knob[],
  compose: { blend: 'screen', alpha: 1, parallax: 0.85 } as Compose,

  // ── the four expressive knobs (multipliers, 1 = as designed) ──
  size: 1,
  petalAlpha: 1,
  halation: 1,
  rays: 1,

  /** how the rings and petals are laid out */
  layout: {
    /** outer-ring petal length before the horizon envelope */
    lengthOuter: 0.98,
    /** length of the innermost ring relative to the outer ring, by ring count (2, 3, 4, 5) */
    innerMin: [0.56, 0.46, 0.40, 0.34],
    ringPow: 1.08,
    /** distance of the petal bases from the anchor */
    baseOffset: 0.02,
    /** extra base radius of the outer ring: the petals rise from a ring of pearls around the core */
    baseRing: 0.07,
    /** petal half-width vs neighbour spacing (1 = just touching) */
    overlap: 1.3,
    minAspect: 0.03,
    jitter: { angle: 0.3, length: 0.075, width: 0.13, bow: 0.035 },
    /** one or two petals of the outer ring grow longer */
    favourite: { boost: [1.12, 1.26] as number[] },
    /** ring alpha, outer → inner */
    ringAlpha: [1.0, 0.68],
    /** unfolding: per-ring start (outer → inner), spread across the fan, duration */
    open: { startOuter: 0.2, startInner: 0.0, uStagger: 0.1, span: 0.6, rot: [0, 0.8], len: [0.1, 1], dip: 0.22 },
    /** the closed bud cone half-angle in degrees */
    coneDeg: 11,
    /** where the light seems to come from (glass highlight side) */
    lightDir: [-0.55, -0.83] as number[],
  },

  /** the fan for each horizon: petal length = R·lengthOuter·(base + peak·cos(u·π/2)^pow)·skew·alt */
  horizon: {
    dawn: { base: 0.6, peak: 0.4, pow: 1.15, skew: 0.0, alt: 0.0, noise: 0.0, bow: 0.05, bowU: 0.11, halo: 0.34, streakY: 0 },
    dusk: { base: 0.5, peak: 0.5, pow: 1.3, skew: 0.3, alt: 0.05, noise: 0.0, bow: 0.15, bowU: 0.05, halo: 0.3, streakY: 0 },
    zenith: { base: 0.44, peak: 0.56, pow: 0.8, skew: 0.0, alt: 0.3, noise: 0.0, bow: -0.01, bowU: -0.07, halo: 0.36, streakY: 0 },
    nadir: { base: 0.82, peak: 0.18, pow: 1.0, skew: 0.0, alt: 0.0, noise: 0.24, bow: 0.11, bowU: 0.0, halo: 0.0, streakY: 0 },
  },

  /** petal silhouettes. aspect = half-width / length; sM = where the belly is; ra/rb/tp shape the rise, the fall and the tip */
  forms: {
    lance: { alpha: 1.18, aspect: 0.125, sM: 0.4, ra: 1.9, rb: 1.05, tp: 1.0, bow: 0.05, sAmp: 0.0, sFreq: 0, veins: 4, straight: false },
    teardrop: { alpha: 0.95, aspect: 0.31, sM: 0.46, ra: 1.8, rb: 0.9, tp: 0.55, bow: 0.03, sAmp: 0.0, sFreq: 0, veins: 4, straight: false },
    shard: { alpha: 1.0, aspect: 0.21, sM: 0.34, ra: 1, rb: 1, tp: 1, bow: 0.0, sAmp: 0.0, sFreq: 0, veins: 0, straight: true },
    ribbon: { alpha: 1.08, aspect: 0.095, sM: 0.26, ra: 1.7, rb: 1.7, tp: 0.9, bow: 0.12, sAmp: 0.13, sFreq: 0.9, veins: 0, straight: false },
    coronet: { alpha: 1.7, aspect: 0.055, sM: 0.14, ra: 1.0, rb: 1.0, tp: 1.0, bow: 0.02, sAmp: 0.0, sFreq: 0, veins: 0, straight: false },
  },
  /** coronet: spikes double (long ones = the trait), short ones between; a ring of pearls at the foot */
  coronet: { short: 0.6, baseRing: 0.115, pearls: 3, pearlPx: 2.1, ringAlpha: 0.22 },
  /** the closed-bud silhouette every piece shares before the reveal */
  teardrop: { sM: 0.46, ra: 1.8, rb: 0.9, tp: 0.55 },

  /** exposure: the glass has to stand above a sea that is already lit around the anchor */
  expose: { gain: 1.32, edge: 1.25, white: 0.16 },

  /** how the petals look under the four Glass traits (body-trait, so they may show before the reveal) */
  glass: {
    clear: { body: 0.86, edge: 1.25, disp: 0.22, soft: 0.0, glare: 0.9 },
    stained: { body: 1.3, edge: 0.95, disp: 0.12, soft: 0.0, glare: 1.0 },
    frosted: { body: 1.2, edge: 0.55, disp: 0.0, soft: 1.0, glare: 1.35 },
    prismatic: { body: 1.0, edge: 1.05, disp: 1.0, soft: 0.0, glare: 1.0 },
  },

  /** a petal of glass */
  petal: {
    /** longitudinal body gradient: alpha at 0, 20 %, 50 %, 80 %, tip (near zero at the claw where petals pile up) */
    body: [0.012, 0.085, 0.2, 0.15, 0.06],
    /** extra alpha of the lit half (the crease down the middle of the glass) */
    lit: 0.55,
    /** the luminous inner lens (scaled copy of the petal) */
    lens: { width: 0.5, length: 0.78, alpha: 0.09 },
    edgePx: 0.95,
    edge: [0.14, 0.42, 0.85],
    innerEdgePx: 1.35,
    innerEdge: 0.6,
    veinPx: 0.8,
    veinAlpha: 0.2,
    sideVeinAlpha: 0.1,
    fibres: 2,
    fibreAlpha: 0.07,
    pearlPx: 1.7,
    pearlAlpha: 0.9,
    glintPx: 1.5,
    glintAlpha: 0.75,
    dispersionPx: 1.3,
    dispersionHue: 55,
  },

  /** lace of caustic lines between neighbouring petals */
  web: { alpha: 0.13, px: 0.7, tiers: [0.5, 0.74], sag: 0.16, gap: [0.09, 0.26] },

  /** the four light classes (traits.bloom.light) */
  light: {
    lamp: { core: 0.062, coreGlow: 3.0, halo: 1.05, haloA: 0.36, glare: 0.42, rays: 15, rayLen: [0.9, 1.5], rayA: [0.05, 0.1], shafts: 0, streak: 0, ghosts: 0 },
    radiant: { core: 0.074, coreGlow: 3.3, halo: 1.5, haloA: 0.46, glare: 0.58, rays: 30, rayLen: [1.1, 2.4], rayA: [0.06, 0.14], shafts: 3, streak: 0, ghosts: 0 },
    blazing: { core: 0.098, coreGlow: 3.7, halo: 1.75, haloA: 0.54, glare: 0.62, rays: 34, rayLen: [1.2, 2.6], rayA: [0.08, 0.16], shafts: 4, streak: 0.6, ghosts: 0 },
    nova: { core: 0.12, coreGlow: 3.7, halo: 2.05, haloA: 0.6, glare: 0.72, rays: 44, rayLen: [1.4, 3.0], rayA: [0.09, 0.18], shafts: 6, streak: 1.0, ghosts: 5 },
  },

  /** rays: angular half-width in degrees for hairlines and broad shafts */
  ray: { widthDeg: [0.35, 1.7], shaftDeg: [3.5, 9], shaftA: 0.06, over: 1.12, start: 0.04, gain: 1.75 },
  /** a deep-hue wash of colour around the bloom (fraction of R, alpha) */
  wash: { radius: 2.1, alpha: 0.13 },

  /** glare pyramid (petals + core drawn at 1/div scale, blurred by repeated halving) */
  glare: { div: 4, bodyK: 0.5, levels: [0.34, 0.32, 0.3, 0.28, 0.26], depth: [3, 4, 4, 5] },

  /** lens streak + hex ghosts (blazing, nova) */
  streak: { len: 2.1, thickPx: 3.6, alpha: 0.7, glowPx: 22, glowAlpha: 0.2 },
  ghost: { at: [0.5, 0.82, 1.18, 1.62, 2.1], size: [0.05, 0.09, 0.035, 0.12, 0.06], alpha: [0.2, 0.14, 0.24, 0.1, 0.16] },

  /** the closed bud */
  bud: {
    length: 0.36,
    /** fraction of that length the seed has at growth 0 */
    minScale: 0.5,
    aspect: 0.21,
    /** body alpha and glare of the bud; the heart sits inside it, this far along its length */
    alpha: 0.3,
    glare: 0.3,
    coreShift: 0.2,
    /** ring lengths, outer → inner */
    ringLen: [1, 0.84, 0.66],
    petals: 7,
    rings: 3,
    core: 0.04,
    halo: 0.8,
    haloA: 0.3,
    /** extra ember at the start so the seed is still legible (0..1 of the way to the full colour) */
    ember: 0.5,
    wick: { len: 0.85, alpha: 0.28 },
  },
};
