// Four horizon glyphs, drawn for this site: thin strokes, one colour (currentColor), 48 × 48.
// Static, trusted markup only.

const wrap = (body: string) =>
  `<svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;

const ray = (cx: number, cy: number, deg: number, r0: number, r1: number) => {
  const a = (deg * Math.PI) / 180;
  const f = (n: number) => n.toFixed(2);
  return `<path d="M${f(cx + r0 * Math.cos(a))} ${f(cy + r0 * Math.sin(a))}L${f(cx + r1 * Math.cos(a))} ${f(cy + r1 * Math.sin(a))}"/>`;
};

/** Dawn — a sun rising out of the water. */
const dawn = wrap(
  `<path d="M5 32H43"/><path d="M14 32a10 10 0 0 1 20 0"/>` +
  [-90, -58, -122, -28, -152].map((d) => ray(24, 32, d, 14, d === -90 ? 20 : 18)).join('') +
  `<path d="M15 37H33" opacity=".55"/><path d="M20 41.5H28" opacity=".3"/>`,
);

/** Dusk — a low sun, trailing across the glass. */
const dusk = wrap(
  `<path d="M5 34H43"/><circle cx="33" cy="29" r="5"/>` +
  `<path d="M25 24H14"/><path d="M24 29H6" opacity=".7"/><path d="M25 38.5H17" opacity=".4"/>` +
  `<path d="M20 20H11" opacity=".4"/>`,
);

/** Zenith — light falling from above in shafts. */
const zenith = wrap(
  `<circle cx="24" cy="9" r="3.4"/>` +
  `<path d="M24 15V41"/><path d="M20.5 14.5L16 41" opacity=".75"/><path d="M27.5 14.5L32 41" opacity=".75"/>` +
  `<path d="M17.5 13L8 37" opacity=".45"/><path d="M30.5 13L40 37" opacity=".45"/>` +
  `<path d="M5 44H43"/>`,
);

/** Nadir — a lamp, lit from within. */
const nadir = wrap(
  `<circle cx="24" cy="24" r="14"/><circle cx="24" cy="24" r="4.2" fill="currentColor" stroke="none"/>` +
  Array.from({ length: 8 }, (_, i) => ray(24, 24, i * 45 + 22.5, 8.4, 11)).join(''),
);

export const GLYPHS: string[] = [dawn, dusk, zenith, nadir];

/** Tiny play / pause marks for the transport (10 × 10). */
export const PLAY_MARK =
  '<svg viewBox="0 0 10 10" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M2 1.2L8.6 5 2 8.8Z"/></svg>';
export const PAUSE_MARK =
  '<svg viewBox="0 0 10 10" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M3 1.5V8.5M7 1.5V8.5"/></svg>';
