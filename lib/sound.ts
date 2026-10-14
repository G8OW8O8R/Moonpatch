/**
 * What the farm sounds like where the visitor stands: one bed of sound per
 * scene, a handful of one-off sounds for things that happen, and the saved
 * choice to hear them. Plain logic only; the playing lives with the page.
 */
import { z } from "zod";
import type { RoomId } from "./rooms";

/** A scene with its own bed of sound. */
export type SoundScene = "gate" | "square" | RoomId;

export const SOUND_SCENES = ["gate", "square", "cafe", "barn", "haunt"] as const satisfies readonly SoundScene[];

export const CUES = [
  "gate-open",
  "whoosh",
  "door-cafe",
  "door-barn",
  "door-haunt",
  "card-open",
  "tag-open",
  "basket-add",
  "stamp",
  "ticket-tear",
  "hover",
] as const;

export type Cue = (typeof CUES)[number];

/** How loud each bed plays at rest. The haunt shop is the one place allowed to be loud. */
export const BED_LEVEL: Readonly<Record<SoundScene, number>> = {
  gate: 0.55,
  square: 0.5,
  cafe: 0.5,
  barn: 0.5,
  haunt: 0.7,
};

/** How loud each one-off sound plays; the pointer's tick stays in the background. */
export const CUE_LEVEL: Readonly<Record<Cue, number>> = {
  "gate-open": 0.7,
  whoosh: 0.45,
  "door-cafe": 0.6,
  "door-barn": 0.6,
  "door-haunt": 0.7,
  "card-open": 0.5,
  "tag-open": 0.5,
  "basket-add": 0.55,
  stamp: 0.6,
  "ticket-tear": 0.6,
  hover: 0.16,
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

export function audioUrl(name: SoundScene | Cue, format: AudioFormat): string {
  return `/audio/${name}.${format}`;
}

/** Where the visitor stands, as far as sound goes: inside a building, on the square, or still at the gate. */
export function sceneAt(place: "square" | RoomId, onSquare: boolean): SoundScene {
  if (place !== "square") return place;
  return onSquare ? "square" : "gate";
}

/** Each bed's target level for a scene (zero when the visitor is elsewhere or the sound is off). */
export function bedTargets(scene: SoundScene | null): Record<SoundScene, number> {
  const out = {} as Record<SoundScene, number>;
  for (const s of SOUND_SCENES) out[s] = s === scene ? BED_LEVEL[s] : 0;
  return out;
}

/** The door heard on the way into a building, or the rush of air on the way out. */
export function moveCue(to: "square" | RoomId): Cue {
  return to === "square" ? "whoosh" : `door-${to}`;
}

const savedSound = z.object({ on: z.boolean() });

/** The saved choice, read back; anything else (nothing saved, a stale or tampered save) is silence. */
export function readSoundChoice(stored: unknown): boolean {
  const parsed = savedSound.safeParse(stored);
  return parsed.success && parsed.data.on;
}
