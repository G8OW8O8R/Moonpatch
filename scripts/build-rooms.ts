/**
 * The door leaves inside each building, lifted off the plate so they can
 * move a little faster than the room behind them.
 *
 *   pnpm rooms                  write public/img/rooms/*
 *   pnpm rooms --debug=<dir>    also dump the masks and checks into <dir>
 *
 * Every leaf on the plates is cut along one straight edge (content/rooms/*.json,
 * shares of the plate), so its mask is exact: everything between the edge and
 * the side of the plate, with a two-pixel ramp across the edge itself.
 *
 *   <room>-<layer>-<width>   the leaf as WebP with alpha, cropped to its side.
 *   <room>-clean-<width>     the plate with the room carried on under each
 *                            leaf, mirrored across the edge, for as far as a
 *                            leaf can ever slide away from it. Within the
 *                            ramp and past that strip it is the plate itself,
 *                            so leaf over clean is the plate again at rest.
 *
 * Sources are never modified.
 */
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const root = process.cwd();
const outDir = join(root, "public", "img", "rooms");
const debugArg = process.argv.find((arg) => arg.startsWith("--debug="));
const debugDir = debugArg ? join(root, debugArg.slice("--debug=".length)) : null;

const W = 2576;
const H = 1438;
const WIDTHS = [1600, 2576] as const;
const ROOMS = ["cafe", "barn", "haunt"] as const;
type Room = (typeof ROOMS)[number];

/** Half the width of the ramp across an edge, plate px. */
const RAMP = 1;
/** How far under a leaf the room is carried on, plate px: past the furthest a leaf ever slides. */
const STRIP = 64;

interface Layer {
  id: string;
  side: "left" | "right";
  /** Two points of the edge as shares of the plate, top and bottom. */
  edge: [[number, number], [number, number]];
  nearness: number;
}

interface RoomFile {
  look: number;
  layers: Layer[];
}

const readRoom = async (room: Room): Promise<RoomFile> =>
  JSON.parse(await readFile(join(root, "content", "rooms", `${room}.json`), "utf8")) as RoomFile;

/** Edge x (plate px) at a pixel row's centre. */
const edgeAt = (layer: Layer, y: number) => {
  const [[u0, v0], [u1, v1]] = layer.edge;
  const t = ((y + 0.5) / H - v0) / (v1 - v0);
  return (u0 + (u1 - u0) * t) * W;
};

/** Signed distance of a pixel centre into the leaf, plate px (negative: out in the room). */
const into = (layer: Layer, x: number, y: number) => {
  const e = edgeAt(layer, y);
  return layer.side === "left" ? e - (x + 0.5) : x + 0.5 - e;
};

const alphaAt = (d: number) => Math.min(1, Math.max(0, (d + RAMP) / (2 * RAMP)));

/** Linear sample of one row of an RGB plate at a fractional x. */
const sampleRow = (rgb: Buffer, y: number, x: number, c: number) => {
  const fx = Math.min(W - 1, Math.max(0, x - 0.5));
  const x0 = Math.floor(fx);
  const x1 = Math.min(W - 1, x0 + 1);
  const t = fx - x0;
  return rgb[(y * W + x0) * 3 + c]! * (1 - t) + rgb[(y * W + x1) * 3 + c]! * t;
};

/** Pixels this far from the edge are taken as clean door or clean room. */
const CLEAR = RAMP + 1.5;

/** Columns a layer covers, ramp included. */
function span(layer: Layer): { left: number; width: number } {
  const reach = Math.max(edgeAt(layer, 0), edgeAt(layer, H - 1));
  const near = Math.min(edgeAt(layer, 0), edgeAt(layer, H - 1));
  const left = layer.side === "left" ? 0 : Math.max(0, Math.floor(near - CLEAR));
  const right = layer.side === "left" ? Math.min(W, Math.ceil(reach + CLEAR)) : W;
  return { left, width: right - left };
}

/** Leaf over plate as an 8-bit pixel: what the plate must come back as. */
const over = (front: number, back: number, a: number) => Math.round(front * a + back * (1 - a));

