// 01 — The story. Five passages, each with a render of one hand-picked seed.
//
//  desktop (>= 900px)  one sticky stage on the left; the art changes with the passage in the middle of the viewport.
//                      Passages III and V are scroll-linked: their text pins and scroll progress drives the crossfade.
//  phone               each passage carries its own small figure above the text. No sticky, no scroll-linking:
//                      the tides and the bloom are a row of stills you tap.

import '../styles/story.css';
import { PARAMS, STAGES, REVEAL_BLOCK, HORIZON_NAMES, deriveTraits, timeline, type Horizon, type PieceState } from '../../art/index.ts';
import { STORY } from '../../data/featured.ts';
import { el, watchVisible } from '../lib/dom.ts';
import { fmtInt } from '../lib/format.ts';
import { onMotionChange, reducedMotion } from '../lib/motion.ts';
import { fitSize, pixelBudget } from '../lib/piece.ts';
import { observeReveal } from '../lib/reveal.ts';
import { HEAD, PASSAGES, ROMAN, richNodes } from './story.copy.ts';
import { Frame, Stage, type FrameHost, type FrameSpec } from './story.stage.ts';

const S = STORY;
const N = PASSAGES.length;
const SCRUB = new Set([2, 4]);
const ACCENTS = ['ember', 'verdigris', 'cobalt', 'rose', 'saffron', 'orchid', 'glacier'];
const DESKTOP = '(min-width: 900px)';

type Mode = 'stage' | 'stack';
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
/** Where a scroll-linked passage stands among its n frames: hold, blend, hold. */
function mix(n: number, p: number, reduce: boolean) {
  const f = p * (n - 1);
  if (reduce) { const k = Math.round(f); return { k, b: 0, near: k }; }
  const k = Math.min(n - 2, Math.floor(f));
  const b = smooth(0.18, 0.82, f - k);
  return { k, b, near: b > 0.5 ? k + 1 : k };
}
const at = (block: number, horizon: Horizon | null, sky: string | null = null): PieceState => ({ block, horizon, sky });
const meta = (block: number) => `Day ${timeline(block).day} · Block ${fmtInt(block)}`;

// ── what each picture is ──────────────────────────────────────────────
const lore = PARAMS.lore;
const specCache = new Map<string, FrameSpec>();
const memo = (key: string, make: () => FrameSpec): FrameSpec => {
  let v = specCache.get(key);
  if (!v) specCache.set(key, (v = make()));
  return v;
};
const specGlass = (): FrameSpec => memo('glass', () => ({
  id: 'glass', seed: S.seed, state: at(STAGES.tide4, S.horizon), only: ['abyss', 'strata', 'texture'],
  label: 'The Glass Sea', meta: `${lore.layers.abyss!.name} · ${lore.layers.strata!.name} · ${lore.layers.texture!.name}`, line: 'The sea, before anything is lifted from it.',
}));
const specSeed = (): FrameSpec => memo('seed', () => ({
  id: 'seed', seed: S.seed, state: at(STAGES.seed, S.horizon),
  label: 'The seed', meta: meta(STAGES.seed), line: 'Cold, dim, half-formed.',
}));
const TIDE_KEYS = ['tide1', 'tide2', 'tide3', 'tide4'] as const;
const specTide = (k: number): FrameSpec => memo(`tide${k}`, () => {
  const block = STAGES[TIDE_KEYS[k]!];
  return { id: `tide${k + 1}`, seed: S.seed, state: at(block, S.horizon), label: `Tide ${ROMAN[k]} · ${lore.tides[k]!.name}`, meta: meta(block), line: lore.tides[k]!.line };
});
const specStill = (h: Horizon): FrameSpec => memo(`still${h}`, () => ({
  id: `still:${h}`, seed: S.seed, state: at(STAGES.still, h),
  label: `The Still Hour · ${HORIZON_NAMES[h]}`, meta: meta(STAGES.still), line: PARAMS.horizons[h]!.line,
}));
const BLOOM = [
  { key: 'reveal', stage: STAGES.reveal, label: 'The sky opens', line: () => 'The bud is taut, and closed.' },
  { key: 'opening', stage: STAGES.opening, label: 'The bloom opens', line: (h: Horizon) => `Turned toward ${HORIZON_NAMES[h]}.` },
  { key: 'bloomed', stage: STAGES.bloomed, label: 'Bloomed', line: (h: Horizon) => `Turned toward ${HORIZON_NAMES[h]}. It never changes again.` },
] as const;
const specBloom = (k: number, h: Horizon): FrameSpec => memo(`bloom${k}${h}`, () => {
  const b = BLOOM[k]!;
  return { id: `bloom:${h}:${b.key}`, seed: S.seed, state: at(b.stage, h, S.sky), label: b.label, meta: meta(b.stage), line: b.line(h) };
});

