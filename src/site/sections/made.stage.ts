// The exploded stack. Every depth layer of a Piece gets its own plane in a CSS 3D scene (perspective + preserve-3d).
//
// * Real mix-blend-mode cannot live inside a preserve-3d scene (Chromium flattens the stack), so each plane is a
//   plain, normally-blended sheet of its own canvas over the dark stage: additive layers (threads, lumen, veil) are
//   light on transparent, the sheets are glass, and the three texture overlays are converted into one "grain" sheet.
// * At separation 0 the stack is replaced by the TRUE flattened composite (composite()), so collapse and expand meet.
// * Leader lines are projected by hand from the same transform the browser applies, so nothing reads layout per frame.
// * No frame loop runs unless something is easing.

import { type Piece, type LayerOut } from '../../art/index.ts';
import { fitSize, flatten, pixelBudget } from '../lib/piece.ts';
import { reducedMotion } from '../lib/motion.ts';
import { el } from '../lib/dom.ts';
import { ROW_ORDER, ROW_OF, loreOf, type RowId } from './made.data.ts';

const D2R = Math.PI / 180;
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** All the numbers that shape the composition. */
export const GEO = {
  tiltX: -34,        // degrees at full separation (negative: the first sheet sits at the top)
  tiltY: 16,         // positive yaw keeps every sheet's left edge clear of the leader lines
  gap: 0.3,        // distance between neighbouring planes, in plane heights, at separation 1
  persp: 2.2,        // perspective distance, in plane heights (≈ 1400 px on desktop)
  pointerX: 7,       // extra degrees of tilt that follow the pointer
  pointerY: 5,
  aspect: 0.8,       // 4:5
  minGap: 34,        // px between leader labels
  anchorU: -1,       // where a leader meets its plane: -1 left edge … +1 right edge
};

export interface StageHooks {
  onHover(id: RowId | null): void;
  onPick(id: RowId): void;
  /** the plane size changed enough that the render should be redone */
  onResize(): void;
  /** the collapsed piece was clicked: open it */
  onOpen(): void;
}

interface Plane { id: RowId; el: HTMLElement; tag: HTMLElement; line: SVGLineElement; dot: SVGCircleElement; on: boolean }

export class Stage {
  readonly scene = el('div', { class: 'made__scene' });
  private stack = el('div', { class: 'made__stack' });
  private flat = el('div', { class: 'made__plane made__plane--flat frame--ph' });
  private svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  private tags = el('div', { class: 'made__tags', 'aria-hidden': 'true' });
  /** the three texture overlays with their real blend modes, laid over the stack while it is nearly flat */
  private ovl = el('div', { class: 'made__ovl', 'aria-hidden': 'true' });
  private ovAlpha = new Map<HTMLCanvasElement, number>();
  private planes: Plane[] = [];
  private ro: ResizeObserver;

  // geometry
  pw = 320; ph = 400;
  private labelW = 0;
  private sceneW = 0; private sceneH = 0;
  private phone = false;
  private lastRenderPh = 0;

  // motion state
  private sep = 0;
  private sepTween: { from: number; to: number; t0: number; ms: number } | null = null;
  private px = 0; private py = 0; private tpx = 0; private tpy = 0;
  private raf = 0;
  private split = false;
  private iso: RowId | null = null;
  private destroyed = false;
  private hasPiece = false;
  // picking: a coarse alpha map per plane + the transform actually on screen
  private maps = new Map<RowId, { nx: number; ny: number; a: Uint8Array }>();
  private view: { s: number; tx: number; ty: number; d: number; zs: number[]; ids: RowId[]; cx: number; cy: number } | null = null;
  private hoverId: RowId | null = null;

