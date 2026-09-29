// The grid of tiles. Filtering never re-renders art: tiles fade out, the rest glide together (FLIP), new ones fade in.
// Under prefers-reduced-motion the change is instant.

import { el } from '../lib/dom.ts';
import { reducedMotion } from '../lib/motion.ts';
import { applyVars, type Item } from './gallery.data.ts';
import { TileLoader } from './gallery.tiles.ts';

const EASE = 'cubic-bezier(0.2, 0.7, 0.2, 1)';

export interface Grid {
  list: HTMLElement;
  empty: HTMLElement;
  loader: TileLoader;
  cell(it: Item): HTMLElement;
  tile(it: Item): HTMLAnchorElement;
  /** the art currently in a tile (draft or full), or null */
  canvas(it: Item): HTMLCanvasElement | null;
  /** items currently shown, in order */
  shown(): Item[];
  apply(next: Item[], animate: boolean): void;
  dispose(): void;
}

export function createGrid(items: Item[], onClear: () => void): Grid {
  const loader = new TileLoader();
  const cells = new Map<Item, HTMLLIElement>();

  const list = el('ul', { class: 'gal__grid' });
  for (const it of items) {
    const art = el('span', { class: 'gal__art frame frame--ph', 'aria-hidden': 'true' });
    applyVars(art, it.vars);
    const a = el('a', {
      class: 'gal__tile', href: `#gallery/${it.code}`, dataset: { galleryItem: '', no: it.code },
      'aria-label': `${it.label}, ${it.title}. ${it.paletteName}, ${it.horizonName}.`,
    },
      art,
      el('span', { class: 'gal__cap' },
        el('span', { class: 'gal__no' }, it.label),
        el('span', { class: 'gal__title' }, it.title),
        el('span', { class: 'gal__meta' }, `${it.paletteName} · ${it.horizonName}`),
      ),
    );
    const li = el('li', { class: 'gal__cell' }, a);
    cells.set(it, li);
    list.append(li);
    loader.add(it, li, (cv, level) => {
      const first = !art.firstElementChild;
      cv.className = 'gal__cv' + (first ? ' is-first' : '');
      cv.setAttribute('role', 'img');
      cv.setAttribute('aria-label', it.alt);
      art.replaceChildren(cv);
      art.classList.remove('frame--ph');
      art.dataset.level = level;
      art.removeAttribute('aria-hidden');
    });
  }

  const emptyBtn = el('button', { type: 'button', class: 'btn btn--small' }, 'Clear filters');
  emptyBtn.addEventListener('click', onClear);
  const empty = el('div', { class: 'gal__empty', hidden: true },
    el('p', { class: 'gal__empty-t' }, 'No seed carries all of these at once.'),
    el('p', { class: 'gal__empty-s mute' }, 'Loosen a group, or begin again.'),
    emptyBtn,
  );

  // ── filtering with FLIP ─────────────────────────────────────────────
  let target = new Set(items);
  let token = 0;
  const running = new Set<Animation>();

  const play = (node: Element, kf: Keyframe[], opts: KeyframeAnimationOptions) => new Promise<void>((res) => {
    const a = node.animate(kf, opts);
    running.add(a);
    // finished animations stay in `running` until stopAll(): a fill-forwards effect must be cancelled explicitly
    a.onfinish = () => res();
    a.oncancel = () => { running.delete(a); res(); };
  });
  const stopAll = () => { for (const a of [...running]) a.cancel(); running.clear(); };
  const settle = () => {
    for (const [it, li] of cells) li.hidden = !target.has(it);
    empty.hidden = target.size > 0;
  };
  const onScreen = () => {
    const r = list.getBoundingClientRect();
    return r.bottom > 0 && r.top < innerHeight;
  };

  async function apply(next: Item[], animate: boolean) {
    const my = ++token;
    stopAll();
    settle(); // finish whatever the previous change was heading for
    const before = items.filter((it) => target.has(it));
    target = new Set(next);
    const want = target;

    if (!animate || reducedMotion() || !onScreen() || !before.length) { settle(); return; }

    const staying = before.filter((it) => want.has(it));
    const leaving = before.filter((it) => !want.has(it));
    const entering = items.filter((it) => want.has(it) && !before.includes(it));
    if (!leaving.length && !entering.length) return;

    // 1 · the ones that go dim away where they stand
    if (leaving.length) {
      await Promise.all(leaving.map((it) => play(cells.get(it)!,
        [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.965)' }],
        { duration: 220, easing: 'ease-out', fill: 'forwards' })));
      if (my !== token) return;
    }

    // 2 · measure, re-flow, invert, play
    const first = new Map(staying.map((it) => [it, cells.get(it)!.getBoundingClientRect()] as const));
    stopAll();
    settle();
    const moves: Promise<void>[] = [];
    for (const it of staying) {
      const li = cells.get(it)!;
      const f = first.get(it)!, l = li.getBoundingClientRect();
      const dx = f.left - l.left, dy = f.top - l.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      moves.push(play(li, [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 520, easing: EASE }));
    }
    entering.forEach((it, i) => {
      moves.push(play(cells.get(it)!,
        [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }],
        { duration: 520, delay: 120 + Math.min(i, 8) * 40, easing: EASE, fill: 'backwards' }));
    });
    if (!want.size) moves.push(play(empty, [{ opacity: 0 }, { opacity: 1 }], { duration: 520, easing: EASE }));
    await Promise.all(moves);
  }

  return {
    list, empty, loader,
    cell: (it) => cells.get(it)!,
    tile: (it) => cells.get(it)!.firstElementChild as HTMLAnchorElement,
    canvas: (it) => cells.get(it)!.querySelector<HTMLCanvasElement>('canvas'),
    shown: () => items.filter((it) => target.has(it)),
    apply: (next, animate) => { void apply(next, animate); },
    dispose: () => { token++; stopAll(); loader.dispose(); },
  };
}
