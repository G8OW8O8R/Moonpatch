"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { type DoorParams, PEAK, cutTime, defaultDoor } from "@/lib/door-rig";
import { placePath } from "@/lib/routes";
import { type GateDebugState, GateScene, type SquareCopy } from "./GateScene";
import type { DoorSeek } from "./renderer/engine";

interface Control {
  key: Exclude<keyof DoorParams, "cutAt">;
  label: string;
  min: number;
  max: number;
  step: number;
}

const controls: Control[] = [
  { key: "duration", label: "Length (s)", min: 0.4, max: 2, step: 0.05 },
  { key: "zCut", label: "Square zoom at the cut", min: 1.2, max: 4, step: 0.05 },
  { key: "blur", label: "Blur at top speed (px)", min: 0, max: 40, step: 0.5 },
  { key: "blurPower", label: "Blur exponent", min: 1, max: 4, step: 0.1 },
  { key: "roomFrom", label: "Room zoom at the cut", min: 0.98, max: 1.04, step: 0.001 },
  { key: "leafRate", label: "Leaves vs room", min: 1, max: 2.5, step: 0.05 },
  { key: "exposure", label: "Exposure match (s)", min: 0, max: 0.2, step: 0.01 },
  { key: "turn", label: "Turn-around (s)", min: 0.04, max: 0.3, step: 0.01 },
];

const format = (n: number) => (Math.abs(n) >= 10 ? n.toFixed(0) : n.toFixed(3));

const percentile = (xs: number[], p: number) => {
  if (!xs.length) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
};

declare global {
  interface Window {
    /** Development only: hold the café move at a moment (ms), or let it go (null). */
    holdDoor?: (at: { leg: 1 | -1; ms: number } | null) => void;
  }
}

/** Development rig for the move between the square and the café: a timeline to scrub, every tunable on a slider. */
export function TransitionLab({ children, square }: { children: ReactNode; square: SquareCopy }) {
  const [door, setDoor] = useState<DoorParams>(defaultDoor);
  const [leg, setLeg] = useState<1 | -1>(1);
  const [ms, setMs] = useState(0);
  const [held, setHeld] = useState(false);
  const [state, setState] = useState<GateDebugState | null>(null);
  const [journey, setJourney] = useState<number[]>([]);
  const onDebug = useCallback((next: GateDebugState) => setState(next), []);
  const total = door.duration * 1000;

  const seek = useMemo<DoorSeek | null>(() => (held ? { room: "cafe", leg, ms: Math.min(ms, total) } : null), [held, leg, ms, total]);

  useEffect(() => {
    window.holdDoor = (at) => {
      if (!at) return setHeld(false);
      setLeg(at.leg);
      setMs(at.ms);
      setHeld(true);
    };
    return () => {
      delete window.holdDoor;
    };
  }, []);

  const cutMs = cutTime(door) * total;

  return (
    <>
      <GateScene labelledBy="gate-heading" square={square} door={door} seek={seek} onJourney={setJourney} onDebug={onDebug}>
        {children}
      </GateScene>
      <aside className="fixed right-4 bottom-4 z-40 max-h-[80svh] w-72 overflow-y-auto rounded-md bg-paper/95 p-4 text-[13px] leading-tight text-ink shadow-lg">
        <p className="mb-3 font-medium tabular-nums">
          {state ? `${state.mode}${state.reason ? ` (${state.reason})` : ""} · ${state.stats.fps.toFixed(0)} fps · q${state.stats.quality}` : "…"}
        </p>
        <div className="mb-3 flex gap-3">
          <a href={placePath(square.lang, "cafe")} onClick={(e) => (e.preventDefault(), window.history.pushState(null, "", placePath(square.lang, "cafe")))} className="underline underline-offset-2">
            Enter
          </a>
          <button type="button" onClick={() => window.history.back()} className="underline underline-offset-2">
            Back
          </button>
        </div>
        <label className="mb-2 flex items-center gap-2">
          <input type="checkbox" checked={held} onChange={(e) => setHeld(e.target.checked)} className="accent-pumpkin" />
          <span>Hold at a moment</span>
        </label>
        <div className="mb-2 flex gap-3">
          {([1, -1] as const).map((value) => (
            <label key={value} className="flex items-center gap-1">
              <input type="radio" name="leg" checked={leg === value} onChange={() => setLeg(value)} className="accent-pumpkin" />
              <span>{value === 1 ? "Way in" : "Way out"}</span>
            </label>
          ))}
        </div>
        <label className="mb-3 block">
          <span className="flex justify-between">
            <span>Time (cut at {cutMs.toFixed(0)} ms)</span>
            <span className="tabular-nums">{Math.min(ms, total).toFixed(0)} ms</span>
          </span>
          <input type="range" min={0} max={total} step={1} value={Math.min(ms, total)} onChange={(e) => setMs(Number(e.target.value))} className="w-full accent-pumpkin" />
        </label>
        <label className="mb-2 block">
          <span className="flex justify-between">
            <span>Cut (share of the move)</span>
            <span className="tabular-nums">{format(door.cutAt ?? PEAK.t)}</span>
          </span>
          <input
            type="range"
            min={0.2}
            max={0.7}
            step={0.001}
            value={door.cutAt ?? PEAK.t}
            onChange={(e) => setDoor((d) => ({ ...d, cutAt: Number(e.target.value) }))}
            className="w-full accent-pumpkin"
          />
        </label>
        {controls.map(({ key, label, min, max, step }) => (
          <label key={key} className="mb-2 block">
            <span className="flex justify-between">
              <span>{label}</span>
              <span className="tabular-nums">{format(door[key])}</span>
            </span>
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={door[key]}
              onChange={(e) => setDoor((d) => ({ ...d, [key]: Number(e.target.value) }))}
              className="w-full accent-pumpkin"
            />
          </label>
        ))}
        <button type="button" onClick={() => setDoor(defaultDoor)} className="mt-1 underline underline-offset-2">
          Reset
        </button>
        <p className="mt-3 tabular-nums" data-journey={JSON.stringify(journey)}>
          {journey.length
            ? `Last move: ${journey.length} frames · p50 ${percentile(journey, 50).toFixed(1)} ms · p95 ${percentile(journey, 95).toFixed(1)} ms · max ${Math.max(...journey).toFixed(1)} ms`
            : "No move yet"}
        </p>
      </aside>
    </>
  );
}
