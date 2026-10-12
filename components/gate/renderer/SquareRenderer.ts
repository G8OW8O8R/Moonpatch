/**
 * The square after the ride, drawn in the gate's WebGL context with the very
 * square-golden texture the ride ends on, so the hand-over is exact. Dusk
 * falls through dusk-base, each light comes on by itself, and the signpost
 * and notice board stand in front with their contact shadows.
 */
import type { PlateWindow } from "@/lib/gate-rig";
import { PLATE, type Size } from "@/lib/plate-box";
import {
  type ArmId,
  BOARD_PARTS,
  BOARD,
  PROP_TINT as TINT,
  type PropQuad,
  boardQuad,
  contactShadows,
  propPlacement,
  signQuads,
  visitShift,
} from "@/lib/square-props";
import { DUSK, flicker, gradeAt, lightLevel, shiftWindow, squareFrame, windowAt } from "@/lib/square-rig";
import lightsManifest from "@/components/square/lights.json";
import {
  type Corner,
  type GL,
  type Program,
  type Quad,
  type Target,
  createQuad,
  createTexture,
  deleteTarget,
  drawQuad,
  finishProgram,
  startProgram,
  whenCompiled,
} from "./gl";
import { contactFragment, defocusFragment, glowFragment, propFragment, screenVertex, squareFragment } from "./square-shaders";

export interface SquareState {
  /** Followed dusk progress, 0–1. */
  dusk: number;
  /** Followed closing push-in, 0–1. */
  wander: number;
  /** Camera move onto the notice board, 0–1. */
  visit: number;
  /** Turn of each signpost arm on its nail, radians. */
  arms: Record<ArmId, number>;
  /** Fade of the props after the ride, 0–1. */
  props: number;
}

export const restingSquare: SquareState = {
  dusk: 0,
  wander: 0,
  visit: 0,
  arms: { cafe: 0, barn: 0, haunt: 0 },
  props: 0,
};

export interface SquareImages {
  base: ImageBitmap;
  lights: ImageBitmap;
  ids: ImageBitmap;
  props: Record<PropQuad["id"], ImageBitmap>;
}

interface LightEntry {
  id: number;
  kind: string;
  order: number;
}

const lights = lightsManifest.lights as LightEntry[];

/** Ink of the lettering on the arms. */
const INK: [number, number, number] = [0x2b / 255, 0x21 / 255, 0x1c / 255];

const mix3 = (a: readonly number[], b: readonly number[], t: number): [number, number, number] => [
  a[0]! + (b[0]! - a[0]!) * t,
  a[1]! + (b[1]! - a[1]!) * t,
  a[2]! + (b[2]! - a[2]!) * t,
];

export class SquareRenderer {
  private readonly gl: GL;
  private readonly plate: Program;
  private readonly prop: Program;
  private readonly contact: Program;
  private readonly glow: Program;
  private readonly defocus: Program;
  private readonly quad: Quad;
  private readonly emptyVao: WebGLVertexArrayObject;
  private readonly golden: WebGLTexture;
  private base: WebGLTexture | null = null;
  private lightsTex: WebGLTexture | null = null;
  private ids: WebGLTexture | null = null;
  private readonly levels: WebGLTexture;
  private readonly levelData = new Uint8Array(256 * 4);
  private readonly props = new Map<PropQuad["id"], WebGLTexture>();
  private readonly labels = new Map<ArmId, WebGLTexture>();
  private frame: Target | null = null;

  static async create(gl: GL, golden: WebGLTexture, frame: () => Promise<void>): Promise<SquareRenderer> {
    const programs = [
      startProgram(gl, fullscreen, squareFragment),
      startProgram(gl, screenVertex, propFragment),
      startProgram(gl, screenVertex, contactFragment),
      startProgram(gl, screenVertex, glowFragment),
      startProgram(gl, fullscreen, defocusFragment),
    ];
    await whenCompiled(gl, programs, frame);
    return new SquareRenderer(gl, golden, programs.map((p) => finishProgram(gl, p)));
  }

  private constructor(gl: GL, golden: WebGLTexture, programs: Program[]) {
    this.gl = gl;
    this.golden = golden;
    [this.plate, this.prop, this.contact, this.glow, this.defocus] = programs as [Program, Program, Program, Program, Program];
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
    for (const [id, bitmap] of Object.entries(images.props) as [PropQuad["id"], ImageBitmap][]) {
      this.props.set(id, createTexture(gl, bitmap, { anisotropy: 4 }));
      bitmap.close();
      await pause();
    }
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

  /** True while some light is on, so the flicker needs frames. */
  glowing(state: SquareState): boolean {
    return this.ready && state.dusk > DUSK.lights[0];
  }

  render(state: SquareState, css: Size, dpr: number, seconds: number, canvas: { width: number; height: number }) {
    const { gl } = this;
    const width = canvas.width;
    const height = canvas.height;
    const frame = squareFrame(css, state);
    const placement = propPlacement(css);
    const visit = state.visit;
    const windowFor = (nearness: number): PlateWindow => {
      const w = windowAt(frame, nearness);
      return visit > 0 ? shiftWindow(w, visitShift(css, frame, placement, visit, nearness)) : w;
    };

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
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    gl.viewport(0, 0, width, height);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);

    const grade = gradeAt(state.dusk);
    this.drawPlate(windowFor(1), grade, dpr, width, height, visit);

    const propsAlpha = this.props.size ? state.props : 0;
    const tint = mix3(TINT.golden, TINT.dusk, grade);
    if (propsAlpha > 0.001) {
      gl.enable(gl.BLEND);
      // Contact shadows first, multiplied into the ground.
      gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_COLOR);
      const c = this.contact;
      gl.useProgram(c.program);
      gl.uniform2f(c.uniform("uViewport"), width, height);
      for (const shadow of contactShadows(placement)) {
        const w = windowFor(shadow.nearness);
        gl.uniform1f(c.uniform("uStrength"), shadow.strength * propsAlpha * (1 - visit));
        this.drawRect(w, { x: shadow.x - shadow.rx, y: shadow.y - shadow.ry, w: shadow.rx * 2, h: shadow.ry * 2 }, dpr);
      }
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      // The signpost in front, sharp or not: it stays behind the board when the board comes forward.
      for (const quad of signQuads(placement.sign)) {
        const angle = quad.id.startsWith("arm-") ? state.arms[quad.id.slice(4) as ArmId] : 0;
        this.drawProp(quad, windowFor(quad.nearness), tint, propsAlpha, dpr, width, height, angle);
      }
    }

