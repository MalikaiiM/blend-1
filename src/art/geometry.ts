// Where things are. One shared answer to "where is the bloom?" so every layer agrees.

import { PARAMS } from './params.ts';
import { DEG } from './math.ts';
import type { RGB } from './color.ts';
import type { Traits } from './traits.ts';
import type { Timeline } from './clock.ts';
import { growthRamp } from './clock.ts';
import { lerp } from './math.ts';
import { makeRng, seedWords } from './rng.ts';

export interface Layout {
  w: number;
  h: number;
  /** min(w,h) */
  unit: number;
  /** h / 1000 — px per design pixel */
  S: number;
  /** primary bloom anchor, px */
  cx: number;
  cy: number;
  /** full-bloom radius, px */
  R: number;
  /** direction the bloom opens toward, radians (canvas coords: 0 → +x, π/2 → +y) */
  axis: number;
  /** angular width of the fan, radians (2π = full radial) */
  spread: number;
  /** 0..1 how much of the bloom's final size the bud has reached so far (growth only) */
  bud: number;
  /** 1 when the fan is full radial (nadir) */
  radial: boolean;
  /** unit vector of the axis */
  ax: number;
  ay: number;
  light: RGB;
  haze: RGB;
}

export function layout(traits: Traits, tl: Timeline, w: number, h: number): Layout {
  const hz = PARAMS.horizons[traits.horizon.index]!;
  const unit = Math.min(w, h);
  const r = makeRng(seedWords(traits.seed), 'layout');
  const jx = r.range(-0.045, 0.045), jy = r.range(-0.03, 0.03);
  const radial = hz.spreadDeg >= 359;
  const R = unit * (radial ? 0.44 : 0.62) * r.range(0.93, 1.07);
  const axis = (hz.axisDeg + r.range(-7, 7)) * DEG;
  return {
    w, h, unit, S: h / PARAMS.canvas.designHeight,
    cx: (hz.anchor[0] + jx) * w,
    cy: (hz.anchor[1] + jy) * h,
    R, axis,
    spread: hz.spreadDeg * DEG,
    bud: lerp(PARAMS.growth.budAt0, 1, growthRamp(tl, 'bud')),
    radial,
    ax: Math.cos(axis), ay: Math.sin(axis),
    light: traits.colors.bloomLight,
    haze: traits.colors.haze,
  };
}
