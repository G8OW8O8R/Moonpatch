/**
 * Inside a building: the room plate with its door leaves lifted off it. On
 * the way in the leaves slide past faster than the room (they are nearer),
 * and on a screen with a mouse the room drifts a little with the pointer,
 * the leaves more. At rest, and still, it draws the plate's own file
 * instead, the very picture the page shows.
 */
import { type DoorParams, defaultDoor, leafWindow, roomWindow } from "@/lib/door-rig";
import type { PlateWindow } from "@/lib/gate-rig";
import { PLATE, type Size } from "@/lib/plate-box";
import { ROOMS, type RoomId, type RoomLayer, edgeMid, leafSpan } from "@/lib/rooms";
import { type Corner, type GL, type Program, type Quad, createQuad, createTexture, drawQuad, finishProgram, startProgram, whenCompiled } from "./gl";

/** How far the room and its leaves drift with the pointer at the screen's edge, CSS px (vertical: half). */
export const DRIFT = { plate: 6, leaf: 16 } as const;

export interface RoomImages {
  /** The plate with the room carried on under each leaf. */
  clean: ImageBitmap;
  /** Each leaf, premultiplied, cropped to its side of the plate. */
  leaves: Record<string, ImageBitmap>;
}

interface RoomTextures {
  clean: WebGLTexture;
  leaves: Array<{ layer: RoomLayer; texture: WebGLTexture }>;
  /** The plate's own file, for the room at rest. */
  plate: WebGLTexture | null;
}

const header = /* glsl */ `#version 300 es
precision highp float;
`;

const fullscreen = /* glsl */ `${header}
const vec2 corners[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
void main() {
  gl_Position = vec4(corners[gl_VertexID], 0.0, 1.0);
}
`;

const plateFragment = /* glsl */ `${header}
uniform vec2 uViewport;
uniform vec2 uOrigin;   // plate window, device px
uniform float uScale;
uniform vec2 uPlate;
uniform sampler2D uTexture;
out vec4 outColour;
void main() {
  vec2 pixel = vec2(gl_FragCoord.x, uViewport.y - gl_FragCoord.y);
  outColour = vec4(texture(uTexture, (pixel - uOrigin) / uScale / uPlate).rgb, 1.0);
}
`;

const leafVertex = /* glsl */ `${header}
in vec3 aWorld;   // xy: device px from the top left
in vec2 aUv;
uniform vec2 uViewport;
out vec2 vUv;
void main() {
  gl_Position = vec4(2.0 * aWorld.x / uViewport.x - 1.0, 1.0 - 2.0 * aWorld.y / uViewport.y, 0.0, 1.0);
  vUv = aUv;
}
`;

const leafFragment = /* glsl */ `${header}
in vec2 vUv;
uniform sampler2D uTexture;
out vec4 outColour;
void main() {
  outColour = texture(uTexture, vUv);
}
`;

export interface RoomFrame {
  /** Where the journey is (½ the cut, 1 at rest). */
  j: number;
  /** Followed pointer, -1…1 across the screen (0 in the middle, or with no mouse). */
  drift: { x: number; y: number };
  params?: DoorParams;
  /** A frame buffer of the canvas's size to draw into instead of the canvas. */
  into?: WebGLFramebuffer | null;
}

const moved = (w: PlateWindow, x: number, y: number): PlateWindow => ({ scale: w.scale, origin: { x: w.origin.x + x, y: w.origin.y + y } });

export class RoomRenderer {
  private readonly gl: GL;
  private readonly plate: Program;
  private readonly leaf: Program;
  private readonly quad: Quad;
  private readonly emptyVao: WebGLVertexArrayObject;
  private readonly rooms = new Map<RoomId, RoomTextures>();

  static async create(gl: GL, frame: () => Promise<void>): Promise<RoomRenderer> {
    const programs = [startProgram(gl, fullscreen, plateFragment), startProgram(gl, leafVertex, leafFragment)];
    await whenCompiled(gl, programs, frame);
    return new RoomRenderer(gl, programs.map((p) => finishProgram(gl, p)) as [Program, Program]);
  }

  private constructor(gl: GL, [plate, leaf]: [Program, Program]) {
    this.gl = gl;
    this.plate = plate;
    this.leaf = leaf;
    this.quad = createQuad(gl);
    this.emptyVao = gl.createVertexArray();
  }

