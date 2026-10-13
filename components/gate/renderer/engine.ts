/**
 * The gate scene's run loop, free of the DOM, so it can live in a worker on
 * an OffscreenCanvas (or, where that is missing, on the page itself). Picks
 * the textures that suit the screen, loads them, and draws frames only while
 * something moves.
 */
import { type Follower, type RigParams, endWindow, followOpening, restWindow, settledState } from "@/lib/gate-rig";
import type { PosterPlate, Size } from "@/lib/plate-box";
import { type ArmId, BOARD_WRITING, type PropQuad, openedBoard } from "@/lib/square-props";
import { type FrameStats, GateRenderer, type GateImages, gateLayers } from "./GateRenderer";
import { GRAIN_FPS, GrainPass } from "./grain";
import { type SquareImages, SquareRenderer, type SquareState } from "./SquareRenderer";

export interface PosterInfo {
  /** The file the <img> shows. */
  src: string;
  /** Its natural size, which srcset scales by the chosen density and rounds. */
  natural: Size;
}

export interface EngineSetup {
  poster: PosterInfo;
  plate: PosterPlate;
  css: Size;
  dpr: number;
  params: RigParams;
  /** Gate progress through its part of the section (0–1). */
  progress: number;
  square: SquareState;
  /** Development only: hold the gate renderer ("gate") or draw the square without its props ("plate"), to compare frames. */
  debugLayer?: "gate" | "plate";
}

export interface EngineEvents {
  onReady(): void;
  onFail(reason: string): void;
  onStats(stats: FrameStats): void;
  /** The timed ride has arrived where it was sent (1 on the square, 0 back at the gate). */
  onRideSettled(ride: 0 | 1): void;
  /** The dusk plates and the props are on the GPU: the square may show its props. */
  onSquareReady(): void;
}

export interface Engine {
  setProgress(progress: number): void;
  /** Plays the ride forwards (1) or back (0). */
  setRide(target: 0 | 1): void;
  setParams(params: RigParams): void;
  setSquare(state: SquareState): void;
  /** Lettering for a signpost arm, drawn on the page where the fonts live. */
  setLabel(arm: ArmId, bitmap: ImageBitmap): void;
  resize(css: Size, dpr: number): void;
  setActive(active: boolean): void;
  dispose(): void;
}

/** Messages from the page to the worker. */
export type ToWorker =
  | { type: "init"; canvas: OffscreenCanvas; setup: EngineSetup }
  | { type: "progress"; progress: number }
  | { type: "ride"; target: 0 | 1 }
  | { type: "params"; params: RigParams }
  | { type: "square"; state: SquareState }
  | { type: "label"; arm: ArmId; bitmap: ImageBitmap }
  | { type: "resize"; css: Size; dpr: number }
  | { type: "active"; active: boolean }
  | { type: "dispose" };

/** Messages from the worker to the page. */
export type FromWorker =
  | { type: "ready" }
  | { type: "fail"; reason: string }
  | { type: "stats"; stats: FrameStats }
  | { type: "settled"; ride: 0 | 1 }
  | { type: "squareReady" };

/** Device pixels per plate pixel above which the full-size layers are worth their weight. */
const FULL_SIZE_FROM = 0.55;

/** Fetches and decodes off the main thread; layers come out premultiplied. */
async function loadBitmap(src: string, premultiply: boolean, raw = false): Promise<ImageBitmap> {
  const response = await fetch(src);
  if (!response.ok) throw new Error(`could not load ${src}`);
  return createImageBitmap(await response.blob(), {
    premultiplyAlpha: premultiply ? "premultiply" : "none",
    // Data, not a picture: no colour management may touch it.
    ...(raw ? { colorSpaceConversion: "none" as const } : {}),
  });
}

/** Width of the square plates for this screen, shared by golden and the dusk layers so they line up. */
const squareWidthFor = (css: Size, dpr: number) => (endWindow(css).scale * dpr > 0.62 ? 2576 : 1600);

const PROP_FILES: Record<PropQuad["id"], string> = {
  post: "post",
  "arm-cafe": "arm-cafe",
  "arm-barn": "arm-barn",
  "arm-haunt": "arm-haunt",
  board: "board",
};

/** The square's second course, fetched once the gate is running. */
async function loadSquareImages(css: Size, dpr: number): Promise<SquareImages> {
  const width = squareWidthFor(css, dpr);
  const ids = Object.keys(PROP_FILES) as PropQuad["id"][];
  const [base, lights, idMap, writing, ...props] = await Promise.all([
    loadBitmap(`/img/square/dusk-base-${width}.webp`, false),
    loadBitmap(`/img/square/dusk-lights-${width}.webp`, false),
    loadBitmap(`/img/square/lights-${width}.webp`, false, true),
    loadBitmap(BOARD_WRITING, true),
    ...ids.map((id) => loadBitmap(`/img/square/${PROP_FILES[id]}.webp`, true)),
  ]);
  return {
    base: base!,
    lights: lights!,
    ids: idMap!,
    writing: writing!,
    props: Object.fromEntries(ids.map((id, i) => [id, props[i]!])) as Record<PropQuad["id"], ImageBitmap>,
  };
}

