/**
 * Layers of the gate scene, cut from the gate plates.
 *
 *   pnpm layers                  write public/img/gate/* and components/gate/layers.json
 *   pnpm layers --debug=<dir>    also dump mattes and overlays into <dir>
 *   pnpm layers --manifest-only  rewrite the manifest, keep the encoded textures
 *
 * square-golden.jpg is the reference plate: it is the same view without the
 * gate. The leaves get a matte built from fitted geometry (pickets, rails,
 * brace and iron), so their edges are clean lines instead of a noisy key; the
 * arch, corn and pumpkins reuse the hand-cut alpha of public/layers, cleaned
 * of loose specks. Colours come from gate.jpg for landscape screens and from
 * gate-tall.jpg for portrait ones, so at rest every layer lands on the exact
 * pixels of the poster it replaces. Sources are never modified.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const root = process.cwd();
const outDir = join(root, "public", "img", "gate");
const manifestPath = join(root, "components", "gate", "layers.json");
const debugArg = process.argv.find((arg) => arg.startsWith("--debug="));
const debugDir = debugArg ? join(root, debugArg.slice("--debug=".length)) : null;
/** Rewrite the manifest only, keeping the encoded textures. */
const manifestOnly = process.argv.includes("--manifest-only");

const W = 2576;
const H = 1438;
const TALL = { width: 2552, height: 4577, dx: -10, dy: 1671 };

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Plane = Float32Array;

// ---------------------------------------------------------------- image io

async function loadRgb(file: string): Promise<Plane> {
  const data = await sharp(join(root, file)).removeAlpha().toColorspace("srgb").raw().toBuffer();
  return Float32Array.from(data);
}

async function loadAlpha(file: string): Promise<Plane> {
  const data = await sharp(join(root, file)).ensureAlpha().extractChannel(3).raw().toBuffer();
  const out = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) out[i] = data[i]! / 255;
  return out;
}

/** gate-tall.jpg re-indexed to gate.jpg coordinates (edge columns repeated where it is narrower). */
async function loadTallAsGate(): Promise<Plane> {
  const tall = await loadRgb("public/plates/gate-tall.jpg");
  const out = new Float32Array(W * H * 3);
  for (let y = 0; y < H; y++) {
    const ty = y + TALL.dy;
    for (let x = 0; x < W; x++) {
      const tx = Math.min(TALL.width - 1, Math.max(0, x + TALL.dx));
      const s = (ty * TALL.width + tx) * 3;
      const d = (y * W + x) * 3;
      out[d] = tall[s]!;
      out[d + 1] = tall[s + 1]!;
      out[d + 2] = tall[s + 2]!;
    }
  }
  return out;
}

async function debugGray(name: string, plane: Plane, rect: Rect, scale = 255) {
  if (!debugDir) return;
  const buf = Buffer.alloc(rect.w * rect.h);
  for (let y = 0; y < rect.h; y++)
    for (let x = 0; x < rect.w; x++) {
      buf[y * rect.w + x] = Math.max(0, Math.min(255, Math.round(plane[(y + rect.y) * W + x + rect.x]! * scale)));
    }
  await sharp(buf, { raw: { width: rect.w, height: rect.h, channels: 1 } }).png().toFile(join(debugDir, `${name}.png`));
}

/** The layer over a flat magenta, to spot holes and fringes at a glance. */
async function debugOver(name: string, rgb: Plane, alpha: Plane, rect: Rect, under = [255, 0, 255]) {
  if (!debugDir) return;
  const buf = Buffer.alloc(rect.w * rect.h * 3);
  for (let y = 0; y < rect.h; y++)
    for (let x = 0; x < rect.w; x++) {
      const i = (y + rect.y) * W + x + rect.x;
      const a = alpha[i]!;
      for (let c = 0; c < 3; c++) buf[(y * rect.w + x) * 3 + c] = Math.round(rgb[i * 3 + c]! * a + under[c]! * (1 - a));
    }
  await sharp(buf, { raw: { width: rect.w, height: rect.h, channels: 3 } }).png().toFile(join(debugDir, `${name}.png`));
}

// ---------------------------------------------------------------- filters

function boxBlur1d(src: Plane, radius: number, horizontal: boolean): Plane {
  const out = new Float32Array(src.length);
  const n = horizontal ? W : H;
  const lines = horizontal ? H : W;
  for (let line = 0; line < lines; line++) {
    let acc = 0;
    let count = 0;
    const at = (k: number) => (horizontal ? line * W + k : k * W + line);
    for (let k = 0; k < Math.min(n, radius); k++) {
      acc += src[at(k)]!;
      count++;
    }
    for (let k = 0; k < n; k++) {
      const add = k + radius;
      const drop = k - radius - 1;
      if (add < n) {
        acc += src[at(add)]!;
        count++;
      }
      if (drop >= 0) {
        acc -= src[at(drop)]!;
        count--;
      }
      out[at(k)] = acc / count;
    }
  }
  return out;
}

