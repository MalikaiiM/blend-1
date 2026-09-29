// The to-scale rail: 28 days of growth and one day of bloom drawn in proportion, so the crowding at the
// end (the Still Hour, the Reveal, the bloom) is honest rather than hidden. Numerals are spread apart with
// slanted hairline leaders back to their true positions. Decorative (aria-hidden): the list below carries the content.

import { PARAMS, TURN_CLOSE_BLOCK, REVEAL_BLOCK, BLOOM_END_BLOCK, BLOCKS_PER_TIDE } from '../../art/index.ts';
import { roman, TIDES, type Milestone } from '../lib/timeline-schedule.ts';

const NS = 'http://www.w3.org/2000/svg';
type Attrs = Record<string, string | number>;
function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}, text?: string): SVGElementTagNameMap[K] {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  if (text != null) n.textContent = text;
  return n;
}

/** Push sorted positions apart until neighbours are `gap` apart, keeping them inside [lo, hi]. */
export function spread(xs: number[], gap: number, lo: number, hi: number): number[] {
  const p = xs.slice();
  for (let it = 0; it < 240; it++) {
    let moved = false;
    for (let i = 1; i < p.length; i++) {
      const d = p[i]! - p[i - 1]!;
      if (d < gap - 0.01) { const k = (gap - d) / 2; p[i - 1]! -= k; p[i]! += k; moved = true; }
    }
    if (p[0]! < lo) { p[0] = lo; moved = true; }
    if (p[p.length - 1]! > hi) { p[p.length - 1] = hi; moved = true; }
    if (!moved) break;
  }
  return p;
}

export interface Strip {
  el: SVGSVGElement;
  draw(width: number, nowBlock: number | null): void;
  setActive(n: number | null): void;
}

