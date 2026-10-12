/**
 * Things that stand on the square in front of the plate: the signpost and the
 * notice board. They are cut-out layers placed in square plate pixels, each
 * at its own nearness (how much closer than the plate it is), standing on
 * the ground with a contact shadow at its foot. Landscape and portrait
 * screens get their own placement, worked out from the part of the plate the
 * screen actually shows.
 */
import { PLATE, type Size } from "./plate-box";
import type { PlateWindow } from "./gate-rig";
import { type Shift, type SquareFrame, type Vec2, onScreen, shiftWindow, squareFrame, windowAt } from "./square-rig";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ArmId = "cafe" | "barn" | "haunt";

/** Source sizes of the layers in public/layers. */
export const POST = { width: 261, height: 1027 } as const;
export const ARM = { width: 1331, height: 323 } as const;
export const BOARD = { width: 1345, height: 2226 } as const;

/** Each arm hangs on a nail, given as a share of the arm image; the haunt shop points the other way. */
export const ARMS: ReadonlyArray<{ id: ArmId; nail: Vec2; points: "left" | "right" }> = [
  { id: "cafe", nail: { x: 0.939, y: 0.49 }, points: "left" },
  { id: "barn", nail: { x: 0.937, y: 0.49 }, points: "left" },
  { id: "haunt", nail: { x: 0.061, y: 0.5 }, points: "right" },
];

/** The painted face of an arm, where its label goes, as shares of the arm image. */
export const ARM_FACE: Readonly<Record<"left" | "right", Rect>> = {
  left: { x: 0.11, y: 0.1, w: 0.74, h: 0.8 },
  right: { x: 0.12, y: 0.1, w: 0.74, h: 0.8 },
};

/** The board in the lantern's light, as the camera arrives on it: baked by `pnpm square`, never filtered on the page. */
export const OPENED_BOARD = "/img/square/board-open.webp";
export const OPENED_BOARD_AVIF = "/img/square/board-open.avif";

/** Notice board landmarks, in pixels of noticeboard.png. */
export const BOARD_PARTS = {
  cork: { x: 320, y: 480, w: 725, h: 935 },
  lantern: { x: 150, y: 668, r: 70 },
  /** Feet of the two legs. */
  feet: [
    { x: 229, y: 2226 },
    { x: 1127, y: 2226 },
  ],
  /** The blank cards pinned to the cork, with their tilt in degrees. */
  cards: {
    hours: { x: 368, y: 532, w: 284, h: 400, rotate: 0 },
    whatsOn: { x: 770, y: 572, w: 233, h: 320, rotate: 1.4 },
    note: { x: 572, y: 806, w: 248, h: 332, rotate: -3.3 },
    map: { x: 368, y: 992, w: 272, h: 366, rotate: -1 },
    drawings: { x: 708, y: 980, w: 314, h: 386, rotate: 3.6 },
  },
} as const;

/**
 * Windows and doors of the three buildings in square plate pixels. Nothing
 * placed on the square may cover them.
 */
export const BUILDING_OPENINGS: ReadonlyArray<{ name: string; rect: Rect }> = [
  { name: "barn door", rect: { x: 445, y: 695, w: 155, h: 235 } },
  { name: "barn transom", rect: { x: 440, y: 640, w: 152, h: 52 } },
  { name: "barn hayloft", rect: { x: 450, y: 420, w: 150, h: 200 } },
  { name: "café front", rect: { x: 1165, y: 615, w: 251, h: 227 } },
  { name: "café wing", rect: { x: 1475, y: 752, w: 137, h: 90 } },
  { name: "shop windows", rect: { x: 1975, y: 640, w: 259, h: 266 } },
  { name: "shop upper window", rect: { x: 2060, y: 484, w: 28, h: 86 } },
];

export interface SignPlacement {
  /** Centre of the post, plate x. */
  x: number;
  /** Where the post meets the ground, plate y. */
  ground: number;
  /** Height of the post, plate px. */
  height: number;
  /** Width of one arm, plate px. */
  arm: number;
  nearness: number;
}

