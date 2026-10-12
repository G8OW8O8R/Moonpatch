import {
  type Camera,
  EYE_HEIGHT,
  GATE_GROUND_Y,
  type LeafSide,
  PRINCIPAL,
  type RigParams,
  type Vec3,
  cameraAt,
  groundDepth,
  leafPoint,
  leafShade,
  restWindow,
  shadowOnGround,
  unproject,
} from "@/lib/gate-rig";
import { PLATE, PLATE_TALL, type PosterPlate, type Size, TALL_OFFSET, plateBox, posterPlates } from "@/lib/plate-box";
import layers from "../layers.json";
import {
  type Corner,
  type GL,
  type Program,
  type Quad,
  type Target,
  createQuad,
  createTarget,
  createTexture,
  deleteTarget,
  drawQuad,
  finishProgram,
  startProgram,
  whenCompiled,
} from "./gl";
import {
  backdropFragment,
  blurFragment,
  fullscreenVertex,
  roadFragment,
  shadowFragment,
  spriteFragment,
  worldVertex,
} from "./shaders";

export interface LayerRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GateLayer {
  id: string;
  kind: "leaf" | "card";
  side?: LeafSide;
  contact?: number;
  rect: LayerRect;
  parts?: LayerRect[];
}

export const gateLayers = layers.layers as GateLayer[];

export interface PosterImage {
  /** The poster file decoded at its own pixel size. */
  bitmap: ImageBitmap;
  /** Natural size of the <img>, which srcset scales by the chosen density and rounds. */
  natural: Size;
}

export interface GateImages {
  plate: PosterPlate;
  poster: PosterImage;
  square: ImageBitmap;
  /** Premultiplied when decoded. */
  layers: Record<string, ImageBitmap>;
}

export interface FrameStats {
  /** Frames per second over the last second of motion. */
  fps: number;
  /** 0 full quality, 1 reduced, 2 gave up. */
  quality: 0 | 1 | 2;
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Where the closed leaves stand on the plate, with room for the drop rods. */
const LEAF_AREA = { x0: 404, y0: 850, x1: 2212, y1: 1400 };

/** Rows over which the road takes over from the square below the gate line. */
const ROAD_FEATHER: readonly [number, number] = [1356, 1368];

/** Camera speed (gate distances per second) at which the near layers smear fully. */
const FULL_BLUR_SPEED = 3;

export class GateRenderer {
  private readonly gl: GL;
  private readonly backdrop: Program;
  private readonly road: Program;
  private readonly sprite: Program;
  private readonly shadow: Program;
  private readonly blur: Program;
  private readonly quad: Quad;
  private readonly emptyVao: WebGLVertexArrayObject;
  private readonly poster: WebGLTexture;
  private readonly square: WebGLTexture;
  private readonly posterNatural: Size;
  private readonly posterTexelWidth: number;
  private readonly textures: Map<string, WebGLTexture>;
  private readonly plate: PosterPlate;
  private target: Target | null = null;
  /** Resolution of the pass being drawn relative to the canvas (½ inside the blur buffer). */
  private nearScale = 1;
  private readonly cardMeshes = new Map<string, { vao: WebGLVertexArrayObject; buffer: WebGLBuffer; count: number; focal0: number }>();
  private readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  private readonly onQuality: (stats: FrameStats) => void;

  private css: Size = { width: 1, height: 1 };
  private dpr = 1;
  private maxDpr = 2;
  private blurAllowed = true;

  private lastZ = 0;
  private lastTime = 0;
  private speed = 0;
  private frameTimes: number[] = [];
  private reportedAt = 0;
  private stats: FrameStats = { fps: 0, quality: 0 };

