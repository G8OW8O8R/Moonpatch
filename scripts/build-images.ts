/**
 * Responsive variants of the full-bleed plates.
 *
 *   pnpm images            build what is missing or older than its source
 *   pnpm images --force    rebuild everything
 *
 * public/plates/<name>.jpg → public/img/plates/<name>-<width>.{avif,webp}
 * at the plate's full width (2576 landscape, 2552 portrait) and at 1600px.
 * The tag's twine and grommet and the pass's moon stamp →
 * public/img/textures/{twine,grommet,stamp-moon}.webp: a straight run of the
 * twine (the source lies in a curve), a small ring, a stamp twice as large as
 * it is ever printed.
 * A room that grades its door leaves gets its picture from `pnpm rooms` instead.
 * Sources are never modified.
 */
import { mkdir, readFile, readdir, stat } from "node:fs/promises";
import { join, parse } from "node:path";
import sharp, { type Sharp } from "sharp";

const root = process.cwd();
const sourceDir = join(root, "public", "plates");
const outDir = join(root, "public", "img", "plates");

const reducedWidth = 1600;

const encoders = {
  avif: (image: Sharp) => image.avif({ quality: 56, effort: 6, chromaSubsampling: "4:4:4" }),
  webp: (image: Sharp) => image.webp({ quality: 80, effort: 6, smartSubsample: true }),
} as const;

const force = process.argv.includes("--force");

async function isFresh(output: string, sourceMtime: number): Promise<boolean> {
  if (force) return false;
  try {
    return (await stat(output)).mtimeMs >= sourceMtime;
  } catch {
    return false;
  }
}

const kb = (bytes: number) => `${Math.round(bytes / 1024)} KB`;

const textureDir = join(root, "public", "textures", "assets");
const textureOut = join(root, "public", "img", "textures");

/** The run of the twine that hangs the tag: its flattest stretch, stood upright and pulled straight. */
const STRAND = { left: 340, top: 410, width: 420, height: 170 } as const;
const STRAND_WIDTH = 80;

async function straightTwine(source: string): Promise<Sharp> {
  const { data, info } = await sharp(source).extract(STRAND).rotate(-90).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  // The middle of the strand on each row, smoothed so the twist is kept and only the bow goes.
  const centres = Array.from({ length: height }, (_, y) => {
    let sum = 0;
    let moment = 0;
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * channels + 3] ?? 0;
      sum += alpha;
      moment += alpha * x;
    }
    return sum ? moment / sum : width / 2;
  });
  const smooth = centres.map((_, y) => {
    const span = centres.slice(Math.max(0, y - 20), y + 21);
    return span.reduce((a, b) => a + b, 0) / span.length;
  });
  const out = Buffer.alloc(STRAND_WIDTH * height * 4);
  const at = (x: number, y: number, c: number) => (x >= 0 && x < width ? (data[(y * width + x) * channels + c] ?? 0) : 0);
  for (let y = 0; y < height; y++) {
    const shift = (smooth[y] ?? width / 2) - STRAND_WIDTH / 2;
    for (let x = 0; x < STRAND_WIDTH; x++) {
      const sx = x + shift;
      const x0 = Math.floor(sx);
      const f = sx - x0;
      for (let c = 0; c < 4; c++) out[(y * STRAND_WIDTH + x) * 4 + c] = Math.round(at(x0, y, c) * (1 - f) + at(x0 + 1, y, c) * f);
    }
  }
  return sharp(out, { raw: { width: STRAND_WIDTH, height, channels: 4 } });
}

async function buildTextures(): Promise<number> {
  await mkdir(textureOut, { recursive: true });
  const jobs: Array<{ name: string; make: (source: string) => Promise<Sharp> | Sharp }> = [
    { name: "twine", make: straightTwine },
    { name: "grommet", make: (source) => sharp(source).resize({ width: 160, kernel: "lanczos3" }) },
    { name: "stamp-moon", make: (source) => sharp(source).resize({ width: 240, kernel: "lanczos3" }) },
  ];
  let built = 0;
  for (const { name, make } of jobs) {
    const source = join(textureDir, `${name}.png`);
    const output = join(textureOut, `${name}.webp`);
    if (await isFresh(output, (await stat(source)).mtimeMs)) continue;
    const info = await (await make(source)).webp({ quality: 86, alphaQuality: 90, effort: 6 }).toFile(output);
    built += 1;
    console.log(`${name}.webp  ${info.width}×${info.height}  ${kb(info.size)}`);
  }
  return built;
}

/** Rooms whose picture `pnpm rooms` writes, with their leaves graded. */
async function gradedRooms(): Promise<Set<string>> {
  const rooms = new Set<string>();
  for (const room of ["cafe", "barn", "haunt"]) {
    const file = JSON.parse(await readFile(join(root, "content", "rooms", `${room}.json`), "utf8")) as { grade?: unknown };
    if (file.grade) rooms.add(room);
  }
  return rooms;
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const skip = await gradedRooms();
  const files = (await readdir(sourceDir)).filter((file) => /\.jpe?g$/i.test(file)).sort();
  let built = 0;

  for (const file of files) {
    const source = join(sourceDir, file);
    const { name } = parse(file);
    if (skip.has(name)) continue;
    const sourceMtime = (await stat(source)).mtimeMs;
    const { width: sourceWidth = 0 } = await sharp(source).metadata();

    if (sourceWidth < reducedWidth) {
      throw new Error(`${file} is ${sourceWidth}px wide, narrower than the ${reducedWidth}px variant`);
    }

    for (const width of [sourceWidth, reducedWidth]) {
      for (const [format, encode] of Object.entries(encoders)) {
        const output = join(outDir, `${name}-${width}.${format}`);
        if (await isFresh(output, sourceMtime)) continue;

        const pipeline = sharp(source).withIccProfile("srgb").resize({ width, kernel: "lanczos3" });
        const info = await encode(pipeline).toFile(output);
        built += 1;
        console.log(`${name}-${width}.${format}  ${info.width}×${info.height}  ${kb(info.size)}`);
      }
    }
  }

  built += await buildTextures();
  console.log(built ? `Built ${built} files.` : "Plates and textures are up to date.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
