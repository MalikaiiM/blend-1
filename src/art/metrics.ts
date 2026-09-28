// Image-quality metrics used by the audit to decide what "weak" means. Pure functions over RGBA bytes.

export interface Metrics {
  meanLum: number;
  lumStd: number;
  colorfulness: number;
  litCoverage: number;
  darkClip: number;
  whiteClip: number;
  hueBins: number;
  coreLum: number;
  bloomContrast: number;
  edgeEnergy: number;
  /** ~16×20 RGB thumbnail, 0..1, for near-duplicate detection */
  tiny: number[];
}

const lum = (r: number, g: number, b: number) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

export function measure(data: Uint8ClampedArray | Uint8Array, w: number, h: number, core: { x: number; y: number; r: number }): Metrics {
  const n = w * h;
  const L = new Float32Array(n);
  let sum = 0, sumSq = 0, lit = 0, dark = 0, white = 0;
  let mrg = 0, myb = 0, srg = 0, syb = 0;
  const bins = new Float32Array(12);
  let chromaticN = 0;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const r = data[p]!, g = data[p + 1]!, b = data[p + 2]!;
    const l = lum(r, g, b);
    L[i] = l;
    sum += l; sumSq += l * l;
    if (l > 0.45) lit++;
    if (l < 0.03) dark++;
    if (l > 0.97) white++;
    const rg = r - g, yb = 0.5 * (r + g) - b;
    mrg += rg; myb += yb; srg += rg * rg; syb += yb * yb;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const c = mx - mn;
    if (c > 40 && mx > 60) {
      let hh = 0;
      if (mx === r) hh = ((g - b) / c + 6) % 6;
      else if (mx === g) hh = (b - r) / c + 2;
      else hh = (r - g) / c + 4;
      bins[Math.min(11, Math.floor((hh / 6) * 12))]!++;
      chromaticN++;
    }
  }
  const mean = sum / n;
  const std = Math.sqrt(Math.max(0, sumSq / n - mean * mean));
  const vrg = Math.max(0, srg / n - (mrg / n) ** 2), vyb = Math.max(0, syb / n - (myb / n) ** 2);
  const colorfulness = (Math.sqrt(vrg + vyb) + 0.3 * Math.hypot(mrg / n, myb / n)) / 255;
  let hueBins = 0;
  if (chromaticN > n * 0.02) for (const b of bins) if (b / chromaticN >= 0.06) hueBins++;

  // core brightness around the bloom anchor
  let cs = 0, cn = 0;
  const x0 = Math.max(0, Math.floor(core.x - core.r)), x1 = Math.min(w - 1, Math.ceil(core.x + core.r));
  const y0 = Math.max(0, Math.floor(core.y - core.r)), y1 = Math.min(h - 1, Math.ceil(core.y + core.r));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if ((x - core.x) ** 2 + (y - core.y) ** 2 <= core.r * core.r) { cs += L[y * w + x]!; cn++; }
  const coreLum = cn ? cs / cn : mean;

  // edge energy
  let e = 0;
  for (let y = 1; y < h; y++) for (let x = 1; x < w; x++) {
    const i = y * w + x;
    e += Math.abs(L[i]! - L[i - 1]!) + Math.abs(L[i]! - L[i - w]!);
  }
  const edgeEnergy = e / (2 * n);

  // tiny thumbnail (box average)
  const tw = 16, th = 20, tiny: number[] = [];
  for (let ty = 0; ty < th; ty++) for (let tx = 0; tx < tw; tx++) {
    let r = 0, g = 0, b = 0, c = 0;
    const xa = Math.floor((tx * w) / tw), xb = Math.floor(((tx + 1) * w) / tw), ya = Math.floor((ty * h) / th), yb2 = Math.floor(((ty + 1) * h) / th);
    for (let y = ya; y < yb2; y++) for (let x = xa; x < xb; x++) { const p = (y * w + x) * 4; r += data[p]!; g += data[p + 1]!; b += data[p + 2]!; c++; }
    tiny.push(r / c / 255, g / c / 255, b / c / 255);
  }
  return {
    meanLum: mean, lumStd: std, colorfulness, litCoverage: lit / n, darkClip: dark / n, whiteClip: white / n,
    hueBins, coreLum, bloomContrast: coreLum - mean, edgeEnergy, tiny,
  };
}
