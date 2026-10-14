import { describe, expect, it } from "vitest";
import { PLATE } from "./plate-box";
import {
  ARM,
  BOARD,
  BOARD_PARTS,
  BUILDING_OPENINGS,
  boardQuad,
  castShadow,
  intersects,
  openedBoard,
  openedBoardSizes,
  boardFoot,
  contactShadows,
  propPlacement,
  propWindow,
  propsOnScreen,
  quadOnScreen,
  signFoot,
  signQuads,
  visitShift,
} from "./square-props";
import { type Shift, onScreen, shiftWindow, squareFrame, windowAt } from "./square-rig";
import { defaultDoor, doorShift, legAt } from "./door-rig";
import { ROOM_ROW } from "./rooms";

const landscape = [
  { width: 1536, height: 864 },
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1280, height: 1024 },
  { width: 2560, height: 1080 },
];
const portrait = [
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 360, height: 780 },
];
const all = [...landscape, ...portrait];

const quadsOf = (viewport: { width: number; height: number }) => {
  const placement = propPlacement(viewport);
  return [...signQuads(placement.sign), boardQuad(placement.board)];
};

describe("propPlacement", () => {
  it.each(all)("covers no window or door at $width×$height", (viewport) => {
    for (const quad of quadsOf(viewport)) {
      for (const opening of BUILDING_OPENINGS) {
        expect(intersects(quad.rect, opening.rect), `${quad.id} over the ${opening.name}`).toBe(false);
      }
    }
  });

  it.each(all)("keeps the signpost and the board on screen to the end of the push-in at $width×$height", (viewport) => {
    for (const view of [
      { dusk: 1, wander: 0, visit: 0 },
      { dusk: 1, wander: 1, visit: 0 },
    ]) {
      const { props } = propsOnScreen(viewport, view);
      for (const [id, prop] of Object.entries(props)) {
        if (id === "post") continue; // its foot may leave the frame as the camera closes in
        expect(prop.rect.x, id).toBeGreaterThanOrEqual(0);
        expect(prop.rect.x + prop.rect.w, id).toBeLessThanOrEqual(viewport.width);
        expect(prop.rect.y, id).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it.each(landscape)("stands the signpost and the board on the ground in frame at $width×$height", (viewport) => {
    const { props } = propsOnScreen(viewport, { dusk: 1, wander: 0, visit: 0 });
    expect(props.post.rect.y + props.post.rect.h).toBeLessThanOrEqual(viewport.height);
    expect(props.board.rect.y + props.board.rect.h).toBeLessThanOrEqual(viewport.height);
  });

  it.each(portrait)("makes every target big enough for a thumb at $width×$height", (viewport) => {
    const { props } = propsOnScreen(viewport, { dusk: 1, wander: 0, visit: 0 });
    for (const id of ["arm-cafe", "arm-barn", "arm-haunt", "board"] as const) {
      expect(Math.min(props[id].rect.w, props[id].rect.h), id).toBeGreaterThanOrEqual(44);
    }
  });

  it.each(landscape)("keeps the board clear of the tagline to the end of the push-in at $width×$height", (viewport) => {
    // The tagline's block in the bottom-left corner, as the stylesheet sets it (one line, the hint beneath).
    const clamp = (min: number, v: number, max: number) => Math.min(max, Math.max(min, v));
    const gutter = clamp(16, viewport.width * 0.028, 56);
    const font = clamp(36, viewport.width * 0.044, 84);
    const top = viewport.height - (gutter + 8 + 24 + 12 + font * 1.04);
    for (const wander of [0, 1]) {
      const { board } = propsOnScreen(viewport, { dusk: 1, wander, visit: 0 }).props;
      expect(board.rect.y + board.rect.h, `wander ${wander}`).toBeLessThanOrEqual(top);
    }
  });

  it("stacks the arms down the post without overlapping, each hung on its nail", () => {
    const quads = signQuads(propPlacement({ width: 1536, height: 864 }).sign);
    const arms = quads.filter((q) => q.id.startsWith("arm-"));
    for (let i = 1; i < arms.length; i++) {
      expect(arms[i]!.rect.y).toBeGreaterThanOrEqual(arms[i - 1]!.rect.y + arms[i - 1]!.rect.h);
    }
    for (const arm of arms) {
      expect(arm.rect.w / arm.rect.h).toBeCloseTo(ARM.width / ARM.height, 6);
      // Nailed onto the face of the post.
      expect(arm.pivot!.x).toBeGreaterThan(quads[0]!.rect.x);
      expect(arm.pivot!.x).toBeLessThan(quads[0]!.rect.x + quads[0]!.rect.w);
    }
  });

  it("throws the golden-hour shadow back and to the right, its foot on the prop's foot", () => {
    const rect = { x: 100, y: 200, w: 50, h: 300 };
    const [tl, tr, bl, br] = castShadow(rect);
    expect(bl).toEqual({ x: 100, y: 500 });
    expect(br).toEqual({ x: 150, y: 500 });
    expect(tl.x).toBeGreaterThan(bl.x);
    expect(tl.y).toBeLessThan(bl.y);
    expect(tr.x - tl.x).toBe(50);
  });

  it("keeps the props inside the plate", () => {
    for (const viewport of all) {
      for (const quad of quadsOf(viewport)) {
        expect(quad.rect.x).toBeGreaterThanOrEqual(0);
        expect(quad.rect.x + quad.rect.w).toBeLessThanOrEqual(PLATE.width);
        expect(quad.rect.y + quad.rect.h).toBeLessThanOrEqual(PLATE.height);
      }
    }
  });
});

describe("the opened board", () => {
  it.each(all)("leaves room for the header and fits the cork at $width×$height", (viewport) => {
    const board = openedBoard(viewport);
    const scale = board.w / BOARD.width;
    const { cork, cards } = BOARD_PARTS;
    expect(board.h / board.w).toBeCloseTo(BOARD.height / BOARD.width, 6);
    expect(board.y + cork.y * scale).toBeGreaterThanOrEqual(100);
    expect(board.y + (cork.y + cork.h) * scale).toBeLessThanOrEqual(viewport.height);
    // Every card is fully on screen.
    for (const card of Object.values(cards)) {
      expect(board.x + card.x * scale).toBeGreaterThanOrEqual(0);
      expect(board.x + (card.x + card.w) * scale).toBeLessThanOrEqual(viewport.width);
    }
  });

  it.each(all)("tells the browser its width on screen at $width×$height", (viewport) => {
    // The sizes list read the way a browser reads it, for this viewport.
    const length = (expr: string): number => {
      const value = expr
        .trim()
        .replace(/100vw/g, String(viewport.width))
        .replace(/100vh/g, String(viewport.height))
        .replace(/px/g, "")
        .replace(/calc|min/g, (fn) => (fn === "min" ? "Math.min" : ""));
      return Number(new Function(`return ${value}`)());
    };
    const [phone, rest] = openedBoardSizes().split(/,\s(?=min\()/);
    const narrow = viewport.width <= 639;
    const width = length(narrow ? phone!.replace("(max-width: 639px)", "") : rest!);
    // To the pixel: enough to pick the right file.
    expect(width).toBeCloseTo(openedBoard(viewport).w, 0);
  });

  it.each(all)("is where the camera lands on the board at $width×$height", (viewport) => {
    const placement = propPlacement(viewport);
    const frame = squareFrame(viewport, { dusk: 1, wander: 1 });
    const quad = boardQuad(placement.board);
    const base = propWindow(frame, quad.nearness, quad.foot);
    const shift = visitShift(viewport, frame, placement, 1, quad.nearness);
    const scaled = {
      scale: base.scale * shift.scale,
      origin: {
        x: shift.about.x + (base.origin.x - shift.about.x) * shift.scale + shift.by.x,
        y: shift.about.y + (base.origin.y - shift.about.y) * shift.scale + shift.by.y,
      },
    };
    const landed = quadOnScreen(scaled, quad.rect);
    const target = openedBoard(viewport);
    for (const key of ["x", "y", "w", "h"] as const) expect(landed[key]).toBeCloseTo(target[key], 6);
    // At rest the move does nothing.
    const still = visitShift(viewport, frame, placement, 0, quad.nearness);
    expect(still.scale).toBe(1);
    expect(still.by).toEqual({ x: 0, y: 0 });
  });

  it("moves the plate behind less than the board", () => {
    const viewport = { width: 1536, height: 864 };
    const placement = propPlacement(viewport);
    const frame = squareFrame(viewport, { dusk: 1, wander: 1 });
    const board = visitShift(viewport, frame, placement, 1, placement.board.nearness);
    const plate = visitShift(viewport, frame, placement, 1, 1);
    expect(board.scale).toBeGreaterThan(plate.scale);
    expect(plate.scale).toBeGreaterThan(1);
  });
});

describe("standing on the ground", () => {
  /** Furthest a prop's foot may slide on the plate under it, CSS px. */
  const SLIP = 0.5;

  /** Every camera move the square makes: dusk's pan, the closing push-in, and the push-in on each door. */
  const moves = (viewport: { width: number; height: number }) => {
    const views: Array<{ dusk: number; wander: number; camera?: Shift }> = [];
    for (let dusk = 0; dusk <= 1.0001; dusk += 0.125) views.push({ dusk, wander: 0 });
    for (let wander = 0; wander <= 1.0001; wander += 0.125) views.push({ dusk: 1, wander });
    const base = windowAt(squareFrame(viewport, { dusk: 1, wander: 1 }));
    for (const room of ROOM_ROW) {
      for (let ms = 0; ms <= defaultDoor.cutAt * defaultDoor.duration * 1000; ms += 20) {
        views.push({ dusk: 1, wander: 1, camera: doorShift(viewport, base, room, legAt(1, ms / 1000).j) });
      }
    }
    return views;
  };

  it.each(all)("keeps each prop's foot on its plate pixel through every camera move at $width×$height", (viewport) => {
    const placement = propPlacement(viewport);
    const feet = [
      ...[...signQuads(placement.sign), boardQuad(placement.board)].map((q) => ({ id: q.id, nearness: q.nearness, foot: q.foot })),
      ...contactShadows(placement).map((s, i) => ({ id: `shadow ${i}`, nearness: s.nearness, foot: s.foot })),
    ];
    for (const view of moves(viewport)) {
      const frame = squareFrame(viewport, view);
      const lay = (w: ReturnType<typeof windowAt>) => (view.camera ? shiftWindow(w, view.camera) : w);
      const plate = lay(windowAt(frame, 1));
      for (const { id, nearness, foot } of feet) {
        const onPlate = onScreen(plate, foot.x, foot.y);
        const onProp = onScreen(lay(propWindow(frame, nearness, foot)), foot.x, foot.y);
        const slip = Math.hypot(onProp.x - onPlate.x, onProp.y - onPlate.y);
        expect(slip, `${id} at dusk ${view.dusk.toFixed(2)}, wander ${view.wander.toFixed(2)}`).toBeLessThanOrEqual(SLIP);
      }
    }
  });

  it.each(all)("draws the post and the board standing on those feet at $width×$height", (viewport) => {
    const placement = propPlacement(viewport);
    for (const view of moves(viewport).filter((v) => !v.camera)) {
      const { props, plate } = propsOnScreen(viewport, { ...view, visit: 0 });
      for (const [id, foot] of [
        ["post", signFoot(placement.sign)],
        ["board", boardFoot(placement.board)],
      ] as const) {
        const { rect } = props[id];
        const ground = onScreen(plate, foot.x, foot.y);
        expect(Math.abs(rect.x + rect.w / 2 - ground.x), id).toBeLessThanOrEqual(SLIP);
        expect(Math.abs(rect.y + rect.h - ground.y), id).toBeLessThanOrEqual(SLIP);
      }
    }
  });

  it("still grows nearer props faster than the plate as the camera closes in", () => {
    const viewport = { width: 1536, height: 864 };
    const placement = propPlacement(viewport);
    const frame = squareFrame(viewport, { dusk: 1, wander: 1 });
    expect(propWindow(frame, placement.sign.nearness, signFoot(placement.sign)).scale).toBeGreaterThan(windowAt(frame, 1).scale);
  });
});