/**
 * 8-bit door and room values, as near the wanted colours as can be, whose
 * mix at this alpha is the plate's own value exactly. One of the two moves
 * by whole steps; the other then has the one value that lands on it.
 */
function split(orig: number, door: number, room: number, a: number): [number, number] {
  const clamp = (v: number) => Math.min(255, Math.max(0, Math.round(v)));
  if (a >= 1) return [orig, clamp(room)];
  if (a <= 0) return [clamp(door), orig];
  let best: [number, number] | null = null;
  let cost = Infinity;
  const leafLed = a >= 0.5;
  const ideal = leafLed ? door + (orig - (a * door + (1 - a) * room)) / a : room + (orig - (a * door + (1 - a) * room)) / (1 - a);
  for (let step = 0; step <= 255 && cost > 0; step++) {
    for (const sign of step ? [1, -1] : [1]) {
      const lead = clamp(ideal) + sign * step;
      if (lead < 0 || lead > 255) continue;
      for (const nudge of [0, -1, 1]) {
        const follow = leafLed
          ? clamp((orig - a * lead) / (1 - a) + nudge)
          : clamp((orig - (1 - a) * lead) / a + nudge);
        const [front, back] = leafLed ? [lead, follow] : [follow, lead];
        if (over(front, back, a) !== orig) continue;
        const c = Math.abs(front - door) + Math.abs(back - room);
        if (c < cost) {
          cost = c;
          best = [front, back];
        }
      }
    }
    if (best) break;
  }
  if (!best) throw new Error("no 8-bit split for this pixel");
  return best;
}

interface Cut {
  /** The leaf, straight (not premultiplied) RGBA, cropped to `left` … `left + width`. */
  leaf: Buffer;
  left: number;
  width: number;
}

/**
 * Lifts every leaf off the plate. Across the ramp each pixel is the door and
 * the room mixed; it is split into the door's colour (on the leaf) and the
 * room's (on the plate), with what the split leaves over put back on the
 * side that carries most of the pixel, so leaf over plate is still the plate
 * exactly. Under the leaf the room is mirrored across the edge, from clean
 * room pixels just past the ramp, so no trace of the edge stays behind.
 */
function lift(rgb: Buffer, layers: Layer[]): { clean: Buffer; cuts: Cut[] } {
  const clean = Buffer.from(rgb);
  const cuts: Cut[] = [];
  for (const layer of layers) {
    const { left, width } = span(layer);
    const leaf = Buffer.alloc(width * H * 4);
    const toward = layer.side === "left" ? -1 : 1;
    for (let y = 0; y < H; y++) {
      const e = edgeAt(layer, y);
      for (let x = left; x < left + width; x++) {
        const d = into(layer, x, y);
        const o = (y * width + (x - left)) * 4;
        const p = (y * W + x) * 3;
        const orig = [rgb[p]!, rgb[p + 1]!, rgb[p + 2]!];
        if (d >= RAMP + 0.5) {
          // Door, solid; under it the room carries on (as far as the leaf ever slides).
          for (let c = 0; c < 3; c++) leaf[o + c] = orig[c]!;
          leaf[o + 3] = 255;
          if (d <= STRIP) {
            const mirror = e - toward * (d + CLEAR - RAMP);
            for (let c = 0; c < 3; c++) clean[p + c] = Math.round(sampleRow(rgb, y, mirror, c));
          }
          continue;
        }
        if (d <= -RAMP - 0.5) continue;
        // Across the ramp: door colour from just inside the leaf, room colour from just outside it.
        const door = [0, 1, 2].map((c) => sampleRow(rgb, y, e + toward * CLEAR, c));
        const room = [0, 1, 2].map((c) => sampleRow(rgb, y, e - toward * CLEAR, c));
        const diff = door.map((v, c) => v - room[c]!);
        const span2 = diff.reduce((s, v) => s + v * v, 0);
        // Where door and room differ clearly the pixel says how much of each it holds; where they are
        // close (dark on dark) that reading is noise, and the straight ramp of the edge stands.
        const ramp = alphaAt(d);
        const read = span2 > 0 ? Math.min(1, Math.max(0, diff.reduce((s, v, c) => s + v * (orig[c]! - room[c]!), 0) / span2)) : ramp;
        const trust = Math.min(1, Math.max(0, (Math.sqrt(span2) - 30) / 50));
        let a = ramp + (read - ramp) * trust;
        // The split is worked out for the alpha the file will actually hold.
        a = Math.round(a * 255) / 255;
        for (let c = 0; c < 3; c++) {
          const [front, back] = split(orig[c]!, door[c]!, room[c]!, a);
          leaf[o + c] = front;
          clean[p + c] = back;
        }
        leaf[o + 3] = Math.round(a * 255);
      }
    }
    cuts.push({ leaf, left, width });
  }
  return { clean, cuts };
}