interface StepDef { num: string; name: string; when: string; short: string }
const stepsOf = (i: number): StepDef[] => {
  if (i === 2) {
    return [
      { num: '0', name: 'The seed', when: 'Block 0', short: 'Seed' },
      ...lore.tides.map((t, k) => ({
        num: ROMAN[k]!, name: t.name, short: ROMAN[k]!,
        when: `Days ${k * PARAMS.clock.tideDays}–${(k + 1) * PARAMS.clock.tideDays}`,
      })),
    ];
  }
  return [
    { num: '', name: 'The sky opens', when: `Block ${fmtInt(STAGES.reveal)}`, short: 'Sky' },
    { num: '', name: 'The bloom opens', when: `Block ${fmtInt(STAGES.opening)}`, short: 'Opening' },
    { num: '', name: 'Bloomed, final', when: `Block ${fmtInt(STAGES.bloomed)}`, short: 'Bloomed' },
  ];
};

interface Fig { fig: HTMLElement; frameEl: HTMLElement; label: HTMLElement; meta: HTMLElement; count: HTMLElement; line: HTMLElement }

class Story {
  private mode: Mode;
  private chosen: Horizon = S.horizon;
  private root: HTMLElement;
  private wrap!: HTMLElement;
  private grid!: HTMLElement;
  private stagecol!: HTMLElement;
  private passages: HTMLElement[] = [];
  private texts: HTMLElement[] = [];
  private stepBtns: HTMLButtonElement[][] = [];
  private controls: (HTMLElement | null)[] = [];
  private inners: HTMLElement[] = [];
  private chips: HTMLButtonElement[] = [];
  private live!: HTMLElement;
  private figs: Fig[] = [];
  private stages: Stage[] = [];
  private thumbs: (HTMLCanvasElement | null)[][] = [];
  private stackIdx: number[] = [0, 0, 2, 0, 2];
  private px = { w: 0, h: 0 };
  private cssW = 0;
  private near = false;
  private active = 0;
  private lastActive = -1;
  private slowUntil = 0;
  private raf = 0;
  private hoverT = 0;
  private disposed = false;
  private offs: Array<() => void> = [];
  private lastCap = new Map<Fig, string>();
  private pNow = [0, 0, 0, 0, 0];
  private lastStep: number[] = [-1, -1, -1, -1, -1];
  private mq = matchMedia(DESKTOP);

  private host: FrameHost = {
    changed: () => this.onFrame(),
    twin: (f) => {
      for (const st of this.stages) for (const g of st.frames.values()) if (g !== f && g.key === f.key && g.quality === 2) return g;
      return null;
    },
  };

  constructor(root: HTMLElement) {
    this.root = root;
    this.mode = this.mq.matches ? 'stage' : 'stack';
    this.themeFromArt();
    this.buildStatic();
    this.buildMode();

    const sched = () => this.schedule();
    window.addEventListener('scroll', sched, { passive: true });
    let rt = 0;
    const onResize = () => { clearTimeout(rt); rt = window.setTimeout(() => this.onResize(), 160); };
    window.addEventListener('resize', onResize);
    this.offs.push(
      () => window.removeEventListener('scroll', sched),
      () => { window.removeEventListener('resize', onResize); clearTimeout(rt); },
      watchVisible(this.grid, (v) => { this.near = v; if (v) this.schedule(); else this.cancelAll(); }, '100% 0px 100% 0px'),
      onMotionChange(() => { this.schedule(); }),
    );
  }

