// The detail view: a full-screen dialog with the piece large, its traits and odds, its seed, seven stills of its growth,
// a PNG download and prev/next within the current filter set. Built lazily on first open.

import { STAGES, composite, renderPieceAsync } from '../../art/index.ts';
import { el } from '../lib/dom.ts';
import { fmtInt } from '../lib/format.ts';
import { reducedMotion } from '../lib/motion.ts';
import { enqueue, fitSize, flatten, getThumb, pixelBudget, renderQueued } from '../lib/piece.ts';
import { BLOOMED, STRIP, applyVars, blockOf, pct, slug, stateAt, type Item } from './gallery.data.ts';

const EASE = 'cubic-bezier(0.2, 0.7, 0.2, 1)';
const MAIN_MAX_PX = 1_800_000; // ≈ 1200 × 1500
const STILL = { w: 200, h: 250 } as const;

export interface DetailHost {
  /** the pieces in the current filter set, in order */
  items(): Item[];
  /** the grid tile (an <a>) of a piece, for the flight and for returning focus */
  tile(it: Item): HTMLElement | null;
  /** the art currently in that tile — the opening frame */
  thumb(it: Item): HTMLCanvasElement | null;
  /** prev/next moved to another piece: update the address */
  navigate(it: Item): void;
  /** the owner decides how to close (history) and then calls close() */
  requestClose(): void;
}

const arrow = (dir: 'l' | 'r') =>
  `<svg viewBox="0 0 16 10" width="16" height="10" aria-hidden="true" focusable="false"><path d="${dir === 'r' ? 'M0 5h15M11 1l4 4-4 4' : 'M16 5H1M5 1L1 5l4 4'}" fill="none" stroke="currentColor" stroke-width="1"/></svg>`;

function free(piece: { layers: { canvas: HTMLCanvasElement }[] }) {
  // release the layer canvases right away — a 2000 × 2500 piece holds ~9 of them
  for (const L of piece.layers) { L.canvas.width = 0; L.canvas.height = 0; }
}