  /**
   * Compiles the shaders and uploads the textures a piece at a time, yielding
   * between pieces, so starting the scene never blocks the page.
   */
  static async create(
    canvas: HTMLCanvasElement | OffscreenCanvas,
    gl: GL,
    images: GateImages,
    onQuality: (stats: FrameStats) => void,
    frame: () => Promise<void>,
  ): Promise<GateRenderer> {
    const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
    const pending = [
      startProgram(gl, fullscreenVertex, backdropFragment),
      startProgram(gl, fullscreenVertex, blurFragment),
      startProgram(gl, worldVertex, roadFragment),
      startProgram(gl, worldVertex, spriteFragment),
      startProgram(gl, worldVertex, shadowFragment),
    ];
    await whenCompiled(gl, pending, frame);
    const programs: Program[] = [];
    for (const p of pending) {
      programs.push(finishProgram(gl, p));
      await pause();
    }
    const upload = async (bitmap: ImageBitmap, anisotropy?: number) => {
      const texture = createTexture(gl, bitmap, { anisotropy });
      bitmap.close();
      await pause();
      return texture;
    };
    const posterTexelWidth = images.poster.bitmap.width;
    const poster = await upload(images.poster.bitmap);
    const square = await upload(images.square);
    const textures = new Map<string, WebGLTexture>();
    for (const layer of gateLayers) {
      const bitmap = images.layers[layer.id];
      if (bitmap) textures.set(layer.id, await upload(bitmap, 8));
    }
    return new GateRenderer(canvas, gl, { programs, poster, square, textures, posterTexelWidth }, images, onQuality);
  }

  private constructor(
    canvas: HTMLCanvasElement | OffscreenCanvas,
    gl: GL,
    built: {
      programs: Program[];
      poster: WebGLTexture;
      square: WebGLTexture;
      textures: Map<string, WebGLTexture>;
      posterTexelWidth: number;
    },
    images: GateImages,
    onQuality: (stats: FrameStats) => void,
  ) {
    this.canvas = canvas;
    this.onQuality = onQuality;
    this.gl = gl;
    this.plate = images.plate;
    [this.backdrop, this.blur, this.road, this.sprite, this.shadow] = built.programs as [Program, Program, Program, Program, Program];
    this.quad = createQuad(gl);
    this.emptyVao = gl.createVertexArray();
    this.poster = built.poster;
    this.square = built.square;
    this.textures = built.textures;
    this.posterNatural = images.poster.natural;
    this.posterTexelWidth = built.posterTexelWidth;
  }

