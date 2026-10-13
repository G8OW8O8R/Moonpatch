/**
 * Motion blur of a camera move, laid over a whole frame drawn into a buffer.
 * Every screen point is smeared along the way it travels (a field k·x + b:
 * radial in a zoom, straight in a slide), as far as the pace of the move
 * says. Just before a cut it can also bring the frame's exposure to that of
 * the frame across the cut: both means are read off a coarse mip, three
 * times a frame (once per corner of the triangle), and nothing is ever read
 * back from the GPU.
 */
import { type GL, type Program, type Target, createMipTarget, deleteTarget, finishProgram, startProgram, whenCompiled } from "./gl";

/**
 * Taps along each smear. Each reads a mip as wide as the gap between taps,
 * so together they cover the whole smear: no copies and no noise between
 * neighbouring pixels.
 */
const TAPS = 16;

/**
 * The exposure is matched in the vertex stage: a 16×16 grid over a mip some
 * thirty texels across, never the last 1×1 mip (odd sizes lose whole rows on
 * the way down there).
 */
const vertex = /* glsl */ `#version 300 es
precision highp float;
const vec2 corners[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
uniform sampler2D uFrame;
uniform sampler2D uOther;   // the frame across the cut, for its exposure
uniform float uExposure;    // 0 the frame's own … 1 the other frame's
uniform float uFrameLod;
uniform float uOtherLod;
flat out float vGain;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

float mean(sampler2D image, float lod) {
  float sum = 0.0;
  for (int y = 0; y < 16; y++)
    for (int x = 0; x < 16; x++) sum += dot(textureLod(image, (vec2(x, y) + 0.5) / 16.0, lod).rgb, LUMA);
  return sum / 256.0;
}

void main() {
  gl_Position = vec4(corners[gl_VertexID], 0.0, 1.0);
  vGain = 1.0;
  if (uExposure > 0.0) {
    float gain = clamp(mean(uOther, uOtherLod) / max(mean(uFrame, uFrameLod), 1e-3), 0.5, 2.0);
    vGain = mix(1.0, gain, uExposure);
  }
}
`;

const fragment = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uFrame;
uniform vec2 uViewport;     // device px
uniform float uK;           // field: a point x (device px, from the top left) moves along uK·x + uB
uniform vec2 uB;
uniform float uLength;      // device px of smear where the field is 1
uniform float uFloor;       // the least any point is smeared, in the field's units (the still middle of a zoom too)
flat in float vGain;
out vec4 outColour;

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 p = vec2(frag.x, uViewport.y - frag.y);
  vec2 d = uK * p + uB;
  float m = length(d);
  vec2 v = (m > 1e-5 ? d / m : vec2(1.0, 0.0)) * max(m, uFloor) * uLength;
  // The field is from the top left; the buffer is from the bottom left.
  vec2 step = vec2(v.x, -v.y) / uViewport;
  vec2 uv = frag / uViewport;
  vec3 colour;
  if (dot(v, v) < 0.25) {
    colour = texture(uFrame, uv).rgb;
  } else {
    float lod = log2(max(1.0, length(v) / ${TAPS}.0));
    vec3 sum = vec3(0.0);
    for (int i = 0; i < ${TAPS}; i++) {
      float s = (float(i) + 0.5) / ${TAPS}.0 - 0.5;
      sum += textureLod(uFrame, uv + step * s, lod).rgb;
    }
    colour = sum / ${TAPS}.0;
  }
  outColour = vec4(colour * vGain, 1.0);
}
`;

export interface BlurFrame {
  /** Unit field, device px: the fastest corner of the screen moves 1. */
  k: number;
  b: { x: number; y: number };
  /** Smear of that fastest corner, CSS px (the field carries the device scale). */
  length: number;
  /** The least any point is smeared, in the field's units. */
  floor: number;
  /** Towards the other frame's exposure, 0–1, and that frame (a mipmapped texture of its own size). */
  exposure: number;
  other: { texture: WebGLTexture; width: number; height: number } | null;
}

/** The mip about thirty texels across: coarse enough to average, fine enough to have lost nothing. */
const meanLod = (width: number, height: number) => Math.max(0, Math.floor(Math.log2(Math.max(width, height) / 30)));

export class MotionBlurPass {
  private readonly gl: GL;
  private readonly program: Program;
  private readonly vao: WebGLVertexArrayObject;
  private buffer: Target | null = null;

  static async create(gl: GL, frame: () => Promise<void>): Promise<MotionBlurPass> {
    const pending = startProgram(gl, vertex, fragment);
    await whenCompiled(gl, [pending], frame);
    return new MotionBlurPass(gl, finishProgram(gl, pending));
  }

  private constructor(gl: GL, program: Program) {
    this.gl = gl;
    this.program = program;
    this.vao = gl.createVertexArray();
  }

  /** The buffer a frame is drawn into before it is blurred, sized to the canvas. */
  target(width: number, height: number): Target {
    if (!this.buffer || this.buffer.width !== width || this.buffer.height !== height) {
      if (this.buffer) deleteTarget(this.gl, this.buffer);
      this.buffer = createMipTarget(this.gl, width, height);
    }
    return this.buffer;
  }

  /** Blurs the buffer onto the canvas. */
  draw(frame: BlurFrame) {
    const { gl } = this;
    const buffer = this.buffer;
    if (!buffer) return;
    const p = this.program;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, buffer.width, buffer.height);
    gl.disable(gl.BLEND);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, buffer.texture);
    // Mips for the taps of a long smear, and for the frame's mean while its exposure is matched.
    if (frame.length > 1 || (frame.exposure > 0 && frame.other)) gl.generateMipmap(gl.TEXTURE_2D);
    gl.useProgram(p.program);
    gl.bindVertexArray(this.vao);
    gl.uniform1i(p.uniform("uFrame"), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, frame.other?.texture ?? buffer.texture);
    gl.uniform1i(p.uniform("uOther"), 1);
    gl.uniform2f(p.uniform("uViewport"), buffer.width, buffer.height);
    gl.uniform1f(p.uniform("uK"), frame.k);
    gl.uniform2f(p.uniform("uB"), frame.b.x, frame.b.y);
    gl.uniform1f(p.uniform("uLength"), frame.length);
    gl.uniform1f(p.uniform("uFloor"), frame.floor);
    gl.uniform1f(p.uniform("uExposure"), frame.other ? frame.exposure : 0);
    gl.uniform1f(p.uniform("uFrameLod"), meanLod(buffer.width, buffer.height));
    gl.uniform1f(p.uniform("uOtherLod"), frame.other ? meanLod(frame.other.width, frame.other.height) : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.activeTexture(gl.TEXTURE0);
  }

  dispose() {
    if (this.buffer) deleteTarget(this.gl, this.buffer);
    this.buffer = null;
    this.gl.deleteProgram(this.program.program);
  }
}
