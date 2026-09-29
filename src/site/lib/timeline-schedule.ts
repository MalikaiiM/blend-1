// Shared by the timeline, mint and footer sections: the drop's schedule, computed from the clock
// and PARAMS.drop only (never hard-coded), plus the countdown and a few prose helpers.

import {
  PARAMS, BLOCKS_PER_DAY, BLOCKS_PER_TIDE, REVEAL_BLOCK, TURN_CLOSE_BLOCK, BLOOM_END_BLOCK,
  blockToDate, mintOpenMs,
} from '../../art/index.ts';
import { fmtInt } from './format.ts';

// ── prose helpers ────────────────────────────────────────────────────
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
/** 512 → "five hundred and twelve"; 28 → "twenty-eight". */
export function words(n: number): string {
  if (n < 20) return ONES[n] ?? String(n);
  if (n < 100) return TENS[Math.floor(n / 10)]! + (n % 10 ? `-${ONES[n % 10]}` : '');
  if (n < 1000) return `${ONES[Math.floor(n / 100)]} hundred${n % 100 ? ` and ${words(n % 100)}` : ''}`;
  return fmtInt(n);
}
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];
export const roman = (n: number) => ROMAN[n - 1] ?? String(n);
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// ── the clock in numbers ─────────────────────────────────────────────
export const TIDES = PARAMS.clock.tides;
export const TIDE_DAYS = PARAMS.clock.tideDays;
export const GROWTH_DAYS = TIDES * TIDE_DAYS;
export const STILL_BLOCKS = PARAMS.clock.stillHourBlocks;
export const BLOOM_DAYS = PARAMS.clock.bloomBlocks / BLOCKS_PER_DAY;
export const EDITION = PARAMS.meta.edition;

/** "7 days", "1 hour", "6 d 23 h" — a span of blocks in plain words. */
export function spanWords(blocks: number): string {
  const s = Math.round(blocks * PARAMS.clock.blockSeconds);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (!h && !m) return plural(d, 'day');
  if (!d && !m) return plural(h, 'hour');
  if (!d && !h) return plural(m, 'minute');
  return [d ? `${d} d` : '', h ? `${h} h` : '', m ? `${m} min` : ''].filter(Boolean).join(' ');
}

// ── dates ────────────────────────────────────────────────────────────
const dayFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const shortFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' });
const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: false });
const clean = (s: string) => s.replace(/,/g, '');
export const dateOf = (block: number) => clean(dayFmt.format(blockToDate(block)));
export const shortDateOf = (block: number) => shortFmt.format(blockToDate(block));
const dmyFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
/** "12 Nov 2026" */
export const dmyOf = (block: number) => dmyFmt.format(blockToDate(block));
export const timeOf = (block: number) => `${timeFmt.format(blockToDate(block))} UTC`;
export const isoOf = (block: number) => blockToDate(block).toISOString();
export const mintWindowCloseBlock = () => Math.round((PARAMS.drop.mintWindowHours * 3600) / PARAMS.clock.blockSeconds);

// ── milestones ───────────────────────────────────────────────────────
export type MilestoneKind = 'mint' | 'tide' | 'still' | 'reveal' | 'bloom';
export interface Milestone {
  n: number;
  id: string;
  kind: MilestoneKind;
  block: number;
  title: string;
  /** the mono line under the title: which tide, or which moment */
  stage: string;
  /** the serif line: what has woken by now */
  line: string;
  turning: 'open' | 'closed';
  turningLabel: string;
  /** position on the to-scale rail, 0..1 */
  frac: number;
  /** "Day 7" */
  dayLabel: string;
}

const tideLore = (n: number) => PARAMS.lore.tides[n - 1]!;