export interface BoardPlacement {
  /** Centre between the legs, plate x. */
  x: number;
  ground: number;
  height: number;
  nearness: number;
}

export interface PropPlacement {
  sign: SignPlacement;
  board: BoardPlacement;
}

/** The part of the plate a screen shows when the square is at rest. */
export function visiblePlate(viewport: Size): Rect {
  const { base } = squareFrame(viewport, { dusk: 1, wander: 0 });
  const x = -base.origin.x / base.scale;
  const y = -base.origin.y / base.scale;
  return { x, y, w: viewport.width / base.scale, h: viewport.height / base.scale };
}

/** Plate pixels per CSS pixel at rest. */
const platePerCss = (viewport: Size) => 1 / squareFrame(viewport, { dusk: 1, wander: 0 }).base.scale;

/** Window of a layer at this nearness at the end of the closing push-in, which carries near things outwards. */
const endWindow = (viewport: Size, nearness: number) => windowAt(squareFrame(viewport, { dusk: 1, wander: 1 }), nearness);

/**
 * Furthest right a point at this nearness may stand (plate x) and still be
 * `margin` CSS px inside the screen at the end of the push-in.
 */
export function rightLimit(viewport: Size, nearness: number, margin: number): number {
  const w = endWindow(viewport, nearness);
  return (viewport.width - margin - w.origin.x) / w.scale;
}

/** Post height per unit of arm width. */
const POST_PER_ARM = 1.36;

/**
 * Arms are nailed off the post's centre, their butt ends towards its far
 * side, as on a real signpost: this share of the post's width.
 */
const NAIL_OFFSET = 0.3;

const postWidthOf = (height: number) => (height * POST.width) / POST.height;

/** From the post's centre line to the tip of an arm, plate px. */
const armReach = (arm: number, height: number) => arm * (1 - ARMS[2]!.nail.x) - NAIL_OFFSET * postWidthOf(height);

/** Lowest edge of the shop windows (plate y): the whole signpost stands below it. */
const BELOW_WINDOWS = 912;

/**
 * Where the props stand. Landscape: the signpost on the right verge in the
 * foreground, its arms below the shop windows and inside the frame to the
 * end of the push-in; the board at the left edge of the road, between the
 * barn door and the café, clear of the tagline. Portrait: the frame ends on
 * the café, so the signpost stands in the foreground under it, centred and
 * big enough for a thumb, and the board to the café's left.
 */
export function propPlacement(viewport: Size): PropPlacement {
  const view = visiblePlate(viewport);
  const perCss = platePerCss(viewport);
  const bottom = view.y + view.h;
  if (viewport.width / viewport.height < 4 / 5) {
    const nearness = 1.5;
    const end = endWindow(viewport, nearness);
    // Arms 48 CSS px tall where the screen allows, never under 44: the whole arm is the button.
    const armFor = (cssHeight: number) => (cssHeight * perCss * ARM.width) / ARM.height;
    const halfSpan = (arm: number) => armReach(arm, arm * POST_PER_ARM) * end.scale;
    const fits = (viewport.width / 2 - 8) / halfSpan(1);
    const arm = Math.max(armFor(44), Math.min(armFor(48), fits));
    const height = arm * POST_PER_ARM;
    return {
      sign: {
        x: (viewport.width / 2 - end.origin.x) / end.scale,
        ground: Math.min(PLATE.height - 18, bottom - 10 * perCss),
        height,
        arm,
        nearness,
      },
      board: { x: Math.max(view.x + 70 * perCss, 1010), ground: 1004, height: 168, nearness: 1.3 },
    };
  }
  const nearness = 1.7;
  const ground = Math.min(1332, bottom - 28 * perCss);
  // A shorter post where a wide screen shows less of the ground, so it stays below the windows.
  const height = Math.min(300 * POST_PER_ARM, ground - BELOW_WINDOWS);
  const arm = height / POST_PER_ARM;
  return {
    sign: { x: Math.min(2140, rightLimit(viewport, nearness, 24) - armReach(arm, height)), ground, height, arm, nearness },
    board: { x: 704, ground: 1000, height: 214, nearness: 1.35 },
  };
}

