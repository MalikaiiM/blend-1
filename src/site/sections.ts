// Lazy section loader. Each section module default-exports mount(root) and owns its own CSS.
import { whenNear } from './lib/dom.ts';
import { observeReveal } from './lib/reveal.ts';

type Mount = (root: HTMLElement) => void | (() => void) | Promise<void | (() => void)>;
const loaders: Record<string, () => Promise<{ default: Mount }>> = {
  hero: () => import('./sections/hero.ts'),
  story: () => import('./sections/story.ts'),
  made: () => import('./sections/made.ts'),
  mechanic: () => import('./sections/mechanic.ts'),
  gallery: () => import('./sections/gallery.ts'),
  timeline: () => import('./sections/timeline.ts'),
  mint: () => import('./sections/mint.ts'),
  footer: () => import('./sections/footer.ts'),
};

export function mountSections() {
  document.querySelectorAll<HTMLElement>('[data-section]').forEach((root) => {
    const name = root.dataset.section!;
    const load = loaders[name];
    if (!load) return;
    const go = async () => {
      try {
        const mod = await load();
        await mod.default(root);
        observeReveal(root);
      } catch (e) {
        console.error(`[halocline] section "${name}" failed`, e);
      }
    };
    if (name === 'hero') go();
    else whenNear(root, go, name === 'footer' ? '200px' : '900px');
  });
}
