// 05 — Reveal timeline. The twenty-eight days from the mint to the bloom: a to-scale rail (desktop) and
// seven milestones, each with the date, the block, the tide's line and a small live render of one sample seed.

import '../styles/timeline.css';
import { el } from '../lib/dom.ts';
import { watchVisible } from '../lib/dom.ts';
import { DEMO } from '../../data/featured.ts';
import { REVEAL_BLOCK } from '../../art/index.ts';
import type { PieceState } from '../../art/index.ts';
import { fmtInt, shortSeed } from '../lib/format.ts';
import { reducedMotion } from '../lib/motion.ts';
import {
  milestones, countdown, words, cap, dateOf, timeOf, isoOf, spanWords, FAIRNESS,
  EDITION, GROWTH_DAYS, TIDES, STILL_BLOCKS, type Milestone,
} from '../lib/timeline-schedule.ts';
import { lazyThumb, type LazyArt } from '../lib/timeline-art.ts';
import { createStrip } from './timeline.strip.ts';

const disposers = new WeakMap<HTMLElement, () => void>();
const rv = (i = 0) => ({ dataset: { reveal: '' }, style: `--d:${i * 70}` });

/** One sample seed, drawn at each milestone's block. Before the reveal the sky is unknown. */
const sampleState = (block: number): PieceState => ({ block, horizon: DEMO.horizon, sky: block >= REVEAL_BLOCK ? DEMO.sky : null });

function card(m: Milestone, i: number, arts: LazyArt[], onLit: (n: number | null) => void): HTMLLIElement {
  const id = `tl-${m.n}`;
  const isReveal = m.kind === 'reveal';
  const canvas = el('canvas', { class: 'tl__canvas', role: 'img', 'aria-label': `The sample seed, drawn live at block ${fmtInt(m.block)} — ${m.title.toLowerCase()}`, width: 4, height: 5 });
  const frame = el('div', { class: 'frame frame--ph tl__frame' }, canvas);
  const li = el('li', { class: `tl__item tl__item--${m.kind}`, id, ...rv(i) },
    el('div', { class: 'tl__card' },
      el('div', { class: 'tl__top' },
        el('span', { class: 'tl__badge num', 'aria-hidden': 'true' }, String(m.n)),
        el('span', { class: 'tl__day num' }, m.dayLabel),
      ),
      el('figure', { class: 'tl__fig' },
        frame,
        el('figcaption', { class: 'tl__cap caption' }, `Seed ${shortSeed(DEMO.seed)}`),
      ),
      el('div', { class: 'tl__body' },
        el('div', { class: 'tl__id' },
          el('h3', { class: 'tl__title h3' }, m.title),
          el('div', { class: 'tl__meta' },
            el('time', { class: 'tl__when', datetime: isoOf(m.block) }, el('span', {}, dateOf(m.block)), el('span', {}, timeOf(m.block))),
            el('p', { class: 'tl__blk' }, el('span', { class: 'tl__k' }, 'Block'), ' ', el('span', { class: 'num' }, fmtInt(m.block))),
          ),
        ),
        el('p', { class: 'tl__stage' }, m.stage),
        isReveal ? el('p', { class: 'tl__fair' }, FAIRNESS) : null,
        el('p', { class: 'tl__line' }, m.line),
        el('p', { class: `tl__state tl__state--${m.turning}` }, el('span', { class: 'tl__dot', 'aria-hidden': 'true' }), m.turningLabel),
      ),
    ),
  );
  arts.push(lazyThumb(frame, canvas, DEMO.seed, sampleState(m.block), { pri: isReveal ? 2 : 0 }));
  li.addEventListener('pointerenter', () => onLit(m.n));
  li.addEventListener('pointerleave', () => onLit(null));
  li.addEventListener('focusin', () => onLit(m.n));
  li.addEventListener('focusout', () => onLit(null));
  return li;
}

