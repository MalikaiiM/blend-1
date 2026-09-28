// The block clock. A piece is a pure function of (seed, block, horizon, sky):
// nothing here keeps state. `block` counts from the block the mint opens.

import { PARAMS } from './params.ts';
import { clamp, smootherstep, smoothstep, TAU } from './math.ts';

export type Phase = 'seed' | 'growing' | 'still' | 'opening' | 'bloomed';

const C = PARAMS.clock;

export const BLOCKS_PER_DAY = C.blocksPerDay;
export const BLOCKS_PER_TIDE = C.tideDays * C.blocksPerDay; // 50,400
export const GROWTH_BLOCKS = C.tides * BLOCKS_PER_TIDE; // 201,600  (28 days)
export const REVEAL_BLOCK = GROWTH_BLOCKS;
export const TURN_CLOSE_BLOCK = REVEAL_BLOCK - C.stillHourBlocks;
export const BLOOM_END_BLOCK = REVEAL_BLOCK + C.bloomBlocks;

export interface Timeline {
  block: number;
  /** 0 at mint, 1 at the reveal block */
  t: number;
  /** 1..4 while growing (4 stays through the still hour and after) */
  tide: number;
  /** progress within the current tide, 0..1 */
  tideProgress: number;
  /** whole days since mint */
  day: number;
  /** 0..1 through the current day */
  dayPhase: number;
  phase: Phase;
  /** bloom opening 0..1 (0 until the reveal block; 1 once fully open) */
  bloom: number;
  revealed: boolean;
  turnOpen: boolean;
  /** days of slow drift — frozen at the reveal so the final image never moves again */
  drift: number;
  /** signed daily breathing, −1..1, faded out as the bloom opens */
  pulse: number;
  blocksToReveal: number;
}

export function timeline(blockIn: number): Timeline {
  const block = Math.max(0, Math.floor(blockIn));
  const t = clamp(block / GROWTH_BLOCKS);
  const tide = Math.min(C.tides, Math.floor(block / BLOCKS_PER_TIDE) + 1);
  const tideProgress = tide >= C.tides && block >= GROWTH_BLOCKS ? 1 : (block % BLOCKS_PER_TIDE) / BLOCKS_PER_TIDE;
  const bloom = clamp((block - REVEAL_BLOCK) / C.bloomBlocks);
  const dayPhase = (block % BLOCKS_PER_DAY) / BLOCKS_PER_DAY;
  const phase: Phase =
    block <= 0 ? 'seed'
    : block < TURN_CLOSE_BLOCK ? 'growing'
    : block < REVEAL_BLOCK ? 'still'
    : block < BLOOM_END_BLOCK ? 'opening'
    : 'bloomed';
  const settle = 1 - smoothstep(0, 1, bloom);
  return {
    block, t, tide, tideProgress,
    day: Math.floor(block / BLOCKS_PER_DAY),
    dayPhase, phase, bloom,
    revealed: block >= REVEAL_BLOCK,
    turnOpen: block < TURN_CLOSE_BLOCK,
    drift: Math.min(block, REVEAL_BLOCK) / BLOCKS_PER_DAY,
    pulse: Math.sin(dayPhase * TAU) * settle,
    blocksToReveal: Math.max(0, REVEAL_BLOCK - block),
  };
}

/** Growth ramp for a named window (see PARAMS.growth.windows): 0 → 1, smooth. */
export function growthRamp(tl: Timeline, name: string): number {
  const w = PARAMS.growth.windows[name] ?? [0, 1];
  return smootherstep(w[0], w[1], tl.t);
}

/** Named moments on the clock, for the lab and the site. */
export const STAGES = {
  seed: 0,
  tide1: Math.round(BLOCKS_PER_TIDE * 0.5),
  tide2: Math.round(BLOCKS_PER_TIDE * 1.5),
  tide3: Math.round(BLOCKS_PER_TIDE * 2.5),
  tide4: Math.round(BLOCKS_PER_TIDE * 3.5),
  still: TURN_CLOSE_BLOCK + 10,
  reveal: REVEAL_BLOCK,
  opening: REVEAL_BLOCK + Math.round(C.bloomBlocks * 0.45),
  bloomed: BLOOM_END_BLOCK + 1,
} as const;
export type StageName = keyof typeof STAGES;

export const mintOpenMs = () => Date.parse(PARAMS.drop.mintOpenISO);
export const blockToDate = (block: number) => new Date(mintOpenMs() + block * C.blockSeconds * 1000);
export const dateToBlock = (d: Date | number) =>
  Math.round(((typeof d === 'number' ? d : d.getTime()) - mintOpenMs()) / (C.blockSeconds * 1000));

export function describeBlock(block: number) {
  const tl = timeline(block);
  const days = block / BLOCKS_PER_DAY;
  return { tl, days, date: blockToDate(block) };
}
