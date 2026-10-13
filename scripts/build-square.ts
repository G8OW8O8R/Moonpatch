/**
 * Dusk on the square, taken apart so it can fall a light at a time.
 *
 *   pnpm square                  write public/img/square/* and components/square/lights.json
 *   pnpm square --debug=<dir>    also dump masks and previews into <dir>
 *
 * square-golden.jpg and square-dusk.jpg are the same view, aligned to under
 * half a pixel, but their fine grain differs: a plain crossfade makes the
 * picture swim halfway through. So dusk is rebuilt on golden's grain:
 *
 *   dusk-base     square-dusk's colour and light carried onto square-golden's
 *                 detail by a guided filter, with every lamp left dark.
 *   dusk-lights   square-dusk itself where something glows (alpha = how much).
 *   lights        lossless; red = which light a pixel belongs to (0 = none),
 *                 green = the soft bloom around it.
 *   props         the signpost and the notice board from public/layers,
 *                 as WebP with alpha, at their own size; board-open is the
 *                 board in the warm light it has once opened (PROP_TINT.open
 *                 in lib/square-props) with its lantern alight, so the page
 *                 never filters it.
 *   *-dusk        each prop in the light at the very end of dusk, for the
 *                 square without WebGL: the light the scene gives it then
 *                 (lib/prop-light), baked.
 *   board-writing faint pencil on the board's cards, seen from the square.
 *
 * Fading golden → dusk-base only changes colour, never grain; each light then
 * switches on by itself. The manifest lists every light with the moment it
 * comes on: bulbs in a wave running along the strings from the poles nearest
 * the gate, then windows and lanterns building by building. Sources are never
 * modified.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp, { type Sharp } from "sharp";
import { BOARD, BOARD_PARTS } from "../lib/board-parts.ts";
import { LANTERN, PROP_LIGHT, WARM, lanternFalloff, lanternGlass, warmLight } from "../lib/prop-light.ts";

const root = process.cwd();
const outDir = join(root, "public", "img", "square");
const manifestPath = join(root, "components", "square", "lights.json");
const debugArg = process.argv.find((arg) => arg.startsWith("--debug="));
const debugDir = debugArg ? join(root, debugArg.slice("--debug=".length)) : null;

const W = 2576;
const H = 1438;
const N = W * H;

type Plane = Float32Array;

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

type LightKind = "bulb" | "window" | "lamp";

interface Fixture {
  name: string;
  kind: Exclude<LightKind, "bulb">;
  rect: Rect;
  /** Where on the dusk timeline it comes on (bulbs fill 0–0.7). */
  order: number;
  /** Brightening (in luminance levels) at which a pixel counts as lit. */
  from: number;
}

/**
 * Windows, doors and lamps, in square plate pixels. Each one lights as a
 * whole, after the strings nearest to it.
 */
const fixtures: Fixture[] = [
  { name: "barn-transom", kind: "window", rect: { x0: 440, y0: 640, x1: 592, y1: 692 }, order: 0.5, from: 14 },
  { name: "barn-door", kind: "window", rect: { x0: 445, y0: 695, x1: 600, y1: 930 }, order: 0.56, from: 14 },
  { name: "cafe-porch", kind: "lamp", rect: { x0: 1318, y0: 744, x1: 1347, y1: 790 }, order: 0.6, from: 14 },
  { name: "cafe-door", kind: "window", rect: { x0: 1262, y0: 740, x1: 1318, y1: 822 }, order: 0.66, from: 14 },
  { name: "cafe-left", kind: "window", rect: { x0: 1165, y0: 750, x1: 1214, y1: 842 }, order: 0.7, from: 14 },
  { name: "cafe-right", kind: "window", rect: { x0: 1347, y0: 740, x1: 1416, y1: 842 }, order: 0.73, from: 14 },
  { name: "cafe-gable", kind: "window", rect: { x0: 1265, y0: 615, x1: 1316, y1: 692 }, order: 0.8, from: 14 },
  { name: "cafe-wing", kind: "window", rect: { x0: 1475, y0: 752, x1: 1612, y1: 842 }, order: 0.84, from: 14 },
  { name: "shop-lantern", kind: "lamp", rect: { x0: 2076, y0: 718, x1: 2126, y1: 772 }, order: 0.62, from: 14 },
  { name: "shop-door", kind: "window", rect: { x0: 2070, y0: 772, x1: 2126, y1: 842 }, order: 0.78, from: 14 },
  { name: "shop-left", kind: "window", rect: { x0: 1975, y0: 658, x1: 2052, y1: 888 }, order: 0.82, from: 14 },
  { name: "shop-right", kind: "window", rect: { x0: 2126, y0: 640, x1: 2234, y1: 906 }, order: 0.86, from: 14 },
  { name: "shop-upper", kind: "window", rect: { x0: 2060, y0: 484, x1: 2088, y1: 570 }, order: 0.9, from: 14 },
  { name: "jack-1", kind: "lamp", rect: { x0: 1945, y0: 930, x1: 1998, y1: 985 }, order: 0.92, from: 10 },
  { name: "jack-2", kind: "lamp", rect: { x0: 1998, y0: 915, x1: 2050, y1: 970 }, order: 0.94, from: 10 },
  { name: "jack-3", kind: "lamp", rect: { x0: 2093, y0: 930, x1: 2148, y1: 985 }, order: 0.96, from: 10 },
  { name: "jack-4", kind: "lamp", rect: { x0: 2122, y0: 982, x1: 2180, y1: 1040 }, order: 0.98, from: 10 },
];

