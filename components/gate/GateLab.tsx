"use client";

import { type ReactNode, useCallback, useState } from "react";
import { type RigParams, defaultRig } from "@/lib/gate-rig";
import { type GateDebugState, GateScene } from "./GateScene";

interface Control {
  key: keyof RigParams;
  label: string;
  min: number;
  max: number;
  step: number;
}

const controls: Control[] = [
  { key: "focalMm", label: "Focal (mm)", min: 18, max: 85, step: 1 },
  { key: "angle", label: "Opening (°)", min: 60, max: 120, step: 1 },
  { key: "stiffness", label: "Spring stiffness", min: 40, max: 300, step: 1 },
  { key: "damping", label: "Spring damping", min: 4, max: 40, step: 0.5 },
  { key: "mass", label: "Spring mass", min: 0.4, max: 3, step: 0.1 },
  { key: "blur", label: "Blur (px)", min: 0, max: 60, step: 1 },
  { key: "shadowOpacity", label: "Shadow opacity", min: 0, max: 1, step: 0.01 },
  { key: "shade", label: "Leaf shading", min: 0, max: 1, step: 0.01 },
  { key: "sunAzimuth", label: "Sun azimuth (°)", min: 0, max: 90, step: 1 },
  { key: "sunElevation", label: "Sun elevation (°)", min: 4, max: 60, step: 1 },
  { key: "squareDepth", label: "Square depth (×)", min: 2, max: 20, step: 0.5 },
  { key: "travel", label: "Ride length (×)", min: 1.2, max: 2.5, step: 0.05 },
  { key: "push", label: "Square push", min: 0, max: 0.15, step: 0.005 },
  { key: "openEnd", label: "Opening share", min: 0.2, max: 0.6, step: 0.01 },
];

const format = (n: number) => (Math.abs(n) >= 10 ? n.toFixed(0) : n.toFixed(2));

/** Development rig for the gate: every tunable of the scene on sliders, plus a frame counter. */
export function GateLab({ children }: { children: ReactNode }) {
  const [params, setParams] = useState<RigParams>(defaultRig);
  const [length, setLength] = useState(2.5);
  const [state, setState] = useState<GateDebugState | null>(null);
  const onDebug = useCallback((next: GateDebugState) => setState(next), []);

  const scrollTo = (p: number) => {
    const section = document.querySelector("main section");
    if (!section) return;
    const top = section.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: top + p * (section.clientHeight - window.innerHeight), behavior: "instant" });
  };

  return (
    <>
      <GateScene labelledBy="gate-heading" params={params} length={length} onDebug={onDebug}>
        {children}
      </GateScene>
      <aside className="fixed right-4 bottom-4 z-40 max-h-[80svh] w-72 overflow-y-auto rounded-md bg-paper/95 p-4 text-[13px] leading-tight text-ink shadow-lg">
        <p className="mb-3 font-medium tabular-nums">
          {state ? `${state.mode}${state.reason ? ` (${state.reason})` : ""} · ${state.stats.fps.toFixed(0)} fps · q${state.stats.quality}` : "…"}
        </p>
        <label className="mb-3 block">
          <span className="flex justify-between">
            <span>Progress</span>
            <span className="tabular-nums">{format(state?.progress ?? 0)}</span>
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={state?.progress ?? 0}
            onChange={(e) => scrollTo(Number(e.target.value))}
            className="w-full accent-pumpkin"
          />
        </label>
        <label className="mb-2 block">
          <span className="flex justify-between">
            <span>Section (× viewport)</span>
            <span className="tabular-nums">{format(length)}</span>
          </span>
          <input
            type="range"
            min={1.5}
            max={5}
            step={0.1}
            value={length}
            onChange={(e) => setLength(Number(e.target.value))}
            className="w-full accent-pumpkin"
          />
        </label>
        {controls.map(({ key, label, min, max, step }) => (
          <label key={key} className="mb-2 block">
            <span className="flex justify-between">
              <span>{label}</span>
              <span className="tabular-nums">{format(params[key])}</span>
            </span>
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={params[key]}
              onChange={(e) => setParams((p) => ({ ...p, [key]: Number(e.target.value) }))}
              className="w-full accent-pumpkin"
            />
          </label>
        ))}
        <button type="button" onClick={() => setParams(defaultRig)} className="mt-2 underline underline-offset-2">
          Reset
        </button>
      </aside>
    </>
  );
}
