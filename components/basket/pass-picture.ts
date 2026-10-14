/**
 * The Farm Pass drawn onto a canvas, twice the size it is laid out at, for
 * "Save ticket". It is drawn from the ticket on the page itself: the same
 * outlines and frames (from the layout), and every word and picture where
 * the page has put it, in the page's own fonts and colours. Paper outside the
 * ticket and the holes along the perforation stay transparent.
 */
import { FRAME_GAP, type PassLayout, type Rect, framePath, outlinePath } from "@/lib/farm-pass";

/** The paper's tile, as wide as on the page (see .pass-piece). */
const PAPER_TILE = 520;

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`could not load ${src}`));
    image.src = src;
  });

/** An SVG drawn as an image needs a size of its own in some browsers: the wordmark gets its viewBox's. */
async function svgImage(src: string): Promise<HTMLImageElement> {
  const text = await (await fetch(src)).text();
  const box = /viewBox="([^"]+)"/.exec(text)?.[1]?.split(/[\s,]+/).map(Number);
  const sized = box && box.length === 4 ? text.replace("<svg ", `<svg width="${Math.ceil(box[2]!)}" height="${Math.ceil(box[3]!)}" `) : text;
  const url = URL.createObjectURL(new Blob([sized], { type: "image/svg+xml" }));
  try {
    return await loadImage(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Where an element sits inside its piece, in the ticket's own px (offsets ignore the ticket's scale and turn). */
function offsetIn(el: HTMLElement, piece: HTMLElement): { x: number; y: number } {
  let x = 0;
  let y = 0;
  let node: Element | null = el;
  while (node instanceof HTMLElement && node !== piece) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent;
  }
  return { x, y };
}