/** Where the strings of bulbs hang. */
const BULB_BAND: Rect = { x0: 250, y0: 380, x1: 1800, y1: 728 };

/** Lit edges of poles and the chimney: bright at dusk, but not lamps. */
const NOT_BULBS: Rect[] = [
  { x0: 1758, y0: 425, x1: 1786, y1: 728 },
  { x0: 780, y0: 470, x1: 800, y1: 728 },
];

/** Tops of the two poles nearest the gate: the wave of bulbs starts here. */
const SEEDS = [
  { x: 790, y: 432 },
  { x: 1776, y: 434 },
];

/** Bulbs on one string are never further apart than this. */
const STRING_GAP = 90;

/** The guided filter of the light ratio: window radius and regularisation (guide in 0–255 levels, squared). */
const GUIDE_RADIUS = 10;
const GUIDE_EPS = 100;

// ---------------------------------------------------------------- helpers

const inside = (r: Rect, x: number, y: number) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1;
const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

async function loadRgb(file: string): Promise<Plane> {
  const data = await sharp(join(root, file)).removeAlpha().toColorspace("srgb").raw().toBuffer();
  return Float32Array.from(data);
}

function luma(rgb: Plane): Plane {
  const out = new Float32Array(N);
  for (let i = 0; i < N; i++) out[i] = 0.2126 * rgb[i * 3]! + 0.7152 * rgb[i * 3 + 1]! + 0.0722 * rgb[i * 3 + 2]!;
  return out;
}

/** Box sums over (2r+1)² windows, clipped at the edges, via a summed-area table. */
function boxSum(src: Plane, r: number): Float64Array {
  const S = new Float64Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) {
    let row = 0;
    for (let x = 0; x < W; x++) {
      row += src[y * W + x]!;
      S[(y + 1) * (W + 1) + x + 1] = S[y * (W + 1) + x + 1]! + row;
    }
  }
  const out = new Float64Array(N);
  for (let y = 0; y < H; y++) {
    const ya = Math.max(0, y - r);
    const yb = Math.min(H, y + r + 1);
    for (let x = 0; x < W; x++) {
      const xa = Math.max(0, x - r);
      const xb = Math.min(W, x + r + 1);
      out[y * W + x] = S[yb * (W + 1) + xb]! - S[ya * (W + 1) + xb]! - S[yb * (W + 1) + xa]! + S[ya * (W + 1) + xa]!;
    }
  }
  return out;
}

/** Separable Gaussian, edges clamped. */
function gaussian(src: Plane, sigma: number): Plane {
  const r = Math.ceil(sigma * 3);
  const k = Array.from({ length: 2 * r + 1 }, (_, i) => Math.exp(-((i - r) ** 2) / (2 * sigma * sigma)));
  const sum = k.reduce((a, b) => a + b, 0);
  const kernel = k.map((v) => v / sum);
  const tmp = new Float32Array(N);
  const out = new Float32Array(N);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let acc = 0;
      for (let i = -r; i <= r; i++) acc += kernel[i + r]! * src[y * W + Math.min(W - 1, Math.max(0, x + i))]!;
      tmp[y * W + x] = acc;
    }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let acc = 0;
      for (let i = -r; i <= r; i++) acc += kernel[i + r]! * tmp[Math.min(H - 1, Math.max(0, y + i)) * W + x]!;
      out[y * W + x] = acc;
    }
  return out;
}

/** Pixels within `r` of any set pixel (square neighbourhood, via box sums). */
function dilate(mask: Plane, r: number, threshold = 0.05): Plane {
  const bin = new Float32Array(N);
  for (let i = 0; i < N; i++) bin[i] = mask[i]! > threshold ? 1 : 0;
  const sum = boxSum(bin, r);
  const out = new Float32Array(N);
  for (let i = 0; i < N; i++) out[i] = sum[i]! > 0 ? 1 : 0;
  return out;
}

/** Box blur applied three times: close to a Gaussian of sigma ≈ r, at a box filter's cost. */
function softBlur(src: Plane, r: number): Plane {
  let cur: Plane = src;
  const area = (x: number, y: number) => (Math.min(W, x + r + 1) - Math.max(0, x - r)) * (Math.min(H, y + r + 1) - Math.max(0, y - r));
  for (let pass = 0; pass < 3; pass++) {
    const sum = boxSum(cur, r);
    const next = new Float32Array(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) next[y * W + x] = sum[y * W + x]! / area(x, y);
    cur = next;
  }
  return cur;
}