    if (defocus && this.frame) {
      gl.disable(gl.BLEND);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
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
    if (propsAlpha > 0.001 || visit > 0) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      const board = boardQuad(placement.board);
      const w = windowFor(board.nearness);
      const boardTint = mix3(tint, TINT.open, visit);
      this.drawProp(board, w, boardTint, Math.max(propsAlpha, visit), dpr, width, height, 0);
      // The lantern on the board: alight at dusk, never quite steady.
      const flame = lightLevel(0.35, state.dusk) * Math.max(propsAlpha, visit);
      if (flame > 0.001) {
        gl.blendFunc(gl.ONE, gl.ONE);
        const g = this.glow;
        gl.useProgram(g.program);
        gl.uniform2f(g.uniform("uViewport"), width, height);
        gl.uniform1f(g.uniform("uStrength"), 0.55 * flame * flicker(997, seconds, 0.07));
        const scale = board.rect.h / BOARD.height;
        const { lantern } = BOARD_PARTS;
        const cx = board.rect.x + lantern.x * scale;
        const cy = board.rect.y + lantern.y * scale;
        const r = lantern.r * scale * 2.4;
        this.drawRect(w, { x: cx - r, y: cy - r, w: r * 2, h: r * 2 }, dpr);
      }
    }
    gl.disable(gl.BLEND);
  }

  dispose() {
    const { gl } = this;
    for (const t of [this.base, this.lightsTex, this.ids, this.levels]) if (t) gl.deleteTexture(t);
    for (const t of this.props.values()) gl.deleteTexture(t);
    for (const t of this.labels.values()) gl.deleteTexture(t);
    if (this.frame) deleteTarget(gl, this.frame);
    for (const p of [this.plate, this.prop, this.contact, this.glow, this.defocus]) gl.deleteProgram(p.program);
  }

  // ------------------------------------------------------------ internals

  private updateLevels(dusk: number, seconds: number) {
    const data = this.levelData;
    for (const light of lights) {
      const level = lightLevel(light.order, dusk);
      data[light.id * 4] = Math.round(level * 255);
      // Flicker as 0.94–1.06 around 0.5; bulbs breathe a little, windows barely.
      const depth = light.kind === "bulb" ? 0.015 : light.kind === "lamp" ? 0.03 : 0.006;
      data[light.id * 4 + 1] = Math.round(((flicker(light.id, seconds, depth) - 0.94) / 0.12) * 255);
    }
    const { gl } = this;
    gl.bindTexture(gl.TEXTURE_2D, this.levels);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 1, gl.RGBA, gl.UNSIGNED_BYTE, data);
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

  private drawProp(
    quad: PropQuad,
    window: PlateWindow,
    tint: [number, number, number],
    alpha: number,
    dpr: number,
    width: number,
    height: number,
    angle: number,
  ) {
    const texture = this.props.get(quad.id);
    if (!texture) return;
    const { gl } = this;
    const p = this.prop;
    gl.useProgram(p.program);
    gl.uniform2f(p.uniform("uViewport"), width, height);
    gl.uniform3f(p.uniform("uTint"), ...tint);
    gl.uniform3f(p.uniform("uInk"), ...INK);
    gl.uniform1f(p.uniform("uAlpha"), alpha);
    const label = quad.id.startsWith("arm-") ? this.labels.get(quad.id.slice(4) as ArmId) : undefined;
    gl.uniform1f(p.uniform("uHasLabel"), label ? 1 : 0);
    this.bind(p, "uTexture", texture, 0);
    this.bind(p, "uLabel", label ?? texture, 1);
    const pivot = quad.pivot ?? { x: 0, y: 0 };
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
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

/** A full-resolution frame buffer whose texture can be mipmapped, for the out-of-focus scene. */
function createMipTarget(gl: GL, width: number, height: number): Target {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  const levels = Math.floor(Math.log2(Math.max(width, height))) + 1;
  gl.texStorage2D(gl.TEXTURE_2D, levels, gl.RGBA8, width, height);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { framebuffer, texture, width, height };
}