/** Edge strength across x and across y, from luminance and chroma together. */
function colourGradients(rgb: Plane) {
  const channels = [new Float32Array(W * H), new Float32Array(W * H), new Float32Array(W * H)];
  for (let i = 0; i < W * H; i++) {
    const r = rgb[i * 3]!;
    const g = rgb[i * 3 + 1]!;
    const b = rgb[i * 3 + 2]!;
    channels[0]![i] = 0.299 * r + 0.587 * g + 0.114 * b;
    channels[1]![i] = 0.9 * (r - g);
    channels[2]![i] = 0.9 * ((r + g) / 2 - b);
  }
  const gx = new Float32Array(W * H);
  const gy = new Float32Array(W * H);
  for (const channel of channels) {
    const alongY = boxBlur1d(channel, 2, false);
    const alongX = boxBlur1d(channel, 2, true);
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        const dx = (alongY[i + 1]! - alongY[i - 1]!) / 2;
        const dy = (alongX[i + W]! - alongX[i - W]!) / 2;
        gx[i]! += dx * dx;
        gy[i]! += dy * dy;
      }
  }
  for (let i = 0; i < W * H; i++) {
    gx[i] = Math.sqrt(gx[i]!);
    gy[i] = Math.sqrt(gy[i]!);
  }
  return { gx, gy, luma: channels[0]! };
}

// ---------------------------------------------------------------- fitting

/** Weighted least squares polynomial in t, returned as a function. */
function polyfit(ts: number[], vs: number[], ws: number[], degree: number): (t: number) => number {
  const n = degree + 1;
  const t0 = ts.reduce((a, b) => a + b, 0) / Math.max(1, ts.length);
  const span = Math.max(1, ...ts.map((t) => Math.abs(t - t0)));
  const A = Array.from({ length: n }, () => new Array<number>(n + 1).fill(0));
  ts.forEach((t, k) => {
    const u = (t - t0) / span;
    const pow = Array.from({ length: n }, (_, i) => u ** i);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) A[i]![j]! += ws[k]! * pow[i]! * pow[j]!;
      A[i]![n]! += ws[k]! * pow[i]! * vs[k]!;
    }
  });
  for (let i = 0; i < n; i++) {
    let pivot = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(A[r]![i]!) > Math.abs(A[pivot]![i]!)) pivot = r;
    [A[i], A[pivot]] = [A[pivot]!, A[i]!];
    const d = A[i]![i]! || 1e-12;
    for (let r = 0; r < n; r++) {
      if (r === i) continue;
      const f = A[r]![i]! / d;
      for (let c = i; c <= n; c++) A[r]![c]! -= f * A[i]![c]!;
    }
  }
  const coef = A.map((row, i) => row[n]! / (row[i]! || 1e-12));
  return (t) => {
    const u = (t - t0) / span;
    return coef.reduce((acc, c, i) => acc + c * u ** i, 0);
  };
}

/** Fit, drop samples further than `limit` from the fit, fit again. */
function robustFit(ts: number[], vs: number[], ws: number[], degree: number, limit = 1.5) {
  let keep = ts.map((_, i) => i);
  let fit = polyfit(ts, vs, ws, degree);
  for (let round = 0; round < 4; round++) {
    const residuals = keep.map((i) => Math.abs(vs[i]! - fit(ts[i]!)));
    const sorted = [...residuals].sort((a, b) => a - b);
    const mad = sorted[Math.floor(sorted.length / 2)] ?? 0;
    const cut = Math.max(limit, 2.5 * mad);
    const next = keep.filter((_, k) => residuals[k]! <= cut);
    if (next.length < degree + 2 || next.length === keep.length) break;
    keep = next;
    fit = polyfit(
      keep.map((i) => ts[i]!),
      keep.map((i) => vs[i]!),
      keep.map((i) => ws[i]!),
      degree,
    );
  }
  const rms = Math.sqrt(keep.reduce((a, i) => a + (vs[i]! - fit(ts[i]!)) ** 2, 0) / Math.max(1, keep.length));
  return { fit, rms, used: keep.length, total: ts.length };
}

/** Sub-pixel position of the strongest response in [from, to] along a line. */
function peak(sample: (k: number) => number, from: number, to: number): { at: number; strength: number } {
  let best = from;
  let bestValue = -Infinity;
  for (let k = Math.ceil(from); k <= Math.floor(to); k++) {
    const v = sample(k);
    if (v > bestValue) {
      bestValue = v;
      best = k;
    }
  }
  const a = sample(best - 1);
  const c = sample(best + 1);
  const denom = a - 2 * bestValue + c;
  const offset = denom < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / denom)) : 0;
  return { at: best + offset, strength: bestValue };
}

// ---------------------------------------------------------------- leaves

type Side = "left" | "right";

interface Line {
  /** Two points the line passes through, in plate pixels. */
  from: { x: number; y: number };
  to: { x: number; y: number };
}

const line = (x0: number, y0: number, x1: number, y1: number): Line => ({ from: { x: x0, y: y0 }, to: { x: x1, y: y1 } });
const along = (l: Line, x: number) => l.from.y + ((l.to.y - l.from.y) * (x - l.from.x)) / (l.to.x - l.from.x);

/**
 * Each leaf: its columns, and guides (±3 px) for the boards that cross the
 * gaps. Where a board crosses dirt of nearly its own colour the gradient is
 * too weak to trust, so the guides were measured on the plate by hand and the
 * fit only refines them where the edge is clear.
 */
