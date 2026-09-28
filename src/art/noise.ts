// Seeded gradient noise (2D/3D), fBm, and curl. Built from a permutation table
// shuffled by the layer's own Rng, so noise fields are deterministic per seed+label.

import type { Rng } from './rng.ts';

export interface Noise {
  /** ≈ −1..1 */
  n2(x: number, y: number): number;
  n3(x: number, y: number, z: number): number;
  /** fractal sum, normalised ≈ −1..1 */
  fbm(x: number, y: number, oct?: number, lac?: number, gain?: number): number;
  fbm3(x: number, y: number, z: number, oct?: number, lac?: number, gain?: number): number;
  /** ridged multifractal 0..1 — sharp creases */
  ridged(x: number, y: number, oct?: number): number;
  /** divergence-free vector field from noise (curl), unit-ish */
  curl(x: number, y: number, z?: number): [number, number];
}

const G3: [number, number, number][] = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
];

export function makeNoise(rng: Rng): Noise {
  const p = new Uint8Array(512);
  const base = new Uint8Array(256);
  for (let i = 0; i < 256; i++) base[i] = i;
  rng.shuffle(base as unknown as number[]);
  for (let i = 0; i < 512; i++) p[i] = base[i & 255]!;

  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const grad = (h: number, x: number, y: number, z: number) => {
    const g = G3[h % 12]!;
    return g[0] * x + g[1] * y + g[2] * z;
  };

  function n3(x: number, y: number, z: number): number {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    const u = fade(x), v = fade(y), w = fade(z);
    const A = p[X]! + Y, AA = p[A]! + Z, AB = p[A + 1]! + Z;
    const B = p[X + 1]! + Y, BA = p[B]! + Z, BB = p[B + 1]! + Z;
    return lerp(
      lerp(lerp(grad(p[AA]!, x, y, z), grad(p[BA]!, x - 1, y, z), u), lerp(grad(p[AB]!, x, y - 1, z), grad(p[BB]!, x - 1, y - 1, z), u), v),
      lerp(lerp(grad(p[AA + 1]!, x, y, z - 1), grad(p[BA + 1]!, x - 1, y, z - 1), u), lerp(grad(p[AB + 1]!, x, y - 1, z - 1), grad(p[BB + 1]!, x - 1, y - 1, z - 1), u), v),
      w,
    );
  }
  const n2 = (x: number, y: number) => n3(x, y, 0.5);

  function fbm(x: number, y: number, oct = 4, lac = 2, gain = 0.5): number {
    let a = 1, f = 1, s = 0, n = 0;
    for (let i = 0; i < oct; i++) { s += a * n2(x * f, y * f); n += a; a *= gain; f *= lac; }
    return s / n;
  }
  function fbm3(x: number, y: number, z: number, oct = 4, lac = 2, gain = 0.5): number {
    let a = 1, f = 1, s = 0, n = 0;
    for (let i = 0; i < oct; i++) { s += a * n3(x * f, y * f, z * f); n += a; a *= gain; f *= lac; }
    return s / n;
  }
  function ridged(x: number, y: number, oct = 4): number {
    let a = 0.5, f = 1, s = 0;
    for (let i = 0; i < oct; i++) {
      const v = 1 - Math.abs(n2(x * f, y * f));
      s += a * v * v; a *= 0.5; f *= 2;
    }
    return s;
  }
  function curl(x: number, y: number, z = 0): [number, number] {
    const e = 0.01;
    const dx = (n3(x, y + e, z) - n3(x, y - e, z)) / (2 * e);
    const dy = (n3(x + e, y, z) - n3(x - e, y, z)) / (2 * e);
    const m = Math.hypot(dx, dy) || 1;
    return [dx / m, -dy / m];
  }
  return { n2, n3, fbm, fbm3, ridged, curl };
}