  /** Uploads a room's plate and leaves, a texture at a time. */
  async upload(room: RoomId, images: RoomImages, pause: () => Promise<void>) {
    const { gl } = this;
    const clean = createTexture(gl, images.clean);
    images.clean.close();
    const leaves: RoomTextures["leaves"] = [];
    for (const layer of ROOMS[room].layers) {
      const bitmap = images.leaves[layer.id];
      if (!bitmap) continue;
      await pause();
      leaves.push({ layer, texture: createTexture(gl, bitmap, { anisotropy: 4 }) });
      bitmap.close();
    }
    this.rooms.set(room, { clean, leaves, plate: null });
  }

  /** The plate's own file, for the room at rest. */
  setPlate(room: RoomId, bitmap: ImageBitmap) {
    const textures = this.rooms.get(room);
    if (!textures) {
      bitmap.close();
      return;
    }
    if (textures.plate) this.gl.deleteTexture(textures.plate);
    textures.plate = createTexture(this.gl, bitmap);
    bitmap.close();
  }

  has(room: RoomId): boolean {
    return this.rooms.has(room);
  }

  hasPlate(room: RoomId): boolean {
    return !!this.rooms.get(room)?.plate;
  }

  render(room: RoomId, frame: RoomFrame, css: Size, dpr: number, canvas: { width: number; height: number }) {
    const textures = this.rooms.get(room);
    if (!textures) return;
    const { gl } = this;
    const params = frame.params ?? defaultDoor;
    gl.bindFramebuffer(gl.FRAMEBUFFER, frame.into ?? null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.disable(gl.BLEND);

    const room0 = roomWindow(css, frame.j, params);
    const rest = roomWindow(css, 1, params);
    const { x: dx, y: dy } = frame.drift;
    // Pointing right looks right: the room slides the other way, the nearer leaves further.
    const plateWindow = moved(room0, -dx * DRIFT.plate, -dy * DRIFT.plate * 0.5);
    const still = frame.j >= 1 && Math.abs(dx) * DRIFT.leaf < 0.01 && Math.abs(dy) * DRIFT.leaf < 0.01;

    if (still && textures.plate) {
      this.drawPlate(textures.plate, room0, dpr, canvas);
      return;
    }
    this.drawPlate(textures.clean, plateWindow, dpr, canvas);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const p = this.leaf;
    gl.useProgram(p.program);
    gl.uniform2f(p.uniform("uViewport"), canvas.width, canvas.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(p.uniform("uTexture"), 0);
    for (const { layer, texture } of textures.leaves) {
      const w = moved(leafWindow(css, room0, rest, edgeMid(layer), layer.side, params), -dx * DRIFT.leaf, -dy * DRIFT.leaf * 0.5);
      const { left, width } = leafSpan(layer);
      const at = (x: number, y: number, u: number, v: number): Corner => ({
        x: (w.origin.x + w.scale * x) * dpr,
        y: (w.origin.y + w.scale * y) * dpr,
        z: 0,
        u,
        v,
      });
      gl.bindTexture(gl.TEXTURE_2D, texture);
      const right = left + width;
      drawQuad(gl, this.quad, [at(left, 0, 0, 0), at(right, 0, 1, 0), at(left, PLATE.height, 0, 1), at(right, PLATE.height, 1, 1)]);
    }
    gl.disable(gl.BLEND);
  }

  /**
   * The room as it is seen, for its mean light: its own file (the leaves on it), or until that is
   * here the clean plate, which is a little off where it carries the room on under the leaves.
   */
  meanSource(room: RoomId): { texture: WebGLTexture; width: number; height: number } | null {
    const textures = this.rooms.get(room);
    return textures ? { texture: textures.plate ?? textures.clean, width: PLATE.width, height: PLATE.height } : null;
  }

  dispose() {
    const { gl } = this;
    for (const t of this.rooms.values()) {
      gl.deleteTexture(t.clean);
      if (t.plate) gl.deleteTexture(t.plate);
      for (const leaf of t.leaves) gl.deleteTexture(leaf.texture);
    }
    this.rooms.clear();
    gl.deleteProgram(this.plate.program);
    gl.deleteProgram(this.leaf.program);
  }

  private drawPlate(texture: WebGLTexture, w: PlateWindow, dpr: number, canvas: { width: number; height: number }) {
    const { gl } = this;
    const p = this.plate;
    gl.useProgram(p.program);
    gl.bindVertexArray(this.emptyVao);
    gl.uniform2f(p.uniform("uViewport"), canvas.width, canvas.height);
    gl.uniform2f(p.uniform("uOrigin"), w.origin.x * dpr, w.origin.y * dpr);
    gl.uniform1f(p.uniform("uScale"), w.scale * dpr);
    gl.uniform2f(p.uniform("uPlate"), PLATE.width, PLATE.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(p.uniform("uTexture"), 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