const LEAF = {
  y0: 846,
  y1: 1394,
  left: {
    x0: 400,
    x1: 1304,
    boards: [
      { top: line(409, 948, 1280, 956), width: 44 },
      { top: line(409, 1256, 1280, 1264), width: 45 },
      { top: line(409, 1245, 1280, 962), width: 45 },
    ],
    iron: [
      { x0: 1280, x1: 1300, y0: 970.5, y1: 983 },
      { x0: 1255.5, x1: 1264.5, y0: 1330, y1: 1373 },
    ],
  },
  right: {
    x0: 1284,
    x1: 2216,
    boards: [
      { top: line(1301, 955, 2206, 943), width: 41 },
      { top: line(1301, 1262, 2206, 1250), width: 44 },
      { top: line(1301, 949, 2206, 1248), width: 45 },
    ],
    iron: [{ x0: 1315.5, x1: 1324.5, y0: 1330, y1: 1380 }],
  },
} as const;

const HINGE: Readonly<Record<Side, number>> = { left: 409, right: 2207 };

/** Inward bias of every fitted edge: a hair of wood lost beats a hair of background kept. */
const EDGE_BIAS = 0.3;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

interface Picket {
  left: (y: number) => number;
  right: (y: number) => number;
  top: (x: number) => number;
  bottom: (x: number) => number;
}

interface Band {
  top: (x: number) => number;
  bottom: (x: number) => number;
  from: number;
  to: number;
}

interface LeafGeometry {
  pickets: Picket[];
  bands: Band[];
}

/** Pickets as runs of columns that the hand-cut alpha mostly fills over the mulch. */
function findPickets(seed: Plane, x0: number, x1: number): Array<[number, number]> {
  const runs: Array<[number, number]> = [];
  let start = -1;
  for (let x = x0; x <= x1; x++) {
    let filled = 0;
    for (let y = 905; y < 1100; y++) if (seed[y * W + x]! > 0.5) filled++;
    const on = filled / 195 > 0.55 && x < x1;
    if (on && start < 0) start = x;
    if (!on && start >= 0) {
      if (x - start >= 14) runs.push([start, x - 1]);
      start = -1;
    }
  }
  return runs;
}

const weightedMedian = (values: number[], weights: number[]) => {
  const order = values.map((v, i) => [v, weights[i]!] as const).sort((a, b) => a[0] - b[0]);
  const half = order.reduce((s, [, w]) => s + w, 0) / 2;
  let acc = 0;
  for (const [v, w] of order) {
    acc += w;
    if (acc >= half) return v;
  }
  return order.at(-1)?.[0] ?? 0;
};

/**
 * Walks from inside the picket along a column until the colour stops looking
 * like that picket's wood; returns the first row outside, or null.
 */
function walkOut(rgb: Plane, x: number, from: number, step: 1 | -1, limit: number, reference: [number, number]): number | null {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let y = Math.min(...reference); y <= Math.max(...reference); y++) {
    const i = (y * W + x) * 3;
    r += rgb[i]!;
    g += rgb[i + 1]!;
    b += rgb[i + 2]!;
    n++;
  }
  r /= n;
  g /= n;
  b /= n;
  let misses = 0;
  for (let y = from; step > 0 ? y <= limit : y >= limit; y += step) {
    const i = (y * W + x) * 3;
    const d = Math.hypot(rgb[i]! - r, rgb[i + 1]! - g, rgb[i + 2]! - b);
    if (d > 34) {
      misses++;
      if (misses === 2) return y - step;
    } else misses = 0;
  }
  return null;
}

