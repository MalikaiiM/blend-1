const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
export const reducedMotion = () => !!mq?.matches;
export function onMotionChange(cb: (reduced: boolean) => void): () => void {
  if (!mq) return () => {};
  const h = () => cb(mq.matches);
  mq.addEventListener('change', h);
  return () => mq.removeEventListener('change', h);
}
export const isPhone = () => typeof matchMedia === 'function' && matchMedia('(max-width: 700px)').matches;
