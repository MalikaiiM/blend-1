// THE GRAIN (overlay) — film grain that knows where it is, glass tooth, and a handful of hairlines.
//
// The canvas is a mid-grey with a deviation painted on it; 'overlay' turns that deviation into tooth on whatever
// lies below. Overlay damps the deviation in the deep and in the bright (Δout ≈ 2·min(Y,1−Y)·Δsrc·alpha), so the
// source amplitude is lifted by exactly that factor per cell of the low-res luminance map: the grain then reads
// as one even, quiet texture from the abyss to the lamp, and it dithers the darks (no banding in the water).
//
//   luma      triangular white noise per pixel (hash2 with a seed word), blurred to the trait's grain size
//   chroma    two more copies of the same field read at decorrelating offsets → a whisper of colour tooth
//   tooth     fbm blotches + stretched fibre noise on a coarse grid, awake only where there is light
//   hairlines 0–6 seeded scratches / lint fibres, drawn after the pixels
import type { Cv, LayerCtx } from './types.ts';
import { DEG, TAU, clamp, hash2, lerp, smoothstep } from '../math.ts';
import { bilerp, blurSigma, boxBlur, paletteVivid, rowSampler, sampleStd, scratch, type BelowMap } from './texture.util.ts';

const TRI_SD = Math.sqrt(1 / 6);

/** triangular white noise, unit variance, one hash2 call per pixel (its two 16-bit halves are independent uniforms) */
function fillWhite(F: Float32Array, w: number, h: number, seedWord: number): void {
  const inv = 1 / TRI_SD;
  const sw = seedWord | 0;
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++) {
      const t = hash2(x, y, sw) * 65536;
      const a = Math.floor(t);
      F[i] = (a * (1 / 65536) + (t - a) - 1) * inv;
    }
  }
}

const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

/** the pixels: dev = F·gain + tooth on luma, with two decorrelated reads of F for the chroma whisper */
function paint(
  img: ImageData, F: Float32Array, w: number, h: number, inv: number, chroma: number,
  fillG: (y: number, out: Float32Array) => void, fillT: (y: number, out: Float32Array) => void, o1: number, o2: number,
): void {
  const N = w * h;
  const D32 = new Uint32Array(img.data.buffer);
  const D8 = img.data;
  const rowG = new Float32Array(w), rowT = new Float32Array(w);
  const K = 255;
  for (let y = 0, i = 0; y < h; y++) {
    fillG(y, rowG);
    fillT(y, rowT);
    for (let x = 0; x < w; x++, i++) {
      let j1 = i + o1; if (j1 >= N) j1 -= N;
      let j2 = i + o2; if (j2 >= N) j2 -= N;
      const gg = rowG[x]! * inv;
      const dl = F[i]! * gg + rowT[x]!;
      const c1 = F[j1]! * gg * chroma, c2 = F[j2]! * gg * chroma;
      let r = (127.5 + K * (dl + c1)) | 0, gr = (127.5 + K * (dl - 0.5 * (c1 + c2))) | 0, b = (127.5 + K * (dl + c2)) | 0;
      r = r < 0 ? 0 : r > 255 ? 255 : r;
      gr = gr < 0 ? 0 : gr > 255 ? 255 : gr;
      b = b < 0 ? 0 : b > 255 ? 255 : b;
      if (LITTLE_ENDIAN) D32[i] = 0xff000000 | (b << 16) | (gr << 8) | r;
      else { const o = i * 4; D8[o] = r; D8[o + 1] = gr; D8[o + 2] = b; D8[o + 3] = 255; }
    }
  }
}

