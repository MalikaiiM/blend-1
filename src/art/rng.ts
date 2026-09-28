// Deterministic randomness. Everything about a piece derives from one 64-hex seed.
// The seed's 256 bits become eight 32-bit words; every layer asks for its own
// *named* stream so editing one layer never shifts the dice of another.

import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';

export const HEX64 = /^[0-9a-f]{64}$/;

/** Accepts "0x…" / uppercase; returns canonical lowercase 64-hex or null. */
export function normalizeSeed(input: string): string | null {
  const s = input.trim().toLowerCase().replace(/^0x/, '');
  return HEX64.test(s) ? s : null;
}
export const isSeed = (s: string) => HEX64.test(s);

/** Big-endian byte helpers that mirror Solidity's abi.encodePacked for uint8 / uint256. */
export const u8 = (n: number): Uint8Array => Uint8Array.of(n & 255);
export const u256 = (n: number | bigint): Uint8Array => {
  let v = BigInt(n);
  const out = new Uint8Array(32);
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
};

/**
 * keccak-256 (the hash Solidity uses) of the packed concatenation of the parts.
 * 64-hex strings are raw bytes32; other strings are utf8; Uint8Arrays as given.
 */
export function keccakHex(...parts: (string | Uint8Array)[]): string {
  const chunks: Uint8Array[] = parts.map((p) =>
    typeof p === 'string' ? (HEX64.test(p) ? hexToBytes(p) : utf8ToBytes(p)) : p,
  );
  const len = chunks.reduce((n, c) => n + c.length, 0);
  const buf = new Uint8Array(len);
  let o = 0;
  for (const c of chunks) {
    buf.set(c, o);
    o += c.length;
  }
  return bytesToHex(keccak_256(buf));
}

export function seedFromText(text: string): string {
  return bytesToHex(keccak_256(utf8ToBytes(text)));
}

/** A fresh random seed (browser: crypto; node ≥19 also has global crypto). */
export function randomSeed(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return bytesToHex(b);
}

export function seedWords(seed: string): Uint32Array {
  const w = new Uint32Array(8);
  for (let i = 0; i < 8; i++) w[i] = parseInt(seed.slice(i * 8, i * 8 + 8), 16) >>> 0;
  return w;
}

/** FNV-1a + murmur finaliser: string → uint32. */
export function hashString32(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return fmix32(h);
}
export function fmix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export interface Rng {
  (): number; // [0,1)
  range(a: number, b: number): number;
  int(a: number, b: number): number; // inclusive
  chance(p: number): boolean;
  pick<T>(arr: readonly T[]): T;
  weighted<T>(items: readonly { v: T; w: number }[]): T;
  gauss(): number; // ~N(0,1)
  sign(): 1 | -1;
  shuffle<T>(arr: T[]): T[];
  fork(label: string): Rng;
}

function sfc32(a: number, b: number, c: number, d: number): () => number {
  return () => {
    a |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

/** Build an Rng from raw words plus a label. Same words + label → same stream, always. */
export function makeRng(words: ArrayLike<number>, label = ''): Rng {
  const h = hashString32(label);
  const s = [0, 1, 2, 3].map((i) => fmix32(((words[i] ?? 0) ^ Math.imul(words[i + 4] ?? 0, 0x9e3779b1) ^ fmix32(h + i * 0x7f4a7c15)) >>> 0));
  const next = sfc32(s[0]!, s[1]!, s[2]!, s[3]!);
  for (let i = 0; i < 14; i++) next(); // warm up
  const r = next as Rng;
  r.range = (a, b) => a + (b - a) * next();
  r.int = (a, b) => a + Math.floor(next() * (b - a + 1));
  r.chance = (p) => next() < p;
  r.pick = (arr) => arr[Math.floor(next() * arr.length)]!;
  r.sign = () => (next() < 0.5 ? -1 : 1);
  r.gauss = () => {
    let u = 0;
    for (let i = 0; i < 6; i++) u += next();
    return (u - 3) / 0.7071067811865476; // Irwin–Hall(6) normalised to unit variance
  };
  r.weighted = (items) => {
    let total = 0;
    for (const it of items) total += it.w;
    let x = next() * total;
    for (const it of items) {
      x -= it.w;
      if (x < 0) return it.v;
    }
    return items[items.length - 1]!.v;
  };
  r.shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [arr[i], arr[j]] = [arr[j]!, arr[i]!];
    }
    return arr;
  };
  r.fork = (l) => makeRng(words, label + '/' + l);
  return r;
}

export interface SeedCtx {
  hex: string;
  words: Uint32Array;
  /** Independent named stream. `stream('threads')` is unaffected by any other stream. */
  stream(label: string): Rng;
}

export function seedCtx(hex: string): SeedCtx {
  const words = seedWords(hex);
  return { hex, words, stream: (label) => makeRng(words, label) };
}

/** Stream from an arbitrary 64-hex (e.g. a bloom seed) rather than the base seed. */
export function streamOf(hex: string, label: string): Rng {
  return makeRng(seedWords(hex), label);
}