  // ── theme from the art ──────────────────────────────────────────────
  private themeFromArt() {
    try {
      const tr = deriveTraits(S.seed);
      const id = tr.colors.id;
      if (ACCENTS.includes(id)) this.root.dataset.accent = id;
      const c = tr.colors.c.mid;
      this.root.style.setProperty('--story-tint', `rgb(${Math.round(c[0])} ${Math.round(c[1])} ${Math.round(c[2])})`);
    } catch { /* the page still works without a tint */ }
  }

  // ── static DOM: head, passages ──────────────────────────────────────
  private buildStatic() {
    const head = el('header', { class: 'section-head story__head' },
      el('p', { class: 'eyebrow', 'data-reveal': '' }, HEAD.eyebrow),
      el('h2', { class: 'h2', id: 'story-title', 'data-reveal': '', style: '--d:90' }, ...richNodes(HEAD.h2.join(' '))),
      el('p', { class: 'lede', 'data-reveal': '', style: '--d:180' }, HEAD.lede),
    );

    const list = el('ol', { class: 'story__passages', role: 'list' });
    PASSAGES.forEach((p, i) => {
      const title = el('h3', { class: 'story__title h3', id: `story-p${i}` }, p.title);
      const inner = el('div', { class: 'story__text-in', 'data-reveal': '' },
        el('p', { class: 'story__num', 'aria-hidden': 'true' }, ROMAN[i]),
        title,
        el('p', { class: 'story__body' }, ...richNodes(p.body)),
        el('p', { class: 'story__line' }, p.line),
      );
      if (SCRUB.has(i)) this.controls[i] = this.buildSteps(i);
      if (i === 3) this.controls[i] = this.buildTurn();
      this.inners[i] = inner;
      if (i === 4) inner.append(el('p', { class: 'story__note caption', dataset: { note: '' } }, `Shown with a rehearsal sky. The real one stays sealed until block ${fmtInt(REVEAL_BLOCK)}.`));
      const text = el('div', { class: 'story__text' }, inner);
      const li = el('li', { class: `story__passage${SCRUB.has(i) ? ' story__passage--scrub' : ''}`, 'aria-labelledby': `story-p${i}`, dataset: { i: String(i) } }, text);
      this.passages.push(li);
      this.texts.push(text);
      list.append(li);
    });

    this.live = el('p', { class: 'visually-hidden', role: 'status', 'aria-live': 'polite' });
    this.stagecol = el('div', { class: 'story__stagecol' });
    this.grid = el('div', { class: 'story__grid' }, list, this.stagecol);
    this.wrap = el('div', { class: 'wrap story' }, head, this.grid, this.live);
    this.root.replaceChildren(this.wrap);
  }

  private buildSteps(i: number) {
    const defs = stepsOf(i);
    const btns: HTMLButtonElement[] = [];
    const ol = el('ol', {
      class: `story__steps${defs[0]!.num ? '' : ' story__steps--plain'}`, style: `--n:${defs.length}`, role: 'list',
      'aria-label': i === 2 ? 'The seed through the four tides' : 'The bloom, from the sky opening to the final form',
    });
    defs.forEach((d, k) => {
      const b = el('button', { type: 'button', class: 'story__step', 'aria-label': `${d.name}, ${d.when}`, onclick: () => this.onStep(i, k) },
        el('span', { class: 'story__step-n', 'aria-hidden': 'true' }, d.num),
        el('span', { class: 'story__step-name', 'aria-hidden': 'true' }, d.name),
        el('span', { class: 'story__step-when', 'aria-hidden': 'true' }, d.when),
        el('span', { class: 'story__step-short', 'aria-hidden': 'true' }, d.short),
      );
      btns.push(b);
      ol.append(el('li', {}, b));
    });
    this.stepBtns[i] = btns;
    return el('div', { class: 'story__steps-wrap' }, el('p', { class: 'story__hint caption' }, i === 2 ? 'Tap a tide' : 'Tap a moment'), ol);
  }

