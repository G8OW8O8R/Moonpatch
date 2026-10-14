/**
 * The square after the ride, drawn in the gate's WebGL context with the very
 * square-golden texture the ride ends on, so the hand-over is exact. Dusk
 * falls through dusk-base, each light comes on by itself, and the signpost
 * and notice board stand in front, lit by the same light as the plate around
 * them and standing in their own shadows.
 */
import type { PlateWindow } from "@/lib/gate-rig";
import { PLATE, type Size } from "@/lib/plate-box";
import { type BurningLight, type LightKind, LANTERN, PROP_LIGHT, WARM, type WarmLight, duskLight, warmLight } from "@/lib/prop-light";
import {
  type ArmId,
  BOARD_PARTS,
  BOARD,
  CAST,
  PROP_TINT as TINT,
  type PropPlacement,
  type PropQuad,
  boardQuad,
  castShadow,
  contactShadows,
  propPlacement,
  propWindow,
  signQuads,
  visitShift,
} from "@/lib/square-props";
import { type Shift, type Vec2, flicker, gradeAt, lightLevel, shiftWindow, squareFrame, windowAt } from "@/lib/square-rig";
import lightsManifest from "@/components/square/lights.json";
import {
  type Corner,
  type GL,
  type Program,
  type Quad,
  type Target,
  createMipTarget,
  createQuad,
  createTexture,
  deleteTarget,
  drawQuad,
  finishProgram,
  startProgram,
  whenCompiled,
} from "./gl";
import { castFragment, contactFragment, defocusFragment, propFragment, screenVertex, squareFragment } from "./square-shaders";

export interface SquareState {
  /** Followed dusk progress, 0–1. */
  dusk: number;
  /** Followed closing push-in, 0–1. */
  wander: number;
  /** Camera move onto the notice board, 0–1. */
  visit: number;
  /** Turn of each signpost arm on its nail, radians. */
  arms: Record<ArmId, number>;
  /** How far each arm and the board are pointed at (hover, focus), 0–1. */
  pointed: Record<ArmId | "board", number>;
  /** The props answer the pointer (they always stand in the scene; this only matters to the page). */
  props: number;
}

export const restingSquare: SquareState = {
  dusk: 0,
  wander: 0,
  visit: 0,
  arms: { cafe: 0, barn: 0, haunt: 0 },
  pointed: { cafe: 0, barn: 0, haunt: 0, board: 0 },
  props: 0,
};

export interface SquareImages {
  base: ImageBitmap;
  lights: ImageBitmap;
  ids: ImageBitmap;
  props: Record<PropQuad["id"], ImageBitmap>;
  /** Faint handwriting on the board's cards. */
  writing: ImageBitmap;
}

interface LightEntry {
  id: number;
  kind: LightKind;
  x: number;
  y: number;
  order: number;
}

const lights = lightsManifest.lights as LightEntry[];

/** Each light's flicker as the plate draws it: bulbs breathe a little, windows barely. */
const FLICKER_DEPTH: Record<LightKind, number> = { bulb: 0.015, lamp: 0.03, window: 0.006 };

/** Sign paint, multiplied into the wood: dark brown, so the wood still shows through. */
const SIGN_PAINT = [0.31, 0.25, 0.21] as const;

/** Pencil on the board's cards. */
const PENCIL = [0.5, 0.47, 0.47] as const;

/** What a frame's light is made of, shared by every prop. */
interface SceneLight {
  grade: number;
  dpr: number;
  width: number;
  height: number;
}