async function loadImages({ poster, plate, css, dpr }: EngineSetup): Promise<GateImages> {
  // The square in the same format the browser chose for the poster.
  const format = /\.webp(\?|$)/.test(poster.src) ? "webp" : "avif";
  const squareWidth = squareWidthFor(css, dpr);
  const size = restWindow(css).scale * dpr > FULL_SIZE_FROM ? "full" : "half";
  // The very file the <img> shows (from the cache), decoded at its own pixel size.
  const [posterBitmap, square, ...layerBitmaps] = await Promise.all([
    loadBitmap(poster.src, false),
    loadBitmap(`/img/plates/square-golden-${squareWidth}.${format}`, false),
    ...gateLayers.map((layer) => loadBitmap(`/img/gate/${layer.id}.${plate}.${size}.webp`, true)),
  ]);
  return {
    plate,
    poster: { bitmap: posterBitmap!, natural: poster.natural },
    square: square!,
    layers: Object.fromEntries(gateLayers.map((layer, i) => [layer.id, layerBitmaps[i]!])),
  };
}

type FrameRequest = (callback: (now: number) => void) => number;

/** Animation frames where the global scope offers them, a 60 Hz timer elsewhere. */
function frameScheduler(): { request: FrameRequest; cancel: (id: number) => void } {
  const scope = globalThis as { requestAnimationFrame?: FrameRequest; cancelAnimationFrame?: (id: number) => void };
  if (typeof scope.requestAnimationFrame === "function" && typeof scope.cancelAnimationFrame === "function") {
    return { request: scope.requestAnimationFrame.bind(globalThis), cancel: scope.cancelAnimationFrame.bind(globalThis) };
  }
  return {
    request: (callback) => setTimeout(() => callback(performance.now()), 16) as unknown as number,
    cancel: (id) => clearTimeout(id),
  };
}