  private buildTurn() {
    const group = el('div', { class: 'story__chips', role: 'group', 'aria-label': 'Turn the seed toward a horizon' });
    HORIZON_NAMES.forEach((name, h) => {
      const b = el('button', {
        type: 'button', class: 'chip story__chip', 'aria-pressed': String(h === this.chosen), dataset: { h: String(h) },
        onclick: () => this.setHorizon(h as Horizon),
        onpointerenter: () => this.prefetch(h as Horizon),
        // hover turns the seed only when the pointer really moves over the chip (a scroll passing under it does not count)
        onpointermove: (e: PointerEvent) => {
          if (e.pointerType !== 'mouse' || (!e.movementX && !e.movementY) || h === this.chosen) return;
          clearTimeout(this.hoverT);
          this.hoverT = window.setTimeout(() => this.setHorizon(h as Horizon), 170);
        },
        onpointerleave: () => clearTimeout(this.hoverT),
        onfocus: () => this.prefetch(h as Horizon),
        onkeydown: (e: KeyboardEvent) => this.onChipKey(e, h),
      }, name);
      this.chips.push(b);
      group.append(b);
    });
    return el('div', { class: 'story__turn' }, el('p', { class: 'label story__turn-label' }, 'Turn the seed toward'), group);
  }

  // ── mode: one sticky stage, or a figure per passage ─────────────────
  private buildMode() {
    for (const st of this.stages) st.dispose();
    this.stages = [];
    this.figs.forEach((f) => f.fig.remove());
    this.figs = [];
    this.lastCap.clear();
    this.lastStep = [-1, -1, -1, -1, -1];
    this.thumbs = [];
    this.wrap.classList.toggle('story--stage', this.mode === 'stage');
    this.wrap.classList.toggle('story--stack', this.mode === 'stack');

    if (this.mode === 'stage') {
      const f = this.makeFigure(null);
      this.stagecol.replaceChildren(f.fig);
      this.figs = [f];
      this.stages = [new Stage(f.frameEl)];
      // controls live in the text, after the italic line (before the note)
      this.controls.forEach((c, i) => {
        if (!c) return;
        const note = this.inners[i]!.querySelector('[data-note]');
        note ? this.inners[i]!.insertBefore(c, note) : this.inners[i]!.append(c);
      });
    } else {
      this.stagecol.replaceChildren();
      this.passages.forEach((li, i) => {
        const f = this.makeFigure(i);
        li.prepend(f.fig);
        this.figs.push(f);
        this.stages.push(new Stage(f.frameEl));
        // controls sit directly under the picture they change, so a tap never scrolls the picture away
        const c = this.controls[i];
        if (c) f.fig.after(c);
        if (this.stepBtns[i]) {
          const row: (HTMLCanvasElement | null)[] = [];
          this.stepBtns[i]!.forEach((b) => {
            b.querySelector('.story__step-thumb')?.remove();
            const cv = el('canvas', { class: 'story__step-thumb', 'aria-hidden': 'true', width: 1, height: 1 });
            b.prepend(cv);
            row.push(cv);
          });
          this.thumbs[i] = row;
        }
      });
    }
    if (this.mode === 'stage') this.stepBtns.forEach((row) => row?.forEach((b) => b.querySelector('.story__step-thumb')?.remove()));
    this.setPins();
    observeReveal(this.wrap);
    this.measureSize();
    this.schedule();
  }

  private makeFigure(i: number | null): Fig {
    const frameEl = el('div', { class: 'story__frame frame frame--ph' });
    const label = el('span', { class: 'story__cap-label caption' });
    const metaEl = el('span', { class: 'story__cap-meta caption' });
    const count = el('span', { class: 'story__cap-count caption' });
    const line = el('span', { class: 'story__cap-line' });
    const cap = el('figcaption', { class: 'story__cap' }, el('span', { class: 'story__cap-row' }, label, metaEl, count), line);
    const fig = el('figure', { class: `story__fig${i === null ? ' story__fig--stage' : ''}`, 'data-reveal': '' }, frameEl, cap);
    return { fig, frameEl, label, meta: metaEl, count, line };
  }

