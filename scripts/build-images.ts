/**
 * Responsive variants of the full-bleed plates.
 *
 *   pnpm images            build what is missing or older than its source
 *   pnpm images --force    rebuild everything
 *
 * public/plates/<name>.jpg → public/img/plates/<name>-<width>.{avif,webp}
 * Sources are never modified.
 */
import { mkdir, readdir, stat } from "node:fs/promises";
import { join, parse } from "node:path";
import sharp, { type Sharp } from "sharp";

const root = process.cwd();
const sourceDir = join(root, "public", "plates");
const outDir = join(root, "public", "img", "plates");

const widths = [2576, 1600] as const;

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

async function main() {
  await mkdir(outDir, { recursive: true });
  const files = (await readdir(sourceDir)).filter((file) => /\.jpe?g$/i.test(file)).sort();
  let built = 0;

  for (const file of files) {
    const source = join(sourceDir, file);
    const { name } = parse(file);
    const sourceMtime = (await stat(source)).mtimeMs;
    const { width: sourceWidth = 0 } = await sharp(source).metadata();

    for (const width of widths) {
      if (width > sourceWidth) {
        throw new Error(`${file} is ${sourceWidth}px wide, cannot make a ${width}px variant`);
      }
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

  console.log(built ? `Built ${built} files.` : "Plates are up to date.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