/**
 * Dusk's light carried onto golden's grain. The light is the ratio of the
 * two plates, smoothed edge-aware by a guided filter that follows golden's
 * own edges: inside a surface the ratio is flat, so golden's detail passes
 * through untouched; across a roofline it can jump. Only pixels where
 * `weight` is 1 are fitted. Where a window holds too few of them (inside a lit
 * pane) the ratio comes from a wide soft average of the surroundings, so a
 * dark pane comes out as golden's glass in the wall's evening light.
 */
function ratioTransfer(golden: Plane, dusk: Plane, guide: Plane, weight: Plane): Plane {
  const out = new Float32Array(N * 3);
  const area = (2 * GUIDE_RADIUS + 1) ** 2;
  const wSum = boxSum(weight, GUIDE_RADIUS);
  const wI = new Float32Array(N);
  const wII = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    wI[i] = weight[i]! * guide[i]!;
    wII[i] = weight[i]! * guide[i]! * guide[i]!;
  }
  const sI = boxSum(wI, GUIDE_RADIUS);
  const sII = boxSum(wII, GUIDE_RADIUS);
  const wide = softBlur(weight, 40);
  for (let c = 0; c < 3; c++) {
    const ratio = new Float32Array(N);
    for (let i = 0; i < N; i++) ratio[i] = (dusk[i * 3 + c]! + 6) / (golden[i * 3 + c]! + 6);
    const wp = new Float32Array(N);
    const wIp = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      wp[i] = weight[i]! * ratio[i]!;
      wIp[i] = weight[i]! * guide[i]! * ratio[i]!;
    }
    const sp = boxSum(wp, GUIDE_RADIUS);
    const sIp = boxSum(wIp, GUIDE_RADIUS);
    const a = new Float32Array(N);
    const b = new Float32Array(N);
    const valid = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const n = wSum[i]!;
      if (n < area * 0.3) continue;
      const mI = sI[i]! / n;
      const mp = sp[i]! / n;
      const cov = sIp[i]! / n - mI * mp;
      const v = sII[i]! / n - mI * mI;
      a[i] = cov / (v + GUIDE_EPS);
      b[i] = mp - a[i]! * mI;
      valid[i] = 1;
    }
    const va = new Float32Array(N);
    const vb = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      va[i] = valid[i]! * a[i]!;
      vb[i] = valid[i]! * b[i]!;
    }
    const n = boxSum(valid, GUIDE_RADIUS);
    const sa = boxSum(va, GUIDE_RADIUS);
    const sb = boxSum(vb, GUIDE_RADIUS);
    // The wide fallback: a plain weighted average of the ratio.
    const fallback = softBlur(wp, 40);
    for (let i = 0; i < N; i++) {
      const fit = n[i]! > 0 ? (sa[i]! / n[i]!) * guide[i]! + sb[i]! / n[i]! : 0;
      const far = wide[i]! > 1e-4 ? fallback[i]! / wide[i]! : 1;
      const t = smoothstep(0.15, 0.6, n[i]! / area);
      const r = far + (fit - far) * t;
      out[i * 3 + c] = Math.min(255, Math.max(0, (golden[i * 3 + c]! + 6) * r - 6));
    }
  }
  return out;
}

// ---------------------------------------------------------------- lights

interface Light {
  id: number;
  name: string;
  kind: LightKind;
  x: number;
  y: number;
  order: number;
}

/** Bulb centres: local peaks of the brightening along the strings. */
function findBulbs(rise: Plane, dusk: Plane): { x: number; y: number }[] {
  const smooth = gaussian(rise, 1.5);
  const peaks: { x: number; y: number; v: number }[] = [];
  const R = 4;
  for (let y = BULB_BAND.y0; y < BULB_BAND.y1; y++)
    for (let x = BULB_BAND.x0; x < BULB_BAND.x1; x++) {
      const i = y * W + x;
      const v = smooth[i]!;
      if (v < 34 || dusk[i]! < 120) continue;
      if (fixtures.some((f) => inside(f.rect, x, y)) || NOT_BULBS.some((r) => inside(r, x, y))) continue;
      let peak = true;
      for (let dy = -R; dy <= R && peak; dy++)
        for (let dx = -R; dx <= R; dx++) {
          if (!dx && !dy) continue;
          const j = (y + dy) * W + x + dx;
          if (smooth[j]! > v || (smooth[j] === v && j < i)) {
            peak = false;
            break;
          }
        }
      if (peak) peaks.push({ x, y, v });
    }
  // Strongest first; anything closer than a bulb's own halo is the same bulb.
  peaks.sort((a, b) => b.v - a.v);
  const kept: { x: number; y: number }[] = [];
  for (const p of peaks) if (kept.every((k) => Math.hypot(k.x - p.x, k.y - p.y) >= 9)) kept.push(p);
  return kept;
}

/** Hash of an integer to 0–1, for a little irregularity that stays the same between runs. */
const hash = (n: number) => {
  let h = (n * 2654435761) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519) >>> 0;
  h ^= h >>> 13;
  return (h >>> 0) / 4294967295;
};