export function renderGrain(c: LayerCtx, map: BelowMap): Cv {
  const T = c.P.layers.texture;
  const G = T.grain;
  const { w, h, S } = c;
  const N = w * h;
  const kind = G.kinds[(G.force || c.traits.body.grain) as keyof typeof G.kinds];
  const k = smoothstep(0, 1, c.tl.t);
  const amount = G.amount * lerp(G.seedBoost, 1, k) * clamp(Math.pow(S, G.scaleExp), G.scaleMin, 1);

  // ── the grain field: white → blur (→ clumps) → unit variance ──────────────────────────
  const seedWord = Math.floor(c.rng('texture/grain')() * 0x7fffffff);
  const F = scratch('grain.F', N);
  const tmp = scratch('grain.tmp', N);
  fillWhite(F, w, h, seedWord);
  blurSigma(F, w, h, Math.max(kind.minSigma, kind.sigma * S), tmp);
  if (kind.clump > 0) {
    // clumps: an independent field at half resolution (4× cheaper), blurred, then read back bilinearly
    const sdA = sampleStd(F);
    const hw = Math.ceil(w / 2), hh = Math.ceil(h / 2);
    const Bh = scratch('grain.B', hw * hh);
    fillWhite(Bh, hw, hh, seedWord ^ 0x5bd1e995);
    blurSigma(Bh, hw, hh, Math.max(kind.minClumpSigma, kind.clumpSigma * S) / 2, tmp);
    const sdB = sampleStd(Bh);
    const wa = (1 - kind.clump) / sdA, wb = kind.clump / sdB;
    const fillB = rowSampler(Bh, hw, hh, w, h);
    const row = new Float32Array(w);
    for (let y = 0, i = 0; y < h; y++) {
      fillB(y, row);
      for (let x = 0; x < w; x++, i++) F[i] = F[i]! * wa + row[x]! * wb;
    }
  }
  const inv = 1 / sampleStd(F);

  // ── low-res maps: grain gain (source σ per cell) and glass tooth ───────────────────────
  const { mw, mh, Y } = map;
  const alpha = G.compose.alpha;
  const TN = G.tone;
  const Ys = Float32Array.from(Y);
  boxBlur(Ys, mw, mh, 1, 1);
  const gain = new Float32Array(mw * mh);
  const toothAmp = new Float32Array(mw * mh);
  const tooth = G.tooth;
  const toothK = G.mottle * tooth.byGlass[c.traits.body.glass] * lerp(1.15, 1, k);
  for (let i = 0; i < mw * mh; i++) {
    const y = Ys[i]!;
    const prof = lerp(TN.floor, 1, smoothstep(TN.floorAt, TN.fullAt, y)) * (1 - TN.hiRoll * smoothstep(TN.hiFrom, TN.hiTo, y));
    const damp = alpha * 2 * Math.max(Math.min(y, 1 - y), TN.yFloor);
    gain[i] = Math.min(TN.srcMax, (kind.out * amount * prof) / damp);
    toothAmp[i] = Math.min(tooth.srcMax, (tooth.out * toothK * smoothstep(tooth.from, tooth.to, y)) / damp);
  }
  // tooth field on its own coarse grid, in design-px space (so the pattern is the same at any size)
  const tcell = Math.max(3, T.toothCell * S);
  const tw = Math.max(12, Math.round(w / tcell)), th = Math.max(12, Math.round(h / tcell));
  const nz = c.noise('texture/tooth');
  const rt = c.rng('texture/tooth-angle');
  const ang = rt.range(-40, 40) * DEG + (rt.chance(0.5) ? 0 : Math.PI / 2);
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const field = new Float32Array(tw * th);
  for (let j = 0; j < th; j++) for (let i = 0; i < tw; i++) {
    const xd = ((i + 0.5) * w) / tw / S, yd = ((j + 0.5) * h) / th / S;
    const blotch = nz.fbm(xd / tooth.blotch, yd / tooth.blotch, tooth.octaves);
    const u = (xd * ca + yd * sa) / tooth.fibre[0]!, v = (-xd * sa + yd * ca) / tooth.fibre[1]!;
    const fibre = nz.fbm(u + 31.7, v + 11.3, 2);
    field[j * tw + i] = blotch * (1 - tooth.fibreShare) + fibre * tooth.fibreShare;
  }
  const fInv = 1 / sampleStd(field, 4000);
  for (let j = 0; j < mh; j++) for (let i = 0; i < mw; i++) {
    const f = bilerp(field, tw, th, ((i + 0.5) * tw) / mw - 0.5, ((j + 0.5) * th) / mh - 0.5);
    toothAmp[j * mw + i] = toothAmp[j * mw + i]! * f * fInv;
  }

  // ── pixels ───────────────────────────────────────────────────────────────────────
  const cv = c.makeCanvas();
  const g = cv.getContext('2d')!;
  const img = g.createImageData(w, h);
  const o1 = (Math.floor(w * 0.37) + 13 * w + 5) % N, o2 = (Math.floor(w * 0.71) + 29 * w + 11) % N;
  paint(img, F, w, h, inv, kind.chroma * lerp(0.3, 1, paletteVivid(c)), rowSampler(gain, mw, mh, w, h), rowSampler(toothAmp, mw, mh, w, h), o1, o2);
  g.putImageData(img, 0, 0);
  drawHairlines(c, g);
  return cv;
}

