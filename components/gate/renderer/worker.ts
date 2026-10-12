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
