import type { Compose, Knob } from './types.ts';

/** How one dust trait (Sparse · Drifting · Snowfall · Starfall) behaves. Plain numbers and arrays only. */
export interface VeilKind {
  /** number of crisp motes at the reference 4:5 frame (scaled by the frame's area and the density slider) */
  motes: number;
  /** [min, max] count of bokeh discs (rolled once per seed) */
  bokeh: [number, number];
  /** bokeh edge softness range, in unit radii (0.1 = crisp-ish disc, 0.4 = a glowing cloud) */
  bokehSoft: [number, number];
  /** multiplier on bokeh alpha */
  bokehAlpha: number;
  /** mote radius range, design px (diameter 0.6–4) */
  moteSize: [number, number];
  /** exponent on the brilliance draw: higher = fewer bright motes */
  moteGamma: number;
  /** motes are stretched along the flow by 1 + elong·speed */
  elong: number;
  /** mote speed range, design px per day along the flow */
  speed: [number, number];
  /** lateral sway amplitude, design px (snow) */
  sway: number;
  /** how flat the perpendicular density is: 0 = all in beams, 1 = uniform */
  flat: number;
  /** odds of a mote being [light, glass, bloomLight, spark] (need not sum to 1; normalised) */
  colors: [number, number, number, number];
  /** share of motes (and of the sparks) that rise out of the bloom's anchor as a plume; the rest are field dust */
  plume: number;
  /** fraction of motes that are big, soft, out-of-focus flakes */
  flakes: number;
  /** [min, max] count of motion streaks ("sparks") */
  streaks: [number, number];
  /** [min, max] count of large stars */
  stars: [number, number];
  /** how many of the stars carry a four-point glint */
  glints: number;
  /** multiplier on the alpha of every mote */
  bright: number;
  /** chance a mote carries a tiny soft halo */
  halo: number;
}

/**
 * THE VEIL — every magic number of the foreground optics.
 * Plain JSON-serialisable data only (structuredClone'd for reset).
 * The four top-level numbers (dustDensity, bokehSize, bokehGlow, brilliance) are the sliders.
 */
