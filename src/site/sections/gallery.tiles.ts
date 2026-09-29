// Tile art loader: draft first, full when visible, at most a handful of jobs in the shared render queue at once,
// chosen by how close a tile is to the middle of the screen. Stale work is cancelled as tiles scroll away.

import { STAGES } from '../../art/index.ts';
import { getThumb } from '../lib/piece.ts';
import { stateAt, type Item } from './gallery.data.ts';

/** Internal sizes: below 500 px wide getThumb renders in draft quality, from 500 it renders in full quality. */
export const DRAFT = { w: 480, h: 600 } as const;
export const FULL = { w: 500, h: 625 } as const;
const MAX_INFLIGHT = 6;

type Level = 0 | 1 | 2; // none · draft · full

interface Rec {
  item: Item;
  el: HTMLElement;
  set: (cv: HTMLCanvasElement, level: 'draft' | 'full') => void;
  wanted: boolean;
  level: Level;
  job: { cancel: () => void } | null;
  /** we cancelled the running job on purpose (scrolled away, paused) — not a failure */
  stopped: boolean;
  fails: number;
  /** do not try again before this time (ms, performance.now) after a failed render */
  retryAt: number;
}

export class TileLoader {
  private recs = new Map<Element, Rec>();
  private io: IntersectionObserver | null;
  private inflight = 0;
  private paused = false;
  private dead = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private gate: ReturnType<typeof setTimeout> | undefined;
  private lastScroll = 0;
  private onScroll = () => { this.lastScroll = performance.now(); };

  constructor(private max = MAX_INFLIGHT) {
    this.io = 'IntersectionObserver' in window
      ? new IntersectionObserver((es) => {
        for (const e of es) {
          const r = this.recs.get(e.target);
          if (!r) continue;
          r.wanted = e.isIntersecting;
          if (!r.wanted && r.job) { r.stopped = true; r.job.cancel(); }
        }
        this.pump();
      }, { rootMargin: '600px 0px' })
      : null;
    // rendering blocks the main thread in bursts, so no new job starts while the page is being scrolled
    addEventListener('scroll', this.onScroll, { passive: true });
  }

  add(item: Item, el: HTMLElement, set: Rec['set']) {
    const r: Rec = { item, el, set, wanted: !this.io, level: 0, job: null, stopped: false, fails: 0, retryAt: 0 };
    this.recs.set(el, r);
    this.io?.observe(el);
    if (!this.io) this.pump();
  }

  pause() {
    this.paused = true;
    for (const r of this.recs.values()) if (r.job) { r.stopped = true; r.job.cancel(); }
  }
  resume() { this.paused = false; this.pump(); }
  dispose() {
    this.dead = true;
    this.io?.disconnect();
    for (const r of this.recs.values()) r.job?.cancel();
    clearTimeout(this.timer);
    clearTimeout(this.gate);
    removeEventListener('scroll', this.onScroll);
    this.recs.clear();
  }

  /** The next tile to work on, or null. */
  private pick(): Rec | null {
    const vh = innerHeight;
    const now = performance.now();
    let best: Rec | null = null;
    let bestKey = Infinity;
    for (const r of this.recs.values()) {
      if (!r.wanted || r.job || r.level >= 2 || r.retryAt > now || r.el.closest('[hidden]')) continue;
      const b = r.el.getBoundingClientRect();
      const inView = b.bottom > 0 && b.top < vh;
      const dist = Math.abs(b.top + b.height / 2 - vh / 2);
      // visible tiles first (drafts before upgrades), then those in the margin; nearest to the middle first
      const key = (inView ? 0 : 1e6) + r.level * 1e5 + dist;
      if (key < bestKey) { bestKey = key; best = r; }
    }
    return best;
  }

  private pump() {
    if (this.paused || this.dead) return;
    const quiet = performance.now() - this.lastScroll;
    if (quiet < 140) {
      clearTimeout(this.gate);
      this.gate = setTimeout(() => this.pump(), 150 - quiet);
      return;
    }
    while (this.inflight < this.max) {
      const r = this.pick();
      if (!r) break;
      this.start(r);
    }
  }

  private start(r: Rec) {
    const draft = r.level === 0;
    const dim = draft ? DRAFT : FULL;
    const b = r.el.getBoundingClientRect();
    const inView = b.bottom > 0 && b.top < innerHeight;
    const pri = (draft ? 20 : 10) + (inView ? 5 : 0);
    const h = getThumb(r.item.seed, stateAt(r.item, STAGES.bloomed), dim.w, dim.h, pri);
    r.job = h;
    r.stopped = false;
    this.inflight++;
    h.promise.then((cv) => {
      this.inflight--;
      r.job = null;
      if (this.dead) return;
      if (cv) { r.set(cv, draft ? 'draft' : 'full'); r.level = draft ? 1 : 2; r.fails = 0; }
      else if (!r.stopped) {
        // a render that failed on its own: wait a little (longer each time), and give up after three tries
        r.fails++;
        if (r.fails >= 3) r.level = 2;
        else {
          r.retryAt = performance.now() + 2500 * r.fails * r.fails;
          clearTimeout(this.timer);
          this.timer = setTimeout(() => this.pump(), 2600 * r.fails * r.fails);
        }
      }
      this.pump();
    });
  }
}
