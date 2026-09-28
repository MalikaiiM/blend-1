// THE THREADS — what the seed sends out to feel for the surface.
//
// Luminous filaments, mid-scale, mid-bright and saturated: spun glass, fibre-optic. Five families (traits.body.growth)
// share one machine — integrate a polyline through a curl-noise flow field leaning along the horizon axis and swirling
// around the anchor, then paint it as tapered ribbon + white-hot core + soft glow + faint halo.
//
//   gen    threads.gen.ts   ONE rng stream, fixed order → full-length polylines (never depends on quality/growth/time)
//   paint  threads.paint.ts growth = a fraction of each polyline; sway = tl.drift; glow on small canvases, upscaled
//   time   c.grow('threads') · c.tl (t for the stubs, drift for the sway; frozen at the reveal) — nothing else
import type { LayerCtx, LayerFn } from './types.ts';
import { generate, type Thread } from './threads.gen.ts';
import { paint } from './threads.paint.ts';

/**
 * The filaments of a piece are a pure function of (seed, horizon, frame size, PARAMS.layers.threads) — not of the
 * block. A scrubbing visitor asks for the same seed at hundreds of blocks, so the last two results are kept.
 * The key names every input, so the cache can never change what is drawn.
 */
const memo: { key: string; list: Thread[] }[] = [];
function filaments(c: LayerCtx): Thread[] {
  const key = [c.seed, c.traits.horizon.index, c.traits.body.growth, c.w, c.h, c.lay.cx.toFixed(2), c.lay.cy.toFixed(2), c.lay.axis.toFixed(4), JSON.stringify(c.P.layers.threads)].join('|');
  const hit = memo.find((m) => m.key === key);
  if (hit) return hit.list;
  const list = generate(c);
  memo.unshift({ key, list });
  if (memo.length > 2) memo.length = 2;
  return list;
}

export const render: LayerFn = (c) => {
  const canvas = paint(c, filaments(c));
  return { id: 'threads', canvas, ...c.P.layers.threads.compose };
};
