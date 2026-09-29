// 06 — Mint. The plan set down plainly: edition, price (a placeholder), dates, what a keeper receives, what is
// committed before the mint. The button is disabled and honest about it; nothing here touches a wallet.

import '../styles/mint.css';
import { el } from '../lib/dom.ts';
import { HERO } from '../../data/featured.ts';
import { PARAMS, BLOOM_END_BLOCK, REVEAL_BLOCK, deriveTraits } from '../../art/index.ts';
import { fmtInt, shortSeed } from '../lib/format.ts';
import {
  words, cap, dateOf, timeOf, isoOf, dmyOf, countdown, mintWindowCloseBlock, EDITION, TIDES,
} from '../lib/timeline-schedule.ts';
import { lazyPainting, type LazyArt } from '../lib/timeline-art.ts';

const disposers = new WeakMap<HTMLElement, () => void>();
const rv = (i = 0) => ({ dataset: { reveal: '' }, style: `--d:${i * 70}` });

export default function mount(root: HTMLElement) {
  disposers.get(root)?.();
  root.replaceChildren();
  const arts: LazyArt[] = [];

  const D = PARAMS.drop;
  const before = countdown().before;

  // ── the numbers ──────────────────────────────────────────────────
  const fact = (big: string, unit: string | null, label: string, sub?: string) =>
    el('div', { class: 'mint__fact', ...rv(0) },
      el('dt', { class: 'mint__lbl' }, label),
      el('dd', { class: 'mint__big num' }, big, unit ? el('span', { class: 'mint__unit' }, ` ${unit}`) : null),
      sub ? el('dd', { class: 'mint__sub' }, sub) : null,
    );
  const facts = el('dl', { class: 'mint__facts' },
    fact(fmtInt(EDITION), null, 'Seeds in the edition'),
    fact(D.priceEth, 'ETH', 'Price', 'Placeholder — set at launch'),
    fact(String(D.maxPerWallet), null, 'At most, per wallet'),
    fact(String(D.mintWindowHours), 'h', 'Mint window'),
  );

  // ── the schedule ─────────────────────────────────────────────────
  const row = (label: string, block: number, hint?: string) =>
    el('div', { class: 'mint__row' },
      el('dt', {}, label),
      el('dd', {},
        el('time', { datetime: isoOf(block) }, el('span', { class: 'mint__date' }, dateOf(block)), el('span', { class: 'mint__time' }, timeOf(block))),
        el('span', { class: 'mint__blk num' }, `Block ${fmtInt(block)}`),
      ),
    );
  const schedule = el('section', { class: 'mint__block', 'aria-labelledby': 'mint-sched', ...rv(0) },
    el('h3', { class: 'label mint__h', id: 'mint-sched' }, 'Schedule'),
    el('dl', { class: 'mint__sched' },
      row('Mint opens', 0),
      row('Mint window closes', mintWindowCloseBlock()),
      row('The Reveal', REVEAL_BLOCK),
      row('Bloom is final', BLOOM_END_BLOCK),
    ),
    el('p', { class: 'mint__aside' }, 'All seeds share one clock: block 0 is the block the mint opens. A seed minted late in the window is simply a few hours further along.'),
  );

  // ── what you receive ─────────────────────────────────────────────
  const receive = el('section', { class: 'mint__block', 'aria-labelledby': 'mint-get', ...rv(0) },
    el('h3', { class: 'label mint__h', id: 'mint-get' }, 'What a keeper receives'),
    el('ul', { class: 'mint__gets', role: 'list' },
      el('li', {}, `A seed that grows for ${words(TIDES)} tides.`),
      el('li', {}, 'One action: to turn it toward a horizon.'),
      el('li', {}, 'A bloom you helped shape.'),
    ),
  );

  // ── commitments ──────────────────────────────────────────────────
  const commit = (name: string, status: string, note: string) =>
    el('div', { class: 'mint__crow' },
      el('dt', {}, name),
      el('dd', {}, el('span', { class: 'mint__pend' }, status), el('span', { class: 'mint__cnote' }, note)),
    );
  const commitments = el('section', { class: 'mint__block', 'aria-labelledby': 'mint-commit', ...rv(0) },
    el('h3', { class: 'label mint__h', id: 'mint-commit' }, 'Commitments'),
    el('dl', { class: 'mint__commit' },
      commit('Provenance hash', 'To be published before the mint', `keccak256 of all ${words(EDITION)} seeds, in order.`),
      commit('Salt commitment', 'To be published before the mint', 'keccak256 of the artist’s salt, committed on-chain before the first seed is minted.'),
      commit('Contract', 'To be published', 'No address has been announced. Nothing on this page links to one.'),
    ),
  );

  // ── the button and the honest note ───────────────────────────────
  const cta = el('button', {
    type: 'button', class: 'btn mint__cta', disabled: true, 'aria-disabled': 'true', 'aria-describedby': 'mint-note',
  }, before ? `Mint opens ${dmyOf(0)}` : 'Minting is not offered on this page');
  const act = el('div', { class: 'mint__act', ...rv(0) },
    cta,
    el('p', { class: 'mint__note', id: 'mint-note' }, 'This page never asks you to connect a wallet. Nothing here can spend anything.'),
  );
  const closing = el('p', { class: 'mint__close h3', ...rv(0) }, 'Face it toward a horizon. ', el('em', {}, 'Then wait for the sky.'));

  // ── the closing image: a bloom, generous ─────────────────────────
  const hero = HERO[1] ?? HERO[0]!;
  const state = { block: BLOOM_END_BLOCK + 1, horizon: hero.horizon, sky: hero.sky };
  const traits = deriveTraits(hero.seed, { horizon: hero.horizon, sky: hero.sky });
  const canvas = el('canvas', { class: 'mint__canvas', role: 'img', width: 4, height: 5, 'aria-label': `A bloom, drawn live in your browser: ${traits.title}, turned toward ${traits.horizon.name}. Seed ${shortSeed(hero.seed)}.` });
  const frame = el('div', { class: 'frame frame--ph mint__frame' }, canvas);
  const art = el('figure', { class: 'mint__art', ...rv(0) },
    frame,
    el('figcaption', { class: 'mint__cap caption' },
      el('span', {}, traits.title), el('span', {}, ` · ${traits.horizon.name}`), el('br'),
      el('span', { class: 'mint__seed' }, `Seed ${shortSeed(hero.seed)}`), el('span', {}, ' · shown under a rehearsal sky'),
    ),
  );
  arts.push(lazyPainting(frame, canvas, hero.seed, state, { pri: 1, margin: '500px' }));

  const head = el('header', { class: 'section-head mint__head' },
    el('p', { class: 'eyebrow', ...rv(0) }, '06 — Mint'),
    el('h2', { class: 'h2', ...rv(1) }, 'Keep ', el('em', {}, 'a seed')),
    el('p', { class: 'lede', ...rv(2) },
      `${cap(words(EDITION))} seeds, lifted once from the Glass Sea. What follows is the plan, set down plainly and still open to change.`),
  );

  root.append(el('div', { class: 'wrap mint' },
    el('div', { class: 'mint__grid' },
      el('div', { class: 'mint__col' },
        head,
        facts,
        el('p', { class: 'mint__prov caption', ...rv(0) }, 'Provisional — figures and dates are set again at launch.'),
        schedule, receive, commitments, act, closing,
      ),
      art,
    ),
  ));

  const dispose = () => { arts.forEach((a) => a.dispose()); root.replaceChildren(); disposers.delete(root); };
  disposers.set(root, dispose);
  return dispose;
}