/**
 * The wave of bulbs: shortest distance from the poles by the gate, walking
 * from bulb to bulb along the strings (hops no longer than a gap between two
 * bulbs). A bulb on a string of its own is reached across the air, slower.
 */
function bulbOrder(bulbs: { x: number; y: number }[]): number[] {
  const n = bulbs.length;
  const dist = new Array<number>(n).fill(Infinity);
  const done = new Array<boolean>(n).fill(false);
  for (const seed of SEEDS) {
    let best = -1;
    let bestD = Infinity;
    bulbs.forEach((b, i) => {
      const d = Math.hypot(b.x - seed.x, b.y - seed.y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best >= 0) dist[best] = 0;
  }
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i]! < Infinity && (u < 0 || dist[i]! < dist[u]!)) u = i;
    if (u < 0) break;
    done[u] = true;
    for (let v = 0; v < n; v++) {
      if (done[v]) continue;
      const d = Math.hypot(bulbs[u]!.x - bulbs[v]!.x, bulbs[u]!.y - bulbs[v]!.y);
      const step = d <= STRING_GAP ? d : d * 2.5;
      if (dist[u]! + step < dist[v]!) dist[v] = dist[u]! + step;
    }
  }
  const max = Math.max(...dist.filter(Number.isFinite), 1);
  // Bulbs fill the first 70 % of the timeline, give or take a breath each.
  return dist.map((d, i) => Math.min(0.7, Math.max(0, (d / max) * 0.66 + (hash(i + 1) - 0.5) * 0.04)));
}

// ---------------------------------------------------------------- output

async function writeVariants(name: string, data: Buffer, channels: 3 | 4, lossless: boolean, nearest = false) {
  for (const width of [W, 1600]) {
    const height = Math.round((H * width) / W);
    const image = sharp(data, { raw: { width: W, height: H, channels } }).resize({
      width,
      height,
      kernel: nearest ? "nearest" : "lanczos3",
    });
    const file = join(outDir, `${name}-${width}.webp`);
    const info = await (lossless
      ? image.webp({ lossless: true, effort: 6, exact: true })
      : image.webp({ quality: 82, alphaQuality: 90, effort: 6, smartSubsample: true })
    ).toFile(file);
    console.log(`${name}-${width}.webp  ${info.width}×${info.height}  ${Math.round(info.size / 1024)} KB`);
  }
}

async function debugGray(name: string, plane: Plane, scale = 255) {
  if (!debugDir) return;
  const buf = Buffer.alloc(N);
  for (let i = 0; i < N; i++) buf[i] = Math.max(0, Math.min(255, Math.round(plane[i]! * scale)));
  await sharp(buf, { raw: { width: W, height: H, channels: 1 } }).png().toFile(join(debugDir, `${name}.png`));
}

async function debugRgb(name: string, rgb: Plane) {
  if (!debugDir) return;
  const buf = Buffer.alloc(N * 3);
  for (let i = 0; i < N * 3; i++) buf[i] = Math.max(0, Math.min(255, Math.round(rgb[i]!)));
  await sharp(buf, { raw: { width: W, height: H, channels: 3 } }).png().toFile(join(debugDir, `${name}.png`));
}

/** Layers that stand on the square, by published name. */
const PROPS: Record<string, string> = {
  post: "sign-post",
  "arm-cafe": "sign-arm-cafe",
  "arm-barn": "sign-arm-barn",
  "arm-haunt": "sign-arm-haunt",
  board: "noticeboard",
};

/** Light on the opened board; the same numbers as PROP_TINT.open in lib/square-props, which the scene uses. */
const OPEN_TINT = [1.0, 0.93, 0.84];

/** Pencil on the cards: the same colour the scene multiplies in. */
const PENCIL = [128, 120, 120];

interface PropImage {
  data: Buffer;
  width: number;
  height: number;
}

