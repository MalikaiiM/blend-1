type Child = Node | string | number | null | undefined | false;
type Props = Record<string, unknown> & { class?: string; dataset?: Record<string, string>; style?: Partial<CSSStyleDeclaration> | string };

/** Tiny hyperscript: el('div', { class: 'x', onclick }, 'text', child). */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...kids: Child[]): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = String(v);
    else if (k === 'dataset') Object.assign(n.dataset, v);
    else if (k === 'style') typeof v === 'string' ? (n.style.cssText = v) : Object.assign(n.style, v);
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k in n && k !== 'list') (n as any)[k] = v;
    else n.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return n;
}
export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
export const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => Array.from(root.querySelectorAll<T>(sel));

/** Fill a range input's track up to its value (CSS custom property --fill). */
export function fillRange(input: HTMLInputElement) {
  const min = Number(input.min || 0), max = Number(input.max || 100), v = Number(input.value);
  input.style.setProperty('--fill', `${((v - min) / (max - min)) * 100}%`);
}
export const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  return (...a: A) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
/** Run `cb` once when `target` first comes within `margin` of the viewport. */
export function whenNear(target: Element, cb: () => void, margin = '600px') {
  if (!('IntersectionObserver' in window)) return cb();
  const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); cb(); } }, { rootMargin: margin });
  io.observe(target);
}
/** Call `cb(visible)` as the element enters/leaves the viewport. Returns a disposer. */
export function watchVisible(target: Element, cb: (visible: boolean) => void, margin = '0px'): () => void {
  if (!('IntersectionObserver' in window)) { cb(true); return () => {}; }
  const io = new IntersectionObserver((es) => cb(es[es.length - 1]!.isIntersecting), { rootMargin: margin });
  io.observe(target);
  return () => io.disconnect();
}
