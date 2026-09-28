// THE GRAIN — every number of the medium. Plain JSON-serialisable data (structuredClone'd on reset).
//
// Three overlays share one small "map" of what lies below (its luminance), so the grain can dither the
// dark water, the grade can split-tone what is actually there, and the mottling can wake only in the light.
//
//   grain     overlay    film grain (trait: Fine / Silken / Coarse) + glass tooth (mottle + fibre) + a few hairlines
//   vignette  multiply   a lopsided, palette-tinted fall-off that leans away from the light
//   grade     soft-light shadows → deep, highlights → bloomLight, a faint lift in the toe
import type { Compose, Knob } from './types.ts';

export const textureParams = {
  knobs: [
    { path: 'layers.texture.grain.amount', label: 'Grain', min: 0, max: 2, step: 0.05 },
    { path: 'layers.texture.grain.mottle', label: 'Glass tooth', min: 0, max: 2, step: 0.05 },
    { path: 'layers.texture.vignette.strength', label: 'Vignette', min: 0, max: 1, step: 0.02 },
    { path: 'layers.texture.grade.strength', label: 'Grade', min: 0, max: 1.6, step: 0.05 },
  ] as Knob[],

  /**
   * The shared low-res luminance map (cell size in design px, min 2 device px).
   * useBelow 0 (default): luminance is *modelled* from the palette, the anchor and the growth — costs nothing.
   * useBelow 1: read it from c.below() — exact, but that flattens every layer at full size (≈130 ms at 1000×1250).
   */
  map: { cell: 5, minCell: 2, useBelow: 0 },

  /**
   * The model behind useBelow 0, fitted to the median luminance of finished pieces as a function of distance from the anchor:
   * Y = far + (peak − far)·exp(−(d/rad)^expo), d in multiples of R. The light runs further ahead along the horizon's axis
   * (steep, wide) than behind it (a long low tail); a radial horizon (Nadir) is one profile all round.
   * far = the open water (weights of the palette roles' luma + a floor); peak = the lamp (a share of bloomLight's luma).
   */
  model: {
    far: { void: 0.3, deep: 0.06, floor: 0.012 },
    peak: 1.1,
    ahead: { rad: 0.92, expo: 2.2 },
    behind: { rad: 0.74, expo: 1.1 },
    radial: { rad: 0.8, expo: 1.45 },
    /** the lamp's share of its final size before the bloom opens */
    lampBud: 0.55,
  },

  /** the tooth field lives on its own, coarser grid (design px per cell, min 3 device px) */
  toothCell: 12,

  /**
   * How colourful is this palette? mean OKLCH chroma of its mid & glass roles, ramped from→to into 0..1, then floored.
   * Near-mono palettes (Blackglass) scale every tint and the colour noise by it, so they stay near-neutral.
   */
  mono: { floor: 0.1, from: 0.035, to: 0.11 },

  grain: {
    compose: { blend: 'overlay', alpha: 0.5, parallax: 0 } as Compose,
    /** overall grain multiplier (knob) */
    amount: 1,
    /** glass-tooth multiplier (knob) */
    mottle: 1,
    /** dev aid: 'fine' | 'silken' | 'coarse' overrides the piece's Grain trait; '' (default) follows the trait */
    force: '',
    /** at the seed the grain is heavier; ×lerp(seedBoost, 1, growth) */
    seedBoost: 1.3,
    /** amplitude follows canvas scale: ×clamp(S^scaleExp, scaleMin, 1) so a 300 px thumbnail is not grittier than a 1500 px print */
    scaleExp: 0.45,
    scaleMin: 0.62,

    /**
     * Per trait. `out` is the target std-dev of the grain in the OUTPUT (0..1 of full scale) at mid-tones.
     * `sigma` is the blur (std-dev, design px, floored at `minSigma` device px) of the grain grain; `clump` mixes in a second,
     * broader blur (`clumpSigma`) for film-like clusters. `chroma` is the colour noise as a share of the luma noise.
     */
    kinds: {
      fine: { out: 0.019, sigma: 0.22, minSigma: 0, clump: 0, clumpSigma: 0, minClumpSigma: 0, chroma: 0.2 },
      silken: { out: 0.0105, sigma: 0.95, minSigma: 0.65, clump: 0, clumpSigma: 0, minClumpSigma: 0, chroma: 0.1 },
      coarse: { out: 0.017, sigma: 1.0, minSigma: 0.8, clump: 0.35, clumpSigma: 1.5, minClumpSigma: 1.05, chroma: 0.15 },
    },

    /**
     * How grain follows luminance Y of what lies below (0..1).
     * Overlay damps grain in the deep and the bright, so the source amplitude is lifted to compensate
     * (that is what makes the grain dither the abyss): srcσ = out·profile(Y) / (alpha·2·max(min(Y,1−Y), yFloor)).
     */
    tone: { floor: 0.34, floorAt: 0.012, fullAt: 0.3, hiRoll: 0.4, hiFrom: 0.62, hiTo: 0.98, yFloor: 0.02, srcMax: 0.38 },

    /** glass tooth: faint low-frequency mottling + paper-like fibres, awake mostly where there is light */
    tooth: {
      /** std-dev of the mottle in the OUTPUT at full light */
      out: 0.011,
      /** blotch scale, design px */
      blotch: 80,
      /** fibre: [length, width] in design px */
      fibre: [130, 11],
      /** share of the mottle that is fibre */
      fibreShare: 0.4,
      octaves: 3,
      /** ceiling on the tooth's source amplitude, so even the frosted glass at the top of the knob stays a texture, not a stripe */
      srcMax: 0.16,
      /** it wakes with the light: profile(Y) = smoothstep(from, to, Y) */
      from: 0.03,
      to: 0.38,
      /** glass trait multiplies the tooth */
      byGlass: { clear: 0.75, stained: 1, frosted: 1.9, prismatic: 1.1 },
    },

    /** 0–6 hairline scratches and lint fibres, seeded; drawn on the grey base, so overlay shows them only in the light */
    scratches: {
      max: 6,
      /** count = floor(u^skew · (max+1)) — several pieces have none */
      skew: 1.35,
      /** share of scratches (rest are lint fibres) */
      scratchShare: 0.55,
      /** share placed near the bloom (rest anywhere) */
      nearBloom: 0.6,
      scratch: { len: [0.14, 0.5], width: [0.55, 0.95], alpha: [0.12, 0.24], bend: 0.035, lightShare: 0.72 },
      fibre: { len: [9, 30], width: [0.75, 1.15], alpha: [0.22, 0.4], curl: 0.7, lightShare: 0.5 },
    },
  },

  vignette: {
    compose: { blend: 'multiply', alpha: 1, parallax: 0 } as Compose,
    /** 0..1: how far the multiply colour is pulled toward the tinted dark at the deepest corner (knob) */
    strength: 0.62,
    /** ×lerp(seedBoost, 1, growth): the seed sits a little deeper in the dark */
    seedBoost: 1.12,
    /** lightness (0..1 sRGB) of the multiply colour at full strength — never black */
    edgeLum: 0.3,
    /** OKLCH chroma of that colour before the palette's vividness scales it */
    tint: 0.042,
    /** fall-off is smoothstep(start, end, d)^gamma in half-frame units (edges are 1, corners √2) */
    start: 0.5,
    end: 1.5,
    gamma: 1.25,
    /** the vignette's centre follows the bloom anchor by this much */
    follow: 0.32,
    /** the far side of the light (along the axis) is darker by this much of d */
    lean: 0.16,
    /** wobble of the fall-off (fbm), in d units */
    wobble: 0.1,
    /** per-corner strength jitter ± */
    cornerJitter: 0.22,
    /** resolution of the fall-off buffer in device px per cell (before scaling) */
    cell: 6,
  },

  grade: {
    compose: { blend: 'soft-light', alpha: 0.6, parallax: 0 } as Compose,
    /** overall grade multiplier (knob) */
    strength: 1,
    /** extra map blur (cells) — how far the tint spreads around bright things (a halation) */
    blur: 3,
    /** lightness at which tints are drawn (mid grey ≈ 0.6) */
    tintL: 0.62,
    /** shadows → deep. from/to: luminance range over which the shadow tint fades out */
    shadow: { chroma: 0.05, gain: 1.15, from: 0.02, to: 0.5 },
    /** highlights → bloomLight */
    light: { chroma: 0.055, gain: 1.35, from: 0.3, to: 0.92 },
    /** a faint lift in the toe so nothing is dead black (soft-light multiplies the deep, so this is a gain, not an offset) */
    lift: { amount: 0.2, end: 0.2 },
    /** the seed is cooler and flatter: tints rotate toward coolHue, less strength, more lift, softer highlights */
    seed: { cool: 0.55, coolHue: 250, coolChroma: 0.035, strength: 0.7, flat: 0.75, flatLift: 0.09, flatRoll: 0.05 },
  },
};
