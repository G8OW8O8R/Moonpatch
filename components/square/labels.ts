/**
 * Lettering for the signpost arms: Fraunces capitals, soft and a little wide,
 * as a sign painter would letter a board. Drawn on the page where the web
 * fonts live and handed to the scene as paint masks the size of each arm;
 * the scene multiplies the paint into the wood and loses it in the grain.
 * The plain-HTML signpost sets the same words at the same size with CSS.
 */
import { ARM, ARMS, ARM_FACE, type ArmId } from "@/lib/square-props";

/** Capital height as a share of the arm's height, at most (long words get smaller). */
export const LABEL_SIZE = 0.44;

/** Letter spacing, in ems. */
export const LABEL_TRACKING = 0.09;

/** The painted face, soft-cornered and at display size. */
const VARIATION = '"SOFT" 100, "opsz" 144';
const WEIGHT = 600;

/** Half the source size is plenty for lettering seen at a few hundred pixels. */
const SCALE = 0.5;

const PAINT_FAMILY = "sign-paint";

let paintFont: Promise<string> | null = null;

/**
 * Fraunces with the sign painter's axes set. A canvas cannot set font axes,
 * so the page's own Fraunces files are registered once more under a private
 * name with the axes fixed; without access to them, the plain family.
 */
function loadPaintFont(): Promise<string> {
  paintFont ??= (async () => {
    const family = getComputedStyle(document.documentElement).getPropertyValue("--font-fraunces").trim();
    const name = family.split(",")[0]?.replace(/['"]/g, "").trim() ?? "";
    const faces: FontFace[] = [];
    for (const sheet of document.styleSheets) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      for (const rule of rules) {
        if (!(rule instanceof CSSFontFaceRule)) continue;
        const style = rule.style;
        if (style.getPropertyValue("font-family").replace(/['"]/g, "").trim() !== name) continue;
        if (style.getPropertyValue("font-style") === "italic") continue;
        const url = /url\(["']?([^"')]+)/.exec(style.getPropertyValue("src"))?.[1];
        if (!url) continue;
        const range = style.getPropertyValue("unicode-range");
        // Font axes are part of the font loading standard, if not yet of the DOM typings.
        const descriptors: FontFaceDescriptors & { variationSettings: string } = {
          weight: style.getPropertyValue("font-weight") || "100 900",
          variationSettings: VARIATION,
          ...(range ? { unicodeRange: range } : {}),
        };
        faces.push(new FontFace(PAINT_FAMILY, `url(${new URL(url, sheet.href ?? location.href).href})`, descriptors));
      }
    }
    if (!faces.length) return family;
    try {
      await Promise.all(faces.map((face) => face.load()));
      for (const face of faces) document.fonts.add(face);
      return PAINT_FAMILY;
    } catch {
      return family;
    }
  })();
  return paintFont;
}

const fontAt = (family: string, px: number) => `${WEIGHT} ${px}px ${family}`;

const upper = (text: string, lang: string) => text.toLocaleUpperCase(lang);

/**
 * Font size for a label on an arm `height` px tall: capitals of LABEL_SIZE,
 * or smaller where the word would run off the painted face.
 */
function fitSize(ctx: CanvasRenderingContext2D, family: string, text: string, width: number, height: number, face: number): number {
  // Fraunces capitals stand about 0.7 em.
  let size = (height * LABEL_SIZE) / 0.7;
  ctx.font = fontAt(family, size);
  ctx.letterSpacing = `${size * LABEL_TRACKING}px`;
  const measured = ctx.measureText(text).width;
  if (measured > face * width) size *= (face * width) / measured;
  return size;
}

/** Small deterministic noise, so every arm wears the same way on every visit. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Paint chipped away: flecks, and scratches along the grain. */
function wear(ctx: CanvasRenderingContext2D, box: { x: number; y: number; w: number; h: number }, seed: number) {
  const random = seeded(seed);
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 360; i++) {
    ctx.globalAlpha = 0.35 + random() * 0.65;
    const r = 0.4 + random() * random() * 2.2;
    ctx.beginPath();
    ctx.ellipse(box.x + random() * box.w, box.y + random() * box.h, r * (1 + random()), r, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 60; i++) {
    ctx.globalAlpha = 0.25 + random() * 0.5;
    const y = box.y + random() * box.h;
    const x = box.x + random() * box.w;
    ctx.fillRect(x, y, 4 + random() * 40, 0.5 + random() * 1.1);
  }
  ctx.restore();
}

export async function drawArmLabels(labels: Record<ArmId, string>, lang: string): Promise<Partial<Record<ArmId, ImageBitmap>>> {
  if (typeof createImageBitmap !== "function") return {};
  const family = await loadPaintFont();
  if (!family) return {};
  const width = Math.round(ARM.width * SCALE);
  const height = Math.round(ARM.height * SCALE);
  await document.fonts.load(fontAt(family, 64), Object.values(labels).map((l) => upper(l, lang)).join(""));

  const out: Partial<Record<ArmId, ImageBitmap>> = {};
  for (const [index, arm] of ARMS.entries()) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    const face = ARM_FACE[arm.points];
    const box = { x: face.x * width, y: face.y * height, w: face.w * width, h: face.h * height };
    const text = upper(labels[arm.id], lang);
    const size = fitSize(ctx, family, text, width, height, face.w);
    ctx.font = fontAt(family, size);
    ctx.letterSpacing = `${size * LABEL_TRACKING}px`;
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    // Capitals centred on the board: their baseline sits half a cap height below the middle.
    const tracking = size * LABEL_TRACKING;
    ctx.fillText(text, box.x + box.w / 2 + tracking / 2, box.y + box.h / 2 + size * 0.35);
    wear(ctx, box, 7919 * (index + 1));
    out[arm.id] = await createImageBitmap(canvas);
  }
  return out;
}

/**
 * Font size for each label as a share of its arm's height, for the
 * plain-HTML signpost, measured with the same font and the same rule.
 */
/** Sizes already measured, by language: the plain-HTML arms are lettered right in their first frame. */
const measured = new Map<string, Partial<Record<ArmId, number>>>();

export const knownArmLabelSizes = (lang: string): Partial<Record<ArmId, number>> => measured.get(lang) ?? {};

export async function armLabelSizes(labels: Record<ArmId, string>, lang: string): Promise<Partial<Record<ArmId, number>>> {
  const known = measured.get(lang);
  if (known) return known;
  const family = await loadPaintFont();
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx || !family) return {};
  await document.fonts.load(fontAt(family, 64), Object.values(labels).map((l) => upper(l, lang)).join(""));
  const sizes: Partial<Record<ArmId, number>> = {};
  for (const arm of ARMS) {
    sizes[arm.id] = fitSize(ctx, family, upper(labels[arm.id], lang), ARM.width, ARM.height, ARM_FACE[arm.points].w) / ARM.height;
  }
  measured.set(lang, sizes);
  return sizes;
}
