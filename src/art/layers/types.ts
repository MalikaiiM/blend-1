// The contract every layer module fulfils.
import type { Params } from '../params.ts';
import type { RGB } from '../color.ts';
import type { Noise } from '../noise.ts';
import type { Rng } from '../rng.ts';
import type { Timeline } from '../clock.ts';
import type { Traits, ResolvedPalette } from '../traits.ts';
import type { Layout } from '../geometry.ts';
import type { Horizon } from '../mechanic.ts';

export type Cv = HTMLCanvasElement;
export type LayerId = 'abyss' | 'strata' | 'threads' | 'lumen' | 'inclusion' | 'veil' | 'grain' | 'vignette' | 'grade';

export interface PieceState {
  /** blocks since the mint opened (0 = the dim seed; REVEAL_BLOCK = the sky opens) */
  block: number;
  /** the keeper's latest turn; null = never turned (drifts to native) */
  horizon: Horizon | null;
  /** the sealed sky; null = unknown. If the block is past the reveal and this is null, a self-sky is used. */
  sky: string | null;
}

export interface Compose {
  blend: GlobalCompositeOperation;
  alpha: number;
  /** 0 = pinned to the frame, 1 = moves most. Used by the live hero and the exploded view. */
  parallax: number;
}

export interface LayerOut {
  id: LayerId;
  canvas: Cv;
  blend: GlobalCompositeOperation;
  alpha: number;
  parallax: number;
}

export interface LayerCtx {
  w: number;
  h: number;
  /** px per design pixel (h / 1000). Author pixel widths in design px, multiply by S. */
  S: number;
  quality: 'draft' | 'full';
  /** 1 for full, PARAMS.canvas.draftFactor for draft — scale particle COUNTS by this */
  q: number;
  P: Params;
  seed: string;
  traits: Traits;
  tl: Timeline;
  lay: Layout;
  /** the palette in the piece's *current* tone: already dimmed/desaturated by growth and daily pulse */
  pal: Record<'void' | 'deep' | 'mid' | 'glass' | 'light' | 'spark', RGB> & { bloomLight: RGB; haze: RGB; walk(t: number): RGB };
  /** the palette at full tone (final bloom colours) */
  full: ResolvedPalette;
  /** current global tone factors, 0..1 (dim ramps 0.3→1, sat 0.42→1) */
  tone: { dim: number; sat: number };
  /** growth ramps by window name: abyss | strata | threads | bud | veil (0..1) */
  grow(name: 'abyss' | 'strata' | 'threads' | 'bud' | 'veil'): number;
  /** named, independent, deterministic random stream / noise field */
  rng(label: string): Rng;
  noise(label: string): Noise;
  /** lazily flattens every lower layer rendered so far (null for the first layer) — for refraction/halation */
  below(): Cv | null;
  makeCanvas(w?: number, h?: number): Cv;
}

export type LayerFn = (c: LayerCtx) => LayerOut | LayerOut[];

/** A tunable the "How it's made" explainer exposes as a slider. `path` is relative to PARAMS (e.g. "layers.abyss.haze"). */
export interface Knob {
  path: string;
  label: string;
  min: number;
  max: number;
  step: number;
}