/** 0–6 hairline scratches and lint fibres. Generated in full at any quality; draft draws the first ⌈N·q⌉. */
function drawHairlines(c: LayerCtx, g: CanvasRenderingContext2D): void {
  const SC = c.P.layers.texture.grain.scratches;
  const { w, h, S, lay } = c;
  const r = c.rng('texture/hairlines');
  const n = Math.min(SC.max, Math.floor(Math.pow(r(), SC.skew) * (SC.max + 1)));
  const items: {
    scratch: boolean; x: number; y: number; ang: number; len: number; wd: number; a: number; light: boolean; bend: number; curl: number;
  }[] = [];
  for (let i = 0; i < n; i++) {
    const isScratch = r() < SC.scratchShare;
    const P = isScratch ? SC.scratch : SC.fibre;
    const near = r() < SC.nearBloom;
    const x = near ? lay.cx + r.gauss() * lay.R * 0.55 : r() * w;
    const y = near ? lay.cy + r.gauss() * lay.R * 0.55 : r() * h;
    // scratches catch the light: bias them toward the bloom's axis; lint lies any way
    const ang = isScratch ? lay.axis + (r() < 0.65 ? r.gauss() * 0.5 : r() * Math.PI) : r() * TAU;
    const len = isScratch ? lerp(P.len[0]!, P.len[1]!, r()) * Math.hypot(w, h) : lerp(P.len[0]!, P.len[1]!, r()) * S;
    const wd = lerp(P.width[0]!, P.width[1]!, r());
    const a = lerp(P.alpha[0]!, P.alpha[1]!, r());
    const light = r() < P.lightShare;
    const bend = (isScratch ? SC.scratch.bend : 0) * (r() - 0.5) * 2;
    const curl = (isScratch ? 0 : SC.fibre.curl) * (r() - 0.5) * 2;
    items.push({ scratch: isScratch, x, y, ang, len, wd, a, light, bend, curl });
  }
  const draw = Math.ceil(n * c.q);
  g.save();
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (let i = 0; i < draw; i++) {
    const it = items[i]!;
    const px = Math.max(1, it.wd * S); // never thinner than a device pixel; thinner-than-1 is faked with alpha
    const alpha = it.a * Math.min(1, (it.wd * S) / px);
    g.lineWidth = px;
    g.strokeStyle = it.light ? `rgba(255,255,255,${alpha.toFixed(3)})` : `rgba(0,0,0,${(alpha * 1.15).toFixed(3)})`;
    const dx = Math.cos(it.ang), dy = Math.sin(it.ang);
    const x0 = it.x - (dx * it.len) / 2, y0 = it.y - (dy * it.len) / 2;
    const x1 = it.x + (dx * it.len) / 2, y1 = it.y + (dy * it.len) / 2;
    g.beginPath();
    g.moveTo(x0, y0);
    if (it.scratch) {
      g.quadraticCurveTo(it.x - dy * it.bend * it.len, it.y + dx * it.bend * it.len, x1, y1);
    } else {
      // lint: a lazy S with two control points
      const nx = -dy * it.len * it.curl, ny = dx * it.len * it.curl;
      g.bezierCurveTo(x0 + dx * it.len * 0.3 + nx, y0 + dy * it.len * 0.3 + ny, x0 + dx * it.len * 0.7 - nx, y0 + dy * it.len * 0.7 - ny, x1, y1);
    }
    g.stroke();
  }
  g.restore();
}
