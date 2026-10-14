import type { Cue, SoundScene } from "@/lib/sound";

/** What the page tells the sound: where the visitor is, and what just happened. */
export interface SoundSink {
  scene(scene: SoundScene | null): void;
  cue(cue: Cue): void;
}

let scene: SoundScene | null = null;
let sink: SoundSink | null = null;

/**
 * The scene on screen announces itself here, and `null` when it leaves the
 * page. Costs nothing while the sound is off: no player exists until then.
 */
export function setSoundScene(next: SoundScene | null) {
  if (next === scene) return;
  scene = next;
  sink?.scene(next);
}

/** A one-off sound; dropped while the sound is off. */
export function playCue(cue: Cue) {
  sink?.cue(cue);
}

/** The player plugs in once the sound is on, and is told at once where the visitor is. */
export function attachSound(next: SoundSink | null) {
  sink = next;
  next?.scene(scene);
}