async function loadProp(source: string): Promise<PropImage> {
  const { data, info } = await sharp(join(root, "public", "layers", `${source}.png`))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

interface PropLight {
  /** Light on the albedo, per channel. */
  key: number[];
  /** Lamplight from the scene's lights: strength and where it comes from. */
  warm: { strength: number; dir: { x: number; y: number } };
  /** Width of a rim towards that light, image px. */
  rim: number;
  /** The board's lantern, 0–1. */
  lantern: number;
  /** The air between the prop and the camera. */
  air: number[];
  haze: number;
}

/** A prop lit as the scene lights it (lib/prop-light, the props shader), unpremultiplied RGBA out. */
function lightProp(image: PropImage, light: PropLight): Buffer {
  const { data, width, height } = image;
  const out = Buffer.alloc(data.length);
  const alphaAt = (x: number, y: number) => {
    const cx = Math.min(width - 1, Math.max(0, Math.round(x)));
    const cy = Math.min(height - 1, Math.max(0, Math.round(y)));
    return data[(cy * width + cx) * 4 + 3]! / 255;
  };
  const warm = WARM.map((c) => c * light.warm.strength * PROP_LIGHT.warm);
  const lantern = { x: BOARD_PARTS.lantern.x, y: BOARD_PARTS.lantern.y };
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = data[i + 3]! / 255;
      out[i + 3] = data[i + 3]!;
      if (a === 0) continue;
      const u = x / width - 0.5;
      const v = y / height - 0.5;
      const ramp = Math.min(1, Math.max(0, 0.5 + (u * light.warm.dir.x + v * light.warm.dir.y) * 1.2));
      const rim = a * (1 - alphaAt(x + light.warm.dir.x * light.rim, y + light.warm.dir.y * light.rim));
      const d = Math.hypot(x - lantern.x, y - lantern.y);
      const falloff = lanternFalloff(d) * LANTERN.amount * light.lantern;
      const glass = lanternGlass(d) * LANTERN.glow * light.lantern;
      for (let c = 0; c < 3; c++) {
        const albedo = data[i + c]! / 255;
        let colour = albedo * light.key[c]!;
        colour += albedo * warm[c]! * (PROP_LIGHT.ramp * ramp + PROP_LIGHT.rim * rim);
        colour += albedo * LANTERN.flame[c]! * falloff + LANTERN.flame[c]! * glass;
        colour += (light.air[c]! - colour) * light.haze;
        out[i + c] = Math.round(Math.min(1, Math.max(0, colour)) * 255);
      }
    }
  return out;
}

const encodeProp = (image: Sharp, name: string) =>
  image.webp({ quality: 86, alphaQuality: 100, effort: 6, smartSubsample: true }).toFile(join(outDir, `${name}.webp`));

async function writeProps() {
  const encode = encodeProp;
  for (const [name, source] of Object.entries(PROPS)) {
    const info = await encode(sharp(join(root, "public", "layers", `${source}.png`)), name);
    console.log(`${name}.webp  ${info.width}×${info.height}  ${Math.round(info.size / 1024)} KB`);
  }
  // Up close the board stands in its lantern's light alone, the lantern burning steady.
  const source = await loadProp("noticeboard");
  const opened = lightProp(source, {
    key: OPEN_TINT,
    warm: { strength: 0, dir: { x: 0, y: -1 } },
    rim: 0,
    lantern: 1,
    air: [0, 0, 0],
    haze: 0,
  });
  const board = sharp(opened, { raw: { width: source.width, height: source.height, channels: 4 } });
  const info = await encode(board.clone(), "board-open");
  console.log(`board-open.webp  ${info.width}×${info.height}  ${Math.round(info.size / 1024)} KB`);
  // The page shows it first thing on the board's own address: AVIF where the browser takes it.
  const avif = await board.avif({ quality: 52, effort: 6, chromaSubsampling: "4:4:4" }).toFile(join(outDir, "board-open.avif"));
  console.log(`board-open.avif  ${avif.width}×${avif.height}  ${Math.round(avif.size / 1024)} KB`);
}

// ------------------------------------------------------------ board writing

function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type CardBox = { x: number; y: number; w: number; h: number };

/**
 * Pencil on the cards as seen from across the square: lines of handwriting,
 * headings, ticks, a road on the map, pumpkins on the sketch sheet. Never
 * words; the cards up close carry the real ones.
 */