export default function mount(root: HTMLElement) {
  disposers.get(root)?.();
  root.replaceChildren();
  const cleanup: (() => void)[] = [];
  const arts: LazyArt[] = [];
  const ms = milestones();

  // ── head + live countdown ────────────────────────────────────────
  const stillPhrase = STILL_BLOCKS * 12 === 3600 ? 'an hour' : spanWords(STILL_BLOCKS);
  const countHead = el('span', { class: 'tl__count-head' });
  const countSub = el('span', { class: 'tl__count-sub' });
  const count = el('p', { class: 'tl__count', role: 'timer', 'aria-live': 'off' }, countHead, ' ', countSub);
  let lastCd = '';
  const tick = () => {
    const cd = countdown();
    const key = cd.head + '|' + cd.sub + '|' + cd.nowBlock;
    if (key === lastCd) return;
    lastCd = key;
    countHead.replaceChildren(...(cd.before ? ['Mint opens in ', el('em', {}, cd.em)] : [cd.head]));
    countSub.textContent = cd.sub;
    countSub.hidden = !cd.sub;
    strip.draw(strip.width, cd.nowBlock);
  };

  const head = el('header', { class: 'section-head tl__head' },
    el('div', { class: 'tl__headtext' },
      el('p', { class: 'eyebrow', ...rv(0) }, '05 — Reveal timeline'),
      el('h2', { class: 'h2', ...rv(1) }, `${cap(words(GROWTH_DAYS))} days, `, el('em', {}, 'then the sky')),
      el('p', { class: 'lede', ...rv(2) },
        `All ${words(EDITION)} seeds keep one clock. They grow through ${words(TIDES)} tides, hold still for ${stillPhrase}, and on day ${GROWTH_DAYS} the sky opens.`),
    ),
    el('div', { class: 'tl__status', ...rv(3) },
      count,
      el('p', { class: 'tl__prov caption' }, 'Provisional schedule — shifts as one.', el('br'), 'Every date is measured from block 0. All times UTC.'),
    ),
  );

  // ── the to-scale rail (desktop) ──────────────────────────────────
  const stripApi = createStrip(ms);
  const strip = Object.assign(stripApi, { width: 0 });
  const scale = el('div', { class: 'tl__scale', 'aria-hidden': 'true', ...rv(0) }, stripApi.el,
    el('p', { class: 'tl__scalecap caption' }, `Drawn to scale — ${words(GROWTH_DAYS)} days of growth, then one day of bloom`));
  // the numerals are a pointer shortcut to their card (the list itself is fully keyboard/screen-reader reachable)
  scale.addEventListener('click', (e) => {
    const g = (e.target as Element).closest('.tl__sn');
    const item = g && document.getElementById(`tl-${g.getAttribute('data-n')}`);
    if (item) item.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
  });
  const measure = () => {
    const w = Math.round(scale.clientWidth);
    if (w && w !== strip.width) { strip.width = w; strip.draw(w, countdown().nowBlock); }
  };
  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(measure);
    ro.observe(scale);
    cleanup.push(() => ro.disconnect());
  } else {
    addEventListener('resize', measure);
    cleanup.push(() => removeEventListener('resize', measure));
  }

  // ── the milestones ───────────────────────────────────────────────
  const list = el('ol', { class: 'tl__list', role: 'list', 'aria-label': 'Milestones from the mint to the bloom' });
  ms.forEach((m, i) => {
    if (i) list.append(el('li', { class: 'tl__gap', 'aria-hidden': 'true' }, el('span', {}, `${spanWords(m.block - ms[i - 1]!.block)} later`)));
    list.append(card(m, i, arts, (n) => strip.setActive(n)));
  });

  const note = el('p', { class: 'tl__note caption', ...rv(0) },
    `Each frame is one sample seed (${shortSeed(DEMO.seed)}), drawn live in your browser at that block. The bloom is shown under a rehearsal sky; the real one is not yet known.`);

  root.append(el('div', { class: 'wrap tl' }, head, scale, list, note));

  measure();
  tick();
  const timer = setInterval(tick, 30_000);
  cleanup.push(() => clearInterval(timer));
  cleanup.push(watchVisible(root, (v) => { if (v) tick(); }, '200px'));

  const dispose = () => { cleanup.forEach((f) => f()); arts.forEach((a) => a.dispose()); root.replaceChildren(); disposers.delete(root); };
  disposers.set(root, dispose);
  return dispose;
}
