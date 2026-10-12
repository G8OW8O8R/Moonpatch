/**
 * Lettering for the signpost arms, drawn on the page where the web fonts
 * live and handed to the scene as alpha masks the size of each arm. The
 * plain-HTML signpost sets the same words in the same box with CSS.
 */
import { ARM, ARMS, ARM_FACE, type ArmId } from "@/lib/square-props";

/** Letter height as a share of the arm's height, shared with the CSS signpost. */
export const LABEL_SIZE = 0.6;

/** Half the source size is plenty for lettering seen at a few hundred pixels. */
const SCALE = 0.5;

export async function drawArmLabels(labels: Record<ArmId, string>): Promise<Partial<Record<ArmId, ImageBitmap>>> {
  const family = getComputedStyle(document.documentElement).getPropertyValue("--font-caveat").trim();
  if (!family || typeof createImageBitmap !== "function") return {};
  const width = Math.round(ARM.width * SCALE);
  const height = Math.round(ARM.height * SCALE);
  const fontAt = (px: number) => `600 ${px}px ${family}`;
  await document.fonts.load(fontAt(64), Object.values(labels).join(""));

  const out: Partial<Record<ArmId, ImageBitmap>> = {};
  for (const arm of ARMS) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    const face = ARM_FACE[arm.points];
    const box = { x: face.x * width, y: face.y * height, w: face.w * width, h: face.h * height };
    const text = labels[arm.id];
    let size = height * LABEL_SIZE;
    ctx.font = fontAt(size);
    const measured = ctx.measureText(text).width;
    if (measured > box.w) size *= box.w / measured;
    ctx.font = fontAt(size);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // Caveat sits a little high on its line: nudge it onto the middle of the board.
    ctx.fillText(text, box.x + box.w / 2, box.y + box.h / 2 + size * 0.06);
    out[arm.id] = await createImageBitmap(canvas);
  }
  return out;
}