const fontOf = (style: CSSStyleDeclaration) => `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;

function setLetterSpacing(ctx: CanvasRenderingContext2D, spacing: string) {
  if ("letterSpacing" in ctx) ctx.letterSpacing = spacing === "normal" ? "0px" : spacing;
}

/** One run of words, left-aligned on its own baseline (its box's top plus the font's ascent). */
function drawRun(ctx: CanvasRenderingContext2D, el: HTMLElement, origin: { x: number; y: number }) {
  const style = getComputedStyle(el);
  ctx.font = fontOf(style);
  ctx.fillStyle = style.color;
  setLetterSpacing(ctx, style.letterSpacing);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const text = el.textContent ?? "";
  const ascent = ctx.measureText(text).fontBoundingBoxAscent;
  ctx.fillText(text, origin.x, origin.y + ascent);
}

/** The heading set round the top of a circle, letter by letter, centred on its top. */
function drawArc(ctx: CanvasRenderingContext2D, el: SVGTextElement, { cx, cy, r }: PassLayout["arc"]) {
  const style = getComputedStyle(el);
  const text = el.textContent ?? "";
  ctx.font = fontOf(style);
  ctx.fillStyle = style.fill;
  setLetterSpacing(ctx, "0px");
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const spacing = parseFloat(style.letterSpacing) || 0;
  const widths = [...text].map((char) => ctx.measureText(char).width + spacing);
  const total = widths.reduce((sum, w) => sum + w, 0) - spacing;
  let along = -total / 2;
  for (const [i, char] of [...text].entries()) {
    const w = widths[i]!;
    const angle = (along + (w - spacing) / 2) / r;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.fillText(char, 0, -r);
    ctx.restore();
    along += w;
  }
}

/** Cream paper, a little darker towards its edges, inside one piece's outline. */
function drawPaper(ctx: CanvasRenderingContext2D, outline: Path2D, box: Rect, paper: HTMLImageElement) {
  ctx.save();
  ctx.clip(outline);
  ctx.fillStyle = "#f3e9d6";
  ctx.fillRect(box.x, box.y, box.width, box.height);
  const pattern = ctx.createPattern(paper, "repeat");
  if (pattern) {
    const k = PAPER_TILE / paper.naturalWidth;
    pattern.setTransform(new DOMMatrix([k, 0, 0, k, 0, 0]));
    ctx.fillStyle = pattern;
    ctx.fillRect(box.x, box.y, box.width, box.height);
  }
  // The same burn as the page's (an ellipse filling the piece, clear to 55 %).
  ctx.translate(box.x + box.width / 2, box.y + box.height / 2);
  ctx.scale(box.width / 2, box.height / 2);
  const burn = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.SQRT2);
  burn.addColorStop(0.55, "rgb(140 100 50 / 0)");
  burn.addColorStop(1, "rgb(140 100 50 / 0.2)");
  ctx.fillStyle = burn;
  ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();
}

function drawFrame(ctx: CanvasRenderingContext2D, frame: Rect, ink: string) {
  ctx.strokeStyle = ink;
  ctx.lineWidth = 2;
  ctx.stroke(new Path2D(framePath(frame, 14)));
  ctx.lineWidth = 1;
  const inner = { x: frame.x + FRAME_GAP, y: frame.y + FRAME_GAP, width: frame.width - 2 * FRAME_GAP, height: frame.height - 2 * FRAME_GAP };
  ctx.stroke(new Path2D(framePath(inner, 10)));
}

/** The ticket on the page (`ticket`, laid out per `layout`) as a PNG, `scale` times its size. */
export async function passPicture(ticket: HTMLElement, layout: PassLayout, scale = 2): Promise<Blob> {
  await document.fonts.ready;
  const main = ticket.querySelector<HTMLElement>('[data-piece="main"]');
  const stub = ticket.querySelector<HTMLElement>('[data-piece="stub"]');
  if (!main || !stub) throw new Error("no ticket to draw");
  const [paper, wordmark] = await Promise.all([loadImage("/textures/paper-cream.jpg"), svgImage("/brand/wordmark.svg")]);

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(layout.width * scale);
  canvas.height = Math.round(layout.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.scale(scale, scale);
  const ink = getComputedStyle(ticket).color;

  for (const [piece, outline, frame] of [
    [main, layout.main, layout.mainFrame],
    [stub, layout.stub, layout.stubFrame],
  ] as const) {
    const at = { x: piece.offsetLeft, y: piece.offsetTop };
    drawPaper(ctx, new Path2D(outlinePath(outline)), { x: at.x, y: at.y, width: piece.offsetWidth, height: piece.offsetHeight }, paper);
    drawFrame(ctx, frame, ink);
    for (const run of piece.querySelectorAll<HTMLElement>("[data-ink]")) {
      const { x, y } = offsetIn(run, piece);
      drawRun(ctx, run, { x: at.x + x, y: at.y + y });
    }
  }

  const arc = main.querySelector<SVGTextElement>("[data-arc]");
  if (arc) drawArc(ctx, arc, layout.arc);
  const w = layout.wordmark;
  ctx.drawImage(wordmark, w.x, w.y, w.width, w.height);

  // "Admit one", turned with the stub; then the moon stamp inked over the paper.
  const admit = stub.querySelector<HTMLElement>("[data-admit]");
  if (admit) {
    const style = getComputedStyle(admit);
    ctx.save();
    ctx.translate(layout.admit.x, layout.admit.y);
    ctx.rotate((layout.admit.rotate * Math.PI) / 180);
    ctx.font = fontOf(style);
    ctx.fillStyle = style.color;
    setLetterSpacing(ctx, style.letterSpacing);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(admit.textContent ?? "", 0, 0);
    ctx.restore();
  }
  const stamp = stub.querySelector<HTMLImageElement>("[data-stamp]");
  if (stamp) {
    const { x, y, size, rotate } = layout.stamp;
    ctx.save();
    ctx.globalAlpha = parseFloat(getComputedStyle(stamp).opacity) || 0.9;
    ctx.globalCompositeOperation = "multiply";
    ctx.translate(x, y);
    ctx.rotate((rotate * Math.PI) / 180);
    const height = (size * stamp.naturalHeight) / stamp.naturalWidth;
    ctx.drawImage(stamp, -size / 2, -height / 2, size, height);
    ctx.restore();
  }

  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("no picture"))), "image/png"));
}