async function writeDebug(room: Room, rgb: Buffer, clean: Buffer, cuts: Cut[], layers: Layer[]) {
  if (!debugDir) return;
  await mkdir(debugDir, { recursive: true });
  // Overview: what is lifted, tinted, with the edge drawn on.
  const tint = Buffer.from(rgb);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let a = 0;
      for (const layer of layers) a = Math.max(a, alphaAt(into(layer, x, y)));
      const onEdge = layers.some((layer) => Math.abs(into(layer, x, y)) < 1.5);
      const o = (y * W + x) * 3;
      if (onEdge) [tint[o], tint[o + 1], tint[o + 2]] = [255, 230, 0];
      else if (a > 0) {
        tint[o] = Math.round(tint[o]! * 0.6 + 255 * 0.4);
        tint[o + 1] = Math.round(tint[o + 1]! * 0.6);
        tint[o + 2] = Math.round(tint[o + 2]! * 0.6 + 255 * 0.4);
      }
    }
  await sharp(tint, { raw: { width: W, height: H, channels: 3 } }).resize(1288).jpeg({ quality: 86 }).toFile(join(debugDir, `${room}-mask.jpg`));
  await sharp(clean, { raw: { width: W, height: H, channels: 3 } }).png().toFile(join(debugDir, `${room}-clean.png`));
  for (const [i, layer] of layers.entries()) {
    const cut = cuts[i]!;
    await sharp(cut.leaf, { raw: { width: cut.width, height: H, channels: 4 } }).png().toFile(join(debugDir, `${room}-${layer.id}.png`));
  }
}

async function main() {
  await mkdir(outDir, { recursive: true });
  for (const room of ROOMS) {
    const { layers } = await readRoom(room);
    const { data: rgb, info } = await sharp(join(root, "public", "plates", `${room}.jpg`)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    if (info.width !== W || info.height !== H) throw new Error(`${room}.jpg must be ${W}×${H}`);
    const { clean, cuts } = lift(rgb, layers);
    await writeDebug(room, rgb, clean, cuts, layers);
    if (debugDir && process.argv.includes("--preview")) continue;
    for (const width of WIDTHS) {
      const height = Math.round((H * width) / W);
      const plate = sharp(clean, { raw: { width: W, height: H, channels: 3 } }).resize(width, height, { kernel: "lanczos3" });
      await plate.clone().avif({ quality: 56, effort: 6, chromaSubsampling: "4:4:4" }).toFile(join(outDir, `${room}-clean-${width}.avif`));
      await plate.webp({ quality: 82, effort: 6, smartSubsample: true }).toFile(join(outDir, `${room}-clean-${width}.webp`));
      for (const [i, layer] of layers.entries()) {
        const cut = cuts[i]!;
        const scale = width / W;
        await sharp(cut.leaf, { raw: { width: cut.width, height: H, channels: 4 } })
          .resize(Math.max(1, Math.round(cut.width * scale)), height, { kernel: "lanczos3" })
          .webp({ quality: 86, alphaQuality: 100, effort: 6, smartSubsample: true })
          .toFile(join(outDir, `${room}-${layer.id}-${width}.webp`));
      }
    }
  }
}

await main();