export function runGate(canvas: HTMLCanvasElement | OffscreenCanvas, setup: EngineSetup, events: EngineEvents): Engine {
  let { css, dpr, params, progress } = setup;
  let square: SquareState = setup.square;
  let squareRenderer: SquareRenderer | null = null;
  const pendingLabels = new Map<ArmId, ImageBitmap>();
  let grain: GrainPass | null = null;
  let lastStill = 0;
  // A page opened mid-way shows the settled scene at once; motion starts from there.
  const settled = settledState(progress, params);
  let opening: Follower = { value: settled.opening, velocity: 0 };
  let ride = settled.ride;
  let rideTarget: 0 | 1 = settled.ride === 1 ? 1 : 0;
  let lastFrame = 0;
  let active = true;
  let disposed = false;
  let renderer: GateRenderer | null = null;
  const started = performance.now();
  let raf = 0;
  let movedAt = -Infinity;
  let ready = false;
  /**
   * Square frames drawn since its layers arrived (-1: none to wait for). The page is told the square
   * is ready only once a frame of it is on the canvas, so the canvas is never shown a frame early.
   */
  let squareFrames = -1;
  const frames = frameScheduler();

  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
    // A software rasteriser could never hold the frame rate: the poster is better.
    failIfMajorPerformanceCaveat: true,
  }) as WebGL2RenderingContext | null;

  const fail = (reason: string) => {
    if (disposed) return;
    dispose();
    events.onFail(reason);
  };

  const frame = (now: number) => {
    raf = 0;
    if (!renderer || !active || disposed) return;
    // Frame time, capped so a stall (a hidden tab) never turns into a jump.
    const dt = lastFrame ? Math.min(0.05, (now - lastFrame) / 1000) : 0;
    lastFrame = now;

    opening = followOpening(opening, Math.min(1, Math.max(0, progress / params.openEnd)), dt, params);
    const riding = ride !== rideTarget;
    if (riding) {
      const step = dt / params.rideDuration;
      ride = rideTarget === 1 ? Math.min(1, ride + step) : Math.max(0, ride - step);
      if (ride === rideTarget) events.onRideSettled(rideTarget);
    }
    // Once the ride has landed, the square takes over from the same texture.
    const onSquare = !riding && ride === 1 && !!squareRenderer && setup.debugLayer !== "gate";
    const busy = riding || opening.velocity !== 0 || now - movedAt < 160;
    const seconds = (now - started) / 1000;
    // The gate draws whenever asked to. The square runs on even at rest, at a film's pace: new grain,
    // and the lights' flicker, every frame of film.
    if (busy || !onSquare || now - lastStill >= 1000 / GRAIN_FPS - 4) {
      lastStill = now;
      if (onSquare) squareRenderer!.render(setup.debugLayer === "plate" ? { ...square, props: 0 } : square, css, renderer.devicePixelRatio, seconds, renderer.size);
      else renderer.render({ opening: opening.value, ride }, params, riding);
      // The closed gate is the poster itself; grain comes in along the ride and stays on the square.
      // Over the opened board the page lays the same film itself, over its cards as well.
      const dpr = renderer.devicePixelRatio;
      const board = onSquare && square.visit >= 0.999 ? openedBoard(css) : null;
      const hole = board && { x: board.x * dpr, y: board.y * dpr, w: board.w * dpr, h: board.h * dpr };
      grain?.draw(onSquare ? 1 : ride * ride, seconds, renderer.size, dpr, hole);
      if (onSquare && squareFrames >= 0 && ++squareFrames === 2) {
        squareFrames = -1;
        events.onSquareReady();
      }
    }

    // Keep drawing every frame while anything moves, so motion is smooth and its pace measurable.
    if (busy) renderer.recordFrame(now);
    if (!ready) {
      ready = true;
      events.onReady();
      // A page opened past the threshold starts with the ride already landed.
      if (ride === rideTarget) events.onRideSettled(rideTarget);
    }
    // The film runs on once the square is drawn; while its layers still upload, the landed frame holds still.
    if (busy || onSquare) schedule();
    else lastFrame = 0;
  };

  const schedule = () => {
    if (!raf && active && !disposed) raf = frames.request(frame);
  };

  const onLost = (event: Event) => {
    event.preventDefault();
    fail("context lost");
  };

  if (!gl) {
    queueMicrotask(() => fail("no webgl2"));
  } else {
    canvas.addEventListener("webglcontextlost", onLost);
    loadImages(setup)
      .then((images) =>
        GateRenderer.create(
          canvas,
          gl,
          images,
          (stats) => {
            events.onStats(stats);
            if (stats.quality === 2) fail("too slow");
          },
          () => new Promise<void>((resolve) => frames.request(() => resolve())),
        ),
      )
      .then((created) => {
        if (disposed) {
          created.dispose();
          return;
        }
        renderer = created;
        renderer.resize(css, dpr);
        schedule();
        startSquare(created);
        void GrainPass.create(gl!, () => new Promise<void>((resolve) => frames.request(() => resolve())))
          .then((pass) => {
            if (disposed) pass.dispose();
            else grain = pass;
          })
          .catch(() => undefined);
      })
      .catch((error: unknown) => fail(error instanceof Error ? error.message : "load failed"));
  }

  /** The square's own layers load behind the gate, while the visitor is still looking at it. */
  function startSquare(gate: GateRenderer) {
    const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
    Promise.all([
      loadSquareImages(css, dpr),
      SquareRenderer.create(gl!, gate.squareTexture, () => new Promise<void>((resolve) => frames.request(() => resolve()))),
    ])
      .then(async ([images, created]) => {
        if (disposed) {
          created.dispose();
          return;
        }
        await created.upload(images, pause);
        if (disposed) {
          created.dispose();
          return;
        }
        for (const [arm, bitmap] of pendingLabels) created.setLabel(arm, bitmap);
        pendingLabels.clear();
        squareRenderer = created;
        squareFrames = 0;
        schedule();
      })
      // Without its dusk layers the square still stands, in golden light: never worth failing the gate over.
      .catch(() => undefined);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (raf) frames.cancel(raf);
    canvas.removeEventListener("webglcontextlost", onLost);
    squareRenderer?.dispose();
    squareRenderer = null;
    for (const bitmap of pendingLabels.values()) bitmap.close();
    pendingLabels.clear();
    grain?.dispose();
    grain = null;
    renderer?.dispose();
    renderer = null;
  }

  return {
    setProgress(next) {
      if (next === progress) return;
      progress = next;
      movedAt = performance.now();
      schedule();
    },
    setRide(target) {
      if (target === rideTarget) return;
      rideTarget = target;
      schedule();
    },
    setParams(next) {
      params = next;
      schedule();
    },
    setSquare(next) {
      square = next;
      movedAt = performance.now();
      schedule();
    },
    setLabel(arm, bitmap) {
      if (squareRenderer) {
        squareRenderer.setLabel(arm, bitmap);
        schedule();
      } else {
        pendingLabels.get(arm)?.close();
        pendingLabels.set(arm, bitmap);
      }
    },
    resize(nextCss, nextDpr) {
      css = nextCss;
      dpr = nextDpr;
      renderer?.resize(css, dpr);
      // A resized canvas is blank: draw the very next frame.
      lastStill = 0;
      schedule();
    },
    setActive(next) {
      active = next;
      if (next) schedule();
      else if (raf) {
        frames.cancel(raf);
        raf = 0;
      }
    },
    dispose,
  };
}
