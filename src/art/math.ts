// Small numeric helpers shared by every layer. Pure, allocation-free where it matters.

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number) => (a === b ? 0 : (v - a) / (b - a));
export const remap = (v: number, a: number, b: number, c: number, d: number) => lerp(c, d, invLerp(a, b, v));
export const mod = (n: number, m: number) => ((n % m) + m) % m;
export const fract = (v: number) => v - Math.floor(v);

/** Hermite smoothstep between edges a and b. */
export const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp(invLerp(a, b, v));
  return t * t * (3 - 2 * t);
};
/** Perlin's smootherstep — zero first and second derivative at the edges. */
export const smootherstep = (a: number, b: number, v: number) => {
  const t = clamp(invLerp(a, b, v));
  return t * t * t * (t * (t * 6 - 15) + 10);
};

export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeOutQuint = (t: number) => 1 - Math.pow(1 - t, 5);
export const easeInCubic = (t: number) => t * t * t;
export const easeOutBack = (t: number, s = 1.4) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);

/** Soft bump: 0 outside [a,d], rises a→b, holds to c, falls c→d. */
export const trapezoid = (a: number, b: number, c: number, d: number, v: number) =>
  smoothstep(a, b, v) * (1 - smoothstep(c, d, v));

/** Angle helpers */
export const angDiff = (a: number, b: number) => {
  let d = mod(a - b + Math.PI, TAU) - Math.PI;
  return d;
};
export const lerpAngle = (a: number, b: number, t: number) => a + angDiff(b, a) * t;

/** Deterministic 2D hash → [0,1). Cheap, stateless; used for grain and sparkle phase. */
export function hash2(x: number, y: number, s = 0): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}