function fitLeaf(side: Side, seed: Plane, rgb: Plane, gx: Plane, gy: Plane, log: string[]): LeafGeometry {
  const spec = LEAF[side];
  const runs = findPickets(seed, spec.x0, spec.x1);
  log.push(`${side}: ${runs.length} pickets ${runs.map(([a, b]) => `${a}-${b}`).join(" ")}`);

  interface Samples {
    ts: number[];
    vs: number[];
    ws: number[];
  }
  const measured: Array<{ left: (y: number) => number; right: (y: number) => number; tops: Samples; feet: Samples }> = [];
  let worstEdge = 0;
  for (const [index, [a, b]] of runs.entries()) {
    const edge = (guess: number, sign: 1 | -1) => {
      const ts: number[] = [];
      const vs: number[] = [];
      const ws: number[] = [];
      for (let y = 915; y <= 1330; y++) {
        const p = peak((k) => gx[y * W + k]!, guess - 7, guess + 7);
        if (p.strength < 10) continue;
        ts.push(y);
        vs.push(p.at);
        ws.push(p.strength);
      }
      const result = robustFit(ts, vs, ws, 2, 1.2);
      worstEdge = Math.max(worstEdge, result.rms);
      return (y: number) => result.fit(y) + sign * EDGE_BIAS;
    };
    // The picket on the hinge is screwed to the hinge line itself; corn leaves hanging over it fool the fit.
    const hinge = HINGE[side];
    const left = side === "left" && index === 0 ? () => hinge : edge(a, 1);
    const right = side === "right" && index === runs.length - 1 ? () => hinge : edge(b, -1);

    // Tops and feet: walk out of the wood, then put the edge on the strongest gradient nearby.
    const tops: Samples = { ts: [], vs: [], ws: [] };
    const feet: Samples = { ts: [], vs: [], ws: [] };
    for (let x = Math.ceil(left(905) + 2); x <= Math.floor(right(905) - 2); x++) {
      const up = walkOut(rgb, x, 920, -1, 852, [918, 932]);
      if (up !== null) {
        const p = peak((k) => gy[k * W + x]!, up - 3, up + 3);
        tops.ts.push(x);
        tops.vs.push(p.strength >= 8 ? p.at : up - 0.5);
        tops.ws.push(Math.max(4, p.strength));
      }
    }
    for (let x = Math.ceil(left(1330) + 2); x <= Math.floor(right(1330) - 2); x++) {
      const down = walkOut(rgb, x, 1322, 1, 1362, [1314, 1324]);
      if (down !== null) {
        const p = peak((k) => gy[k * W + x]!, down - 3, down + 3);
        feet.ts.push(x);
        feet.vs.push(p.strength >= 8 ? p.at : down + 0.5);
        feet.ws.push(Math.max(4, p.strength));
      }
    }
    measured.push({ left, right, tops, feet });
  }
  log.push(`  picket edges: worst rms ${worstEdge.toFixed(2)} px`);

  // Every picket wears the same cut: a flat top with rounded shoulders (a superellipse),
  // fitted over the whole leaf so a pumpkin behind one picket cannot bend its cap.
  const shoulder = (ry: number, n: number, cx: number, rx: number) => (x: number) => {
    const u = Math.min(1, Math.abs(x - cx) / rx);
    return ry * (1 - (1 - u ** n) ** (1 / n));
  };
  const capOf = (m: (typeof measured)[number], ry: number, n: number) => {
    const cx = (m.left(900) + m.right(900)) / 2;
    const rx = (m.right(900) - m.left(900)) / 2 + 0.5;
    const shape = shoulder(ry, n, cx, rx);
    const y0 = weightedMedian(
      m.tops.ts.map((x, i) => m.tops.vs[i]! - shape(x)),
      m.tops.ws,
    );
    const err = m.tops.ts.reduce((s, x, i) => s + m.tops.ws[i]! * Math.min(4, (m.tops.vs[i]! - y0 - shape(x)) ** 2), 0);
    return { y0, shape, err };
  };
  let best = { err: Infinity, ry: 0, n: 2 };
  for (let ry = 2; ry <= 24; ry += 0.5)
    for (const n of [2, 2.5, 3, 4, 5, 6]) {
      const err = measured.reduce((s, m) => s + capOf(m, ry, n).err, 0);
      if (err < best.err) best = { err, ry, n };
    }
  log.push(`  caps: shoulder ${best.ry} px, exponent ${best.n}`);

  // Feet are sawn level: one line across the leaf, each picket allowed a pixel or two of its own.
  const allFeet = robustFit(
    measured.flatMap((m) => m.feet.ts),
    measured.flatMap((m) => m.feet.vs),
    measured.flatMap((m) => m.feet.ws),
    1,
    1.5,
  );
  log.push(`  feet: rms ${allFeet.rms.toFixed(2)} (${allFeet.used}/${allFeet.total}), y ${allFeet.fit(spec.x0).toFixed(1)} → ${allFeet.fit(spec.x1).toFixed(1)}`);

  const pickets: Picket[] = measured.map((m) => {
    const cap = capOf(m, best.ry, best.n);
    const offsets = m.feet.ts.map((x, i) => m.feet.vs[i]! - allFeet.fit(x));
    const own = offsets.length >= 6 ? weightedMedian(offsets, m.feet.ws) : 0;
    const footShift = Math.max(-2, Math.min(2, own));
    return {
      left: m.left,
      right: m.right,
      top: (x: number) => cap.y0 + cap.shape(x) + EDGE_BIAS,
      bottom: (x: number) => allFeet.fit(x) + footShift - EDGE_BIAS,
    };
  });

  // Boards show only in the gaps between pickets: refine the guides there.
  interface Gap {
    from: (y: number) => number;
    to: (y: number) => number;
  }
  const gaps: Gap[] = [];
  for (let i = 0; i + 1 < pickets.length; i++) gaps.push({ from: pickets[i]!.right, to: pickets[i + 1]!.left });
  const gapProfile = (gap: Gap, y: number) => {
    const from = Math.ceil(gap.from(y) + 2);
    const to = Math.floor(gap.to(y) - 2);
    let acc = 0;
    for (let x = from; x <= to; x++) acc += gy[y * W + x]!;
    return to >= from ? acc / (to - from + 1) : 0;
  };
  const leafFrom = pickets[0]!.left(1100);
  const leafTo = pickets.at(-1)!.right(1100);

  const bands: Band[] = spec.boards.map((board, index) => {
    const refine = (offset: number) => {
      const ts: number[] = [];
      const vs: number[] = [];
      const ws: number[] = [];
      for (const gap of gaps) {
        // Sample both thirds of a gap, so a sloping brace gets two points per gap.
        for (const t of [0.3, 0.7]) {
          const guessX = gap.from(1100) + t * (gap.to(1100) - gap.from(1100));
          const guessY = along(board.top, guessX) + offset;
          const x = Math.round(guessX);
          const p = peak((y) => {
            const g = { from: () => x - 3, to: () => x + 3 };
            return gapProfile(g, y);
          }, guessY - 4, guessY + 4);
          ts.push(x);
          vs.push(p.strength >= 10 ? p.at : guessY);
          ws.push(p.strength >= 10 ? p.strength : 3);
        }
      }
      return robustFit(ts, vs, ws, 1, 1.5);
    };
    const top = refine(0);
    const bottom = refine(board.width);
    log.push(
      `  board ${index + 1}: top rms ${top.rms.toFixed(2)}, bottom rms ${bottom.rms.toFixed(2)}, ` +
        `width ${(bottom.fit(leafFrom) - top.fit(leafFrom)).toFixed(1)} → ${(bottom.fit(leafTo) - top.fit(leafTo)).toFixed(1)}`,
    );
    return {
      top: (x: number) => top.fit(x) + EDGE_BIAS,
      bottom: (x: number) => bottom.fit(x) - EDGE_BIAS,
      from: Math.min(leafFrom, leafTo),
      to: Math.max(leafFrom, leafTo),
    };
  });

  return { pickets, bands };
}

