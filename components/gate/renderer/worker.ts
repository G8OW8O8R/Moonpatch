/// <reference lib="webworker" />
/**
 * Runs the gate scene off the main thread: the WebGL context, decoding,
 * uploads and every frame happen here, so the page never waits on the GPU.
 */
import { type Engine, type FromWorker, type ToWorker, runGate } from "./engine";

const scope = self as unknown as DedicatedWorkerGlobalScope;
let engine: Engine | null = null;
const post = (message: FromWorker) => scope.postMessage(message);

scope.onmessage = (event: MessageEvent<ToWorker>) => {
  const message = event.data;
  switch (message.type) {
    case "init":
      engine = runGate(message.canvas, message.setup, {
        onReady: () => post({ type: "ready" }),
        onFail: (reason) => post({ type: "fail", reason }),
        onStats: (stats) => post({ type: "stats", stats }),
        onRideSettled: (ride) => post({ type: "settled", ride }),
        onSquareReady: () => post({ type: "squareReady" }),
        onCut: (place) => post({ type: "cut", place }),
        onPlaced: (place) => post({ type: "placed", place }),
        onJourney: (frames) => post({ type: "journey", frames }),
        onSeeked: (ms) => post({ type: "seeked", ms }),
      });
      break;
    case "progress":
      engine?.setProgress(message.progress);
      break;
    case "ride":
      engine?.setRide(message.target);
      break;
    case "params":
      engine?.setParams(message.params);
      break;
    case "square":
      engine?.setSquare(message.state);
      break;
    case "label":
      if (engine) engine.setLabel(message.arm, message.bitmap);
      else message.bitmap.close();
      break;
    case "place":
      engine?.setPlace(message.place);
      break;
    case "door":
      engine?.setDoor(message.params);
      break;
    case "pointer":
      engine?.setPointer(message.at);
      break;
    case "look":
      engine?.setLook(message.look);
      break;
    case "seek":
      engine?.seek(message.at);
      break;
    case "resize":
      engine?.resize(message.css, message.dpr);
      break;
    case "active":
      engine?.setActive(message.active);
      break;
    case "dispose":
      engine?.dispose();
      engine = null;
      scope.close();
      break;
  }
};
