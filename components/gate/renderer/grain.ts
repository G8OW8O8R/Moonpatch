/**
 * Film grain over the whole frame, plate and props alike, so they share one
 * piece of film. It moves on at a film's pace, not the screen's, and is
 * multiplied in: the frame times 1 ± a little, never a veil laid on top.
 */
import { type GL, type Program, finishProgram, startProgram, whenCompiled } from "./gl";

/** New grain this many times a second. */
export const GRAIN_FPS = 18;

/** How far a grain moves the frame's colour, either way. */
const GRAIN_DEPTH = 0.022;

/** Size of a grain, CSS px. */
const GRAIN_SIZE = 1;

const vertex = /* glsl */ `#version 300 es
precision highp float;
const vec2 corners[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
void main() {
  gl_Position = vec4(corners[gl_VertexID], 0.0, 1.0);
}
`;

/** Side of the square of grain laid down once and moved about every frame of film, px. */
const TILE = 512;

/**
 * One fetch of film per pixel: a square of grain, one of four in its
 * channels, at a different place every frame. Written as 0.5 + n/2: the
 * blend (destination × source × 2) turns it into destination × (1 + n).
 */
const fragment = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uGrain;
uniform vec2 uShift;    // where this frame of film starts in the square, 0–1
uniform vec4 uChannel;  // which of the four grains
uniform float uCell;    // device px per grain
uniform float uDepth;
out vec4 outColour;

void main() {
  float n = dot(texture(uGrain, gl_FragCoord.xy / (uCell * ${TILE}.0) + uShift), uChannel) * 2.0 - 1.0;
  outColour = vec4(vec3(0.5 + 0.5 * n * uDepth), 1.0);
}
`;

/** Grain about a mean of 0.5: the sum of three throws is near enough to the bell of real film. */
function grainTile(): Uint8Array {
  const data = new Uint8Array(TILE * TILE * 4);
  for (let i = 0; i < data.length; i++) {
    const n = (Math.random() + Math.random() + Math.random()) / 3 - 0.5;
    data[i] = Math.round(127.5 + Math.max(-1, Math.min(1, n * 2.6)) * 127.5);
  }
  return data;
}

/** A small, fixed sequence of numbers per frame of film (no allocation per frame). */
const frameNoise = (frame: number, salt: number) => {
  const x = Math.sin(frame * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

export class GrainPass {
  private readonly gl: GL;
  private readonly program: Program;
  private readonly vao: WebGLVertexArrayObject;
  private readonly tile: WebGLTexture;

  static async create(gl: GL, frame: () => Promise<void>): Promise<GrainPass> {
    const pending = startProgram(gl, vertex, fragment);
    await whenCompiled(gl, [pending], frame);
    return new GrainPass(gl, finishProgram(gl, pending));
  }

  private constructor(gl: GL, program: Program) {
    this.gl = gl;
    this.program = program;
    this.vao = gl.createVertexArray();
    this.tile = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tile);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, TILE, TILE, 0, gl.RGBA, gl.UNSIGNED_BYTE, grainTile());
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  }

  /** Lays `amount` (0–1) of grain over whatever is on the screen; the grain is frame `seconds` of the film. */
  draw(amount: number, seconds: number, size: { width: number; height: number }, dpr: number) {
    if (amount <= 0.001) return;
    const { gl } = this;
    const p = this.program;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, size.width, size.height);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.DST_COLOR, gl.SRC_COLOR);
    gl.useProgram(p.program);
    gl.bindVertexArray(this.vao);
    const frame = Math.floor(seconds * GRAIN_FPS);
    const channel = Math.floor(frameNoise(frame, 1) * 4);
    gl.uniform2f(p.uniform("uShift"), frameNoise(frame, 2), frameNoise(frame, 3));
    gl.uniform4f(p.uniform("uChannel"), channel === 0 ? 1 : 0, channel === 1 ? 1 : 0, channel === 2 ? 1 : 0, channel === 3 ? 1 : 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tile);
    gl.uniform1i(p.uniform("uGrain"), 0);
    gl.uniform1f(p.uniform("uCell"), GRAIN_SIZE * dpr);
    gl.uniform1f(p.uniform("uDepth"), GRAIN_DEPTH * Math.min(1, amount));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.BLEND);
  }

  dispose() {
    this.gl.deleteTexture(this.tile);
    this.gl.deleteProgram(this.program.program);
    this.gl.deleteVertexArray(this.vao);
  }
}