function rasteriseLeaf(side: Side, geometry: LeafGeometry): Plane {
  const alpha = new Float32Array(W * H);
  const spec = LEAF[side];
  for (let y = LEAF.y0; y < LEAF.y1; y++)
    for (let x = spec.x0; x < spec.x1; x++) {
      let a = 0;
      for (const p of geometry.pickets) {
        const c = Math.min(
          clamp01(x - p.left(y) + 0.5),
          clamp01(p.right(y) - x + 0.5),
          clamp01(y - p.top(x) + 0.5),
          clamp01(p.bottom(x) - y + 0.5),
        );
        if (c > a) a = c;
      }
      for (const band of geometry.bands) {
        if (x < band.from - 1 || x > band.to + 1) continue;
        const c = Math.min(
          clamp01(y - band.top(x) + 0.5),
          clamp01(band.bottom(x) - y + 0.5),
          clamp01(x - band.from + 0.5),
          clamp01(band.to - x + 0.5),
        );
        if (c > a) a = c;
      }
      for (const box of spec.iron) {
        const c = Math.min(
          clamp01(x + 0.5 - box.x0),
          clamp01(box.x1 - x + 0.5),
          clamp01(y + 0.5 - box.y0),
          clamp01(box.y1 - y + 0.5),
        );
        if (c > a) a = c;
      }
      alpha[y * W + x] = a;
    }
  return alpha;
}

// ---------------------------------------------------------------- arch and ground cards

/** Row where the posts and the gate meet the road. */
const GATE_GROUND_Y = 1362;

interface Ellipse {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

interface Capsule {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  r: number;
}

/**
 * Pumpkins at the foot of the posts, measured on the plate. They stand in
 * front of the posts, so they become cards on the road at their own contact
 * row; left on the arch they would hover over the road once the camera moves.
 */
const PUMPKINS: Record<Side, { contact: number; bodies: Ellipse[]; stems: Capsule[] }> = {
  left: {
    contact: 1416,
    bodies: [
      { cx: 261.5, cy: 1348.5, rx: 71, ry: 68 },
      { cx: 57, cy: 1352, rx: 63, ry: 60 },
      { cx: 134, cy: 1399.5, rx: 52, ry: 42 },
    ],
    stems: [
      { x0: 270, y0: 1294, x1: 305, y1: 1256, r: 8 },
      { x0: 57, y0: 1296, x1: 80, y1: 1266, r: 8 },
      { x0: 132, y0: 1369, x1: 130, y1: 1349, r: 7 },
    ],
  },
  right: {
    contact: 1440,
    bodies: [
      { cx: 2400, cy: 1369, rx: 81, ry: 70 },
      { cx: 2535, cy: 1324, rx: 65, ry: 50 },
      { cx: 2535, cy: 1403, rx: 55, ry: 42 },
    ],
    stems: [
      { x0: 2410, y0: 1311, x1: 2385, y1: 1274, r: 9 },
      { x0: 2542, y0: 1286, x1: 2517, y1: 1256, r: 9 },
      { x0: 2542, y0: 1369, x1: 2540, y1: 1344, r: 7 },
    ],
  },
};

/**
 * Corn shocks lean on the posts and take the foot of each post with them, so
 * they stand exactly on the post's line: any other depth would tear the post
 * along the edge of the card once the camera is close.
 */
const CORN: Record<Side, { x0: number; y0: number; x1: number; y1: number }> = {
  left: { x0: 118, y0: 680, x1: 381, y1: GATE_GROUND_Y + 4 },
  right: { x0: 2208, y0: 670, x1: 2514, y1: GATE_GROUND_Y + 4 },
};

function ellipseCover(e: Ellipse, x: number, y: number, grow: number): number {
  const rx = e.rx + grow;
  const ry = e.ry + grow;
  const k = Math.hypot((x - e.cx) / rx, (y - e.cy) / ry);
  return clamp01((1 - k) * Math.min(rx, ry) + 0.5);
}

function capsuleCover(c: Capsule, x: number, y: number): number {
  const dx = c.x1 - c.x0;
  const dy = c.y1 - c.y0;
  const t = clamp01(((x - c.x0) * dx + (y - c.y0) * dy) / (dx * dx + dy * dy));
  return clamp01(c.r - Math.hypot(x - c.x0 - t * dx, y - c.y0 - t * dy) + 0.5);
}

/** Connected pieces of the alpha; returns a mask of the pieces of at least `minArea` pixels, grown by `grow`. */
function keepLargePieces(alpha: Plane, minArea: number, grow: number, log: string[]): Plane {
  const label = new Int32Array(W * H).fill(-1);
  const keep = new Uint8Array(W * H);
  const stack: number[] = [];
  let pieces = 0;
  let dropped = 0;
  for (let start = 0; start < W * H; start++) {
    if (alpha[start]! <= 0.2 || label[start] !== -1) continue;
    const members: number[] = [];
    label[start] = pieces;
    stack.push(start);
    while (stack.length) {
      const i = stack.pop()!;
      members.push(i);
      const x = i % W;
      const y = (i - x) / W;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = ny * W + nx;
          if (label[j] === -1 && alpha[j]! > 0.2) {
            label[j] = pieces;
            stack.push(j);
          }
        }
    }
    if (members.length >= minArea) for (const i of members) keep[i] = 1;
    else dropped++;
    pieces++;
  }
  log.push(`arch: ${pieces} pieces, dropped ${dropped} specks`);
  // Grow the kept pieces a little, so their soft edges stay with them.
  const grown = new Float32Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!keep[y * W + x]) continue;
      for (let dy = -grow; dy <= grow; dy++)
        for (let dx = -grow; dx <= grow; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < W && ny < H) grown[ny * W + nx] = 1;
        }
    }
  return grown;
}

