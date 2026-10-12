/**
 * The gate scene's run loop, free of the DOM, so it can live in a worker on
 * an OffscreenCanvas (or, where that is missing, on the page itself). Picks
 * the textures that suit the screen, loads them, and draws frames only while
 * something moves.
 */
import { type Follower, type RigParams, endWindow, followOpening, restWindow, settledState } from "@/lib/gate-rig";
import type { PosterPlate, Size } from "@/lib/plate-box";
import { type FrameStats, GateRenderer, type GateImages, gateLayers } from "./GateRenderer";

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
  /** Scroll progress through the section (0–1). */
  progress: number;
}

export interface EngineEvents {
  onReady(): void;
  onFail(reason: string): void;
  onStats(stats: FrameStats): void;
  /** The timed ride has arrived where it was sent (1 on the square, 0 back at the gate). */
  onRideSettled(ride: 0 | 1): void;
}

export interface Engine {
  setProgress(progress: number): void;
  /** Plays the ride forwards (1) or back (0). */
  setRide(target: 0 | 1): void;
  setParams(params: RigParams): void;
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
  | { type: "resize"; css: Size; dpr: number }
  | { type: "active"; active: boolean }
  | { type: "dispose" };

/** Messages from the worker to the page. */
export type FromWorker =
  | { type: "ready" }
  | { type: "fail"; reason: string }
  | { type: "stats"; stats: FrameStats }
  | { type: "settled"; ride: 0 | 1 };

/** Device pixels per plate pixel above which the full-size layers are worth their weight. */
const FULL_SIZE_FROM = 0.55;

/** Fetches and decodes off the main thread; layers come out premultiplied. */
async function loadBitmap(src: string, premultiply: boolean): Promise<ImageBitmap> {
  const response = await fetch(src);
  if (!response.ok) throw new Error(`could not load ${src}`);
  return createImageBitmap(await response.blob(), { premultiplyAlpha: premultiply ? "premultiply" : "none" });
}

async function loadImages({ poster, plate, css, dpr }: EngineSetup): Promise<GateImages> {
  // The square in the same format the browser chose for the poster.
  const format = /\.webp(\?|$)/.test(poster.src) ? "webp" : "avif";
  const squareWidth = endWindow(css).scale * dpr > 0.62 ? 2576 : 1600;
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
  // A page opened mid-way shows the settled scene at once; motion starts from there.
  const settled = settledState(progress, params);
  let opening: Follower = { value: settled.opening, velocity: 0 };
  let ride = settled.ride;
  let rideTarget: 0 | 1 = settled.ride === 1 ? 1 : 0;
  let lastFrame = 0;
  let active = true;
  let disposed = false;
  let renderer: GateRenderer | null = null;
  let raf = 0;
  let movedAt = -Infinity;
  let ready = false;
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
    renderer.render({ opening: opening.value, ride }, params, riding);

    // Keep drawing every frame while anything moves, so motion is smooth and its pace measurable.
    const busy = riding || opening.velocity !== 0 || now - movedAt < 160;
    if (busy) renderer.recordFrame(now);
    if (!ready) {
      ready = true;
      events.onReady();
    }
    if (busy) schedule();
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
      })
      .catch((error: unknown) => fail(error instanceof Error ? error.message : "load failed"));
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (raf) frames.cancel(raf);
    canvas.removeEventListener("webglcontextlost", onLost);
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
    resize(nextCss, nextDpr) {
      css = nextCss;
      dpr = nextDpr;
      renderer?.resize(css, dpr);
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