function boardWriting(): string {
  const random = seeded(31);
  const f = (n: number) => n.toFixed(1);
  /** A line of joined-up hand from x0 to x1: humps for letters, a tall one now and then, gaps for spaces. */
  const hand = (x0: number, x1: number, y: number, xh: number, width: number) => {
    let x = x0;
    let d = `M${f(x)} ${f(y)}`;
    while (x < x1 - xh) {
      const letters = 2 + Math.floor(random() * 6);
      for (let k = 0; k < letters && x < x1; k++) {
        const w = xh * (0.42 + random() * 0.32);
        const tall = random() < 0.16 ? 1.8 : 1;
        const up = xh * (0.75 + random() * 0.4) * tall;
        d += ` c${f(w * 0.05)} ${f(-up * 1.33)} ${f(w * 0.95)} ${f(-up * 1.33)} ${f(w)} 0`;
        if (random() < 0.08) {
          // A descender.
          d += ` q${f(w * 0.2)} ${f(xh * 1.8)} ${f(w * 0.35)} 0`;
          x += w * 0.35;
        }
        x += w;
      }
      x += xh * (0.55 + random() * 0.5);
      d += ` M${f(x)} ${f(y + (random() - 0.5) * 2)}`;
    }
    return `<path d="${d}" stroke-width="${width}"/>`;
  };
  const card = (id: keyof typeof BOARD_PARTS.cards, body: (c: CardBox) => string) => {
    const c = BOARD_PARTS.cards[id];
    return `<g transform="rotate(${c.rotate} ${f(c.x + c.w / 2)} ${f(c.y + c.h / 2)})">${body(c)}</g>`;
  };
  const lines = (c: CardBox, from: number, count: number, gap: number, xh: number) =>
    Array.from({ length: count }, (_, i) => {
      const x0 = c.x + c.w * 0.12;
      const span = c.w * 0.76 * (0.55 + random() * 0.45);
      return hand(x0, x0 + span, c.y + c.h * (from + i * gap), xh, 2.4);
    }).join("");
  const title = (c: CardBox, y: number, share: number) => hand(c.x + c.w * 0.12, c.x + c.w * (0.12 + share), c.y + c.h * y, 19, 4.6);

  const parts = [
    card("hours", (c) => title(c, 0.15, 0.62) + lines(c, 0.3, 7, 0.085, 11)),
    card(
      "whatsOn",
      (c) =>
        title(c, 0.16, 0.66) +
        Array.from({ length: 4 }, (_, i) => {
          const y = c.y + c.h * (0.33 + i * 0.15);
          const x = c.x + c.w * 0.12;
          return `<path d="M${f(x)} ${f(y - 4)} l4 5 l9 -12" stroke-width="2.4"/>` + hand(x + 20, x + 20 + c.w * (0.4 + random() * 0.3), y, 11, 2.4);
        }).join(""),
    ),
    card(
      "note",
      (c) =>
        Array.from({ length: 5 }, (_, i) => {
          const span = c.w * (0.5 + random() * 0.25);
          const x0 = c.x + (c.w - span) / 2;
          return hand(x0, x0 + span, c.y + c.h * (0.28 + i * 0.1), 10, 2.2);
        }).join("") +
        `<path d="M${f(c.x + c.w * 0.3)} ${f(c.y + c.h * 0.84)} h${f(c.w * 0.4)}" stroke-width="2.2"/>` +
        hand(c.x + c.w * 0.3, c.x + c.w * 0.7, c.y + c.h * 0.8, 10, 2.6),
    ),
    card("map", (c) => {
      const p = (u: number, v: number) => `${f(c.x + c.w * u)} ${f(c.y + c.h * v)}`;
      return (
        `<path d="M${p(0.1, 0.85)} C${p(0.35, 0.75)} ${p(0.25, 0.45)} ${p(0.5, 0.42)} S${p(0.7, 0.2)} ${p(0.9, 0.15)}" stroke-width="3.2"/>` +
        `<path d="M${p(0.14, 0.9)} C${p(0.4, 0.8)} ${p(0.3, 0.5)} ${p(0.55, 0.47)} S${p(0.74, 0.25)} ${p(0.93, 0.2)}" stroke-width="2"/>` +
        `<rect x="${f(c.x + c.w * 0.6)}" y="${f(c.y + c.h * 0.5)}" width="${f(c.w * 0.12)}" height="${f(c.h * 0.08)}" stroke-width="2.4"/>` +
        `<path d="M${p(0.25, 0.25)} m-6 0 a6 6 0 1 0 12 0 a6 6 0 1 0 -12 0" stroke-width="2.4"/>` +
        hand(c.x + c.w * 0.12, c.x + c.w * 0.62, c.y + c.h * 0.1, 13, 3.4) +
        hand(c.x + c.w * 0.62, c.x + c.w * 0.88, c.y + c.h * 0.66, 9, 2) +
        hand(c.x + c.w * 0.3, c.x + c.w * 0.5, c.y + c.h * 0.3, 9, 2)
      );
    }),
    card("drawings", (c) =>
      (
        [
          [0.3, 0.38, 0.17],
          [0.68, 0.42, 0.13],
          [0.48, 0.72, 0.2],
        ] as const
      )
        .map(([u, v, r]) => {
          const cx = c.x + c.w * u;
          const cy = c.y + c.h * v;
          const rx = c.w * r;
          const ry = rx * 0.78;
          return (
            `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" stroke-width="2.6"/>` +
            `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx * 0.45)}" ry="${f(ry)}" stroke-width="2"/>` +
            `<path d="M${f(cx)} ${f(cy - ry)} q2 -14 9 -18" stroke-width="2.6"/>`
          );
        })
        .join(""),
    ),
  ];
  const [r, g, b] = PENCIL;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${BOARD.width}" height="${BOARD.height}" viewBox="0 0 ${BOARD.width} ${BOARD.height}">` +
    `<g fill="none" stroke="rgb(${r},${g},${b})" stroke-linecap="round" stroke-linejoin="round">${parts.join("")}</g></svg>`
  );
}

async function writeBoardWriting() {
  const info = await sharp(Buffer.from(boardWriting()))
    .webp({ quality: 90, alphaQuality: 90, effort: 6 })
    .toFile(join(outDir, "board-writing.webp"));
  console.log(`board-writing.webp  ${info.width}×${info.height}  ${Math.round(info.size / 1024)} KB`);
}

// --------------------------------------------------------- props at dusk

/**
 * Where each prop stands on a 1536×864 screen (lib/square-props), in plate
 * px, with how many CSS px one pixel of its image covers there. Their light
 * is read from the plate around them; other screens differ by too little to
 * matter for light this broad.
 */