export const veilParams = {
  /** slider-able parameters the explainer exposes (2–4 per layer) */
  knobs: [
    { path: 'layers.veil.dustDensity', label: 'Dust density', min: 0.2, max: 2.5, step: 0.05 },
    { path: 'layers.veil.bokehSize', label: 'Bokeh size', min: 0.5, max: 1.8, step: 0.05 },
    { path: 'layers.veil.bokehGlow', label: 'Bokeh glow', min: 0, max: 2, step: 0.05 },
    { path: 'layers.veil.brilliance', label: 'Mote brilliance', min: 0.3, max: 2, step: 0.05 },
  ] as Knob[],
  compose: { blend: 'screen', alpha: 1, parallax: 1.5 } as Compose,

  // ── the four sliders ────────────────────────────────────────────
  /** multiplier on the number of dust motes, streaks and stars */
  dustDensity: 1,
  /** multiplier on the diameter of every bokeh disc */
  bokehSize: 1,
  /** multiplier on the brightness of the bokeh */
  bokehGlow: 1,
  /** multiplier on the brightness of the motes */
  brilliance: 1,

  // ── the four dust traits ────────────────────────────────────────
  kinds: {
    sparse: {
      motes: 170, bokeh: [6, 10], bokehSoft: [0.09, 0.2], bokehAlpha: 1.05,
      moteSize: [0.45, 2.5], moteGamma: 2.5, elong: 0.5, speed: [5, 12], sway: 0, flat: 0.32,
      colors: [46, 30, 16, 5], plume: 0.36, flakes: 0, streaks: [1, 3], stars: [0, 0], glints: 0, bright: 1.25, halo: 0.22,
    },
    drifting: {
      motes: 480, bokeh: [10, 16], bokehSoft: [0.1, 0.24], bokehAlpha: 1,
      moteSize: [0.45, 2.2], moteGamma: 2.6, elong: 1.15, speed: [6, 17], sway: 0, flat: 0.16,
      colors: [42, 30, 20, 4], plume: 0.46, flakes: 0, streaks: [3, 6], stars: [0, 0], glints: 0, bright: 1.05, halo: 0.12,
    },
    snowfall: {
      motes: 1050, bokeh: [8, 13], bokehSoft: [0.26, 0.44], bokehAlpha: 0.82,
      moteSize: [0.4, 1.7], moteGamma: 2.1, elong: 0, speed: [3, 8], sway: 9, flat: 0.82,
      colors: [70, 18, 12, 0], plume: 0.24, flakes: 0.17, streaks: [0, 1], stars: [0, 0], glints: 0, bright: 0.88, halo: 0.03,
    },
    starfall: {
      motes: 720, bokeh: [7, 11], bokehSoft: [0.1, 0.24], bokehAlpha: 0.78,
      moteSize: [0.45, 2.2], moteGamma: 2.6, elong: 2, speed: [8, 22], sway: 0, flat: 0.2,
      colors: [34, 28, 24, 14], plume: 0.4, flakes: 0, streaks: [16, 26], stars: [7, 12], glints: 6, bright: 1.1, halo: 0.1,
    },
  } as Record<string, VeilKind>,

  // ── where things go ─────────────────────────────────────────────
  frame: {
    /** items may sit this far outside the frame (design px) so bokeh can be cropped by the edge */
    margin: 90,
    /** a wide frame gets more items: count × clamp(aspect / 0.8, lo, hi) */
    areaLo: 0.72, areaHi: 2.0,
  },
  flow: {
    /** hole left at the centre of a radial (Nadir) flow, in bloom radii */
    radialHole: 0.07,
    /** stream bands: cells across the frame and their noise octaves */
    bandFreq: 3.2, bandOctaves: 3,
    /** how strongly dust gathers in the beam that runs through the bloom anchor (0..1) and its half-width (fraction of the frame) */
    beam: 0.85, beamSigma: 0.24,
  },
  /** dust that rises out of the bloom's anchor: born near it, carried along the axis (or outward, on Nadir), fading with age */
  plume: {
    /** where it starts and where it dies, in full-bloom radii */
    start: 0.2, len: 1.5,
    /** angular spread of the plume about the axis, as a fraction of the horizon's fan (one std-dev) */
    fan: 0.27,
    /** how far a slow swirl of noise bends the streams (design px) and its frequency (per px) */
    wander: 52, wanderFreq: 0.0042,
    /** brightness falls with age as (1 − age)^fade */
    fade: 0.7,
    /** odds of a plume mote being [light, glass, bloomLight, spark] */
    colors: [38, 14, 42, 6],
  },
  light: {
    /** the bloom's reach for dust, as a fraction of the full-bloom radius (scales up as the bud swells) */
    reach: 0.72, reachBud: 0.35,
    /** the centre of the bloom stays clear: dust dims to `floor` inside `clear` radii, ramping to full by `clearEnd` */
    clear: 0.06, clearEnd: 0.42, floor: 0.3,
    /** dust brightness = base + gain · near · front */
    base: 0.75, gain: 1.15,
    /** falloff sharpness of the near-light glow */
    sharp: 1.8,
    /** the bloom opening lifts the dust near it by up to this much */
    bloomLift: 0.3,
    /** extra lift by the (revealed) Light class */
    lightClass: { lamp: 1, radiant: 1.06, blazing: 1.16, nova: 1.3 } as Record<string, number>,
  },

  // ── bokeh: soft, large, out-of-focus discs ──────────────────────
  bokehShape: {
    /** diameter range, design px; `skew` > 1 makes small discs commoner */
    diam: [44, 175], skew: 1.65,
    /** each seed multiplies the skew by a draw from this range (small discs commoner … big discs commoner) */
    skewSeed: [0.6, 1.35],
    /** each seed favours one colour family by this factor */
    favour: 2.2,
    /** a wide frame scales the disc count by areaK^areaCount and the disc size by areaK^areaSize */
    areaCount: 0.7, areaSize: 0.4,
    /** draft still draws this fraction of the discs (plus its share of the rest), so the composition matches */
    draftKeep: 0.6,
    /** the first few discs are heroes: big, and cropped by a frame edge; their diameter range */
    heroes: 2, heroDiam: [110, 172], heroGain: 1.5,
    /** alpha × (smallest … largest disc) */
    sizeGain: [1.2, 0.74],
    /** where the discs go: near the light, hugging the edges, anywhere */
    where: [0.34, 0.42, 0.24],
    /** peak alpha of the rim before the sliders (0..1) */
    alpha: [0.29, 0.59],
    /** interior level (fraction of the rim peak), rim height, rim position and width in unit radii */
    centre: [0.5, 0.7], rim: [0.3, 0.6], rimAt: 0.88, rimWidth: 0.22,
    /** three looks: a filled glow, a brighter-rimmed ring, and the standard disc (the rest) */
    glowChance: 0.28, ringChance: 0.22,
    glow: { centre: 1.35, rim: 0.3, soft: 1.25 },
    ring: { centre: 0.72, rim: 1.35, soft: 0.85 },
    /** bigger discs are more defocused: edge softness × (small … large) */
    sizeSoft: [0.75, 1.4],
    /** a plateau of halation just outside the disc edge */
    halation: 0.13,
    /** how much of a polygonal aperture shows (0 = round), varies per disc */
    aperture: [0.16, 0.5],
    /** aperture blade counts to pick from */
    blades: [5, 6, 6, 6, 6, 7, 7, 8, 9],
    /** the side facing the light is brighter by this much */
    litSide: [0.2, 0.5],
    /** faint dusty mottling inside the disc */
    mottle: [0.05, 0.16],
    /** colour: fringe hue shift (deg) between centre and rim, and its chroma boost */
    fringeHue: [6, 22], fringeChroma: 1.15,
    /** chroma boost on the palette colour before it is used for glass (bokeh are richer than the palette's canon) */
    chromaBoost: 1.3,
    /** the palette's near-white `light` tints toward its `glass` by this much, so pale discs keep a hue */
    lightTint: 0.5,
    /** share of discs whose hue is nudged within the palette family, and by how much (deg) */
    hueJitter: 0.7, hueRange: 42,
    /** odds of [glass, mid, light, haze, bloomLight, spark] */
    colors: [28, 20, 6, 18, 14, 14],
    /** slow sway around the resting place: amplitude (design px) and period (days) */
    sway: [10, 42], period: [36, 90],
    /** how far off the frame a disc may be centred and still be drawn, unit radii */
    cull: 1.35,
    /** sprite resolution: real px per sprite cell, and limits */
    cell: 2.1, minRes: 30, maxRes: 120,
    /** bokeh out of focus (early growth): extra edge softness, lost rim, extra radius */
    unfocusSoft: 0.5, unfocusRadius: 0.2,
    /** bokeh that already ghost in at the dim seed (the two strongest) and how much of them shows */
    ghosts: 2, ghostAmount: 0.6,
    /** the light exclusion: bokeh dims over the bloom's core */
    coreClear: 0.4, coreFloor: 0.18,
  },

  // ── dust: crisp motes ───────────────────────────────────────────
  dust: {
    /** smallest visible radius in px (below this the mote gets fainter instead of smaller) */
    minPx: 0.46,
    /** baseline alpha = a0 + a1 · brilliance */
    a0: 0.3, a1: 0.85,
    /** brilliant motes get whiter cores */
    whiten: 0.62,
    /** halo radius = mote radius × (haloMin … haloMax) and its alpha relative to the mote */
    haloMin: 4, haloMax: 10, haloAlpha: 0.26,
    /** big soft flakes (snowfall): radius design px and alpha */
    flakeSize: [2.3, 12], flakeAlpha: 0.4,
    /** fraction of motes that already glimmer at the dim seed, and how much of them shows */
    early: 0.14, earlyAmount: 0.6,
    /** twinkle of the bright ones with the days: depth and cycles per day */
    twinkle: 0.16, twinkleRate: [0.3, 2.2],
    /** growth gathering: threshold and span of each item's appearance (in growth-window units) */
    appear: [0, 0.68], span: [0.22, 0.32],
    /** cap on how many motes a slider can conjure */
    maxMotes: 3600,
  },

  // ── sparks: motion streaks and stars ────────────────────────────
  streak: {
    /** length and width, design px */
    len: [16, 74], lenStarfall: [26, 120], width: [0.9, 2.2],
    /** angle jitter (deg) about the flow */
    jitter: 5,
    alpha: [0.45, 0.95],
    /** odds of [spark, light, glass] */
    colors: [38, 42, 20],
    /** more of them sit in the beam */
    beam: 0.9,
  },
  star: {
    /** where the stars sit: [near the light, hugging an edge, anywhere]; never closer to the anchor than `minReach` bloom radii */
    where: [0.42, 0.18, 0.4], minReach: 0.42,
    /** slow sway around the resting place: amplitude (design px) and period (days) */
    sway: [14, 46], period: [30, 80],
    /** core radius, design px */
    size: [2.0, 4.0],
    /** halo radius, design px */
    halo: [16, 42],
    /** glint arm length, design px, and half-width at the centre */
    glintLen: [46, 130], glintWidth: 0.95,
    /** the eight-point ones (the first this many glints also get short diagonal arms) */
    diagonals: 2,
    /** tilt of the glints, deg */
    tilt: 14,
  },
};