  // ── the frames each passage owns ────────────────────────────────────
  /** Frames a passage wants rendered, most urgent first. */
  private specsFor(i: number): FrameSpec[] {
    switch (i) {
      case 0: return [specGlass()];
      case 1: return [specSeed()];
      case 2: return [specSeed(), ...[0, 1, 2, 3].map(specTide)];
      case 3: {
        const order = [this.chosen, ...([0, 1, 2, 3] as Horizon[]).filter((h) => h !== this.chosen)];
        return order.map(specStill);
      }
      default: return BLOOM.map((_, k) => specBloom(k, this.chosen));
    }
  }
  /** The ordered frames a scroll-linked / tap-linked passage moves through. */
  private scrubSpecs(i: number): FrameSpec[] {
    return i === 2 ? [specSeed(), ...[0, 1, 2, 3].map(specTide)] : BLOOM.map((_, k) => specBloom(k, this.chosen));
  }
  private stageOf(i: number) { return this.mode === 'stage' ? this.stages[0]! : this.stages[i]!; }
  private frame(i: number, spec: FrameSpec): Frame {
    const st = this.stageOf(i);
    let f = st.frames.get(spec.id);
    if (!f) { f = new Frame(spec, this.host); st.add(f); }
    return f;
  }

  // ── geometry ────────────────────────────────────────────────────────
  private measureSize() {
    const r = this.figs[0]?.frameEl.getBoundingClientRect();
    if (!r || r.width < 40) return;
    this.cssW = r.width;
    const stage = this.mode === 'stage';
    this.px = fitSize(r.width, r.height, Math.min(stage ? 780_000 : 420_000, pixelBudget()), stage ? 1.5 : 2);
  }

  /** Vertical centre for the pinned text of a scroll-linked passage. */
  private setPins() {
    const vh = window.innerHeight;
    const nav = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 64;
    SCRUB.forEach((i) => {
      const t = this.texts[i]!;
      const h = t.firstElementChild instanceof HTMLElement ? t.firstElementChild.offsetHeight : t.offsetHeight;
      t.style.setProperty('--pin', `${Math.round(Math.max(nav + 16, (vh - h) / 2))}px`);
    });
  }

  private onResize() {
    if (this.disposed) return;
    const mode: Mode = this.mq.matches ? 'stage' : 'stack';
    if (mode !== this.mode) { this.mode = mode; this.buildMode(); return; }
    this.setPins();
    const r = this.figs[0]?.frameEl.getBoundingClientRect();
    if (r && this.cssW && Math.abs(r.width - this.cssW) / this.cssW > 0.22) {
      this.stages.forEach((st) => st.frames.forEach((f) => f.release()));
      this.measureSize();
    }
    this.schedule();
  }

  // ── the loop ────────────────────────────────────────────────────────
  private schedule() {
    if (this.raf || this.disposed) return;
    this.raf = requestAnimationFrame(() => { this.raf = 0; this.update(); });
  }
  private onFrame() {
    if (this.mode === 'stack') { this.paintStack(); this.paintThumbs(); }
    this.schedule();
  }

  private measure() {
    const vh = window.innerHeight;
    const mid = vh * 0.5;
    let active = 0, best = Infinity;
    const p = [0, 0, 0, 0, 0];
    this.passages.forEach((li, i) => {
      const lr = li.getBoundingClientRect();
      const tr = this.mode === 'stage' ? this.texts[i]!.getBoundingClientRect() : lr;
      const d = Math.abs((tr.top + tr.bottom) / 2 - mid);
      if (d < best) { best = d; active = i; }
      if (this.mode === 'stage' && SCRUB.has(i)) {
        const span = lr.height - tr.height;
        p[i] = span > 1 ? clamp((tr.top - lr.top) / span) : 0;
      }
    });
    return { active, p };
  }

  private update() {
    if (this.disposed) return;
    if (!this.figs[0] || !this.near) return;
    if (!this.px.w) this.measureSize();
    const m = this.measure();
    this.active = m.active;
    this.pNow = m.p;
    if (this.mode === 'stage') this.paintStage(m);
    this.plan();
  }