  /** Canvas size in CSS pixels; the drawing buffer follows the device pixel ratio, at most 2. */
  resize(css: Size, devicePixelRatio: number) {
    this.css = css;
    this.dpr = Math.min(this.maxDpr, devicePixelRatio);
    const width = Math.max(1, Math.round(css.width * this.dpr));
    const height = Math.max(1, Math.round(css.height * this.dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    if (this.target && (this.target.width !== Math.ceil(width / 2) || this.target.height !== Math.ceil(height / 2))) {
      deleteTarget(this.gl, this.target);
      this.target = null;
    }
  }

  get quality(): FrameStats {
    return this.stats;
  }

  /**
   * Draws one frame. Returns true while the picture is still settling (the
   * motion blur fading out), so the caller keeps asking for frames.
   */
  render(progress: number, params: RigParams, now: number): boolean {
    const { gl } = this;
    const camera = cameraAt(progress, this.css, params);
    const width = this.canvas.width;
    const height = this.canvas.height;

    this.trackSpeed(camera, now);
    const blurPx = this.blurAllowed ? params.blur * Math.min(1, this.speed / FULL_BLUR_SPEED) : 0;

    const opening = camera.opening;
    const dissolve = smoothstep(0, 0.8, opening);
    const under = smoothstep(0, 0.015, opening);
    const posterAlpha = 1 - smoothstep(0, 0.01, opening);

    gl.viewport(0, 0, width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);

    // The square, far behind everything.
    gl.disable(gl.BLEND);
    this.drawBackdrop(camera.window.origin, camera.window.scale, camera.squareZoom, dissolve, under, 1);

    // Shadows of the leaves on the road beyond the gate line.
    const shadowStrength = params.shadowOpacity * smoothstep(0, 0.25, opening);
    if (shadowStrength > 0.001) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_COLOR);
      this.useWorld(this.shadow, camera);
      gl.uniform1f(this.shadow.uniform("uStrength"), shadowStrength);
      gl.uniform1f(this.shadow.uniform("uSoftness"), 5);
      for (const layer of gateLayers) {
        if (layer.kind !== "leaf" || !layer.side) continue;
        this.bindTexture(this.shadow, "uTexture", this.textures.get(layer.id), 0);
        drawQuad(gl, this.quad, this.leafCorners(layer, camera, (p) => shadowOnGround(p, params)));
      }
    }

    // Near layers: straight to the screen, or, while the camera is fast, at half
    // resolution into a buffer that the blur smears anyway.
    const blurring = blurPx > 1.5;
    this.nearScale = 1;
    if (blurring) {
      if (!this.target) this.target = createTarget(gl, Math.ceil(width / 2), Math.ceil(height / 2));
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.target.framebuffer);
      gl.viewport(0, 0, this.target.width, this.target.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      this.nearScale = this.target.width / width;
    }
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    this.drawRoad(camera, dissolve, under);

    this.useWorld(this.sprite, camera);
    for (const layer of gateLayers) {
      const texture = this.textures.get(layer.id);
      if (!texture) continue;
      this.bindTexture(this.sprite, "uTexture", texture, 0);
      if (layer.kind === "leaf" && layer.side) {
        gl.uniform1f(this.sprite.uniform("uShade"), leafShade(layer.side, camera.angle, params));
        drawQuad(gl, this.quad, this.leafCorners(layer, camera, (p) => p));
      } else {
        gl.uniform1f(this.sprite.uniform("uShade"), 1);
        this.drawCard(layer, camera.focal0);
      }
    }

    if (blurring && this.target) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, width, height);
      this.nearScale = 1;
      const p = this.blur;
      gl.useProgram(p.program);
      gl.bindVertexArray(this.emptyVao);
      gl.uniform2f(p.uniform("uViewport"), width, height);
      const centre = {
        x: (camera.window.origin.x + camera.window.scale * PRINCIPAL.x) * this.dpr,
        y: (camera.window.origin.y + camera.window.scale * PRINCIPAL.y) * this.dpr,
      };
      const reach = Math.max(
        Math.hypot(centre.x, centre.y),
        Math.hypot(width - centre.x, centre.y),
        Math.hypot(centre.x, height - centre.y),
        Math.hypot(width - centre.x, height - centre.y),
      );
      gl.uniform2f(p.uniform("uCentre"), centre.x, centre.y);
      gl.uniform1f(p.uniform("uAmount"), (blurPx * this.dpr) / reach);
      this.bindTexture(p, "uLayer", this.target.texture, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // The poster on top for the first instant, so the hand-over from the <img> is exact.
    if (posterAlpha > 0) {
      const rest = restWindow(this.css);
      const box = this.posterBox();
      this.drawBackdrop(rest.origin, rest.scale, 1, 0, 0, posterAlpha, box);
    }

    return this.speed > 0.02 || blurring;
  }

  /** Frame pacing while the scene moves: reported twice a second, and quality drops when it cannot keep up. */
  recordFrame(now: number) {
    const times = this.frameTimes;
    if (times.length && now - times.at(-1)! > 200) times.length = 0;
    times.push(now);
    while (times.length > 2 && now - times[0]! > 1000) times.shift();
    if (times.length < 2) return;
    const fps = ((times.length - 1) * 1000) / (now - times[0]!);
    this.stats = { ...this.stats, fps };
    if (now - this.reportedAt > 500) {
      this.reportedAt = now;
      this.onQuality(this.stats);
    }
    // Judge only a full second of motion.
    if (now - times[0]! < 950) return;
    if (fps < 45 && this.stats.quality < 2) {
      const quality = (this.stats.quality + 1) as 1 | 2;
      this.stats = { fps, quality };
      if (quality === 1) {
        this.maxDpr = 1;
        this.blurAllowed = false;
        this.resize(this.css, this.dpr);
      }
      times.length = 0;
      this.onQuality(this.stats);
    }
  }

  dispose() {
    const { gl } = this;
    for (const texture of this.textures.values()) gl.deleteTexture(texture);
    gl.deleteTexture(this.poster);
    gl.deleteTexture(this.square);
    if (this.target) deleteTarget(gl, this.target);
    for (const mesh of this.cardMeshes.values()) {
      gl.deleteVertexArray(mesh.vao);
      gl.deleteBuffer(mesh.buffer);
    }
    gl.deleteProgram(this.backdrop.program);
    gl.deleteProgram(this.road.program);
    gl.deleteProgram(this.sprite.program);
    gl.deleteProgram(this.shadow.program);
    gl.deleteProgram(this.blur.program);
  }