const STANDING: Record<string, { source: string; box: Rect; cssPerPixel: number }> = {
  post: { source: "sign-post", box: { x0: 2011, y0: 924, x1: 2115, y1: 1332 }, cssPerPixel: 0.267 },
  "arm-cafe": { source: "sign-arm-cafe", box: { x0: 1812, y0: 969, x1: 2112, y1: 1041 }, cssPerPixel: 0.152 },
  "arm-barn": { source: "sign-arm-barn", box: { x0: 1812, y0: 1049, x1: 2112, y1: 1121 }, cssPerPixel: 0.152 },
  "arm-haunt": { source: "sign-arm-haunt", box: { x0: 2014, y0: 1129, x1: 2314, y1: 1201 }, cssPerPixel: 0.152 },
  board: { source: "noticeboard", box: { x0: 703, y0: 670, x1: 957, y1: 1090 }, cssPerPixel: 0.127 },
};

function meanRgb(plane: Plane, box: Rect): number[] {
  const sum = [0, 0, 0];
  let n = 0;
  for (let y = Math.max(0, box.y0); y < Math.min(H, box.y1); y++)
    for (let x = Math.max(0, box.x0); x < Math.min(W, box.x1); x++) {
      for (let c = 0; c < 3; c++) sum[c] = sum[c]! + plane[(y * W + x) * 3 + c]!;
      n++;
    }
  return sum.map((v) => v / n / 255);
}

/** Every prop in the light at the end of dusk: every light on, burning steady. */
async function writeDuskProps(base: Plane, lights: ReadonlyArray<Light>) {
  const burning = lights.map((l) => ({ kind: l.kind, x: l.x, y: l.y, level: 1, flicker: 1 }));
  const grow = (b: Rect, by: number): Rect => ({ x0: b.x0 - by, y0: b.y0 - by, x1: b.x1 + by, y1: b.y1 + by });
  for (const [name, prop] of Object.entries(STANDING)) {
    const key = PROP_LIGHT.golden.map((k, c) => k * PROP_LIGHT.dusk[c]!);
    const sign = name !== "board";
    // Lamplight is gathered where the scene gathers it: the signpost's or the board's middle.
    const at = sign ? { x: 2063, y: 1087 } : { x: 830, y: 838 };
    const image = await loadProp(prop.source);
    const lit = lightProp(image, {
      key,
      warm: warmLight(at, burning),
      rim: PROP_LIGHT.rimPx / prop.cssPerPixel,
      lantern: sign ? 0 : 1,
      air: meanRgb(base, grow(prop.box, 160)),
      haze: PROP_LIGHT.haze,
    });
    const info = await encodeProp(sharp(lit, { raw: { width: image.width, height: image.height, channels: 4 } }), `${name}-dusk`);
    console.log(`${name}-dusk.webp  ${info.width}×${info.height}  ${Math.round(info.size / 1024)} KB`);
  }
}

