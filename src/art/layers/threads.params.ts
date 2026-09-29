import type { Compose, Knob } from './types.ts';

/**
 * THE THREADS — every magic number of the filament layer.
 * Plain JSON-serialisable data only (structuredClone'd for reset).
 *
 * Units: "px" are design pixels (multiplied by S = h/1000 at render time); "reach" is
 * √(w·h) × `length` (so a thread of 0.5 reaches half a frame on any aspect); "U" is min(w,h).
 * Angles in radians unless a name says deg.
 */
export const threadsParams = {
  /** slider-able parameters the explainer exposes (2–4 per layer) */
  knobs: [
    { path: 'layers.threads.count', label: 'Thread count', min: 0.4, max: 1.6, step: 0.05 },
    { path: 'layers.threads.curlScale', label: 'Curl scale', min: 0.5, max: 2, step: 0.05 },
    { path: 'layers.threads.glow', label: 'Glow', min: 0, max: 2, step: 0.05 },
    { path: 'layers.threads.length', label: 'Reach', min: 0.5, max: 1.5, step: 0.05 },
  ] as Knob[],
  compose: { blend: 'screen', alpha: 1, parallax: 0.55 } as Compose,

  // ── the four sliders (1 = as designed) ─────────────────────────────
  /** multiplies how many filaments each family sends out */
  count: 1,
  /** flow-field frequency: <1 broad sweeps, >1 tight eddies */
  curlScale: 1,
  /** strength of the glow and halo passes */
  glow: 1,
  /** multiplies how far every filament reaches */
  length: 1,

  // ── painting ──────────────────────────────────────────────────────
  draw: {
    /**
     * The glow and halo live on small canvases of a FIXED height (so a small pixel is the same slice of the design
     * at every output size, and the glow looks alike on a thumbnail and a poster). Radii in design px.
     */
    glowRows: 230,
    glowRadius: 3.6,
    glowAlpha: 0.05,
    /** halo canvas: the wide gathering of light around bright filaments */
    haloRows: 90,
    haloRadius: 18,
    haloAlpha: 0.025,
    /** box-blur radius (in small-canvas px, two passes each way) */
    /** exposure control: cell size (px) of the crowding map and the level at which a crowd stops adding light */
    densCell: 22,
    densMax: 1.7,
    blurGlow: 1,
    blurHalo: 1,
    /** the thin white-hot core: width as a fraction of the body, and its alpha gain */
    /** overall brightness of every filament (1 = as authored per family) */
    gain: 0.9,
    coreWidth: 0.4,
    coreGain: 1.15,
    /** how much of the palette's `light` role tints the core */
    coreTint: 0.36,
    /** a filament thinner than this (design px) is never drawn thinner */
    minWidth: 0.55,
    /** rough chunk length (design px) — colour and brightness are set per chunk */
    chunkLen: 62,
    chunkMin: 3,
    chunkMax: 9,
    /** brightness fall-off from origin to tip (1 = none) and per-chunk shimmer */
    tipFade: 0.32,
    flicker: 0.32,
    /** growing tips glow: crisp head, glow blob and how much of it survives once fully grown */
    tipGlow: 1,
    tipRest: 0.3,
    /** the seed's stubs lengthen by this factor (×) across the first tide, before the threads' own window opens */
    stubGrow: 1.4,
  },

  /** how many of the generated filaments are drawn at draft quality: q + (1 − q) × draftFloor */
  draftFloor: 0.3,
  /** …and how much brighter each of them is drawn (× the share left out) */
  draftGain: 0.8,

  /** brightness is kept a little lower where the lumen will sit (its anchor) */
  centre: { radius: 0.2, minAlpha: 0.72 },

  /** slow sway with the days (frozen at the reveal by tl.drift) */
  sway: { freq: [0.045, 0.13] as [number, number] },

  color: {
    /** how far `light` bleeds into the root colour, and how far `mid` brightens for tips */
    rootLight: [0.05, 0.22] as [number, number],
    tipLift: 1.28,
    tipChroma: 1.12,
    tipMaxL: 0.82,
    /** spark: the fraction of filaments carrying the accent, and the share inside the chosen family */
    sparkAny: 0.014,
    sparkFamily: 0.34,
    /** spectral palettes: hue-walk travels this far from root to tip */
    walkSpan: 0.2,
  },

  /**
   * One family per `traits.body.growth`. Shared keys:
   *   n           filaments at count = 1
   *   steps       polyline segments per filament (same at every quality)
   *   len         reach range (fractions of reach; reeds: of the frame height)
   *   w           base width range (px); wTip = width at the tip as a fraction of the base
   *   alpha       [min, max, gamma] brightness of a filament (u^gamma between min and max)
   *   startMax    latest growth start (in growth time g)
   *   stubP/stubR/stubLen  the few stubs a seed already has near the anchor
   *   flow        steering: wa axis, wc curl, wr outward, ws swirl, freq curl frequency, ell steering length (px),
   *               wob wobble curvature (rad/px×1e3), wobF wobble frequency
   *   sway        [amplitude px, exponent] of the slow sway
   */
  families: {
    // long, smooth, near-parallel sweeping arcs in ribbons of hair-fine filaments
    silk: {
      n: 236, steps: 100,
      ribbons: [5, 8], edgeShare: 0.4,
      len: [0.55, 1.1], w: [0.5, 1.25], wTip: 0.2,
      alpha: [0.1, 0.95, 2.4],
      startMax: 0.5, stubP: 0.4, stubR: 0.3, stubLen: [0.04, 0.09],
      /** total turning of a ribbon's arc (rad) */
      turn: [0.8, 2.2],
      ribW: [16, 46], originSpread: 0.4, pinch: [0.8, 2.2], braid: 1.2,
      headJit: 0.012, turnJit: 0.05, lenJit: [0.7, 1],
      flow: { wa: 0.7, wc: 0.5, wr: 0, ws: 0.15, freq: 0.85, ell: 320, wob: 0.3, wobF: 1.6, fine: 0 },
      sway: [5, 1.3],
    },
    // branching: trunks fork and taper into twigs — roots, lightning, river deltas
    root: {
      n: 170, steps: 110, trunks: [7, 10], edgeShare: 0.42,
      len: [0.34, 0.74], w: [1.9, 4.2], wTip: 0.1,
      alpha: [0.28, 0.95, 1.2],
      startMax: 0.55, stubP: 0.6, stubR: 0.3, stubLen: [0.05, 0.11],
      /** children per parent at depth 0 / 1 / 2 (inclusive ranges) */
      kids: [[3, 5], [2, 3], [1, 2]] as [number, number][],
      kidLen: [0.55, 0.95], kidAngle: [26, 60], kidW: 0.8, kidAlpha: 0.92, spawn: [0.08, 0.82],
      jag: 0.35,
      flow: { wa: 0.5, wc: 0.7, wr: 0.6, ws: 0.4, freq: 1.5, ell: 170, wob: 0.9, wobF: 3.2, fine: 0.15 },
      sway: [3.2, 1.3],
    },
    // short, dense, curling; spiral tips, clumps
    coral: {
      n: 270, steps: 70, clumps: [12, 18], edgeShare: 0.2, fieldShare: 0.35,
      len: [0.06, 0.24], w: [1.3, 3.2], wTip: 0.3,
      alpha: [0.2, 0.85, 1.4], densMax: 1.15,
      startMax: 0.5, stubP: 0.75, stubR: 0.32, stubLen: [0.08, 0.16],
      clumpR: [14, 46], headSpread: 0.75,
      /** total curl of the spiral tip (rad), the share of the length it occupies, and base curvature (rad per length) */
      curl: [4.2, 9.5], curlFrom: [0.36, 0.6], bend: [0.4, 2.2], flipP: 0.28,
      beadP: 0.45, beadR: [1.4, 3],
      flow: { wa: 0.4, wc: 0.4, wr: 0.35, ws: 0.15, freq: 2, ell: 60, wob: 1.2, wobF: 4, fine: 0.4 },
      sway: [2.4, 1.6],
    },
    // vertical grasses rising from the bottom edge, gently swaying, with tiny bead/seed-heads
    reed: {
      n: 140, steps: 90, tufts: [16, 26], glow: 0.55, densMax: 1.05,
      /** heights are fractions of the frame HEIGHT */
      len: [0.24, 0.68], w: [1, 2.5], wTip: 0.22,
      alpha: [0.24, 0.9, 1.3],
      startMax: 0.5, stubP: 0.8, stubR: 0.5, stubLen: [0.05, 0.12],
      tuftW: [8, 26], lean: 0.24, leanJit: 0.14, bendTurn: [0.35, 1.15],
      beadR: [1.1, 2.6], pearlP: 0.4, pearls: [2, 4], pearlSpan: [0.68, 0.94],
      /** how strongly the tallest tufts crowd toward the anchor */
      crowd: 0.55, crowdWidth: 0.34,
      flow: { wa: 0, wc: 0.22, wr: 0, ws: 0, freq: 1.2, ell: 500, wob: 0.6, wobF: 2, fine: 0 },
      sway: [12, 1.7],
    },
    // dense chaotic tangles: high energy, many crossings
    storm: {
      n: 262, steps: 110, vortices: [2, 3],
      len: [0.14, 0.6], w: [0.6, 2.1], wTip: 0.18,
      alpha: [0.2, 0.98, 1.6],
      startMax: 0.55, stubP: 0.6, stubR: 0.3, stubLen: [0.04, 0.1],
      anchorShare: 0.5, edgeShare: 0.22, anchorSigma: 0.17,
      jag: 0.5,
      flow: { wa: 0.3, wc: 1.4, wr: 0.15, ws: 0.8, freq: 3.1, ell: 34, wob: 3.2, wobF: 7, fine: 1.5 },
      sway: [4.5, 1.2],
    },
  },

  /** where filaments are born */
  origin: {
    /** anchor cluster: gaussian radius (× U) and how wide the outward fan is (× spread) */
    anchorSigma: 0.075,
    fanSigma: 0.26,
    /** the horizon edge: gaussian spread along the edge (× the edge's length) */
    edgeSigma: 0.3,
    /** nadir: filaments also rise from a ring at this radius range (× U) */
    ring: [0.03, 0.2] as [number, number],
  },

  /** the same ordered steps at every quality: polyline resolution safety */
  guard: { maxThreads: 640 },
};
