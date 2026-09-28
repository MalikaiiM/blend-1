import { $, $$ } from './lib/dom.ts';

export function initNav() {
  const nav = $('#nav')!;
  const toggle = $('#navToggle') as HTMLButtonElement;
  const sheet = $('#navSheet')!;
  const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 24);
  onScroll();
  addEventListener('scroll', onScroll, { passive: true });

  const setOpen = (open: boolean) => {
    sheet.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.firstElementChild!.textContent = open ? 'Close' : 'Menu';
    document.body.style.overflow = open ? 'hidden' : '';
  };
  toggle.addEventListener('click', () => setOpen(sheet.hidden));
  $$('a', sheet).forEach((a) => a.addEventListener('click', () => setOpen(false)));
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sheet.hidden) setOpen(false); });

  // current section highlight
  const links = $$<HTMLAnchorElement>('.nav__links a');
  const map = new Map<string, HTMLAnchorElement>(links.map((a) => [a.getAttribute('href')!.slice(1), a]));
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => {
      for (const e of es) if (e.isIntersecting) {
        links.forEach((l) => l.classList.remove('is-current'));
        map.get(e.target.id)?.classList.add('is-current');
      }
    }, { rootMargin: '-45% 0px -50% 0px' });
    map.forEach((_, id) => { const s = document.getElementById(id); if (s) io.observe(s); });
  }
}