interface CardCut {
  id: string;
  contact: number;
  alpha: Plane;
  /** Pixels filled behind the pumpkins: target index → source index. */
  fill: Map<number, number>;
}

function cutArch(archSeed: Plane, log: string[]): CardCut[] {
  const kept = keepLargePieces(archSeed, 2500, 2, log);
  const base = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) base[i] = archSeed[i]! * kept[i]!;

  const cards: CardCut[] = [];
  const rest = Float32Array.from(base);
  const fill = new Map<number, number>();

  for (const side of ["left", "right"] as const) {
    const spec = PUMPKINS[side];
    const alpha = new Float32Array(W * H);
    const mask = new Float32Array(W * H);
    const x0 = Math.floor(Math.min(...spec.bodies.map((b) => b.cx - b.rx)) - 12);
    const x1 = Math.ceil(Math.max(...spec.bodies.map((b) => b.cx + b.rx)) + 12);
    const y0 = Math.floor(Math.min(...spec.stems.map((s) => Math.min(s.y0, s.y1) - s.r)) - 4);
    for (let y = Math.max(0, y0); y < H; y++)
      for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) {
        let m = 0;
        for (const body of spec.bodies) m = Math.max(m, ellipseCover(body, x, y, 1.5));
        for (const stem of spec.stems) m = Math.max(m, capsuleCover(stem, x, y));
        const i = y * W + x;
        mask[i] = m;
        alpha[i] = base[i]! * m;
        rest[i] = base[i]! * (1 - m);
      }

    // Behind a pumpkin the post or the corn simply carries on down to the road:
    // mirror what is just above the pumpkin into the hole, column by column.
    for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) {
      let top = -1;
      for (let y = Math.max(0, y0); y < H; y++)
        if (mask[y * W + x]! > 0.5) {
          top = y;
          break;
        }
      if (top < 0) continue;
      const above = (top - 3) * W + x;
      if (base[above]! < 0.5) continue;
      for (let y = top - 2; y <= GATE_GROUND_Y; y++) {
        const i = y * W + x;
        if (mask[i]! <= 0) continue;
        const sy = Math.max(0, 2 * (top - 3) - y);
        const src = sy * W + x;
        const filled = base[src]! * mask[i]!;
        if (filled > rest[i]!) {
          rest[i] = Math.min(1, rest[i]! + filled);
          fill.set(i, src);
        }
      }
    }
    cards.push({ id: `pumpkins-${side}`, contact: spec.contact, alpha, fill: new Map() });
  }

  // Fallen leaves and dirt below the gate line belong to the road, not to the arch.
  for (let y = GATE_GROUND_Y + 5; y < H; y++) for (let x = 0; x < W; x++) rest[y * W + x] = 0;

  const arch = Float32Array.from(rest);
  const corn: CardCut[] = [];
  for (const side of ["left", "right"] as const) {
    const box = CORN[side];
    const alpha = new Float32Array(W * H);
    for (let y = box.y0; y < box.y1; y++)
      for (let x = box.x0; x < box.x1; x++) {
        const i = y * W + x;
        alpha[i] = rest[i]!;
        arch[i] = 0;
      }
    corn.push({ id: `corn-${side}`, contact: GATE_GROUND_Y, alpha, fill });
  }

  return [{ id: "arch", contact: GATE_GROUND_Y, alpha: arch, fill }, ...corn, ...cards];
}

