/**
 * What the farm sounds like where the visitor stands: one bed of sound per
 * scene, a handful of one-off sounds for things that happen, and the saved
 * choice to hear them. Plain logic only; the playing lives with the page.
 */
import { z } from "zod";
import type { RoomId } from "./rooms";

/** Where the visitor can stand, as far as sound goes. */
export type SoundScene = "gate" | "square" | RoomId;

/** The scenes with a bed of sound of their own; the gate and the square are heard in silence. */
export const BEDS = ["cafe", "barn", "haunt"] as const satisfies readonly SoundScene[];

export type Bed = (typeof BEDS)[number];

/** The one-off sounds: the creak of the gate, heard again in each building's door. */
export const CUES = ["gate-open"] as const;

export type Cue = (typeof CUES)[number];

/** How loud each bed plays at rest. The haunt shop is the one place allowed to be loud. */
export const BED_LEVEL: Readonly<Record<Bed, number>> = {
  cafe: 0.5,
  barn: 0.5,
  haunt: 0.7,
};

/** How loud each one-off sound plays. */
export const CUE_LEVEL: Readonly<Record<Cue, number>> = {
  "gate-open": 0.7,
};

/** Seconds: one bed hands over to the next as slowly as a scene change takes. */
export const CROSSFADE = 1.2;
/** Seconds: the switch brings the whole farm in or out. */
export const MASTER_FADE = 0.6;

/**
 * Time constant for `setTargetAtTime`: after `seconds` the level is within
 * 5 % of its target (three time constants), which reads as done.
 */
export function timeConstant(seconds: number): number {
  return Math.max(0.001, seconds / 3);
}

export type AudioFormat = "webm" | "mp3";

export function audioUrl(name: Bed | Cue, format: AudioFormat): string {
  return `/audio/${name}.${format}`;
}

/** Where the visitor stands, as far as sound goes: inside a building, on the square, or still at the gate. */
export function sceneAt(place: "square" | RoomId, onSquare: boolean): SoundScene {
  if (place !== "square") return place;
  return onSquare ? "square" : "gate";
}

/** Each bed's target level for a scene (zero when the visitor is elsewhere or the sound is off). */
export function bedTargets(scene: SoundScene | null): Record<Bed, number> {
  const out = {} as Record<Bed, number>;
  for (const bed of BEDS) out[bed] = bed === scene ? BED_LEVEL[bed] : 0;
  return out;
}

/** The door creaking open on the way into a building; the way out is quiet. */
export function moveCue(to: "square" | RoomId): Cue | null {
  return to === "square" ? null : "gate-open";
}

const savedSound = z.object({ on: z.boolean() });

/** The saved choice, read back; anything else (nothing saved, a stale or tampered save) is silence. */
export function readSoundChoice(stored: unknown): boolean {
  const parsed = savedSound.safeParse(stored);
  return parsed.success && parsed.data.on;
}