export interface PropQuad {
  id: "post" | `arm-${ArmId}` | "board";
  /** Rectangle on the plate, before any turn. */
  rect: Rect;
  nearness: number;
  /** Arms turn about their nail (plate px). */
  pivot?: Vec2;
}

export interface ContactShadow {
  /** Centre on the plate and radii, plate px. */
  x: number;
  y: number;
  rx: number;
  ry: number;
  nearness: number;
  strength: number;
}

const armHeight = (width: number) => (width * ARM.height) / ARM.width;

/** The signpost as quads: the post, then the three arms stacked down it. */
export function signQuads(sign: SignPlacement): PropQuad[] {
  const postWidth = postWidthOf(sign.height);
  const top = sign.ground - sign.height;
  const h = armHeight(sign.arm);
  const quads: PropQuad[] = [
    { id: "post", rect: { x: sign.x - postWidth / 2, y: top, w: postWidth, h: sign.height }, nearness: sign.nearness },
  ];
  ARMS.forEach((arm, i) => {
    // The nail sits on the post's face, towards the arm's butt end.
    const side = arm.points === "left" ? 1 : -1;
    const nail = { x: sign.x + side * NAIL_OFFSET * postWidth, y: top + sign.height * 0.11 + h * (0.5 + i * 1.1) };
    quads.push({
      id: `arm-${arm.id}`,
      rect: { x: nail.x - arm.nail.x * sign.arm, y: nail.y - arm.nail.y * h, w: sign.arm, h },
      nearness: sign.nearness,
      pivot: nail,
    });
  });
  return quads;
}

export function boardQuad(board: BoardPlacement): PropQuad {
  const w = (board.height * BOARD.width) / BOARD.height;
  return { id: "board", rect: { x: board.x - w / 2, y: board.ground - board.height, w, h: board.height }, nearness: board.nearness };
}

export function contactShadows(placement: PropPlacement): ContactShadow[] {
  const { sign, board } = placement;
  const postWidth = (sign.height * POST.width) / POST.height;
  const boardScale = board.height / BOARD.height;
  const boardLeft = board.x - (BOARD.width * boardScale) / 2;
  return [
    { x: sign.x, y: sign.ground - 2, rx: postWidth * 1.25, ry: postWidth * 0.22, nearness: sign.nearness, strength: 0.55 },
    ...BOARD_PARTS.feet.map((foot) => ({
      x: boardLeft + foot.x * boardScale,
      y: board.ground - 2,
      rx: 160 * boardScale,
      ry: 36 * boardScale,
      nearness: board.nearness,
      strength: 0.5,
    })),
    // The roof and body throw a broad soft patch between the legs.
    { x: board.x, y: board.ground - 4, rx: BOARD.width * boardScale * 0.62, ry: 70 * boardScale, nearness: board.nearness, strength: 0.22 },
  ];
}

/** A prop's rectangle on screen for a window (ignoring an arm's small turn). */
export function quadOnScreen(window: PlateWindow, rect: Rect): Rect {
  const a = onScreen(window, rect.x, rect.y);
  return { x: a.x, y: a.y, w: rect.w * window.scale, h: rect.h * window.scale };
}

export const intersects = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// ---------------------------------------------------------------- the visit

/** The cards' reach across the cork, in board pixels. */
const CARD_SPAN = { x: 360, w: 670 };

/** Space kept clear for the header above the opened board, CSS px. */
const HEADER_ROOM = 112;

/**
 * Where the board stands on screen once it is opened, CSS px: the cork as
 * large as fits under the header (on phones, as wide as the screen allows),
 * centred, the roof and lantern above it, the legs running off the bottom.
 */
