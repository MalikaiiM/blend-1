import type { Compose, Knob } from './types.ts';

/**
 * THE INCLUSION — every number of the rare features lives here (plain JSON-serialisable data).
 * Lengths are fractions of R (the bloom radius) unless a name says "px" (design px, ×S at draw time).
 */
export const inclusionParams = {
  /** slider-able parameters the explainer exposes (2–4 per layer) */
  knobs: [
    { path: 'layers.inclusion.seam.glow', label: 'Seam glow', min: 0.3, max: 2.2, step: 0.01 },
    { path: 'layers.inclusion.twin.size', label: 'Twin size', min: 0.6, max: 1.5, step: 0.01 },
    { path: 'layers.inclusion.halo.count', label: 'Halo rings', min: 3, max: 10, step: 1 },
    { path: 'layers.inclusion.veil.opacity', label: 'Veil opacity', min: 0.2, max: 1.8, step: 0.01 },
  ] as Knob[],
  compose: { blend: 'source-over', alpha: 1, parallax: 0.9 } as Compose,
  /** kinds that only add light are composed with 'screen'; the ones that darken or copy the glass stay 'source-over' */
  blend: {
    seam: 'source-over', twin: 'screen', eclipse: 'source-over', veil: 'screen', halo: 'source-over', comet: 'screen', spectrum: 'screen',
  } as Record<string, GlobalCompositeOperation>,

  seam: {
    /** glow strength (knob) */
    glow: 1,
    /** where it passes: along the bloom's axis and across it, × R */
    along: [0.05, 0.55], across: [-0.28, 0.28],
    /** heading in degrees from the horizontal (sign is drawn) */
    angleDeg: [26, 64],
    /** segment lengths (design px), heading wander (rad), chance of an abrupt kink */
    seg: [14, 58], wander: 0.42, kink: 0.18,
    /** width of the feathered band where the glass is sheared (design px), shear (px) along the crack, small opening across it */
    band: 240, shift: [9, 16], shearTurn: [14, 52], gapShift: 1.8, ghostA: 0.5, ghostQ: 0.4, ghostScale: 0.5,
    branches: 13, twigChance: 0.5, branchAng: [24, 68], branchLen: [0.06, 0.3],
    gapPx: 2.6, gapAlpha: 0.55, corePx: 5.4, twigPx: 1.9, pools: 8, poolPx: [4, 9], bodyRGB: [226, 165, 62], deepRGB: [160, 100, 34],
    glowPx: [84, 46, 24, 11], glowA: [0.05, 0.09, 0.16, 0.24],
    /** the bloom lights the crack where they meet */
    bloomLift: 0.9, pour: 0.2,
    flecks: 36, fleckPx: [0.7, 2.3], fringePx: 1.6,
  },

  twin: {
    /** size of the second bloom as a fraction of the first (knob multiplies it) */
    scale: [0.5, 0.64], size: 1,
    intensity: 0.82, hue: 22,
    /** how far the thread bows, as a fraction of the distance between the hearts */
    arc: [0.1, 0.2], beads: [4, 7],
    threadPx: 1.5, threadA: 1.0, glowPx: [34, 15, 6], glowA: [0.07, 0.14, 0.26],
  },

  halo: {
    /** number of rings (knob) */
    count: 7,
    /** radius of the first ring, × R */
    r0: [0.24, 0.34],
    px: [1.3, 2.4], alpha: 1.3, glow: 1.6,
    /** how much dimmer the ring is on the side away from where the bloom opens */
    leanFloor: 0.28, drift: 0.12,
    /** wide soft bands under each ring: [width px, alpha] */
    glowBands: [[44, 0.035], [20, 0.07], [9, 0.12]],
    /** the glass rim: hue swing (deg), opacity and offset (px) of the two dispersed lines, and the shadow beyond the ring */
    disperseHue: 42, disperseA: 0.5, dispersePx: 1.5, shadowA: 0.3,
  },

  comet: {
    /** the path's anchor: how far ahead of the bloom (× R) and how far off its axis */
    ahead: [0.85, 1.3], across: [-0.55, 0.55],
    /** heading in degrees from the horizontal */
    angleDeg: [16, 50],
    /** tail length (× frame unit), sideways bend (× tail) */
    tail: [0.7, 1.15], bend: 0.09,
    /** how far off-frame the head starts, × unit */
    travel: 1.2,
    dustW: [3, 88], dustA: 0.85, dustMix: 0.4, fibres: 52,
    ionLen: 1.3, ionPx: 2.6, ionA: 1.0,
    sparks: 120, sparkBias: 1.35, sparkAccent: 0.22,
    headPx: 4.4, comaPx: 34, flarePx: 60,
  },

  veil: {
    /** number of curtains, and the overall opacity (knob) */
    count: 5, opacity: 1,
    /** half-width of a curtain, × frame width; how strongly the curtains lean toward the bloom */
    half: [0.09, 0.19], lean: 0.3,
    /** how far the hues swing (degrees) around the palette's glass colour */
    hueSwing: 42,
    columns: 72, streakA: 0.85, bodyK: 1.8, hemA: 0.2,
    /** the clear hole left around the bloom: radius × R and depth */
    holeR: 0.95, hole: 0.85,
    /** the streaks are drawn at 1/fineDiv of the frame and scaled up */
    fineDiv: 3,
    /** the near-monochrome palette gets a quieter veil so its one hot accent still speaks */
    monoK: 0.5,
  },

  spectrum: {
    /** the hue field ('color' blend) over the bloom's neighbourhood: strength, ring strength, radius (× R) and how much of it shows */
    recolorA: 1, ringA: 0.5, recolorR: 0.95, recolorMix: 0.95,
    /** the bloom split in two extra copies: scale spread, turn (rad), intensity, hue shift (deg) */
    split: { scale: 0.02, rot: 0.03, intensity: 0.16, hue: 80 },
    /** a wide conic dispersion glow round the bloom: radius (× R) and strength */
    glowR: 1.9, glowA: 0.2,
    /** rainbow bands: radius (× R), width (× R), alpha, reversed order (the fainter secondary bow) */
    bands: [
      { r: 1.14, w: 0.2, a: 0.46, rev: false },
      { r: 1.7, w: 0.26, a: 0.24, rev: true },
    ],
    lines: 9, lineA: 0.55,
    /** the split interface lines: offset between colours (px), width (px), alpha */
    splitPx: 2.4, splitLinePx: 0.9, splitA: 0.5,
    beads: [10, 16],
  },

  eclipse: {
    radius: [0.22, 0.3],
    /** moon offset from the sun as a fraction of the moon's radius */
    offset: [0.02, 0.045],
    /** how far (× radius) the moon starts from the sun before it slides in */
    slide: 2.6,
    moon: { alpha: 0.985, rim: 0.42, shine: 0.12 },
    corona: {
      reach: 3.4, alpha: 0.5, veil: 0.1,
      streamers: 46, streamLen: [0.5, 2.4], streamDeg: [0.5, 2.2], streamA: [0.05, 0.2],
    },
    ring: { px: 1.1, alpha: 0.9, lune: 0.075, floor: 0.16, spread: 0.85, glowPx: [3, 9, 24], glowA: [0.42, 0.2, 0.1], bleed: 0.16 },
    spikes: { len: [0.9, 1.5], minorLen: [0.3, 0.6], px: 1.4, alpha: 0.8 },
    bead: { r: 0.32, alpha: 0.85 },
  },
};