  // ------------------------------------------------------------ internals

  /**
   * The <img> poster exactly as the browser paints it: cover-fitted from its
   * natural size (which srcset scales by the chosen density and rounds), the
   * box snapped to whole device pixels, sampled bilinearly without mipmaps
   * unless it shrinks by half or more.
   */
  private posterBox(): { x: number; y: number; w: number; h: number; lod: number } {
    const box = plateBox(this.css, this.posterNatural, posterPlates[this.plate].anchor);
    const x0 = Math.round(box.x * this.dpr);
    const y0 = Math.round(box.y * this.dpr);
    const x1 = Math.round((box.x + box.width) * this.dpr);
    const y1 = Math.round((box.y + box.height) * this.dpr);
    const texelsPerPixel = this.posterTexelWidth / (x1 - x0);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, lod: texelsPerPixel < 2 ? 0 : Math.floor(Math.log2(texelsPerPixel)) };
  }

  private trackSpeed(camera: Camera, now: number) {
    const dt = (now - this.lastTime) / 1000;
    const z = camera.z / camera.focal0;
    if (this.lastTime === 0 || dt <= 0 || dt > 0.25) {
      this.speed = 0;
    } else {
      const instant = Math.abs(z - this.lastZ) / dt;
      this.speed += (instant - this.speed) * (1 - Math.exp(-dt / 0.08));
      if (this.speed < 0.01) this.speed = 0;
    }
    this.lastZ = z;
    this.lastTime = now;
  }

