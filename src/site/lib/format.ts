import { blockToDate, BLOCKS_PER_DAY, REVEAL_BLOCK, PARAMS } from '../../art/index.ts';

export const fmtInt = (n: number) => Math.round(n).toLocaleString('en-US');
export const shortSeed = (s: string) => `${s.slice(0, 6)}…${s.slice(-4)}`;
export const fmtDate = (block: number, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) =>
  blockToDate(block).toLocaleDateString('en-GB', { timeZone: 'UTC', ...opts });
export const fmtDateTime = (block: number) =>
  blockToDate(block).toLocaleString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) + ' UTC';
export const fmtDayCount = (block: number) => `Day ${Math.floor(block / BLOCKS_PER_DAY)}`;
/** "3 d 4 h" / "42 min" from a block count. */
export function fmtSpan(blocks: number): string {
  const s = blocks * PARAMS.clock.blockSeconds;
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d) return `${d} d ${h} h`;
  if (h) return `${h} h ${m} min`;
  return `${m} min`;
}
export const revealDateLabel = () => fmtDate(REVEAL_BLOCK, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