/** How one prop is drawn this frame. */
interface PropLook {
  alpha: number;
  /** Turn about its nail, radians. */
  angle: number;
  pointed: number;
  warm: WarmLight;
  label: WebGLTexture | undefined;
  paint: readonly [number, number, number];
  wear: number;
  labelAmount?: number;
  /** The board up close, 0–1. */
  open?: number;
  lantern?: number;
  /** One of the signpost's planks or its post: dusk's light on them is their own. */
  sign?: boolean;
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** A prop's window for its nearness and foot. */
type WindowFor = (nearness: number, foot: Vec2) => PlateWindow;

/** Props that arrive after the scene is already on screen come in over this long, ms. */
const LATE_ARRIVAL = 400;

export class SquareRenderer {
  private readonly gl: GL;
  private readonly plate: Program;
  private readonly prop: Program;
  private readonly contact: Program;
  private readonly cast: Program;
  private readonly defocus: Program;
  private readonly quad: Quad;
  private readonly emptyVao: WebGLVertexArrayObject;
  private readonly golden: WebGLTexture;
  private base: WebGLTexture | null = null;
  private lightsTex: WebGLTexture | null = null;
  private ids: WebGLTexture | null = null;
  private writing: WebGLTexture | null = null;
  private readonly levels: WebGLTexture;
  private readonly levelData = new Uint8Array(256 * 4);
  /** Every light as it burns this frame, for the props' reflections. */
  private readonly burning: BurningLight[] = lights.map((l) => ({ kind: l.kind, x: l.x, y: l.y, level: 0, flicker: 1 }));
  private readonly props = new Map<PropQuad["id"], WebGLTexture>();
  private readonly labels = new Map<ArmId, WebGLTexture>();
  private frame: Target | null = null;
  /** When the props reached the GPU (performance.now()). */
  private propsAt = 0;

  static async create(gl: GL, golden: WebGLTexture, frame: () => Promise<void>): Promise<SquareRenderer> {
    const programs = [
      startProgram(gl, fullscreen, squareFragment),
      startProgram(gl, screenVertex, propFragment),
      startProgram(gl, screenVertex, contactFragment),
      startProgram(gl, screenVertex, castFragment),
      startProgram(gl, fullscreen, defocusFragment),
    ];
    await whenCompiled(gl, programs, frame);
    return new SquareRenderer(gl, golden, programs.map((p) => finishProgram(gl, p)));
  }

