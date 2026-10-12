/**
 * Starts the gate scene for a canvas on the page. Where the browser can hand
 * the canvas to a worker, the whole scene runs there; otherwise it runs on
 * the page. Loaded lazily, after the poster has painted.
 */
import type { RigParams } from "@/lib/gate-rig";
import { type Size, posterPlate } from "@/lib/plate-box";
import type { FrameStats } from "./GateRenderer";
import { type Engine, type EngineEvents, type EngineSetup, type FromWorker, type ToWorker, runGate } from "./engine";

export interface GateController {
  setProgress(progress: number): void;
  setParams(params: RigParams): void;
  resize(css: Size): void;
  setActive(active: boolean): void;
  dispose(): void;
}

export interface GateCallbacks {
  /** The first frame is on the canvas and matches the poster. */
  onReady(): void;
  /** WebGL is unavailable, too slow or was lost: show the poster fallback. */
  onFail(reason: string): void;
  /** The screen switched between the landscape and portrait plate: start over. */
  onPlateChange(): void;
  onStats?(stats: FrameStats): void;
}

/** The engine behind a worker, driven by messages. */
function workerEngine(canvas: HTMLCanvasElement, setup: EngineSetup, callbacks: EngineEvents): Engine {
  const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  const send = (message: ToWorker, transfer: Transferable[] = []) => worker.postMessage(message, transfer);
  worker.onmessage = (event: MessageEvent<FromWorker>) => {
    const message = event.data;
    if (message.type === "ready") callbacks.onReady();
    else if (message.type === "fail") callbacks.onFail(message.reason);
    else callbacks.onStats(message.stats);
  };
  worker.onerror = () => callbacks.onFail("worker failed");
  const offscreen = canvas.transferControlToOffscreen();
  send({ type: "init", canvas: offscreen, setup }, [offscreen]);
  return {
    setProgress: (progress) => send({ type: "progress", progress }),
    setParams: (params) => send({ type: "params", params }),
    resize: (css, dpr) => send({ type: "resize", css, dpr }),
    setActive: (active) => send({ type: "active", active }),
    dispose: () => {
      send({ type: "dispose" });
      // Give the worker a moment to free its textures, then make sure it is gone.
      setTimeout(() => worker.terminate(), 1000);
    },
  };
}

export function startGate(
  canvas: HTMLCanvasElement,
  poster: HTMLImageElement,
  initial: { css: Size; params: RigParams; progress: number },
  callbacks: GateCallbacks,
): GateController {
  let css = initial.css;
  let engine: Engine | null = null;
  let disposed = false;
  let pending: Array<(e: Engine) => void> = [];
  const plate = /gate-tall/.test(poster.currentSrc) ? "gate-tall" : posterPlate(css);
  const dpr = () => window.devicePixelRatio || 1;
  const withEngine = (task: (e: Engine) => void) => (engine ? task(engine) : pending.push(task));

  const events: EngineEvents = {
    onReady: () => {
      if (!disposed) callbacks.onReady();
    },
    onFail: (reason: string) => {
      if (disposed) return;
      disposed = true;
      engine?.dispose();
      callbacks.onFail(reason);
    },
    onStats: (stats: FrameStats) => callbacks.onStats?.(stats),
  };

  // The poster's file and natural size are only final once it has decoded.
  void poster
    .decode()
    .catch(() => undefined)
    .then(() => {
      if (disposed) return;
      const setup: EngineSetup = {
        poster: { src: poster.currentSrc, natural: { width: poster.naturalWidth, height: poster.naturalHeight } },
        plate,
        css,
        dpr: dpr(),
        params: initial.params,
        progress: initial.progress,
      };
      const offscreen = "transferControlToOffscreen" in canvas && typeof Worker !== "undefined";
      engine = offscreen ? workerEngine(canvas, setup, events) : runGate(canvas, setup, events);
      for (const task of pending) task(engine);
      pending = [];
    });

  return {
    setProgress: (progress) => withEngine((e) => e.setProgress(progress)),
    setParams: (params) => withEngine((e) => e.setParams(params)),
    resize(next) {
      css = next;
      if (posterPlate(next) !== plate) {
        callbacks.onPlateChange();
        return;
      }
      withEngine((e) => e.resize(next, dpr()));
    },
    setActive: (active) => withEngine((e) => e.setActive(active)),
    dispose() {
      disposed = true;
      engine?.dispose();
      engine = null;
      pending = [];
    },
  };
}
