/** Small WebGL2 helpers: programs, textures, quads and an offscreen target. */

export type GL = WebGL2RenderingContext;

export interface Program {
  program: WebGLProgram;
  uniform: (name: string) => WebGLUniformLocation | null;
}

export interface PendingProgram {
  program: WebGLProgram;
  shaders: [WebGLShader, WebGLShader];
}

function shader(gl: GL, type: number, source: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("could not create a shader");
  gl.shaderSource(sh, source);
  gl.compileShader(sh);
  return sh;
}

/**
 * Starts compiling and linking without asking for the result, so the driver
 * can work in the background (asking at once would block the page).
 */
export function startProgram(gl: GL, vertex: string, fragment: string): PendingProgram {
  const program = gl.createProgram();
  const vs = shader(gl, gl.VERTEX_SHADER, vertex);
  const fs = shader(gl, gl.FRAGMENT_SHADER, fragment);
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  // Fixed slots, so one vertex layout serves every program.
  gl.bindAttribLocation(program, 0, "aWorld");
  gl.bindAttribLocation(program, 1, "aUv");
  gl.linkProgram(program);
  return { program, shaders: [vs, fs] };
}

/** Resolves once the driver has finished the programs (immediately without the parallel-compile extension). */
export async function whenCompiled(gl: GL, pending: PendingProgram[], nextTick: () => Promise<void>) {
  const ext = gl.getExtension("KHR_parallel_shader_compile");
  if (!ext) return;
  while (!pending.every((p) => gl.getProgramParameter(p.program, ext.COMPLETION_STATUS_KHR))) await nextTick();
}

export function finishProgram(gl: GL, { program, shaders }: PendingProgram): Program {
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const logs = shaders.map((sh) => gl.getShaderInfoLog(sh)).join(" ");
    throw new Error(`program failed to link: ${gl.getProgramInfoLog(program)} ${logs}`);
  }
  for (const sh of shaders) gl.deleteShader(sh);
  const uniforms = new Map<string, WebGLUniformLocation | null>();
  return {
    program,
    uniform: (name) => {
      if (!uniforms.has(name)) uniforms.set(name, gl.getUniformLocation(program, name));
      return uniforms.get(name) ?? null;
    },
  };
}

export interface TextureOptions {
  anisotropy?: number;
}

/**
 * Uploads a decoded bitmap with mipmaps. Layers arrive premultiplied from
 * createImageBitmap, so filtering never leaks colour from clear pixels.
 */
export function createTexture(gl: GL, image: TexImageSource, options: TextureOptions = {}): WebGLTexture {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const aniso = gl.getExtension("EXT_texture_filter_anisotropic");
  if (aniso && options.anisotropy) {
    const max = gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number;
    gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(max, options.anisotropy));
  }
  return texture;
}

/** A quad whose four corners (world xyz + uv) can be rewritten every frame. */
export interface Quad {
  vao: WebGLVertexArrayObject;
  buffer: WebGLBuffer;
  data: Float32Array;
}

export function createQuad(gl: GL): Quad {
  const vao = gl.createVertexArray();
  const buffer = gl.createBuffer();
  const data = new Float32Array(4 * 5);
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);
  gl.bindVertexArray(null);
  return { vao, buffer, data };
}

export interface Corner {
  x: number;
  y: number;
  z: number;
  u: number;
  v: number;
}

/** Corners in strip order: top-left, top-right, bottom-left, bottom-right. */
export function drawQuad(gl: GL, quad: Quad, corners: readonly [Corner, Corner, Corner, Corner]) {
  corners.forEach((c, i) => quad.data.set([c.x, c.y, c.z, c.u, c.v], i * 5));
  gl.bindVertexArray(quad.vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, quad.buffer);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, quad.data);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

export interface Target {
  framebuffer: WebGLFramebuffer;
  texture: WebGLTexture;
  width: number;
  height: number;
}

export function createTarget(gl: GL, width: number, height: number): Target {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { framebuffer, texture, width, height };
}

export function deleteTarget(gl: GL, target: Target) {
  gl.deleteFramebuffer(target.framebuffer);
  gl.deleteTexture(target.texture);
}

/** A full-resolution frame buffer whose texture can be mipmapped, to be read out of focus or for its mean. */
export function createMipTarget(gl: GL, width: number, height: number): Target {
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