  private bindTexture(program: Program, name: string, texture: WebGLTexture | undefined, unit: number) {
    const { gl } = this;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture ?? null);
    gl.uniform1i(program.uniform(name), unit);
  }

  private posterRect(): [number, number, number, number] {
    return this.plate === "gate-tall"
      ? [-TALL_OFFSET.x, -TALL_OFFSET.y, PLATE_TALL.width, PLATE_TALL.height]
      : [0, 0, PLATE.width, PLATE.height];
  }

  private bindPlates(p: Program, dissolve: number, under: number, posterLod = -1) {
    const { gl } = this;
    gl.uniform1f(p.uniform("uPosterLod"), posterLod);
    this.bindTexture(p, "uPoster", this.poster, 0);
    this.bindTexture(p, "uSquare", this.square, 1);
    gl.uniform4f(p.uniform("uPosterRect"), ...this.posterRect());
    gl.uniform2f(p.uniform("uPlate"), PLATE.width, PLATE.height);
    gl.uniform4f(p.uniform("uLeafRect"), LEAF_AREA.x0, LEAF_AREA.y0, LEAF_AREA.x1, LEAF_AREA.y1);
    gl.uniform1f(p.uniform("uDissolve"), dissolve);
    gl.uniform1f(p.uniform("uUnder"), under);
    gl.uniform1f(p.uniform("uBand"), this.plate === "gate-tall" ? 1 : 0);
  }

  private drawBackdrop(
    origin: { x: number; y: number },
    scale: number,
    zoom: number,
    dissolve: number,
    under: number,
    alpha: number,
    poster?: { x: number; y: number; w: number; h: number; lod: number },
  ) {
    const { gl } = this;
    const p = this.backdrop;
    gl.useProgram(p.program);
    gl.bindVertexArray(this.emptyVao);
    if (alpha < 1) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    }
    gl.uniform2f(p.uniform("uViewport"), this.canvas.width, this.canvas.height);
    gl.uniform2f(p.uniform("uOrigin"), origin.x * this.dpr, origin.y * this.dpr);
    gl.uniform1f(p.uniform("uScale"), scale * this.dpr);
    gl.uniform2f(p.uniform("uCentre"), PRINCIPAL.x, PRINCIPAL.y);
    gl.uniform1f(p.uniform("uZoom"), zoom);
    gl.uniform1f(p.uniform("uAlpha"), alpha);
    this.bindPlates(p, dissolve, under, poster?.lod ?? -1);
    gl.uniform4f(p.uniform("uPosterScreen"), poster?.x ?? 0, poster?.y ?? 0, poster?.w ?? 0, poster?.h ?? 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private useWorld(p: Program, camera: Camera) {
    const { gl } = this;
    const k = this.dpr * this.nearScale;
    gl.useProgram(p.program);
    gl.uniform2f(p.uniform("uViewport"), this.canvas.width * this.nearScale, this.canvas.height * this.nearScale);
    gl.uniform2f(p.uniform("uOrigin"), camera.window.origin.x * k, camera.window.origin.y * k);
    gl.uniform1f(p.uniform("uScale"), camera.window.scale * k);
    gl.uniform2f(p.uniform("uCentre"), PRINCIPAL.x, PRINCIPAL.y);
    gl.uniform1f(p.uniform("uFocal"), camera.focal);
    gl.uniform1f(p.uniform("uCameraZ"), camera.z);
  }

  private drawRoad(camera: Camera, dissolve: number, under: number) {
    const { gl } = this;
    const p = this.road;
    this.useWorld(p, camera);
    this.bindPlates(p, dissolve, under);
    gl.uniform1f(p.uniform("uFocal0"), camera.focal0);
    gl.uniform2f(p.uniform("uFeather"), ROAD_FEATHER[0], ROAD_FEATHER[1]);
    const bottom = (this.plate === "gate-tall" ? PLATE_TALL.height - TALL_OFFSET.y : PLATE.height) + 40;
    const corner = (u: number, row: number): Corner => {
      const w = unproject({ x: u, y: row }, groundDepth(row, camera.focal0), camera.focal0);
      return { x: w.x, y: EYE_HEIGHT, z: w.z, u: 0, v: 0 };
    };
    const [left, right] = [-600, PLATE.width + 600];
    drawQuad(gl, this.quad, [
      corner(left, ROAD_FEATHER[0] - 2),
      corner(right, ROAD_FEATHER[0] - 2),
      corner(left, bottom),
      corner(right, bottom),
    ]);
  }

  private leafCorners(layer: GateLayer, camera: Camera, place: (p: Vec3) => Vec3): [Corner, Corner, Corner, Corner] {
    const { x, y, w, h } = layer.rect;
    const side = layer.side!;
    const at = (px: number, py: number, u: number, v: number): Corner => {
      const p = place(leafPoint(side, { x: px, y: py }, camera.angle, camera.focal0));
      return { ...p, u, v };
    };
    return [at(x, y, 0, 0), at(x + w, y, 1, 0), at(x, y + h, 0, 1), at(x + w, y + h, 1, 1)];
  }

  /**
   * A card is a still plane at its contact depth, so its quads (only the
   * parts that hold wood) are built once and reused every frame.
   */
  private drawCard(layer: GateLayer, focal0: number) {
    const { gl } = this;
    let mesh = this.cardMeshes.get(layer.id);
    if (!mesh || mesh.focal0 !== focal0) {
      if (mesh) {
        gl.deleteVertexArray(mesh.vao);
        gl.deleteBuffer(mesh.buffer);
      }
      const { rect } = layer;
      const parts = layer.parts?.length ? layer.parts : [rect];
      const depth = groundDepth(layer.contact ?? GATE_GROUND_Y, focal0);
      const data = new Float32Array(parts.length * 6 * 5);
      let o = 0;
      const put = (px: number, py: number) => {
        const w = unproject({ x: px, y: py }, depth, focal0);
        data.set([w.x, w.y, w.z, (px - rect.x) / rect.w, (py - rect.y) / rect.h], o);
        o += 5;
      };
      for (const r of parts) {
        put(r.x, r.y);
        put(r.x + r.w, r.y);
        put(r.x, r.y + r.h);
        put(r.x, r.y + r.h);
        put(r.x + r.w, r.y);
        put(r.x + r.w, r.y + r.h);
      }
      const vao = gl.createVertexArray();
      const buffer = gl.createBuffer();
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);
      mesh = { vao, buffer, count: parts.length * 6, focal0 };
      this.cardMeshes.set(layer.id, mesh);
    }
    gl.bindVertexArray(mesh.vao);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
  }

}