async function main() {
  await mkdir(outDir, { recursive: true });
  if (debugDir) await mkdir(debugDir, { recursive: true });
  await writeProps();

  const golden = await loadRgb("public/plates/square-golden.jpg");
  const dusk = await loadRgb("public/plates/square-dusk.jpg");
  const gl = luma(golden);
  const dl = luma(dusk);
  const rise = new Float32Array(N);
  for (let i = 0; i < N; i++) rise[i] = Math.max(0, dl[i]! - gl[i]!);

  // Lights: fixtures by their rectangles, bulbs by their peaks.
  const bulbs = findBulbs(rise, dl);
  const orders = bulbOrder(bulbs);
  const lights: Light[] = [
    ...bulbs.map((b, i) => ({ id: 0, name: `bulb-${i + 1}`, kind: "bulb" as const, x: b.x, y: b.y, order: orders[i]! })),
    ...fixtures.map((f) => ({
      id: 0,
      name: f.name,
      kind: f.kind,
      x: Math.round((f.rect.x0 + f.rect.x1) / 2),
      y: Math.round((f.rect.y0 + f.rect.y1) / 2),
      order: f.order,
    })),
  ];
  if (lights.length > 255) throw new Error(`${lights.length} lights do not fit one byte of ids`);
  lights.forEach((light, i) => (light.id = i + 1));

  // Each lit pixel belongs to one light; its strength is how much it brightens.
  const ids = new Uint8Array(N);
  const mask = new Float32Array(N);
  const BULB_REACH = 13;
  for (const light of lights) {
    if (light.kind !== "bulb") continue;
    for (let y = light.y - BULB_REACH; y <= light.y + BULB_REACH; y++)
      for (let x = light.x - BULB_REACH; x <= light.x + BULB_REACH; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const d = Math.hypot(x - light.x, y - light.y);
        if (d > BULB_REACH) continue;
        const i = y * W + x;
        // The nearest bulb wins a shared pixel.
        const owner = ids[i] ? lights[ids[i]! - 1]! : null;
        if (owner && Math.hypot(x - owner.x, y - owner.y) <= d) continue;
        const m = smoothstep(8, 36, rise[i]!) * smoothstep(BULB_REACH, BULB_REACH - 4, d);
        if (m <= 0.01) continue;
        ids[i] = light.id;
        mask[i] = m;
      }
  }
  for (const f of fixtures) {
    const light = lights.find((l) => l.name === f.name)!;
    for (let y = f.rect.y0; y < f.rect.y1; y++)
      for (let x = f.rect.x0; x < f.rect.x1; x++) {
        const i = y * W + x;
        const m = smoothstep(f.from, f.from + 30, rise[i]!);
        if (m <= mask[i]!) continue;
        ids[i] = light.id;
        mask[i] = m;
      }
  }
  // Soften the edge by a pixel, so a light never switches on with a hard rim.
  const soft = gaussian(mask, 0.8);
  for (let i = 0; i < N; i++) mask[i] = ids[i] ? Math.max(mask[i]!, soft[i]!) : 0;

  // dusk-base: golden's grain in dusk's light, fitted away from every lamp.
  const weight = new Float32Array(N);
  const near = dilate(mask, 4);
  for (let i = 0; i < N; i++) weight[i] = 1 - near[i]!;
  const base = ratioTransfer(golden, dusk, gl, weight);

  // Bloom: the brightening of the lights, spread wide and soft.
  const lit = new Float32Array(N);
  for (let i = 0; i < N; i++) lit[i] = mask[i]! * rise[i]!;
  const bloom = gaussian(lit, 7);
  // Bloom pixels belong to the nearest light, found by growing the ids outwards.
  const glowIds = new Uint8Array(ids);
  let frontier: number[] = [];
  for (let i = 0; i < N; i++) if (glowIds[i]) frontier.push(i);
  for (let step = 0; step < 24 && frontier.length; step++) {
    const next: number[] = [];
    for (const i of frontier) {
      const x = i % W;
      const y = (i / W) | 0;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (glowIds[j]) continue;
        glowIds[j] = glowIds[i]!;
        next.push(j);
      }
    }
    frontier = next;
  }

  // Encode.
  const baseBuf = Buffer.alloc(N * 3);
  const lightsBuf = Buffer.alloc(N * 4);
  const idBuf = Buffer.alloc(N * 3);
  let bloomMax = 0;
  for (let i = 0; i < N; i++) bloomMax = Math.max(bloomMax, bloom[i]!);
  for (let i = 0; i < N; i++) {
    for (let c = 0; c < 3; c++) {
      const b = Math.round(base[i * 3 + c]!);
      baseBuf[i * 3 + c] = b;
      // Outside the lights the colour is dusk-base, so filtering at a light's edge never pulls in a stray colour.
      lightsBuf[i * 4 + c] = mask[i]! > 0 ? Math.round(dusk[i * 3 + c]!) : b;
    }
    lightsBuf[i * 4 + 3] = Math.round(mask[i]! * 255);
    idBuf[i * 3] = glowIds[i]!;
    idBuf[i * 3 + 1] = Math.min(255, Math.round((Math.sqrt(bloom[i]! / bloomMax) * 255)));
  }
  await writeVariants("dusk-base", baseBuf, 3, false);
  await writeBoardWriting();
  await writeDuskProps(Float32Array.from(baseBuf), lights);
  await writeVariants("dusk-lights", lightsBuf, 4, false);
  await writeVariants("lights", idBuf, 3, true, true);

  // How far the finished dusk sits from square-dusk, away from the lights.
  let diff = 0;
  let count = 0;
  for (let i = 0; i < N; i++) {
    if (near[i]) continue;
    for (let c = 0; c < 3; c++) diff += Math.abs(base[i * 3 + c]! - dusk[i * 3 + c]!);
    count += 3;
  }
  console.log(`dusk-base vs square-dusk away from lights: ${(diff / count).toFixed(2)} levels on average`);

  await mkdir(join(root, "components", "square"), { recursive: true });
  const manifest = {
    size: { width: W, height: H },
    lights: lights.map(({ id, name, kind, x, y, order }) => ({ id, name, kind, x, y, order: +order.toFixed(3) })),
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`${bulbs.length} bulbs, ${fixtures.length} windows and lamps → ${manifestPath}`);

  if (debugDir) {
    await debugGray("mask", mask);
    await debugGray("bloom", bloom, 255 / bloomMax);
    await debugRgb("base", base);
    const preview = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const id = ids[i]!;
      const o = id ? lights[id - 1]!.order : 0;
      preview[i * 3] = id ? 255 * (1 - o) : gl[i]! * 0.3;
      preview[i * 3 + 1] = id ? 255 * o : gl[i]! * 0.3;
      preview[i * 3 + 2] = id ? 80 : gl[i]! * 0.3;
    }
    for (const b of bulbs) for (let d = -2; d <= 2; d++) {
      const i = b.y * W + b.x + d;
      preview[i * 3 + 2] = 255;
    }
    await debugRgb("order", preview);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
