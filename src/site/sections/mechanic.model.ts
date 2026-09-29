// The mechanic section's model: the scrubber's scale, the keeper's turn log (built on the SAME reference
// functions the contract will port — art/mechanic.ts) and a few formatters. Pure; no DOM.

import {
  BLOCKS_PER_DAY, BLOCKS_PER_TIDE, BLOOM_END_BLOCK, REVEAL_BLOCK, TURN_CLOSE_BLOCK, PARAMS,
  MechanicError, isTurnOpen, mintToken, turn as refTurn, blockToDate,
  type Horizon, type TokenState, type Timeline,
} from '../../art/index.ts';

// ── the scale ────────────────────────────────────────────────────────
// The last day is where the drama is, so the scale is piecewise-linear: four honest stretches, each linear.
//   growth (28 days)  ·  the Still Hour (300 blocks)  ·  the opening (1 day)  ·  bloomed (a little past the end)
export const POS_MAX = 10000;
export const BLOCK_MAX = BLOOM_END_BLOCK + Math.round(BLOCKS_PER_DAY / 2);

interface Zone { b0: number; b1: number; p0: number; p1: number }
export const ZONES: Zone[] = [
  { b0: 0, b1: TURN_CLOSE_BLOCK, p0: 0, p1: 7800 },
  { b0: TURN_CLOSE_BLOCK, b1: REVEAL_BLOCK, p0: 7800, p1: 8100 },
  { b0: REVEAL_BLOCK, b1: BLOOM_END_BLOCK, p0: 8100, p1: 9600 },
  { b0: BLOOM_END_BLOCK, b1: BLOCK_MAX, p0: 9600, p1: POS_MAX },
];
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function blockToPos(block: number): number {
  const b = clamp(block, 0, BLOCK_MAX);
  const z = ZONES.find((z) => b <= z.b1) ?? ZONES[ZONES.length - 1]!;
  return z.p0 + ((b - z.b0) / (z.b1 - z.b0)) * (z.p1 - z.p0);
}
export function posToBlock(pos: number): number {
  const p = clamp(pos, 0, POS_MAX);
  const z = ZONES.find((z) => p <= z.p1) ?? ZONES[ZONES.length - 1]!;
  return Math.round(z.b0 + ((p - z.p0) / (z.p1 - z.p0)) * (z.b1 - z.b0));
}
/** Fraction (0..1) along the scale. */
export const blockFrac = (block: number) => blockToPos(block) / POS_MAX;

// ── keyboard notches ─────────────────────────────────────────────────
const OPEN_NOTCH = Math.round(BLOCKS_PER_DAY / 4); // every six hours while the bloom opens
export const DAY_NOTCHES: number[] = [
  ...Array.from({ length: PARAMS.clock.tides * PARAMS.clock.tideDays }, (_, d) => d * BLOCKS_PER_DAY),
  TURN_CLOSE_BLOCK, REVEAL_BLOCK,
  REVEAL_BLOCK + OPEN_NOTCH, REVEAL_BLOCK + 2 * OPEN_NOTCH, REVEAL_BLOCK + 3 * OPEN_NOTCH,
  BLOOM_END_BLOCK, BLOCK_MAX,
];
export const TIDE_NOTCHES: number[] = [
  ...Array.from({ length: PARAMS.clock.tides }, (_, i) => i * BLOCKS_PER_TIDE),
  TURN_CLOSE_BLOCK, REVEAL_BLOCK, BLOOM_END_BLOCK, BLOCK_MAX,
];
/** The next (dir = 1) or previous (dir = −1) notch from `block`. */
export function stepNotch(block: number, dir: 1 | -1, notches: number[]): number {
  if (dir > 0) return notches.find((n) => n > block) ?? notches[notches.length - 1]!;
  for (let i = notches.length - 1; i >= 0; i--) if (notches[i]! < block) return notches[i]!;
  return notches[0]!;
}

// ── named moments (jump chips) ───────────────────────────────────────
export const JUMPS: { id: string; label: string; block: number; mid?: boolean }[] = [
  { id: 'seed', label: 'Seed', block: 0 },
  { id: 'tide1', label: 'Tide I', block: Math.round(BLOCKS_PER_TIDE * 0.5) },
  { id: 'tide2', label: 'Tide II', block: Math.round(BLOCKS_PER_TIDE * 1.5) },
  { id: 'tide3', label: 'Tide III', block: Math.round(BLOCKS_PER_TIDE * 2.5) },
  { id: 'tide4', label: 'Tide IV', block: Math.round(BLOCKS_PER_TIDE * 3.5) },
  { id: 'still', label: 'Still Hour', block: TURN_CLOSE_BLOCK + 10 },
  { id: 'reveal', label: 'Reveal', block: REVEAL_BLOCK },
  { id: 'bloomed', label: 'Bloomed', block: BLOOM_END_BLOCK + 1 },
];

