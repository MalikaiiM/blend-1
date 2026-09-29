// 04 — Gallery. A grid of bloomed pieces you can filter by trait, and a full-screen view for each one.
// Deep-linkable: #gallery/0037 opens a piece; Back closes it. The detail view loads on first use.

import '../styles/gallery.css';
import { el } from '../lib/dom.ts';
import { buildItems, type Item } from './gallery.data.ts';
import { createFilters } from './gallery.filter.ts';
import { createGrid } from './gallery.grid.ts';
import type { DetailHost } from './gallery.detail.ts';

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
function words(n: number): string {
  if (n < 20) return ONES[n]!;
  if (n < 100) return TENS[Math.floor(n / 10)]! + (n % 10 ? `-${ONES[n % 10]}` : '');
  return String(n);
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const HASH = /^#gallery\/(\d{1,6})$/;
const hashNo = (): number | null => {
  const m = HASH.exec(location.hash);
  return m ? parseInt(m[1]!, 10) : null;
};

export default function mount(root: HTMLElement): () => void {
  if (root.dataset.galleryMounted) return () => {};
  root.dataset.galleryMounted = '1';

  const items = buildItems();
  const byNo = new Map(items.map((i) => [i.no, i]));

  // ── page furniture ────────────────────────────────────────────────
  const filters = createFilters(items, (matching, animate) => grid.apply(matching, animate));
  const grid = createGrid(items, () => filters.clear());
  const detailHost: DetailHost = {
    items: () => grid.shown(),
    tile: (it) => grid.tile(it),
    thumb: (it) => grid.canvas(it),
    navigate: (it) => { history.replaceState(history.state, '', `#gallery/${it.code}`); },
    requestClose: () => closeDetail(),
  };

  const wrap = el('div', { class: 'wrap gal' },
    el('header', { class: 'section-head gal__head' },
      el('p', { class: 'eyebrow', dataset: { reveal: '' } }, '04 — Gallery'),
      el('h2', { class: 'h2', dataset: { reveal: '' }, style: '--d:80' }, `${cap(words(items.length))} seeds, `, el('em', {}, 'bloomed')),
      el('p', { class: 'lede', dataset: { reveal: '' }, style: '--d:160' },
        'Each was turned toward a horizon, carried through the sky and left to open. Filter them by what they are; open one to read its odds and watch it grow.'),
    ),
    el('div', { dataset: { reveal: '' }, style: '--d:220' }, filters.root),
    grid.list,
    grid.empty,
    el('p', { class: 'gal__foot caption' },
      'The sky over these pieces is a rehearsal sky, drawn for this page. The real one opens at the reveal. Numbers are illustrative.'),
  );
  root.append(wrap);

  // ── the detail view, hash-driven ──────────────────────────────────
  type D = ReturnType<typeof import('./gallery.detail.ts')['createDetail']>;
  let detail: D | null = null;
  let detailP: Promise<D> | null = null;
  const ensureDetail = () => (detailP ??= import('./gallery.detail.ts').then((m) => (detail = m.createDetail(detailHost))));
  let disposed = false;

  async function openPiece(it: Item, from: HTMLElement | null) {
    const d = await ensureDetail();
    if (disposed || hashNo() !== it.no) return;
    if (d.isOpen()) d.show(it);
    else { grid.loader.pause(); d.open(it, from); }
  }

  function sync(from?: HTMLElement | null) {
    const no = hashNo();
    const it = no === null ? undefined : byNo.get(no);
    if (it) {
      if (!grid.shown().includes(it)) filters.clear(false);
      void openPiece(it, from ?? grid.tile(it));
    } else if (detail?.isOpen()) {
      void detail.close().then(() => { if (!disposed) grid.loader.resume(); });
    }
  }

  function closeDetail() {
    if (!detail?.isOpen()) return;
    if ((history.state as { gal?: number } | null)?.gal) history.back(); // we pushed this entry: go back to where we were
    else {
      history.replaceState(history.state, '', `${location.pathname}${location.search}#gallery`);
      sync();
    }
  }

  const onTileClick = (e: MouseEvent) => {
    const a = (e.target as Element).closest<HTMLAnchorElement>('a[data-gallery-item]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    history.pushState({ gal: 1 }, '', a.getAttribute('href')!);
    sync(a);
  };
  grid.list.addEventListener('click', onTileClick);
  // warm the detail view up so opening is instant: on intent (hover, focus, touch) and otherwise when the browser is idle
  const warm = () => { void ensureDetail(); };
  grid.list.addEventListener('pointerenter', warm, { once: true, capture: true });
  grid.list.addEventListener('focusin', warm, { once: true });
  grid.list.addEventListener('touchstart', warm, { once: true, passive: true });
  const idle = (window as any).requestIdleCallback as ((cb: () => void, o?: { timeout: number }) => number) | undefined;
  if (idle) idle(warm, { timeout: 6000 }); else setTimeout(warm, 3000);
  const onHash = () => sync();
  addEventListener('hashchange', onHash);
  addEventListener('popstate', onHash);

  if (hashNo() !== null) sync();

  return () => {
    disposed = true;
    removeEventListener('hashchange', onHash);
    removeEventListener('popstate', onHash);
    grid.list.removeEventListener('click', onTileClick);
    grid.dispose();
    detail?.dispose();
    wrap.remove();
    delete root.dataset.galleryMounted;
  };
}
