// The filter bar: one row per trait group (Palette · Horizon · Inclusion · Light · Form), chips with faceted counts,
// a live "Showing N of M", and Clear. Within a group chips are OR-ed, across groups AND-ed.
// On a phone the rows sit behind a "Filter" disclosure, and each row scrolls sideways.

import { el } from '../lib/dom.ts';
import { FACETS, emptySel, matches, selSize, type FacetKey, type Item, type Sel } from './gallery.data.ts';

interface Chip { btn: HTMLButtonElement; n: HTMLElement; value: string | null }

export interface Filters {
  root: HTMLElement;
  sel: Sel;
  matching(): Item[];
  active(): boolean;
  /** clear every group (and notify) */
  clear(animate?: boolean): void;
  dispose(): void;
}

export function createFilters(items: Item[], onChange: (matching: Item[], animate: boolean) => void): Filters {
  const sel = emptySel();
  const chips = new Map<FacetKey, Chip[]>();
  const uid = Math.random().toString(36).slice(2, 7);

  const groups = FACETS.map((f) => {
    // only the values that occur in this set, in canonical order
    const present = new Set(items.map((i) => i.facets[f.key]));
    const values = [...f.order.filter((v) => present.has(v)), ...[...present].filter((v) => !f.order.includes(v))];
    const list: Chip[] = [];
    const mk = (value: string | null, label: string) => {
      const n = el('span', { class: 'gal__n num' });
      const btn = el('button', { type: 'button', class: 'chip gal__chip', 'aria-pressed': 'false' }, el('span', { class: 'gal__chip-l' }, label), n);
      if (value === null) btn.dataset.all = '';
      list.push({ btn, n, value });
      btn.addEventListener('click', () => toggle(f.key, value));
      return btn;
    };
    mk(null, 'All');
    for (const v of values) mk(v, v);
    chips.set(f.key, list);
    const labelId = `gal-f-${f.key}-${uid}`;
    return el('div', { class: 'gal__group', role: 'group', 'aria-labelledby': labelId },
      el('span', { class: 'gal__glabel label', id: labelId }, f.label),
      el('div', { class: 'gal__chips' }, ...list.map((c) => c.btn)),
    );
  });

  const panelId = `gal-panel-${uid}`;
  const doneBtn = el('button', { type: 'button', class: 'btn btn--small gal__done' });
  const panel = el('div', { class: 'gal__panel', id: panelId, dataset: { open: 'false' } }, ...groups, doneBtn);
  const badge = el('span', { class: 'gal__badge num', hidden: true });
  const toggleBtn = el('button', { type: 'button', class: 'btn btn--small gal__ftoggle', 'aria-expanded': 'false', 'aria-controls': panelId },
    el('span', {}, 'Filter'), badge);
  const count = el('p', { class: 'gal__count num', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
  const clearBtn = el('button', { type: 'button', class: 'gal__clear' }, 'Clear');
  clearBtn.hidden = true;
  const head = el('div', { class: 'gal__barhead' }, toggleBtn, count, clearBtn);
  const root = el('div', { class: 'gal__bar', role: 'group', 'aria-label': 'Filter the gallery by trait' }, head, panel);

  const setOpen = (open: boolean) => {
    panel.dataset.open = String(open);
    toggleBtn.setAttribute('aria-expanded', String(open));
  };
  toggleBtn.addEventListener('click', () => setOpen(panel.dataset.open !== 'true'));
  doneBtn.addEventListener('click', () => { setOpen(false); toggleBtn.focus({ preventScroll: true }); });
  clearBtn.addEventListener('click', () => clear());

  function toggle(key: FacetKey, value: string | null) {
    const s = sel[key];
    if (value === null) s.clear();
    else if (s.has(value)) s.delete(value);
    else s.add(value);
    update(true);
  }

  function matching() { return items.filter((i) => matches(i, sel)); }

  function refresh(): Item[] {
    const now = matching();
    for (const f of FACETS) {
      const s = sel[f.key];
      // faceted counts: how many pieces this chip would show given every other group
      const pool = items.filter((i) => matches(i, sel, f.key));
      for (const c of chips.get(f.key)!) {
        const n = c.value === null ? pool.length : pool.filter((i) => i.facets[f.key] === c.value).length;
        const pressed = c.value === null ? s.size === 0 : s.has(c.value);
        c.n.textContent = String(n);
        c.btn.setAttribute('aria-pressed', String(pressed));
        // a chip that would show nothing stays pressable (the empty state explains itself) but recedes
        c.btn.classList.toggle('is-zero', n === 0 && !pressed);
      }
    }
    const total = items.length;
    count.textContent = `Showing ${now.length} of ${total}`;
    doneBtn.textContent = now.length ? `Show ${now.length} ${now.length === 1 ? 'piece' : 'pieces'}` : 'Close';
    const k = selSize(sel);
    clearBtn.hidden = k === 0;
    badge.hidden = k === 0;
    badge.textContent = String(k);
    return now;
  }

  function update(animate: boolean) { onChange(refresh(), animate); }

  function clear(animate = true) {
    for (const f of FACETS) sel[f.key].clear();
    update(animate);
  }

  refresh();
  return { root, sel, matching, active: () => selSize(sel) > 0, clear, dispose: () => {} };
}