export function openedBoard(viewport: Size): Rect {
  const { cork } = BOARD_PARTS;
  const narrow = viewport.width < 640;
  // On a phone the cards themselves fill the width; the cork's frame may run off the edges.
  const fit = narrow ? CARD_SPAN : cork;
  const side = narrow ? 8 : 32;
  const room = { w: viewport.width - 2 * side, h: viewport.height - HEADER_ROOM - 24 };
  const scale = Math.min(room.w / fit.w, room.h / cork.h);
  const corkTop = HEADER_ROOM + Math.max(0, (room.h - cork.h * scale) / 2);
  const x = viewport.width / 2 - (fit.x + fit.w / 2) * scale;
  return { x, y: corkTop - cork.y * scale, w: BOARD.width * scale, h: BOARD.height * scale };
}

/**
 * The camera move onto the board, `progress` 0–1: the board flies from where
 * it stands to its opened place; every other layer moves with it, less the
 * further away it is, so the plate behind barely grows.
 */
export function visitShift(viewport: Size, frame: SquareFrame, placement: PropPlacement, progress: number, nearness: number): Shift {
  const quad = boardQuad(placement.board);
  const from = quadOnScreen(windowAt(frame, placement.board.nearness), quad.rect);
  const to = openedBoard(viewport);
  const e = Math.min(1, Math.max(0, progress));
  const about = { x: from.x + from.w / 2, y: from.y + from.h / 2 };
  const target = { x: to.x + to.w / 2, y: to.y + to.h / 2 };
  const scale = Math.pow(to.w / from.w, (e * nearness) / placement.board.nearness);
  return { scale, about, by: { x: (target.x - about.x) * e, y: (target.y - about.y) * e } };
}

export interface PropOnScreen {
  /** The prop's rectangle on screen before any turn, CSS px. */
  rect: Rect;
  /** Arms turn about this screen point. */
  pivot?: Vec2;
}

export interface ShadowOnScreen {
  x: number;
  y: number;
  rx: number;
  ry: number;
  strength: number;
}

export interface SceneView {
  dusk: number;
  wander: number;
  visit: number;
}

/**
 * Every prop and contact shadow on screen for one moment of the square: the
 * very geometry the WebGL scene draws, for the page's buttons and links (and
 * for the plain-HTML square where WebGL is off). `pan: false` holds the
 * portrait camera on the café.
 */
export function propsOnScreen(
  viewport: Size,
  view: SceneView,
  options: { pan?: boolean } = {},
): { props: Record<PropQuad["id"], PropOnScreen>; shadows: ShadowOnScreen[]; plate: PlateWindow } {
  const frame = squareFrame(viewport, view, options);
  const placement = propPlacement(viewport);
  const windowFor = (nearness: number): PlateWindow => {
    const w = windowAt(frame, nearness);
    return view.visit > 0 ? shiftWindow(w, visitShift(viewport, frame, placement, view.visit, nearness)) : w;
  };
  const props = {} as Record<PropQuad["id"], PropOnScreen>;
  for (const quad of [...signQuads(placement.sign), boardQuad(placement.board)]) {
    const w = windowFor(quad.nearness);
    props[quad.id] = {
      rect: quadOnScreen(w, quad.rect),
      ...(quad.pivot ? { pivot: onScreen(w, quad.pivot.x, quad.pivot.y) } : {}),
    };
  }
  const shadows = contactShadows(placement).map((s) => {
    const w = windowFor(s.nearness);
    const c = onScreen(w, s.x, s.y);
    return { x: c.x, y: c.y, rx: s.rx * w.scale, ry: s.ry * w.scale, strength: s.strength };
  });
  return { props, shadows, plate: windowFor(1) };
}

/**
 * Light on the props: as photographed at golden hour, cooler and lower at
 * dusk, and warm by the lantern once the board is opened. The opened board
 * is the same image in HTML with the same tint, so the hand-over is seamless.
 */
export const PROP_TINT = {
  golden: [1.0, 0.96, 0.9],
  dusk: [0.76, 0.66, 0.62],
  open: [1.0, 0.93, 0.84],
} as const;