// ---------------------------------------------------------------- output

interface LayerEntry {
  id: string;
  kind: "leaf" | "card";
  side?: Side;
  /** Contact row on the road (cards only). */
  contact?: number;
  /** Placement on gate.jpg; the texture covers exactly this rectangle. */
  rect: Rect;
  /** The parts of the rectangle that hold any wood, so the empty rest is never drawn. */
  parts?: Rect[];
}

/** Cell size of the coverage grid: small enough to skip the sky, large enough to stay a few dozen quads. */
const PART_CELL = 32;
const PART_MARGIN = 4;

/** Rows of grid cells that hold alpha, merged into runs; every run becomes one quad. */
function partsOf(alpha: Plane, rect: Rect): Rect[] {
  const parts: Rect[] = [];
  for (let y0 = rect.y; y0 < rect.y + rect.h; y0 += PART_CELL) {
    const y1 = Math.min(rect.y + rect.h, y0 + PART_CELL);
    let runStart = -1;
    const cells = Math.ceil(rect.w / PART_CELL);
    // One step past the last cell closes a run that reaches the right edge.
    for (let i = 0; i <= cells; i++) {
      const x0 = rect.x + i * PART_CELL;
      const x1 = Math.min(rect.x + rect.w, x0 + PART_CELL);
      let used = false;
      // A margin, so soft edges in the smaller mip levels are never clipped at a cell border.
      for (let y = Math.max(rect.y, y0 - PART_MARGIN); i < cells && y < Math.min(rect.y + rect.h, y1 + PART_MARGIN) && !used; y++)
        for (let x = Math.max(rect.x, x0 - PART_MARGIN); x < Math.min(rect.x + rect.w, x1 + PART_MARGIN); x++)
          if (alpha[y * W + x]! > 0.5 / 255) {
            used = true;
            break;
          }
      if (used && runStart < 0) runStart = x0;
      if (!used && runStart >= 0) {
        parts.push({ x: runStart, y: y0, w: Math.min(x0, rect.x + rect.w) - runStart, h: y1 - y0 });
        runStart = -1;
      }
    }
  }
  return parts;
}

const SIZES = { full: 1, half: 0.5 } as const;
const PLATES = ["gate", "gate-tall"] as const;

/** Bounding box of the alpha, padded and snapped to even pixels so the half size stays aligned. */
function boundsOf(alpha: Plane, pad = 4): Rect {
  let x0 = W;
  let y0 = H;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (alpha[y * W + x]! > 0.5 / 255) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  const even = (n: number) => n - (n % 2);
  const left = even(Math.max(0, x0 - pad));
  const top = even(Math.max(0, y0 - pad));
  const right = Math.min(W, even(x1 + pad + 2));
  const bottom = Math.min(H, even(y1 + pad + 2));
  return { x: left, y: top, w: right - left, h: bottom - top };
}

/**
 * Gives fully transparent pixels the colour of the nearest wood (pull-push
 * over a pyramid), so filtering and lossy compression never drag a foreign
 * colour into the soft edge.
 */
function bleedColour(rgba: Float32Array, w: number, h: number) {
  type Level = { w: number; h: number; c: Float32Array; n: Float32Array };
  const levels: Level[] = [];
  let cur: Level = { w, h, c: new Float32Array(w * h * 3), n: new Float32Array(w * h) };
  for (let i = 0; i < w * h; i++) {
    const a = rgba[i * 4 + 3]!;
    if (a > 0.5 / 255) {
      cur.n[i] = a;
      for (let k = 0; k < 3; k++) cur.c[i * 3 + k] = rgba[i * 4 + k]! * a;
    }
  }
  levels.push(cur);
  while (cur.w > 1 || cur.h > 1) {
    const nw = Math.max(1, Math.ceil(cur.w / 2));
    const nh = Math.max(1, Math.ceil(cur.h / 2));
    const next: Level = { w: nw, h: nh, c: new Float32Array(nw * nh * 3), n: new Float32Array(nw * nh) };
    for (let y = 0; y < cur.h; y++)
      for (let x = 0; x < cur.w; x++) {
        const s = y * cur.w + x;
        const d = (y >> 1) * nw + (x >> 1);
        next.n[d]! += cur.n[s]!;
        for (let k = 0; k < 3; k++) next.c[d * 3 + k]! += cur.c[s * 3 + k]!;
      }
    levels.push(next);
    cur = next;
  }
  // Pull: every empty cell borrows the average of its parent.
  for (let l = levels.length - 2; l >= 0; l--) {
    const fine = levels[l]!;
    const coarse = levels[l + 1]!;
    for (let y = 0; y < fine.h; y++)
      for (let x = 0; x < fine.w; x++) {
        const i = y * fine.w + x;
        if (fine.n[i]! > 1e-6) continue;
        const p = (y >> 1) * coarse.w + (x >> 1);
        const n = coarse.n[p]!;
        if (n <= 1e-6) continue;
        fine.n[i] = 1e-3;
        for (let k = 0; k < 3; k++) fine.c[i * 3 + k] = (coarse.c[p * 3 + k]! / n) * 1e-3;
      }
  }
  const top = levels[0]!;
  for (let i = 0; i < w * h; i++) {
    if (rgba[i * 4 + 3]! > 0.5 / 255) continue;
    const n = top.n[i]!;
    if (n > 0) for (let k = 0; k < 3; k++) rgba[i * 4 + k] = top.c[i * 3 + k]! / n;
  }
}