export function createDetail(host: DetailHost) {
  let cur: Item | null = null;
  let open = false;
  let stage = BLOOMED;
  let restoreFocus: HTMLElement | null = null;
  let mainJob: { cancel: () => void } | null = null;
  let renderId = 0;
  let curSize = { w: 0, h: 0 };
  const stillJobs: { cancel: () => void }[] = [];
  const stillCv: (HTMLCanvasElement | null)[] = STRIP.map(() => null);
  let dlJob: { cancel: () => void } | null = null;
  let dlBusy = false;
  const bigCache = new Map<string, HTMLCanvasElement>();
  const lockedEls: { node: HTMLElement; inert: boolean; hidden: string | null }[] = [];
  let scrollY0 = 0;
  let anims: Animation[] = [];
  let closing = false;

  // ── DOM ───────────────────────────────────────────────────────────
  const scrim = el('div', { class: 'gal-dlg__scrim' });
  const crumbNo = el('span', { class: 'gal-dlg__no' });
  const pos = el('span', { class: 'gal-dlg__pos num' });
  const prevBtn = el('button', { type: 'button', class: 'btn btn--small gal-dlg__prev', 'aria-label': 'Previous piece' });
  prevBtn.innerHTML = `${arrow('l')}<span>Prev</span>`;
  const nextBtn = el('button', { type: 'button', class: 'btn btn--small gal-dlg__next', 'aria-label': 'Next piece' });
  nextBtn.innerHTML = `<span>Next</span>${arrow('r')}`;
  const closeBtn = el('button', { type: 'button', class: 'btn btn--small gal-dlg__close' }, 'Close');
  closeBtn.setAttribute('aria-label', 'Close and return to the gallery');
  const bar = el('div', { class: 'gal-dlg__bar' },
    el('p', { class: 'gal-dlg__crumb caption' }, el('span', { class: 'gal-dlg__crumb-l' }, 'Gallery'), el('span', { class: 'gal-dlg__sep', 'aria-hidden': 'true' }, '/'), crumbNo),
    el('div', { class: 'gal-dlg__nav' }, pos, prevBtn, nextBtn, closeBtn),
  );

  const frame = el('div', { class: 'gal-dlg__frame frame frame--ph' });
  const capT = el('span', { class: 'gal-dlg__cap-t' });
  const cap = el('figcaption', { class: 'gal-dlg__cap caption' }, capT, el('span', { class: 'gal-dlg__hint', 'aria-hidden': 'true' }, 'Arrow keys to browse · Esc to close'));
  const plate = el('figure', { class: 'gal-dlg__plate' }, frame, cap);
  const stageEl = el('div', { class: 'gal-dlg__stage' }, plate);

  const eyebrow = el('p', { class: 'gal-dlg__eyebrow eyebrow', id: 'gal-dlg-no' });
  const tierChip = el('span', { class: 'tier' });
  const title = el('h2', { class: 'gal-dlg__title', id: 'gal-dlg-title' });
  const sub = el('p', { class: 'gal-dlg__sub caption' });
  const head = el('div', { class: 'gal-dlg__head' }, el('div', { class: 'gal-dlg__meta' }, eyebrow, tierChip), title, sub);

  const seedA = el('span', { class: 'gal-dlg__seed-a' });
  const seedB = el('span', { class: 'gal-dlg__seed-b' });
  const copyBtn = el('button', { type: 'button', class: 'btn btn--small gal-dlg__copy' }, 'Copy');
  const seedSec = el('section', { class: 'gal-dlg__sec', 'aria-labelledby': 'gal-dlg-seed-h' },
    el('h3', { class: 'gal-dlg__sec-t label', id: 'gal-dlg-seed-h' }, 'Seed'),
    el('div', { class: 'gal-dlg__seed-row' },
      el('code', { class: 'gal-dlg__seed', 'aria-label': 'Seed' }, seedA, seedB),
      copyBtn,
    ),
  );

  const table = el('table', { class: 'gal-dlg__table' });
  const traitSec = el('section', { class: 'gal-dlg__sec', 'aria-labelledby': 'gal-dlg-traits-h' },
    el('h3', { class: 'gal-dlg__sec-t label', id: 'gal-dlg-traits-h' }, 'Traits and odds'),
    table,
    el('p', { class: 'gal-dlg__note caption' }, 'Odds are the share of the edition that holds each value. The horizon does not change them.'),
  );

  const stillsEl = el('div', { class: 'gal-dlg__stills', role: 'group', 'aria-label': 'Growth stills' });
  const stillName = el('p', { class: 'gal-dlg__still-name caption', 'aria-hidden': 'true' });
  const nameFor = (i: number) => `${STRIP[i]!.label} · block ${fmtInt(blockOf(STRIP[i]!))}`;
  const stillBtns = STRIP.map((s, i) => {
    const art = el('span', { class: 'gal-dlg__still-art frame frame--ph', 'aria-hidden': 'true' });
    const b = el('button', { type: 'button', class: 'gal-dlg__still', 'aria-pressed': String(i === BLOOMED), 'aria-label': `${s.label}: ${s.long}`, title: s.label }, art);
    b.addEventListener('click', () => setStage(i));
    // hovering or focusing a still names it; leaving returns to the one on the plate
    const peek = () => { stillName.textContent = nameFor(i); };
    const rest = () => { stillName.textContent = nameFor(stage); };
    b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') peek(); });
    b.addEventListener('pointerleave', rest);
    b.addEventListener('focus', peek);
    b.addEventListener('blur', rest);
    stillsEl.append(b);
    return { b, art };
  });
  const growSec = el('section', { class: 'gal-dlg__sec', 'aria-labelledby': 'gal-dlg-grow-h' },
    el('h3', { class: 'gal-dlg__sec-t label', id: 'gal-dlg-grow-h' }, 'Growth'),
    stillsEl,
    stillName,
    el('p', { class: 'gal-dlg__note caption' }, 'Seed to bloom on the block clock. Choose a still to see it on the plate.'),
  );

  const dlBtn = el('button', { type: 'button', class: 'btn gal-dlg__dl' }, 'Download PNG');
  const dlNote = el('span', { class: 'caption gal-dlg__dl-note' });
  const actions = el('div', { class: 'gal-dlg__actions' }, dlBtn, dlNote);
  const status = el('p', { class: 'visually-hidden', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });

  const info = el('div', { class: 'gal-dlg__info' }, head, actions, growSec, traitSec, seedSec, status);
  const body = el('div', { class: 'gal-dlg__body' }, stageEl, info);
  const dlg = el('div', { class: 'gal-dlg', dataset: { accent: 'rose' }, tabindex: '-1' }, scrim, bar, body);
  dlg.setAttribute('role', 'dialog');
  dlg.setAttribute('aria-modal', 'true');
  dlg.setAttribute('aria-labelledby', 'gal-dlg-no gal-dlg-title');
  dlg.hidden = true;

  // Wide layouts keep the growth strip in the side panel. On a phone the plate and the panel stack, so the strip
  // moves to sit right under the plate — otherwise choosing a still would change art that has scrolled out of view.
  const wide = matchMedia('(min-width: 900px) and (min-height: 540px)');
  const placeGrowth = () => {
    growSec.classList.toggle('gal-dlg__sec--stage', !wide.matches);
    if (wide.matches) info.insertBefore(growSec, traitSec); else stageEl.append(growSec);
  };
  wide.addEventListener('change', placeGrowth);
  placeGrowth();

  const say = (msg: string) => { status.textContent = ''; requestAnimationFrame(() => { status.textContent = msg; }); };

  // ── content ───────────────────────────────────────────────────────
  function fill(it: Item) {
    applyVars(dlg, it.vars);
    const t = it.traits;
    const list = host.items();
    const i = Math.max(0, list.indexOf(it));
    crumbNo.textContent = it.label;
    pos.textContent = `${String(i + 1).padStart(2, '0')} / ${String(list.length).padStart(2, '0')}`;
    prevBtn.setAttribute('aria-disabled', String(i <= 0));
    nextBtn.setAttribute('aria-disabled', String(i >= list.length - 1));

    eyebrow.textContent = it.label;
    tierChip.textContent = t.tier ? `Rarity · ${t.tier}` : '';
    tierChip.dataset.tier = t.tier ?? '';
    tierChip.hidden = !t.tier;
    tierChip.title = 'The rarity of the piece as a whole, from all of its traits';
    title.textContent = it.title;
    sub.textContent = `${it.paletteName} · ${t.horizon.turned ? 'Turned toward' : 'Drifted to'} ${it.horizonName}`;

    seedA.textContent = it.seed.slice(0, 32);
    seedB.textContent = it.seed.slice(32);

    const rows = document.createDocumentFragment();
    const head0 = el('thead', { class: 'visually-hidden' }, el('tr', {},
      el('th', { scope: 'col' }, 'Trait'), el('th', { scope: 'col' }, 'Value'), el('th', { scope: 'col' }, 'Odds'), el('th', { scope: 'col' }, 'Tier')));
    rows.append(head0);
    for (const [g, gl] of [['body', 'Body'], ['bloom', 'Bloom'], ['keeper', 'Keeper']] as const) {
      const tb = el('tbody', { class: 'gal-dlg__tg' }, el('tr', {}, el('th', { scope: 'colgroup', colSpan: 4, class: 'gal-dlg__tgh label' }, gl)));
      for (const e of t.list.filter((x) => x.group === g)) {
        const value = e.key === 'horizon' ? `${it.horizonName} — ${t.horizon.turned ? 'Turned' : 'Drifted'}` : e.value;
        tb.append(el('tr', {},
          el('th', { scope: 'row', class: 'gal-dlg__k' }, e.label),
          el('td', { class: 'gal-dlg__v' }, value),
          el('td', { class: 'gal-dlg__p num' }, pct(e.share)),
          el('td', { class: 'gal-dlg__t' }, el('span', { class: 'tier', dataset: { tier: e.tier } }, e.tier)),
        ));
      }
      rows.append(tb);
    }
    table.replaceChildren(rows);
    table.setAttribute('aria-label', `Traits of ${it.title}`);
  }

  // ── the plate ─────────────────────────────────────────────────────
  function mountCanvas(cv: HTMLCanvasElement) {
    frame.replaceChildren(cv);
    cv.className = 'gal-dlg__cv';
    frame.classList.remove('frame--ph');
  }

  function paintMain() {
    mainJob?.cancel();
    mainJob = null;
    const my = ++renderId;
    const it = cur!;
    const st = STRIP[stage]!;
    const block = blockOf(st);
    const cssW = Math.max(120, frame.clientWidth), cssH = Math.max(150, frame.clientHeight);
    const { w, h } = fitSize(cssW, cssH, Math.min(pixelBudget(), MAIN_MAX_PX));
    curSize = { w, h };
    capT.textContent = stage === BLOOMED ? `Bloomed · block ${fmtInt(block)}` : `${st.label} · block ${fmtInt(block)}`;
    const label = `${it.title}, ${it.label}. ${st.long}. ${it.paletteName}, turned toward ${it.horizonName}.`;

    const key = `${it.no}|${block}|${w}x${h}`;
    const hit = bigCache.get(key);
    if (hit) {
      bigCache.delete(key); bigCache.set(key, hit);
      hit.setAttribute('aria-label', label);
      mountCanvas(hit);
      delete frame.dataset.busy;
      return;
    }

    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    cv.setAttribute('role', 'img');
    cv.setAttribute('aria-label', label);
    const g = cv.getContext('2d')!;
    const ph = stage === BLOOMED ? host.thumb(it) : stillCv[stage] ?? null;
    if (ph) { g.imageSmoothingQuality = 'high'; g.drawImage(ph, 0, 0, w, h); }
    mountCanvas(cv);
    frame.dataset.busy = '1';

    const state = stateAt(it, block);
    const job = enqueue(100, async (c) => {
      if (!ph) {
        const d = await renderPieceAsync(it.seed, state, Math.round(w * 0.4), Math.round(h * 0.4), { quality: 'draft' }, c);
        if (!d || c.cancelled) return null;
        g.imageSmoothingQuality = 'high';
        g.drawImage(flatten(d), 0, 0, w, h);
        free(d);
      }
      const p = await renderPieceAsync(it.seed, state, w, h, { quality: 'full' }, c);
      if (!p || c.cancelled) return null;
      composite(g, p);
      free(p);
      return true;
    });
    mainJob = job;
    void job.promise.then((ok) => {
      if (my !== renderId) return;
      mainJob = null;
      if (!ok) return;
      delete frame.dataset.busy;
      bigCache.set(key, cv);
      while (bigCache.size > 6) bigCache.delete(bigCache.keys().next().value!);
    });
  }

  function setStage(i: number, repaint = true) {
    stage = i;
    stillName.textContent = nameFor(i);
    stillBtns.forEach((s, k) => s.b.setAttribute('aria-pressed', String(k === i)));
    if (repaint) {
      paintMain();
      say(`${STRIP[i]!.long}.`);
    }
  }

  function paintStills() {
    stillJobs.splice(0).forEach((j) => j.cancel());
    const it = cur!;
    stillCv.fill(null);
    STRIP.forEach((s, i) => {
      const { art } = stillBtns[i]!;
      art.replaceChildren();
      art.classList.add('frame--ph');
      const h = getThumb(it.seed, stateAt(it, blockOf(s)), STILL.w, STILL.h, 40 - i);
      stillJobs.push(h);
      void h.promise.then((cv) => {
        if (!cv || cur !== it) return;
        stillCv[i] = cv;
        cv.className = 'gal-dlg__still-cv';
        cv.setAttribute('aria-hidden', 'true');
        art.replaceChildren(cv);
        art.classList.remove('frame--ph');
      });
    });
  }

  // ── show / navigate ───────────────────────────────────────────────
  function show(it: Item, dir = 0) {
    cancelWork();
    cur = it;
    stage = BLOOMED;
    stillName.textContent = nameFor(BLOOMED);
    stillBtns.forEach((s, k) => s.b.setAttribute('aria-pressed', String(k === BLOOMED)));
    fill(it);
    info.scrollTop = 0;
    dlg.scrollTop = 0;
    paintMain();
    paintStills();
    setDl('idle');
    const list = host.items();
    say(`${it.label}, ${it.title}. ${list.indexOf(it) + 1} of ${list.length}.`);
    if (dir && !reducedMotion()) {
      frame.animate([{ opacity: 0, transform: `translateX(${dir * 28}px)` }, { opacity: 1, transform: 'none' }], { duration: 380, easing: EASE });
      info.animate([{ opacity: 0.2 }, { opacity: 1 }], { duration: 320, easing: EASE });
    }
  }

  function go(d: -1 | 1) {
    if (!cur) return;
    const list = host.items();
    const i = list.indexOf(cur) + d;
    if (i < 0 || i >= list.length) return;
    const nx = list[i]!;
    host.navigate(nx);
    show(nx, d);
  }

  function cancelWork() {
    mainJob?.cancel(); mainJob = null; renderId++;
    stillJobs.splice(0).forEach((j) => j.cancel());
    dlJob?.cancel(); dlJob = null; dlBusy = false;
  }

  // ── actions ───────────────────────────────────────────────────────
  function setDl(state: 'idle' | 'busy', note = '') {
    dlBusy = state === 'busy';
    dlBtn.textContent = dlBusy ? 'Rendering…' : 'Download PNG';
    dlBtn.setAttribute('aria-disabled', String(dlBusy));
    dlBtn.setAttribute('aria-busy', String(dlBusy));
    const small = pixelBudget() <= 1_100_000;
    dlNote.textContent = note || (small ? '1600 × 2000 px' : '2000 × 2500 px');
  }

  async function download() {
    if (dlBusy || !cur) return;
    const it = cur;
    const small = pixelBudget() <= 1_100_000;
    const W = small ? 1600 : 2000, H = small ? 2000 : 2500;
    setDl('busy', 'This takes a few seconds');
    say(`Rendering ${W} by ${H} pixels.`);
    const job = renderQueued(it.seed, stateAt(it, STAGES.bloomed), W, H, { quality: 'full' }, 90);
    dlJob = job;
    const piece = await job.promise;
    if (dlJob !== job) return; // cancelled: the piece changed or the view closed
    dlJob = null;
    if (!piece) { setDl('idle'); return; }
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    composite(cv.getContext('2d')!, piece);
    free(piece);
    const blob = await new Promise<Blob | null>((res) => cv.toBlob(res, 'image/png'));
    cv.width = 0; cv.height = 0;
    if (!blob) { setDl('idle', 'Could not save on this device'); say('The image could not be saved on this device.'); return; }
    const a = el('a', { href: URL.createObjectURL(blob), download: `halocline-${it.code}-${slug(it.title)}.png`, class: 'visually-hidden' });
    dlg.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    setDl('idle', 'Saved');
    say(`Saved ${it.label}, ${it.title}, as a PNG.`);
  }

  async function copySeed() {
    if (!cur) return;
    const text = cur.seed;
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = el('textarea', { class: 'visually-hidden', readOnly: true }, text);
      dlg.append(ta); ta.select();
      try { document.execCommand('copy'); } catch { /* nothing more to try */ }
      ta.remove(); copyBtn.focus();
    }
    copyBtn.textContent = 'Copied';
    say('Seed copied.');
    setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1800);
  }

  // ── modal plumbing ────────────────────────────────────────────────
  function lock() {
    scrollY0 = window.scrollY;
    const sbw = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (sbw > 0) document.body.style.paddingRight = `${sbw}px`;
    lockedEls.length = 0;
    for (const n of Array.from(document.body.children) as HTMLElement[]) {
      if (n === dlg) continue;
      lockedEls.push({ node: n, inert: n.inert, hidden: n.getAttribute('aria-hidden') });
      n.inert = true;
      n.setAttribute('aria-hidden', 'true');
    }
  }
  function unlock() {
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
    for (const s of lockedEls) {
      s.node.inert = s.inert;
      if (s.hidden === null) s.node.removeAttribute('aria-hidden'); else s.node.setAttribute('aria-hidden', s.hidden);
    }
    lockedEls.length = 0;
  }

  const focusables = () =>
    Array.from(dlg.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
      .filter((n) => !n.hasAttribute('disabled') && n.offsetParent !== null);

  function onKey(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); host.requestClose(); return; }
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    else if (e.key === 'Tab') {
      const f = focusables();
      if (!f.length) return;
      const first = f[0]!, last = f[f.length - 1]!;
      const a = document.activeElement;
      if (e.shiftKey && (a === first || a === dlg)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
      else if (!dlg.contains(a)) { e.preventDefault(); first.focus(); }
    }
  }

  // swipe: horizontal, decisive, single finger
  let sx = 0, sy = 0, st0 = 0, tracking = false;
  stageEl.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) { tracking = false; return; }
    tracking = true; sx = e.touches[0]!.clientX; sy = e.touches[0]!.clientY; st0 = e.timeStamp;
  }, { passive: true });
  stageEl.addEventListener('touchend', (e) => {
    if (!tracking) return;
    tracking = false;
    const t = e.changedTouches[0]!;
    const dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.6 && e.timeStamp - st0 < 700) go(dx < 0 ? 1 : -1);
  }, { passive: true });

  prevBtn.addEventListener('click', () => go(-1));
  nextBtn.addEventListener('click', () => go(1));
  closeBtn.addEventListener('click', () => host.requestClose());
  dlBtn.addEventListener('click', () => void download());
  copyBtn.addEventListener('click', () => void copySeed());

  // re-render the plate if it is resized substantially (rotation, window drag)
  let rt: ReturnType<typeof setTimeout> | undefined;
  const ro = 'ResizeObserver' in window ? new ResizeObserver(() => {
    if (!open || !cur || closing) return;
    clearTimeout(rt);
    rt = setTimeout(() => {
      const want = fitSize(Math.max(120, frame.clientWidth), Math.max(150, frame.clientHeight), Math.min(pixelBudget(), MAIN_MAX_PX));
      if (curSize.w && Math.abs(want.w - curSize.w) / curSize.w > 0.12) paintMain();
    }, 280);
  }) : null;

  // ── open / close with flight from and to the tile ────────────────────
  function stopAnims() { anims.forEach((a) => a.cancel()); anims = []; }
  const run = (n: Element, kf: Keyframe[], o: KeyframeAnimationOptions) => {
    const a = n.animate(kf, o); anims.push(a);
    return new Promise<void>((res) => { a.onfinish = a.oncancel = () => res(); });
  };

  function flightFrom(tileEl: HTMLElement | null): Keyframe | null {
    const art = tileEl?.querySelector<HTMLElement>('.gal__art');
    if (!art) return null;
    const a = art.getBoundingClientRect(), b = frame.getBoundingClientRect();
    if (!a.width || !b.width || a.bottom < 0 || a.top > innerHeight) return null;
    return { transform: `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(${a.width / b.width}, ${a.height / b.height})` };
  }

  function openView(it: Item, from: HTMLElement | null) {
    if (open) { show(it); return; }
    open = true; closing = false;
    restoreFocus = (document.activeElement as HTMLElement) ?? null;
    if (!dlg.isConnected) document.body.append(dlg);
    lock();
    dlg.hidden = false;
    dlg.style.pointerEvents = '';
    show(it);
    addEventListener('keydown', onKey, true);
    ro?.observe(frame);
    closeBtn.focus({ preventScroll: true });
    if (reducedMotion()) return;
    stopAnims();
    const fl = flightFrom(from);
    void run(scrim, [{ opacity: 0 }, { opacity: 1 }], { duration: 380, easing: 'ease-out', fill: 'backwards' });
    void run(bar, [{ opacity: 0 }, { opacity: 1 }], { duration: 420, delay: 160, easing: EASE, fill: 'backwards' });
    void run(info, [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { duration: 620, delay: 220, easing: EASE, fill: 'backwards' });
    void run(cap, [{ opacity: 0 }, { opacity: 1 }], { duration: 420, delay: 380, easing: EASE, fill: 'backwards' });
    if (fl) void run(frame, [fl, { transform: 'none' }], { duration: 640, easing: EASE });
    else void run(frame, [{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }], { duration: 560, delay: 80, easing: EASE, fill: 'backwards' });
  }

  async function closeView() {
    if (!open || closing) return;
    closing = true;
    cancelWork();
    removeEventListener('keydown', onKey, true);
    ro?.disconnect();
    const it = cur;
    dlg.style.pointerEvents = 'none';
    unlock();
    // bring the piece we are looking at back into view, so the plate can settle onto its tile
    let tileEl = it ? host.tile(it) : null;
    if (tileEl) {
      const r = tileEl.getBoundingClientRect();
      if (r.top < 72 || r.bottom > innerHeight - 8) {
        tileEl.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
      }
    } else window.scrollTo({ top: scrollY0, behavior: 'instant' as ScrollBehavior });
    if (!reducedMotion()) {
      stopAnims();
      const fl = flightFrom(tileEl);
      const parts: Promise<void>[] = [
        run(info, [{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: 'ease-in', fill: 'forwards' }),
        run(bar, [{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: 'ease-in', fill: 'forwards' }),
        run(cap, [{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' }),
        run(scrim, [{ opacity: 1 }, { opacity: 0 }], { duration: 480, delay: 120, easing: 'ease-in', fill: 'forwards' }),
      ];
      if (fl) parts.push(run(frame, [{ transform: 'none' }, fl], { duration: 520, easing: EASE, fill: 'forwards' }));
      else parts.push(run(frame, [{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' }));
      await Promise.all(parts);
    }
    stopAnims();
    dlg.hidden = true;
    open = false; closing = false;
    tileEl = it ? host.tile(it) : tileEl;
    const target = tileEl && tileEl.isConnected && !tileEl.closest('[hidden]') ? tileEl : restoreFocus;
    if (target && target.isConnected) target.focus({ preventScroll: true });
    cur = null;
  }

  return {
    isOpen: () => open,
    current: () => cur,
    open: openView,
    show: (it: Item) => { if (open && cur !== it) show(it); },
    close: () => closeView(),
    /** the filter set changed under an open view */
    refreshNav: () => { if (open && cur) fill(cur); },
    dispose: () => {
      cancelWork();
      if (open) { unlock(); removeEventListener('keydown', onKey, true); }
      ro?.disconnect();
      wide.removeEventListener('change', placeGrowth);
      dlg.remove();
      open = false;
    },
  };
}