  private paintStage(m: { active: number; p: number[] }) {
    const stage = this.stages[0]!;
    const fig = this.figs[0]!;
    const reduce = reducedMotion();
    const a = m.active;
    let list: Array<[Frame, number]>;
    let cap: Frame;
    if (SCRUB.has(a)) {
      const fr = this.scrubSpecs(a).map((sp) => this.frame(a, sp));
      const { k, b, near } = mix(fr.length, m.p[a]!, reduce);
      list = reduce ? [[fr[k]!, 1]] : [[fr[k]!, 1], [fr[k + 1]!, b]];
      cap = fr[near]!;
    } else {
      const spec = a === 0 ? specGlass() : a === 1 ? specSeed() : specStill(this.chosen);
      cap = this.frame(a, spec);
      list = [[cap, 1]];
    }
    const now = performance.now();
    if (a !== this.lastActive) { this.lastActive = a; this.slowUntil = now + 1400; }
    stage.show(list, reduce ? 0 : now < this.slowUntil ? 300 : 90);
    this.setCaption(fig, cap.spec, a);
    // highlight the step that the scroll has reached
    SCRUB.forEach((i) => this.markStep(i, mix(this.scrubSpecs(i).length, m.p[i]!, reduce).near));
  }

  private paintStack() {
    if (this.mode !== 'stack') return;
    const reduce = reducedMotion();
    this.passages.forEach((_, i) => {
      const st = this.stages[i], fig = this.figs[i];
      if (!st || !fig) return;
      let spec: FrameSpec;
      if (i === 0) spec = specGlass();
      else if (i === 1) spec = specSeed();
      else if (i === 3) spec = specStill(this.chosen);
      else spec = this.scrubSpecs(i)[this.stackIdx[i]!]!;
      const f = this.frame(i, spec);
      st.show([[f, 1]], reduce ? 0 : 260);
      if (f.usable) this.setCaption(fig, spec, i);
      else if (!this.lastCap.has(fig)) this.setCaption(fig, spec, i);
      if (SCRUB.has(i)) this.markStep(i, this.stackIdx[i]!);
    });
  }

  private paintThumbs() {
    if (this.mode !== 'stack') return;
    SCRUB.forEach((i) => {
      const row = this.thumbs[i];
      if (!row) return;
      this.scrubSpecs(i).forEach((spec, k) => {
        const cv = row[k];
        const f = this.stageOf(i).frames.get(spec.id);
        if (!cv || !f || !f.usable) return;
        const stamp = `${f.quality}|${f.w}`;
        if (cv.dataset.s === stamp) return;
        cv.dataset.s = stamp;
        const w = 144, h = 180;
        if (cv.width !== w) { cv.width = w; cv.height = h; }
        const g = cv.getContext('2d')!;
        g.imageSmoothingQuality = 'high';
        g.drawImage(f.canvas, 0, 0, w, h);
      });
    });
  }

  private setCaption(fig: Fig, spec: FrameSpec, i: number) {
    const key = `${spec.id}|${i}`;
    if (this.lastCap.get(fig) === key) return;
    this.lastCap.set(fig, key);
    fig.label.textContent = spec.label;
    fig.meta.textContent = spec.meta;
    fig.line.textContent = spec.line;
    fig.count.textContent = `${ROMAN[i]} / ${ROMAN[N - 1]}`;
  }

  private markStep(i: number, k: number) {
    if (this.lastStep[i] === k) return;
    this.lastStep[i] = k;
    this.stepBtns[i]?.forEach((b, j) => (j === k ? b.setAttribute('aria-current', 'step') : b.removeAttribute('aria-current')));
  }