// ── the turn log ─────────────────────────────────────────────────────
export interface TurnEvent { id: number; block: number; horizon: Horizon | null }

export const CLOSED_MESSAGE = 'The Still Hour has begun. The seeds hold still.';

/** "Leave it to drift" — clears the turn. (Not in art/mechanic.ts: see the shared change request.) */
function clearTurn(tok: TokenState, block: number): TokenState {
  if (!isTurnOpen(block)) throw new MechanicError('closed', CLOSED_MESSAGE);
  return { ...tok, turn: null, turnBlock: null };
}

/**
 * The keeper's history. The state at any block is a fold over the events up to that block through the
 * reference model, so the rules that refuse a turn here are the rules the contract will refuse it by.
 * Turns made at an earlier block than existing ones are allowed (the scrubber is a time machine); the
 * latest event on the clock is the one that counts.
 */
export class TurnLog {
  private events: TurnEvent[] = [];
  private nextId = 1;
  constructor(readonly tokenId: number, readonly seed: string) {}

  /** The token as it stands at `block`. */
  at(block: number): TokenState {
    let tok = mintToken(this.tokenId, this.seed);
    for (const e of this.sorted()) {
      if (e.block > block) break;
      tok = e.horizon === null ? clearTurn(tok, e.block) : refTurn(tok, e.horizon, e.block);
    }
    return tok;
  }
  /** Face a horizon. Throws MechanicError if the Still Hour has begun. */
  turn(horizon: number, block: number): TurnEvent {
    const next = refTurn(this.at(block), horizon, block); // validates through the reference model
    return this.push(next.turn, block);
  }
  drift(block: number): TurnEvent {
    const next = clearTurn(this.at(block), block);
    return this.push(next.turn, block);
  }
  private push(horizon: Horizon | null, block: number): TurnEvent {
    const e: TurnEvent = { id: this.nextId++, block, horizon };
    this.events.push(e);
    if (this.events.length > 40) this.events.shift();
    return e;
  }
  private sorted() { return [...this.events].sort((a, b) => a.block - b.block || a.id - b.id); }
  /** Newest first (by block, then by when it was pressed). */
  list(): TurnEvent[] { return this.sorted().reverse(); }
  /** The event that counts: the last one on the clock. */
  counting(): TurnEvent | null { return this.list()[0] ?? null; }
  get size() { return this.events.length; }
}

// ── copy + formats ───────────────────────────────────────────────────
export const ROMAN = ['I', 'II', 'III', 'IV'];
export const tideName = (n: number) => PARAMS.lore.tides[Math.min(3, Math.max(0, n - 1))]!;

export const PHASE_LABEL: Record<Timeline['phase'], string> = {
  seed: 'Seed', growing: 'Growing', still: 'The Still Hour', opening: 'Opening', bloomed: 'Bloomed',
};

/** "Day 14, Tide III" — for aria-valuetext and announcements. */
export function spokenTime(tl: Timeline): string {
  if (tl.phase === 'still') return `The Still Hour, day ${tl.day}`;
  if (tl.phase === 'opening') return `Day ${tl.day}, the bloom opening, ${Math.round(tl.bloom * 100)} percent`;
  if (tl.phase === 'bloomed') return 'Bloomed';
  if (tl.phase === 'seed') return 'Block 0, the seed';
  return `Day ${tl.day}, Tide ${ROMAN[tl.tide - 1]}`;
}

const stampFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
});
/** "Thu 12 Nov 2026 · 17:00 UTC" */
export function fmtStamp(block: number): string {
  const p = Object.fromEntries(stampFmt.formatToParts(blockToDate(block)).map((x) => [x.type, x.value]));
  return `${p.weekday} ${p.day} ${p.month} ${p.year} · ${p.hour}:${p.minute} UTC`;
}

export const HORIZON_LINES = PARAMS.horizons.map((h) => h.line);
export { REVEAL_BLOCK, TURN_CLOSE_BLOCK, BLOOM_END_BLOCK, BLOCKS_PER_DAY, BLOCKS_PER_TIDE };