async function writeLayer(
  id: string,
  rect: Rect,
  alpha: Plane,
  colours: Record<(typeof PLATES)[number], Plane>,
  options: { square?: Plane; fill?: Map<number, number> },
  sizes: Record<string, number>,
) {
  if (manifestOnly) return;
  for (const plate of PLATES) {
    const colour = colours[plate];
    const rgba = new Float32Array(rect.w * rect.h * 4);
    for (let y = 0; y < rect.h; y++)
      for (let x = 0; x < rect.w; x++) {
        const i = (y + rect.y) * W + x + rect.x;
        const o = (y * rect.w + x) * 4;
        const a = alpha[i]!;
        const filled = options.fill?.get(i);
        const src = filled ?? i;
        for (let k = 0; k < 3; k++) {
          let c = colour[src * 3 + k]!;
          // Unmix the square seen through a soft edge, so the edge carries only wood.
          if (options.square && filled === undefined && a > 0.02 && a < 0.98) c = (c - (1 - a) * options.square[i * 3 + k]!) / a;
          rgba[o + k] = Math.max(0, Math.min(255, c));
        }
        rgba[o + 3] = a;
      }
    bleedColour(rgba, rect.w, rect.h);
    const bytes = Buffer.alloc(rect.w * rect.h * 4);
    for (let i = 0; i < rect.w * rect.h; i++) {
      for (let k = 0; k < 3; k++) bytes[i * 4 + k] = Math.round(rgba[i * 4 + k]!);
      bytes[i * 4 + 3] = Math.round(rgba[i * 4 + 3]! * 255);
    }
    for (const [size, scale] of Object.entries(SIZES)) {
      const file = `${id}.${plate}.${size}.webp`;
      let image = sharp(bytes, { raw: { width: rect.w, height: rect.h, channels: 4 } });
      if (scale !== 1) image = image.resize({ width: rect.w * scale, height: rect.h * scale, kernel: "lanczos3" });
      const info = await image.webp({ quality: 84, alphaQuality: 100, effort: 6, smartSubsample: true }).toFile(join(outDir, file));
      sizes[file] = info.size;
    }
  }
}

// ---------------------------------------------------------------- main

async function main() {
  const log: string[] = [];
  await mkdir(outDir, { recursive: true });
  if (debugDir) await mkdir(debugDir, { recursive: true });
  const [gate, gateTall, square, seedLeft, seedRight, archSeed] = await Promise.all([
    loadRgb("public/plates/gate.jpg"),
    loadTallAsGate(),
    loadRgb("public/plates/square-golden.jpg"),
    loadAlpha("public/layers/gate-leaf-left.png"),
    loadAlpha("public/layers/gate-leaf-right.png"),
    loadAlpha("public/layers/gate-arch.png"),
  ]);
  const colours = { gate, "gate-tall": gateTall };
  const { gx, gy } = colourGradients(gate);
  const layers: LayerEntry[] = [];
  const sizes: Record<string, number> = {};

  for (const [side, seed] of [
    ["left", seedLeft],
    ["right", seedRight],
  ] as const) {
    const geometry = fitLeaf(side, seed, gate, gx, gy, log);
    const alpha = rasteriseLeaf(side, geometry);
    const rect = boundsOf(alpha);
    const id = `leaf-${side}`;
    layers.push({ id, kind: "leaf", side, rect });
    await writeLayer(id, rect, alpha, colours, { square }, sizes);
    await debugGray(`${id}-alpha`, alpha, rect);
    await debugOver(`${id}-over`, gate, alpha, rect);
  }

  for (const card of cutArch(archSeed, log)) {
    const rect = boundsOf(card.alpha);
    const parts = partsOf(card.alpha, rect);
    const covered = parts.reduce((sum, r) => sum + r.w * r.h, 0) / (rect.w * rect.h);
    log.push(`${card.id}: ${parts.length} quads cover ${(covered * 100).toFixed(0)}% of its box`);
    layers.push({ id: card.id, kind: "card", contact: card.contact, rect, parts });
    await writeLayer(card.id, rect, card.alpha, colours, { square, fill: card.fill }, sizes);
    await debugOver(`${card.id}-over`, gate, card.alpha, rect);
  }

  const manifest = {
    plate: { width: W, height: H },
    sizes: SIZES,
    layers,
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const kb = (n: number) => `${Math.round(n / 1024)} KB`;
  for (const plate of PLATES)
    for (const size of Object.keys(SIZES)) {
      const files = Object.entries(sizes).filter(([file]) => file.endsWith(`.${plate}.${size}.webp`));
      log.push(`${plate} ${size}: ${kb(files.reduce((s, [, n]) => s + n, 0))} (${files.map(([f, n]) => `${f.split(".")[0]} ${kb(n)}`).join(", ")})`);
    }
  console.log(log.join("\n"));
}

await main();