  constructor(readonly host: HTMLElement, private hooks: StageHooks) {
    this.svg.setAttribute('class', 'made__leaders');
    this.svg.setAttribute('aria-hidden', 'true');
    this.stack.append(this.flat);
    for (const id of ROW_ORDER) {
      const plane = el('div', { class: 'made__plane', dataset: { layer: id }, hidden: true });
      this.stack.append(plane);
      const tag = el('div', { class: 'made__tag', dataset: { layer: id } }, loreOf(id).name);
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('r', '2');
      this.svg.append(line, dot);
      this.tags.append(tag);
      tag.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') this.hooks.onHover(id); });
      tag.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') this.hooks.onHover(null); });
      tag.addEventListener('click', () => this.hooks.onPick(id));
      this.planes.push({ id, el: plane, tag, line, dot, on: false });
    }
    this.scene.append(this.stack, this.ovl);
    host.append(this.scene, this.svg, this.tags);

    this.measure(true);
    this.ro = new ResizeObserver(() => { if (this.measure(false)) this.hooks.onResize(); });
    this.ro.observe(host);

    host.addEventListener('pointermove', this.onMove);
    host.addEventListener('pointerleave', this.onLeave);
    host.addEventListener('click', this.onClick);
    this.apply();
  }

  // ── geometry ──────────────────────────────────────────────────────
  private margins() {
    return this.phone ? { mx: 12, top: 10, bot: 46 } : { mx: 18, top: 24, bot: 76 };
  }
  /** Returns true when the plane size changed enough to warrant a fresh render. */
  private measure(first: boolean): boolean {
    const W = this.host.clientWidth, H = this.host.clientHeight;
    if (!W || !H) return false;
    this.phone = W < 600;
    this.labelW = this.phone ? 0 : clamp(Math.round(W * 0.21), 112, 176);
    this.sceneW = W;
    this.sceneH = H;
    const m = this.margins();
    const ph = Math.round(Math.min(H - m.top - m.bot, ((W - this.labelW) * 0.94) / GEO.aspect));
    this.ph = Math.max(80, ph);
    this.pw = Math.round(this.ph * GEO.aspect);
    const s = this.scene.style;
    s.left = '0px'; s.width = `${W}px`;
    this.host.style.setProperty('--pw', `${this.pw}px`);
    this.host.style.setProperty('--ph', `${this.ph}px`);
    this.host.style.setProperty('--labelw', `${this.labelW}px`);
    this.host.classList.toggle('is-compact', this.phone);
    if (!first) { this.apply(); }
    const changed = !this.lastRenderPh || Math.abs(this.ph - this.lastRenderPh) / this.lastRenderPh > 0.08;
    return changed;
  }
  /** Internal pixel size to render at (and remember that we did). */
  renderSize() {
    this.lastRenderPh = this.ph;
    const { w, h } = fitSize(this.pw, this.ph, Math.min(pixelBudget(), 950_000));
    const hh = h, ww = Math.round(hh * GEO.aspect);
    return { w: ww, h: hh };
  }

  // ── pieces ────────────────────────────────────────────────────────
  setPiece(piece: Piece, arrive = false) {
    const groups = new Map<RowId, LayerOut[]>();
    for (const L of piece.layers) {
      const id = ROW_OF[L.id];
      if (!id) continue;
      const arr = groups.get(id) ?? [];
      arr.push(L);
      groups.set(id, arr);
    }
    const inclusionOn = piece.traits.revealed && piece.tl.bloom > 0.0005 && piece.traits.bloom.inclusion !== 'none';
    for (const p of this.planes) {
      const layers = groups.get(p.id);
      const present = !!layers?.length && (p.id !== 'inclusion' || inclusionOn);
      p.on = present;
      p.el.hidden = !present;
      p.tag.hidden = !present;
      p.line.style.display = p.dot.style.display = present ? '' : 'none';
      if (!present) { p.el.replaceChildren(); continue; }
      if (p.id === 'texture') p.el.replaceChildren(texturePlane(layers!, piece.w, piece.h));
      else {
        const cvs = layers!.map((L) => {
          const c = L.canvas;
          // 'color' blends (the Full Spectrum field) can't blend in 3D: a light tint stands in for them
          c.style.opacity = String(L.blend === 'color' ? L.alpha * 0.35 : L.alpha);
          return c;
        });
        p.el.replaceChildren(...cvs);
      }
    }
    // the real overlays: blended by the browser over a nearly flat stack, so the first sliver of separation looks like the piece
    this.ovAlpha.clear();
    const ovs = (['grain', 'vignette', 'grade'] as const).map((id) => piece.layers.find((l) => l.id === id)).filter((l): l is LayerOut => !!l);
    this.ovl.replaceChildren(...ovs.map((L) => {
      L.canvas.classList.add('made__ov');
      L.canvas.style.mixBlendMode = L.blend;
      this.ovAlpha.set(L.canvas, L.alpha);
      return L.canvas;
    }));
    this.flat.replaceChildren(flatten(piece));
    this.flat.classList.remove('frame--ph');
    this.hasPiece = true;
    this.buildMaps();
    // the fade goes on the scene, never on the preserve-3d stack: opacity below 1 would flatten the planes
    if (arrive) { this.scene.classList.remove('is-arrive'); void this.scene.offsetWidth; this.scene.classList.add('is-arrive'); }
    this.apply();
  }