export function milestones(): Milestone[] {
  const mk = (m: Omit<Milestone, 'frac' | 'turningLabel'>): Milestone => ({
    ...m, frac: m.block / BLOOM_END_BLOCK, turningLabel: m.turning === 'open' ? 'Turning open' : 'Turning closed',
  });
  const out: Milestone[] = [
    mk({
      n: 1, id: 'mint', kind: 'mint', block: 0, title: 'Mint opens', stage: `Before the first tide`,
      line: 'A seed is lifted from the deep: cold, dim, half-formed. Its keeper may turn it toward a horizon at once.',
      turning: 'open', dayLabel: 'Day 0',
    }),
  ];
  for (let t = 1; t <= TIDES - 1; t++) {
    const lore = tideLore(t);
    const block = BLOCKS_PER_TIDE * t;
    out.push(mk({
      n: out.length + 1, id: `tide${t}`, kind: 'tide', block, title: `Tide ${roman(t)} ends`,
      stage: `${roman(t)} · ${lore.name}`, line: lore.line, turning: 'open', dayLabel: `Day ${t * TIDE_DAYS}`,
    }));
  }
  const lamp = tideLore(TIDES);
  out.push(
    mk({
      n: out.length + 1, id: 'still', kind: 'still', block: TURN_CLOSE_BLOCK, title: 'The Still Hour',
      stage: `${roman(TIDES)} · ${lamp.name}`,
      line: `${lamp.line} Turning closes: from here nothing anyone learns can be acted on.`,
      turning: 'closed', dayLabel: `Day ${GROWTH_DAYS} − ${spanWords(STILL_BLOCKS)}`,
    }),
    mk({
      n: out.length + 2, id: 'reveal', kind: 'reveal', block: REVEAL_BLOCK, title: 'The Reveal',
      stage: 'The sky opens', line: 'The bud unfolds into its sealed form, over one day.',
      turning: 'closed', dayLabel: `Day ${GROWTH_DAYS}`,
    }),
    mk({
      n: out.length + 3, id: 'bloom', kind: 'bloom', block: BLOOM_END_BLOCK, title: 'Bloom complete',
      stage: 'Final', line: 'The bloom is fully open. The piece is final and never changes again.',
      turning: 'closed', dayLabel: `Day ${GROWTH_DAYS + BLOOM_DAYS}`,
    }),
  );
  return out;
}

export const FAIRNESS = 'The sky opens. No one — not the artist, not a validator — can steer it.';

// ── the countdown ────────────────────────────────────────────────────
export interface Countdown {
  /** before the mint opens? */
  before: boolean;
  /** "Mint opens in 43 days" | "Schedule has begun" */
  head: string;
  /** the emphasised fragment of `head`, if any ("43 days") */
  em: string;
  /** neutral secondary line ("Day 5 of 28"), when the schedule has begun */
  sub: string;
  /** where "now" falls on the path, in blocks (only when inside it) */
  nowBlock: number | null;
}

export function countdown(now = Date.now()): Countdown {
  const open = mintOpenMs();
  const ms = open - now;
  if (ms > 0) {
    const min = Math.floor(ms / 60000), h = Math.floor(min / 60), d = Math.floor(h / 24);
    let em: string;
    if (d >= 2) em = `${d} days`;
    else if (d === 1) em = `1 day ${h - 24} h`;
    else if (h >= 1) em = `${h} h ${min - h * 60} min`;
    else if (min >= 1) em = plural(min, 'minute');
    else em = 'under a minute';
    return { before: true, head: `Mint opens in ${em}`, em, sub: '', nowBlock: null };
  }
  const block = Math.floor((now - open) / (PARAMS.clock.blockSeconds * 1000));
  const inside = block <= BLOOM_END_BLOCK;
  const sub =
    block >= BLOOM_END_BLOCK ? 'The schedule’s bloom date has passed'
    : block >= REVEAL_BLOCK ? 'The schedule’s reveal date has passed'
    : `Day ${Math.floor(block / BLOCKS_PER_DAY)} of ${GROWTH_DAYS} on the schedule`;
  return { before: false, head: 'Schedule has begun', em: '', sub, nowBlock: inside ? block : null };
}