  private constructor(gl: GL, golden: WebGLTexture, programs: Program[]) {
    this.gl = gl;
    this.golden = golden;
    [this.plate, this.prop, this.contact, this.cast, this.defocus] = programs as [Program, Program, Program, Program, Program];
    this.quad = createQuad(gl);
    this.emptyVao = gl.createVertexArray();
    this.levels = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.levels);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.levelData);
    for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, p, gl.NEAREST);
  }

  /** Uploads the dusk plates and the props, a piece at a time. */
  async upload(images: SquareImages, pause: () => Promise<void>) {
    const { gl } = this;
    this.base = createTexture(gl, images.base);
    images.base.close();
    await pause();
    this.lightsTex = createTexture(gl, images.lights);
    images.lights.close();
    await pause();
    // Light ids must never be blended between neighbours.
    const ids = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, ids);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, images.ids);
    for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, p, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    images.ids.close();
    this.ids = ids;
    await pause();
    this.writing = createTexture(gl, images.writing);
    images.writing.close();
    for (const [id, bitmap] of Object.entries(images.props) as [PropQuad["id"], ImageBitmap][]) {
      this.props.set(id, createTexture(gl, bitmap, { anisotropy: 4 }));
      bitmap.close();
      await pause();
    }
    this.propsAt = performance.now();
  }

  setLabel(arm: ArmId, bitmap: ImageBitmap) {
    const { gl } = this;
    const old = this.labels.get(arm);
    if (old) gl.deleteTexture(old);
    this.labels.set(arm, createTexture(gl, bitmap));
    bitmap.close();
  }

  /** Lit once the dusk plates are on the GPU. */
  get ready(): boolean {
    return !!(this.base && this.lightsTex && this.ids);
  }

  /**
   * Draws a frame onto the canvas, or into `into` (a frame buffer of the canvas's size), with the
   * whole scene moved by `camera` on top of its own framing (the push-in on a door).
   */
  render(
    state: SquareState,
    css: Size,
    dpr: number,
    seconds: number,
    canvas: { width: number; height: number },
    { into = null, camera, bare = false }: { into?: WebGLFramebuffer | null; camera?: Shift; bare?: boolean } = {},
  ) {
    const { gl } = this;
    const width = canvas.width;
    const height = canvas.height;
    const frame = squareFrame(css, state);
    const placement = propPlacement(css);
    const visit = state.visit;
    const lay = (w: PlateWindow, nearness: number): PlateWindow => {
      const seen = visit > 0 ? shiftWindow(w, visitShift(css, frame, placement, visit, nearness)) : w;
      return camera ? shiftWindow(seen, camera) : seen;
    };
    const plateWindow = lay(windowAt(frame, 1), 1);
    // Each prop grows about its own foot, which stays on its plate pixel through every move.
    const windowFor: WindowFor = (nearness, foot) => lay(propWindow(frame, nearness, foot), nearness);

    this.updateLevels(state.dusk, seconds);

    // Behind an opened board the scene goes out of focus: draw it into a buffer first.
    const defocus = visit > 0.001;
    if (defocus) {
      if (!this.frame || this.frame.width !== width || this.frame.height !== height) {
        if (this.frame) deleteTarget(gl, this.frame);
        this.frame = createMipTarget(gl, width, height);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.frame.framebuffer);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, into);
    }
    gl.viewport(0, 0, width, height);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);

    const grade = gradeAt(state.dusk);
    this.drawPlate(plateWindow, grade, dpr, width, height, visit);

    // The props stand in the scene from the ride on; only light changes on them.
    const propsAlpha = bare ? 0 : this.propsAlpha();
    const scene: SceneLight = { grade, dpr, width, height };
    if (propsAlpha > 0.001) {
      this.drawShadows(placement, windowFor, scene, propsAlpha * (1 - visit));
      // The signpost in front, sharp or not: it stays behind the board when the board comes forward.
      this.drawSign(placement, windowFor, scene, state, propsAlpha);
    }

    if (defocus && this.frame) {
      gl.disable(gl.BLEND);
      gl.bindFramebuffer(gl.FRAMEBUFFER, into);
      gl.bindTexture(gl.TEXTURE_2D, this.frame.texture);
      gl.generateMipmap(gl.TEXTURE_2D);
      const p = this.defocus;
      gl.useProgram(p.program);
      gl.bindVertexArray(this.emptyVao);
      gl.uniform2f(p.uniform("uViewport"), width, height);
      gl.uniform1f(p.uniform("uRadius"), 7 * dpr * visit);
      gl.uniform1f(p.uniform("uLod"), 2.2 * visit);
      this.bind(p, "uFrame", this.frame.texture, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // The board, sharp, on top: it is what the camera moves onto.
    if (propsAlpha > 0.001 || visit > 0) this.drawBoard(placement, windowFor, scene, state, Math.max(propsAlpha, visit), seconds);
    gl.disable(gl.BLEND);
  }

  /**
   * The signpost and the board as the ride through the gate sees them: on the golden plate, in the
   * plate's own window (the ride moves them exactly as the plate), lit as the square lights them at
   * the start of dusk. Drawn straight after the square, behind the road, the leaves and the arch.
   */
  renderStanding(window: PlateWindow, css: Size, dpr: number, seconds: number, canvas: { width: number; height: number }, alpha: number) {
    const shown = alpha * this.propsAlpha();
    if (shown <= 0.001 || !this.ready) return;
    const { gl } = this;
    this.updateLevels(0, seconds);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    const placement = propPlacement(css);
    const windowFor: WindowFor = () => window;
    const scene: SceneLight = { grade: 0, dpr, width: canvas.width, height: canvas.height };
    const state = restingSquare;
    this.drawShadows(placement, windowFor, scene, shown);
    this.drawSign(placement, windowFor, scene, state, shown);
    this.drawBoard(placement, windowFor, scene, state, shown, seconds);
    gl.disable(gl.BLEND);
  }

  dispose() {
    const { gl } = this;
    for (const t of [this.base, this.lightsTex, this.ids, this.levels, this.writing]) if (t) gl.deleteTexture(t);
    for (const t of this.props.values()) gl.deleteTexture(t);
    for (const t of this.labels.values()) gl.deleteTexture(t);
    if (this.frame) deleteTarget(gl, this.frame);
    for (const p of [this.plate, this.prop, this.contact, this.cast, this.defocus]) gl.deleteProgram(p.program);
  }

  // ------------------------------------------------------------ internals

  /** The props are on the GPU (and, if they came late, have had their moment to arrive). */
  private propsAlpha(): number {
    if (!this.props.size) return 0;
    return Math.min(1, (performance.now() - this.propsAt) / LATE_ARRIVAL);
  }

  /** Shadows, multiplied into the ground: the soft dark at each foot, then what the low sun throws. */
  private drawShadows(placement: PropPlacement, windowFor: WindowFor, scene: SceneLight, alpha: number) {
    const { gl } = this;
    const { dpr, width, height, grade } = scene;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_COLOR);
    const c = this.contact;
    gl.useProgram(c.program);
    gl.uniform2f(c.uniform("uViewport"), width, height);
    for (const shadow of contactShadows(placement)) {
      const w = windowFor(shadow.nearness, shadow.foot);
      gl.uniform1f(c.uniform("uStrength"), shadow.strength * alpha);
      this.drawRect(w, { x: shadow.x - shadow.rx, y: shadow.y - shadow.ry, w: shadow.rx * 2, h: shadow.ry * 2 }, dpr);
    }
    const cast = CAST.strength * (1 - grade) * alpha;
    if (cast > 0.001) {
      const p = this.cast;
      gl.useProgram(p.program);
      gl.uniform2f(p.uniform("uViewport"), width, height);
      gl.uniform1f(p.uniform("uStrength"), cast);
      for (const quad of [signQuads(placement.sign)[0]!, boardQuad(placement.board)]) {
        const texture = this.props.get(quad.id);
        if (!texture) continue;
        this.bind(p, "uTexture", texture, 0);
        const w = windowFor(quad.nearness, quad.foot);
        const [tl, tr, bl, br] = castShadow(quad.rect).map(
          (pt, i): Corner => ({
            x: (w.origin.x + w.scale * pt.x) * dpr,
            y: (w.origin.y + w.scale * pt.y) * dpr,
            z: 0,
            u: i % 2,
            v: i < 2 ? 0 : 1,
          }),
        ) as [Corner, Corner, Corner, Corner];
        drawQuad(gl, this.quad, [tl, tr, bl, br]);
      }
    }
  }

  private drawSign(placement: PropPlacement, windowFor: WindowFor, scene: SceneLight, state: SquareState, alpha: number) {
    const { gl } = this;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const warm = this.warmAt(placement.sign.x, placement.sign.ground - placement.sign.height * 0.6);
    for (const quad of signQuads(placement.sign)) {
      const arm = quad.id.startsWith("arm-") ? (quad.id.slice(4) as ArmId) : null;
      this.drawProp(quad, windowFor(quad.nearness, quad.foot), scene, {
        alpha,
        angle: arm ? state.arms[arm] : 0,
        pointed: arm ? state.pointed[arm] : 0,
        warm,
        label: arm ? this.labels.get(arm) : undefined,
        paint: SIGN_PAINT,
        wear: 1,
        sign: true,
      });
    }
  }

  /** The board; its lantern comes on with the lights, and burns whenever the board is open. */
  private drawBoard(placement: PropPlacement, windowFor: WindowFor, scene: SceneLight, state: SquareState, alpha: number, seconds: number) {
    const { gl } = this;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const visit = state.visit;
    const board = boardQuad(placement.board);
    const lit = Math.max(lightLevel(LANTERN.order, state.dusk), visit);
    this.drawProp(board, windowFor(board.nearness, board.foot), scene, {
      alpha,
      angle: 0,
      pointed: state.pointed.board * (1 - visit),
      warm: this.warmAt(placement.board.x, placement.board.ground - placement.board.height * 0.6),
      label: this.writing ?? undefined,
      paint: PENCIL,
      wear: 0,
      // The writing goes as the camera arrives; the cards up close carry the real words.
      labelAmount: 1 - smoothstep(0.35, 0.9, visit),
      open: visit,
      lantern: lit * flicker(LANTERN.flickerId, seconds, LANTERN.flickerDepth),
    });
  }

  private updateLevels(dusk: number, seconds: number) {
    const data = this.levelData;
    lights.forEach((light, i) => {
      const level = lightLevel(light.order, dusk);
      const beat = flicker(light.id, seconds, FLICKER_DEPTH[light.kind]);
      data[light.id * 4] = Math.round(level * 255);
      // Flicker as 0.94–1.06 around 0.5.
      data[light.id * 4 + 1] = Math.round(((beat - 0.94) / 0.12) * 255);
      // The props' reflections take the very same level and beat.
      const burning = this.burning[i]!;
      burning.level = level;
      burning.flicker = beat;
    });
    const { gl } = this;
    gl.bindTexture(gl.TEXTURE_2D, this.levels);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 1, gl.RGBA, gl.UNSIGNED_BYTE, data);
  }

  /** Lamplight reaching a point of the plate from the lights around it, in the beat of the nearest. */
  private warmAt(x: number, y: number): WarmLight {
    return warmLight({ x, y }, this.burning);
  }

  private bind(program: Program, name: string, texture: WebGLTexture | null, unit: number) {
    const { gl } = this;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(program.uniform(name), unit);
  }

  private drawPlate(window: PlateWindow, grade: number, dpr: number, width: number, height: number, visit: number) {
    const { gl } = this;
    const p = this.plate;
    gl.useProgram(p.program);
    gl.bindVertexArray(this.emptyVao);
    gl.uniform2f(p.uniform("uViewport"), width, height);
    gl.uniform2f(p.uniform("uOrigin"), window.origin.x * dpr, window.origin.y * dpr);
    gl.uniform1f(p.uniform("uScale"), window.scale * dpr);
    gl.uniform2f(p.uniform("uPlate"), PLATE.width, PLATE.height);
    gl.uniform1f(p.uniform("uGrade"), grade);
    gl.uniform1f(p.uniform("uCool"), 1);
    gl.uniform1f(p.uniform("uBloom"), 0.32);
    gl.uniform1f(p.uniform("uLit"), this.ready ? 1 : 0);
    gl.uniform1f(p.uniform("uDim"), 0.55 * visit);
    this.bind(p, "uGolden", this.golden, 0);
    this.bind(p, "uBase", this.base ?? this.golden, 1);
    this.bind(p, "uLights", this.lightsTex ?? this.golden, 2);
    this.bind(p, "uIds", this.ids ?? this.levels, 3);
    this.bind(p, "uLevels", this.levels, 4);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** An axis-aligned plate rectangle as a quad in device pixels. */
  private drawRect(window: PlateWindow, rect: { x: number; y: number; w: number; h: number }, dpr: number) {
    const at = (x: number, y: number, u: number, v: number): Corner => ({
      x: (window.origin.x + window.scale * x) * dpr,
      y: (window.origin.y + window.scale * y) * dpr,
      z: 0,
      u,
      v,
    });
    const { x, y, w, h } = rect;
    drawQuad(this.gl, this.quad, [at(x, y, 0, 0), at(x + w, y, 1, 0), at(x, y + h, 0, 1), at(x + w, y + h, 1, 1)]);
  }

  private drawProp(quad: PropQuad, window: PlateWindow, scene: SceneLight, look: PropLook) {
    const texture = this.props.get(quad.id);
    if (!texture) return;
    const { gl } = this;
    const { dpr } = scene;
    const p = this.prop;
    gl.useProgram(p.program);
    gl.uniform2f(p.uniform("uViewport"), scene.width, scene.height);
    gl.uniform2f(p.uniform("uOrigin"), window.origin.x * dpr, window.origin.y * dpr);
    gl.uniform1f(p.uniform("uScale"), window.scale * dpr);
    gl.uniform2f(p.uniform("uPlate"), PLATE.width, PLATE.height);
    gl.uniform1f(p.uniform("uAirLod"), PROP_LIGHT.airLod);
    gl.uniform3f(p.uniform("uKey"), ...PROP_LIGHT.golden);
    gl.uniform3f(p.uniform("uDusk"), ...duskLight(!!look.sign));
    gl.uniform1f(p.uniform("uGrade"), scene.grade);
    gl.uniform1f(p.uniform("uCool"), 1);
    gl.uniform3f(p.uniform("uOpenTint"), ...TINT.open);
    gl.uniform1f(p.uniform("uOpen"), look.open ?? 0);

    // Lamplight across the face and on the rims turned towards it.
    const warm = look.warm.strength * PROP_LIGHT.warm;
    gl.uniform3f(p.uniform("uWarm"), WARM[0] * warm, WARM[1] * warm, WARM[2] * warm);
    gl.uniform2f(p.uniform("uWarmDir"), look.warm.dir.x, look.warm.dir.y);
    gl.uniform2f(
      p.uniform("uRimStep"),
      (look.warm.dir.x * PROP_LIGHT.rimPx) / (quad.rect.w * window.scale),
      (look.warm.dir.y * PROP_LIGHT.rimPx) / (quad.rect.h * window.scale),
    );
    gl.uniform1f(p.uniform("uRamp"), look.sign ? PROP_LIGHT.signRamp : PROP_LIGHT.ramp);
    gl.uniform1f(p.uniform("uRim"), PROP_LIGHT.rim);
    gl.uniform1f(p.uniform("uHover"), look.pointed);
    gl.uniform1f(p.uniform("uHoverLift"), PROP_LIGHT.hoverLift);
    const hover = PROP_LIGHT.hoverWarm;
    gl.uniform3f(p.uniform("uHoverWarm"), WARM[0] * hover, WARM[1] * hover, WARM[2] * hover);

    const lantern = look.lantern ?? 0;
    gl.uniform1f(p.uniform("uLantern"), lantern);
    if (lantern > 0) {
      gl.uniform2f(p.uniform("uLanternAt"), BOARD_PARTS.lantern.x / BOARD.width, BOARD_PARTS.lantern.y / BOARD.height);
      gl.uniform2f(p.uniform("uImage"), BOARD.width, BOARD.height);
      gl.uniform1f(p.uniform("uLanternReach"), LANTERN.reach);
      gl.uniform1f(p.uniform("uLanternAmount"), LANTERN.amount);
      gl.uniform1f(p.uniform("uGlass"), LANTERN.glass);
      gl.uniform1f(p.uniform("uGlassGlow"), LANTERN.glow);
      gl.uniform3f(p.uniform("uFlame"), ...LANTERN.flame);
    }
    gl.uniform1f(p.uniform("uHaze"), PROP_LIGHT.haze);
    gl.uniform1f(p.uniform("uAlpha"), look.alpha);

    gl.uniform1f(p.uniform("uHasLabel"), look.label ? 1 : 0);
    gl.uniform3f(p.uniform("uPaint"), ...look.paint);
    gl.uniform1f(p.uniform("uWear"), look.wear);
    gl.uniform1f(p.uniform("uLabelAmount"), look.labelAmount ?? 1);
    this.bind(p, "uTexture", texture, 0);
    this.bind(p, "uLabel", look.label ?? texture, 1);
    this.bind(p, "uGolden", this.golden, 2);
    this.bind(p, "uBase", this.base ?? this.golden, 3);

    const pivot = quad.pivot ?? { x: 0, y: 0 };
    const cos = Math.cos(look.angle);
    const sin = Math.sin(look.angle);
    const at = (x: number, y: number, u: number, v: number): Corner => {
      // Turned about the nail on the plate, then onto the screen.
      const dx = x - pivot.x;
      const dy = y - pivot.y;
      const px = pivot.x + dx * cos - dy * sin;
      const py = pivot.y + dx * sin + dy * cos;
      return { x: (window.origin.x + window.scale * px) * dpr, y: (window.origin.y + window.scale * py) * dpr, z: 0, u, v };
    };
    const { x, y, w, h } = quad.rect;
    drawQuad(gl, this.quad, [at(x, y, 0, 0), at(x + w, y, 1, 0), at(x, y + h, 0, 1), at(x + w, y + h, 1, 1)]);
  }
}

const fullscreen = /* glsl */ `#version 300 es
precision highp float;
const vec2 corners[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
void main() {
  gl_Position = vec4(corners[gl_VertexID], 0.0, 1.0);
}
`;