  /** A coarse alpha map for each plane, so a pointer can pick the layer whose light or glass is actually under it. */
  private buildMaps() {
    this.maps.clear();
    const NX = 160, NY = 200;
    const cv = document.createElement('canvas');
    cv.width = NX; cv.height = NY;
    const g = cv.getContext('2d', { willReadFrequently: true })!;
    g.imageSmoothingQuality = 'high';
    for (const p of this.planes) {
      if (!p.on || p.id === 'texture') continue;
      g.clearRect(0, 0, NX, NY);
      for (const c of Array.from(p.el.children)) if (c instanceof HTMLCanvasElement) g.drawImage(c, 0, 0, NX, NY);
      const d = g.getImageData(0, 0, NX, NY).data;
      const a = new Uint8Array(NX * NY);
      for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3]!;
      this.maps.set(p.id, { nx: NX, ny: NY, a });
    }
  }

  /** Which plane is under this viewport point? Exact ray–plane intersection against the transform on screen. */
  pickAt(clientX: number, clientY: number): RowId | null {
    const v = this.view;
    if (!v || this.sep < 0.04) return null;
    const r = this.host.getBoundingClientRect();
    const X = clientX - r.left - v.cx, Y = clientY - r.top - v.cy;
    const cyv = Math.cos(v.ty), syv = Math.sin(v.ty), cxv = Math.cos(v.tx), sxv = Math.sin(v.tx);
    // world = Rx · Ry · (s · local)
    const T = (x: number, y: number, z: number): [number, number, number] => {
      x *= v.s; y *= v.s; z *= v.s;
      const x1 = x * cyv + z * syv, z1 = -x * syv + z * cyv;
      return [x1, y * cxv - z1 * sxv, y * sxv + z1 * cxv];
    };
    const cross = (a: number[], b: number[]) => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
    const dot = (a: number[], b: number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
    const triple = (a: number[], b: number[], c: number[]) => dot(a, cross(b, c));
    const u = T(1, 0, 0), w = T(0, 1, 0), q = [-X, -Y, v.d];
    const hits: { id: RowId; t: number }[] = [];
    v.ids.forEach((id, i) => {
      const map = this.maps.get(id);
      if (!map) return;
      const c = T(0, 0, v.zs[i]!);
      const rhs = [-c[0], -c[1], v.d - c[2]];
      const det = triple(u, w, q);
      if (Math.abs(det) < 1e-9) return;
      const a = triple(rhs, w, q) / det, b = triple(u, rhs, q) / det, t = triple(u, w, rhs) / det;
      if (t <= 0 || Math.abs(a) > this.pw / 2 || Math.abs(b) > this.ph / 2) return;
      const ix = Math.min(map.nx - 1, Math.floor((a / this.pw + 0.5) * map.nx));
      const iy = Math.min(map.ny - 1, Math.floor((b / this.ph + 0.5) * map.ny));
      if (map.a[iy * map.nx + ix]! >= 40) hits.push({ id, t });
    });
    hits.sort((m, n) => m.t - n.t);
    return hits[0]?.id ?? null;
  }
  get present(): RowId[] { return this.planes.filter((p) => p.on).map((p) => p.id); }

  // ── state ─────────────────────────────────────────────────────────
  get separation() { return this.sep; }
  setSeparation(v: number, animate = false) {
    v = clamp(v);
    if (animate && !reducedMotion()) {
      this.sepTween = { from: this.sep, to: v, t0: performance.now(), ms: 2300 };
      this.kick();
      return;
    }
    this.sepTween = null;
    this.sep = v;
    this.apply();
  }
  setIso(id: RowId | null) {
    this.iso = id;
    for (const p of this.planes) {
      p.el.classList.toggle('is-dim', !!id && id !== p.id);
      p.tag.classList.toggle('is-dim', !!id && id !== p.id);
      p.tag.classList.toggle('is-on', id === p.id);
      p.line.classList.toggle('is-dim', !!id && id !== p.id);
      p.dot.classList.toggle('is-dim', !!id && id !== p.id);
    }
    this.apply();
  }

  // ── pointer tilt ──────────────────────────────────────────────────
  private pickT = 0;
  private onMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    if (!reducedMotion()) {
      const r = this.host.getBoundingClientRect();
      this.tpx = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1);
      this.tpy = clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1);
      this.kick();
    }
    if ((e.target as Element).closest?.('.made__tag')) return;
    if (this.sep < 0.04) { this.host.classList.toggle('is-pick', this.hasPiece); return; }
    const cx = e.clientX, cy = e.clientY;
    clearTimeout(this.pickT);
    this.pickT = window.setTimeout(() => {
      const id = this.pickAt(cx, cy);
      this.host.classList.toggle('is-pick', !!id);
      if (id !== this.hoverId) { this.hoverId = id; this.hooks.onHover(id); }
    }, 45);
  };
  private onLeave = () => {
    this.tpx = 0; this.tpy = 0; this.kick();
    clearTimeout(this.pickT);
    this.host.classList.remove('is-pick');
    if (this.hoverId) { this.hoverId = null; this.hooks.onHover(null); }
  };
  private onClick = (e: MouseEvent) => {
    if ((e.target as Element).closest?.('.made__tag')) return;
    if (this.sep < 0.04) { this.hooks.onOpen(); return; }
    const id = this.pickAt(e.clientX, e.clientY);
    if (id) this.hooks.onPick(id);
  };

  private kick() { if (!this.raf && !this.destroyed) this.raf = requestAnimationFrame(this.tick); }
  private tick = (now: number) => {
    this.raf = 0;
    let more = false;
    if (this.sepTween) {
      const tw = this.sepTween;
      const t = clamp((now - tw.t0) / tw.ms);
      this.sep = lerp(tw.from, tw.to, easeInOut(t));
      if (t >= 1) this.sepTween = null; else more = true;
    }
    if (reducedMotion()) { this.px = this.py = 0; }
    else {
      this.px += (this.tpx - this.px) * 0.09; this.py += (this.tpy - this.py) * 0.09;
      if (Math.abs(this.tpx - this.px) > 0.003 || Math.abs(this.tpy - this.py) > 0.003) more = true;
      else { this.px = this.tpx; this.py = this.tpy; }
    }
    this.apply();
    this.onSep?.(this.sep);
    if (more) this.raf = requestAnimationFrame(this.tick);
  };
  /** called on every animated separation change so the slider can follow */
  onSep: ((v: number) => void) | null = null;

  // ── the transform ─────────────────────────────────────────────────
  private project(x: number, y: number, z: number, s: number, tx: number, ty: number, d: number) {
    x *= s; y *= s; z *= s;
    const cy = Math.cos(ty), sy = Math.sin(ty);
    const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
    const cx = Math.cos(tx), sx = Math.sin(tx);
    const y2 = y * cx - z1 * sx, z2 = y * sx + z1 * cx;
    const k = d / (d - z2);
    return { x: x1 * k, y: y2 * k };
  }

  /** Bounding box of every plane's four corners, relative to the scene centre. */
  private bounds(zs: number[], s: number, tx: number, ty: number, d: number) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const z of zs) {
      for (const cx of [-1, 1]) for (const cy of [-1, 1]) {
        const p = this.project((cx * this.pw) / 2, (cy * this.ph) / 2, z, s, tx, ty, d);
        if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
      }
    }
    return { x0, x1, y0, y1 };
  }

  apply() {
    if (this.destroyed) return;
    const sep = this.sep;
    const k = smooth(0, 0.32, sep);             // tilt comes in with the separation: collapsed is exactly flat
    const tx0 = GEO.tiltX * k * D2R, ty0 = GEO.tiltY * k * D2R;
    const tx = (GEO.tiltX + this.py * GEO.pointerY) * k * D2R;
    const ty = (GEO.tiltY + this.px * GEO.pointerX) * k * D2R;
    const d = GEO.persp * this.ph;

    const act = this.planes.filter((p) => p.on);
    const n = act.length;
    const gap = this.ph * GEO.gap * sep + 0.6;
    const zs = act.map((_, i) => (i - (n - 1) / 2) * gap);

    // fit: shrink and centre the whole stack inside the free part of the stage (right of the labels, above the caption)
    const W = this.sceneW, H = this.sceneH;
    const { mx, top, bot } = this.margins();
    const aL = this.labelW + mx, aR = W - mx, aT = top, aB = H - bot;
    let sFit = 1;
    for (let it = 0; it < 2; it++) {
      const bb = this.bounds(zs, sFit, tx0, ty0, d);
      const f = Math.min((aR - aL) / (bb.x1 - bb.x0), (aB - aT) / (bb.y1 - bb.y0));
      sFit = clamp(sFit * f, 0.22, 1);
    }
    const bb = this.bounds(zs, sFit, tx0, ty0, d);
    const fitK = smooth(0, 0.1, sep);
    const s = lerp(1, sFit, fitK);
    const bbS = this.bounds(zs, s, tx0, ty0, d);
    // together: centred across the stage and clear of the caption; apart: centred in the space right of the labels
    const shiftX = lerp(0, (aL + aR) / 2 - (W / 2 + (bbS.x0 + bbS.x1) / 2), fitK);
    const shiftY = lerp((aT + aB) / 2 - H / 2, (aT + aB) / 2 - (H / 2 + (bbS.y0 + bbS.y1) / 2), fitK);
    void bb;

    this.scene.style.perspective = `${d.toFixed(0)}px`;
    this.scene.style.transform = `translate3d(${shiftX.toFixed(2)}px,${shiftY.toFixed(2)}px,0)`;
    this.stack.style.transform = `scale3d(${s.toFixed(4)},${s.toFixed(4)},${s.toFixed(4)}) rotateX(${(tx / D2R).toFixed(3)}deg) rotateY(${(ty / D2R).toFixed(3)}deg)`;
    act.forEach((p, i) => { p.el.style.transform = `translate3d(0,0,${zs[i]!.toFixed(2)}px)`; });
    // the grain sheet only stands in for the overlays: it takes over from them as the stack opens
    this.planes.find((p) => p.id === 'texture')?.el.style.setProperty('--fade', smooth(0.06, 0.4, sep).toFixed(3));
    const ovK = 1 - smooth(0.02, 0.22, sep);
    this.ovl.style.setProperty('--s', s.toFixed(4));
    this.ovAlpha.forEach((a, cv) => { cv.style.opacity = (a * ovK).toFixed(3); });
    this.ovl.hidden = ovK <= 0.001;

    this.view = { s, tx, ty, d, zs, ids: act.map((p) => p.id), cx: W / 2 + shiftX, cy: H / 2 + shiftY };
    const split = sep > 0.0015 || !!this.iso;
    if (split !== this.split) { this.split = split; this.stack.classList.toggle('is-split', split); }

    // leader labels
    const vis = this.phone ? 0 : smooth(0.1, 0.42, sep);
    this.host.style.setProperty('--tagvis', vis.toFixed(3));
    this.host.style.setProperty('--edge', smooth(0.04, 0.3, sep).toFixed(3));
    this.tags.classList.toggle('is-live', vis > 0.5);
    if (this.phone || !n) return;
    const cx0 = W / 2 + shiftX, cy0 = H / 2 + shiftY;
    const items = act.map((p, i) => {
      const a = this.project((GEO.anchorU * this.pw) / 2, 0, zs[i]!, s, tx, ty, d);
      return { p, ax: cx0 + a.x, ay: cy0 + a.y, ly: cy0 + a.y };
    });
    items.sort((a, b) => a.ay - b.ay);
    // relax so labels never touch: push down, then pull the whole column back toward the anchors
    for (let i = 1; i < items.length; i++) items[i]!.ly = Math.max(items[i]!.ly, items[i - 1]!.ly + GEO.minGap);
    const drift = items.reduce((m, it) => m + (it.ay - it.ly), 0) / items.length;
    items.forEach((it) => { it.ly += drift; });
    if (items[0]!.ly < 20) { const dlt = 20 - items[0]!.ly; items.forEach((it) => { it.ly += dlt; }); }
    const over = items[items.length - 1]!.ly - (H - 60);
    if (over > 0) items.forEach((it) => { it.ly -= over; });
    const colX = this.labelW - 14;
    for (const it of items) {
      it.p.tag.style.transform = `translate3d(0,${(it.ly - 9).toFixed(1)}px,0)`;
      it.p.line.setAttribute('x1', String(colX + 6)); it.p.line.setAttribute('y1', it.ly.toFixed(1));
      it.p.line.setAttribute('x2', it.ax.toFixed(1)); it.p.line.setAttribute('y2', it.ay.toFixed(1));
      it.p.dot.setAttribute('cx', it.ax.toFixed(1)); it.p.dot.setAttribute('cy', it.ay.toFixed(1));
    }
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.host.removeEventListener('pointermove', this.onMove);
    this.host.removeEventListener('pointerleave', this.onLeave);
    this.host.removeEventListener('click', this.onClick);
  }
}