export function createStrip(ms: Milestone[]): Strip {
  const svg = s('svg', { class: 'tl__svg', role: 'presentation', focusable: 'false' });
  let lastW = 0, lastNow: number | null | undefined;
  let active: number | null = null;

  const draw = (W: number, nowBlock: number | null) => {
    if (W < 300) return;
    if (W === lastW && nowBlock === lastNow) return;
    lastW = W; lastNow = nowBlock;
    const P = 18, x0 = P, x1 = W - P;
    const X = (block: number) => x0 + (block / BLOOM_END_BLOCK) * (x1 - x0);
    const Hh = 188, cy = 14, R = 11, rail = 76, tideY = 106, dayY = 134, turnY = 162;
    svg.setAttribute('viewBox', `0 0 ${W} ${Hh}`);
    svg.setAttribute('width', String(W));
    svg.setAttribute('height', String(Hh));
    svg.replaceChildren();

    // ── the rail: four tide bars that brighten as the seed wakes, then the bloom day ──
    const bars = s('g', { class: 'tl__bars' });
    const gap = 3;
    for (let t = 0; t < TIDES; t++) {
      const a = X(t * BLOCKS_PER_TIDE) + (t ? gap / 2 : 0), b = X((t + 1) * BLOCKS_PER_TIDE) - gap / 2;
      bars.append(s('rect', { class: 'tl__bar', x: a, y: rail - 1.5, width: Math.max(1, b - a), height: 3, rx: 1.5, 'data-tide': t + 1, style: `--o:${0.3 + 0.17 * t}` }));
    }
    const ba = X(REVEAL_BLOCK) + gap / 2;
    bars.append(s('rect', { class: 'tl__bar tl__bar--bloom', x: ba, y: rail - 1.5, width: Math.max(1, X(BLOOM_END_BLOCK) - ba), height: 3, rx: 1.5 }));
    svg.append(bars);

    // ── ticks at true positions ──
    const ticks = s('g', { class: 'tl__ticks' });
    for (const m of ms) {
      const x = X(m.block), big = m.kind === 'reveal';
      ticks.append(s('line', { class: `tl__tick${big ? ' tl__tick--reveal' : ''}`, x1: x, x2: x, y1: rail - (big ? 11 : 7), y2: rail + (big ? 11 : 7) }));
    }
    svg.append(ticks);

    // ── numerals spread above the rail, leaders back to the ticks ──
    const pos = spread(ms.map((m) => X(m.block)), R * 2 + 6, x0, x1);
    const nums = s('g', { class: 'tl__nums' });
    ms.forEach((m, i) => {
      const x = X(m.block), xa = pos[i]!;
      const g = s('g', { class: `tl__sn${m.kind === 'reveal' ? ' tl__sn--reveal' : ''}${active === m.n ? ' is-lit' : ''}`, 'data-n': m.n });
      g.append(
        s('line', { class: 'tl__lead', x1: xa, y1: cy + R, x2: x, y2: rail - (m.kind === 'reveal' ? 12 : 8) }),
        s('circle', { class: 'tl__sn-c', cx: xa, cy, r: R }),
        s('text', { class: 'tl__sn-t', x: xa, y: cy + 0.5 }, String(m.n)),
      );
      nums.append(g);
    });
    svg.append(nums);

    // ── tide names under each bar ──
    const names = s('g', { class: 'tl__tidenames' });
    for (let t = 0; t < TIDES; t++) {
      const cx = (X(t * BLOCKS_PER_TIDE) + X((t + 1) * BLOCKS_PER_TIDE)) / 2;
      names.append(s('text', { class: 'tl__tn', x: cx, y: tideY }, `${roman(t + 1)} · ${PARAMS.lore.tides[t]!.name}`.toUpperCase()));
    }
    svg.append(names);

    // ── day axis ──
    const axis = s('g', { class: 'tl__axis' });
    const dayMarks: [number, string, 'start' | 'middle' | 'end'][] = [];
    ms.forEach((m) => { if (m.kind === 'mint' || m.kind === 'tide') dayMarks.push([m.block, m.dayLabel, m.kind === 'mint' ? 'start' : 'middle']); });
    const reveal = ms.find((m) => m.kind === 'reveal')!;
    dayMarks.push([REVEAL_BLOCK, reveal.dayLabel, 'end']);
    for (const [b, label, anchor] of dayMarks) axis.append(s('text', { class: 'tl__day', x: X(b) + (anchor === 'start' ? -P + 2 : 0), y: dayY, 'text-anchor': anchor }, label));
    svg.append(axis);

    // ── turning: open until the Still Hour, closed after ──
    const tx1 = X(TURN_CLOSE_BLOCK), tx0 = x0;
    const turn = s('g', { class: 'tl__turn' });
    turn.append(
      s('line', { class: 'tl__turn-open', x1: tx0, x2: tx1 - 2, y1: turnY, y2: turnY }),
      s('line', { class: 'tl__turn-cap', x1: tx0, x2: tx0, y1: turnY - 4, y2: turnY + 4 }),
      s('line', { class: 'tl__turn-cap', x1: tx1 - 2, x2: tx1 - 2, y1: turnY - 4, y2: turnY + 4 }),
      s('line', { class: 'tl__turn-shut', x1: tx1 + 2, x2: x1, y1: turnY, y2: turnY }),
      s('text', { class: 'tl__turn-t', x: (tx0 + tx1) / 2, y: turnY + 20, 'text-anchor': 'middle' }, 'TURNING OPEN'),
      s('text', { class: 'tl__turn-t tl__turn-t--shut', x: x1, y: turnY + 20, 'text-anchor': 'end' }, 'CLOSED'),
    );
    svg.append(turn);

    // ── where "now" falls, when the schedule has begun ──
    if (nowBlock != null) {
      const x = X(Math.min(nowBlock, BLOOM_END_BLOCK));
      svg.append(s('path', { class: 'tl__now', d: `M ${x - 4} ${rail - 30} L ${x + 4} ${rail - 30} L ${x} ${rail - 23} Z` }), s('text', { class: 'tl__now-t', x, y: rail - 36, 'text-anchor': 'middle' }, 'NOW'));
    }
  };

  const setActive = (n: number | null) => {
    active = n;
    svg.querySelectorAll('.tl__sn').forEach((g) => g.classList.toggle('is-lit', n != null && g.getAttribute('data-n') === String(n)));
  };
  return { el: svg, draw, setActive };
}
