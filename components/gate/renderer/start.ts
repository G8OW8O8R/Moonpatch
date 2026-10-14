/**
 * Starts the gate scene for a canvas on the page. Where the browser can hand
 * the canvas to a worker, the whole scene runs there; otherwise it runs on
 * the page. Loaded lazily, after the poster has painted.
 */
import type { DoorParams } from "@/lib/door-rig";
import type { RigParams } from "@/lib/gate-rig";
import type { ArmId } from "@/lib/square-props";
import { type Size, posterPlate } from "@/lib/plate-box";
import type { FrameStats } from "./GateRenderer";
import type { SquareState } from "./SquareRenderer";
import {
  type DoorSeek,
  type Engine,
  type EngineEvents,
  type EngineSetup,
  type FromWorker,
  type ScenePlace,
  type ToWorker,
  runGate,
} from "./engine";

export interface GateController {
  setProgress(progress: number): void;
  setRide(target: 0 | 1): void;
  setParams(params: RigParams): void;
  setSquare(state: SquareState): void;
  setLabel(arm: ArmId, bitmap: ImageBitmap): void;
  setPlace(place: ScenePlace): void;
  setDoor(params: DoorParams): void;
  setPointer(at: { x: number; y: number } | null): void;
  setLook(look: number): void;
  seek(at: DoorSeek | null): void;
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
  /** The timed ride has arrived: the page may scroll again. */
  onRideSettled?(ride: 0 | 1): void;
  /** The square's dusk layers and props are ready to draw. */
  onSquareReady?(): void;
  /** A move between the square and a building has cut to the other side. */
  onCut?(place: ScenePlace): void;
  /** A move has come to rest. */
  onPlaced?(place: ScenePlace): void;
  /** Frame times of the move that just ended, ms. */
  onJourney?(frames: number[]): void;
  onSeeked?(ms: number): void;
}

/** The engine behind a worker, driven by messages. */
function workerEngine(canvas: HTMLCanvasElement, setup: EngineSetup, callbacks: EngineEvents): Engine {
  const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  const send = (message: ToWorker, transfer: Transferable[] = []) => worker.postMessage(message, transfer);
  worker.onmessage = (event: MessageEvent<FromWorker>) => {
    const message = event.data;
    if (message.type === "ready") callbacks.onReady();
    else if (message.type === "fail") callbacks.onFail(message.reason);
    else if (message.type === "settled") callbacks.onRideSettled(message.ride);
    else if (message.type === "squareReady") callbacks.onSquareReady();
    else if (message.type === "cut") callbacks.onCut(message.place);
    else if (message.type === "placed") callbacks.onPlaced(message.place);
    else if (message.type === "journey") callbacks.onJourney(message.frames);
    else if (message.type === "seeked") callbacks.onSeeked(message.ms);
    else callbacks.onStats(message.stats);
  };
  worker.onerror = () => callbacks.onFail("worker failed");
  let offscreen: OffscreenCanvas;
  try {
    offscreen = canvas.transferControlToOffscreen();
  } catch (error) {
    worker.terminate();
    throw error;
  }
  send({ type: "init", canvas: offscreen, setup }, [offscreen]);
  return {
    setProgress: (progress) => send({ type: "progress", progress }),
    setRide: (target) => send({ type: "ride", target }),
    setParams: (params) => send({ type: "params", params }),
    setSquare: (state) => send({ type: "square", state }),
    setLabel: (arm, bitmap) => send({ type: "label", arm, bitmap }, [bitmap]),
    setPlace: (place) => send({ type: "place", place }),
    setDoor: (params) => send({ type: "door", params }),
    setPointer: (at) => send({ type: "pointer", at }),
    setLook: (look) => send({ type: "look", look }),
    seek: (at) => send({ type: "seek", at }),
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
  initial: { css: Size; params: RigParams; door: DoorParams; progress: number; square: SquareState; place: ScenePlace; debugLayer?: "gate" | "plate" },
  callbacks: GateCallbacks,
): GateController {
  let css = initial.css;
  let engine: Engine | null = null;
  let disposed = false;
  let pending: Array<(e: Engine) => void> = [];
  let latestSquare = initial.square;
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
    onRideSettled: (ride) => callbacks.onRideSettled?.(ride),
    onSquareReady: () => {
      if (!disposed) callbacks.onSquareReady?.();
    },
    onCut: (place) => {
      if (!disposed) callbacks.onCut?.(place);
    },
    onPlaced: (place) => {
      if (!disposed) callbacks.onPlaced?.(place);
    },
    onJourney: (frames) => callbacks.onJourney?.(frames),
    onSeeked: (ms) => callbacks.onSeeked?.(ms),
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
        door: initial.door,
        progress: initial.progress,
        square: latestSquare,
        place: initial.place,
        ...(initial.debugLayer ? { debugLayer: initial.debugLayer } : {}),
      };
      const offscreen = "transferControlToOffscreen" in canvas && typeof Worker !== "undefined";
      try {
        engine = offscreen ? workerEngine(canvas, setup, events) : runGate(canvas, setup, events);
      } catch (error) {
        if (!offscreen) throw error;
        // A canvas whose control has already gone (a module reloaded in development): start again on a fresh one.
        callbacks.onPlateChange();
        return;
      }
      for (const task of pending) task(engine);
      pending = [];
    });

  return {
    setProgress: (progress) => withEngine((e) => e.setProgress(progress)),
    setRide: (target) => withEngine((e) => e.setRide(target)),
    setParams: (params) => withEngine((e) => e.setParams(params)),
    setSquare(state) {
      latestSquare = state;
      if (engine) engine.setSquare(state);
    },
    setLabel: (arm, bitmap) => withEngine((e) => e.setLabel(arm, bitmap)),
    setPlace: (place) => withEngine((e) => e.setPlace(place)),
    setDoor: (params) => withEngine((e) => e.setDoor(params)),
    setPointer: (at) => engine?.setPointer(at),
    setLook: (look) => engine?.setLook(look),
    seek: (at) => withEngine((e) => e.seek(at)),
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