  // ── rendering plan: what is worth having in memory right now ────────
  private plan() {
    if (!this.px.w) return;
    const want = new Map<Frame, { pri: number; prog: boolean }>();
    for (let i = 0; i < N; i++) {
      const dist = Math.abs(i - this.active);
      if (dist > 1) continue;
      this.specsFor(i).forEach((spec, k) => {
        const f = this.frame(i, spec);
        let pri = dist === 0 ? (k === 0 ? 8 : 6) : 4;
        // in a scroll-linked passage the frame nearest to where the reader is comes first
        if (dist === 0 && SCRUB.has(i) && this.mode === 'stage') {
          const idx = this.scrubSpecs(i).findIndex((s) => s.id === spec.id);
          if (idx >= 0) pri = 8 - Math.min(2, Math.abs(idx - Math.round(this.pNow[i]! * (this.scrubSpecs(i).length - 1))));
        }
        const prog = dist === 0 && pri >= 7;
        const prev = want.get(f);
        if (!prev || prev.pri < pri) want.set(f, { pri, prog });
      });
    }
    for (const st of this.stages) {
      for (const f of st.frames.values()) {
        const w = want.get(f);
        if (w) f.request(this.px.w, this.px.h, w.pri, w.prog);
        else f.cancel();
      }
    }
    this.trim();
  }
  /** Keep memory sane on huge screens: let go of frames more than two passages away. */
  private trim() {
    let px = 0;
    for (const st of this.stages) for (const f of st.frames.values()) px += f.w * f.h;
    const cap = this.mode === 'stage' ? 9_500_000 : 5_500_000;
    if (px <= cap) return;
    for (let i = 0; i < N; i++) {
      if (Math.abs(i - this.active) < 3) continue;
      this.specsFor(i).forEach((s) => this.stageOf(i).frames.get(s.id)?.release());
    }
  }

  private cancelAll() {
    for (const st of this.stages) for (const f of st.frames.values()) f.cancel();
  }

  private prefetch(h: Horizon) {
    if (!this.near || !this.px.w) return;
    this.frame(3, specStill(h)).request(this.px.w, this.px.h, 9, true);
  }

  // ── interactions ────────────────────────────────────────────────────
  private setHorizon(h: Horizon) {
    if (h === this.chosen) return;
    this.chosen = h;
    this.chips.forEach((b, j) => b.setAttribute('aria-pressed', String(j === h)));
    this.live.textContent = `Facing ${HORIZON_NAMES[h]}. ${PARAMS.horizons[h]!.line}`;
    // the bloom follows the turn: forget the ones we drew for another horizon
    const st = this.stageOf(4);
    for (const f of [...st.frames.values()]) if (f.spec.id.startsWith('bloom:') && !f.spec.id.startsWith(`bloom:${h}:`)) st.remove(f);
    this.thumbs[4]?.forEach((cv) => { if (cv) delete cv.dataset.s; });
    if (this.mode === 'stack') { this.paintStack(); this.paintThumbs(); }
    this.frame(3, specStill(h)).request(this.px.w, this.px.h, 9, true);
    this.lastCap.clear();
    this.slowUntil = performance.now() + 1400;
    this.schedule();
  }

  private onChipKey(e: KeyboardEvent, h: number) {
    const n = HORIZON_NAMES.length;
    let to = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') to = (h + 1) % n;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') to = (h + n - 1) % n;
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = n - 1;
    if (to < 0) return;
    e.preventDefault();
    this.chips[to]!.focus();
    this.setHorizon(to as Horizon);
  }

  private onStep(i: number, k: number) {
    if (this.mode === 'stack') {
      this.stackIdx[i] = k;
      const spec = this.scrubSpecs(i)[k]!;
      this.frame(i, spec).request(this.px.w, this.px.h, 9, true);
      this.paintStack();
      return;
    }
    const li = this.passages[i]!, tx = this.texts[i]!;
    const lr = li.getBoundingClientRect(), tr = tx.getBoundingClientRect();
    const span = lr.height - tr.height;
    const n = stepsOf(i).length;
    const pin = parseFloat(getComputedStyle(tx).top) || 0;
    const y = lr.top + window.scrollY - pin + (k / (n - 1)) * span;
    window.scrollTo({ top: Math.round(y), behavior: reducedMotion() ? 'auto' : 'smooth' });
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    clearTimeout(this.hoverT);
    this.offs.forEach((f) => f());
    this.stages.forEach((s) => s.dispose());
    this.root.replaceChildren();
  }
}

const live = new WeakMap<HTMLElement, Story>();

export default function mount(root: HTMLElement) {
  live.get(root)?.dispose();
  const story = new Story(root);
  live.set(root, story);
  return () => { story.dispose(); live.delete(root); };
}
