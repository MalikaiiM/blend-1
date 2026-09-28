import { reducedMotion } from './motion.ts';

let io: IntersectionObserver | null = null;

/** Fade-and-rise elements marked [data-reveal] as they enter the viewport. Safe to call repeatedly for new content. */
export function observeReveal(root: ParentNode = document) {
  const els = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]:not(.is-in)'));
  if (!els.length) return;
  if (reducedMotion() || !('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('is-in')); return; }
  io ??= new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { (e.target as HTMLElement).classList.add('is-in'); io!.unobserve(e.target); }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
  els.forEach((e) => io!.observe(e));
}