/**
 * The three texture overlays (grain: overlay, vignette: multiply, grade: soft-light) only mean something when
 * blended with what is below them. As a sheet on its own we draw what they DO to a dark stage: the vignette as
 * shade, the grain as pale and dark tooth.
 */
function texturePlane(layers: LayerOut[], w: number, h: number): HTMLCanvasElement {
  const k = 0.6;
  const tw = Math.max(2, Math.round(w * k)), th = Math.max(2, Math.round(h * k));
  const out = document.createElement('canvas');
  out.width = tw; out.height = th;
  const vig = layers.find((l) => l.id === 'vignette');
  const grain = layers.find((l) => l.id === 'grain');
  const tmp = document.createElement('canvas');
  tmp.width = tw; tmp.height = th;
  const tg = tmp.getContext('2d', { willReadFrequently: true })!;
  const read = (L?: LayerOut) => {
    if (!L) return null;
    tg.clearRect(0, 0, tw, th);
    tg.drawImage(L.canvas, 0, 0, tw, th);
    return tg.getImageData(0, 0, tw, th).data;
  };
  const v = read(vig), g = read(grain);
  const g2 = out.getContext('2d')!;
  const img = g2.createImageData(tw, th);
  const o = img.data;
  for (let i = 0; i < o.length; i += 4) {
    // shade: a vignette's brightness is how much it lets through
    const lum = v ? (v[i]! * 0.3 + v[i + 1]! * 0.59 + v[i + 2]! * 0.11) / 255 : 1;
    const shade = clamp((1 - lum) * 0.8);
    // tooth: grain sits around mid grey; pale grains lift, dark grains cut
    const gv = g ? (g[i]! + g[i + 1]! + g[i + 2]!) / 765 : 0.5;
    const dg = (gv - 0.5) * 2;
    // only the pale grains are drawn: the dark ones would grey out the lamp, which the real overlay leaves alone
    const aS = dg > 0 ? clamp(dg * 0.7, 0, 0.07) : 0;
    // speck over shade (shade is black)
    const A = aS + shade * (1 - aS);
    o[i + 3] = Math.round(A * 255);
    const c = A > 0 ? (235 * aS) / A : 0;
    o[i] = o[i + 1] = o[i + 2] = Math.round(c);
  }
  g2.putImageData(img, 0, 0);
  return out;
}
