"use client";

import { useEffect } from "react";
import { Icon } from "@/components/ui/Icon";
import { SOUND_STORAGE_KEY, rehydrateSound, useSound } from "@/lib/sound-store";
import type { FarmSound } from "./player";

let player: Promise<FarmSound> | null = null;

/**
 * The player, made the first time the sound is wanted, always inside a click
 * or a key: the audio clock is started right there, where every browser lets
 * sound begin, and the player's code follows.
 */
function farmSound(): Promise<FarmSound> {
  if (!player) {
    const ctx = new AudioContext();
    void ctx.resume().catch(() => undefined);
    player = import("./player").then(({ FarmSound }) => new FarmSound(ctx));
  }
  return player;
}

const GESTURES = ["pointerdown", "keydown"] as const;

/**
 * The header's sound switch. Silent until the visitor turns it on; the choice
 * is kept. A choice kept from an earlier visit waits for the first click or
 * key of this one, as browsers only let sound start from there, and nothing
 * is fetched before it.
 */
export function SoundSwitch({ label }: { label: string }) {
  const on = useSound((state) => state.on);
  const hydrated = useSound((state) => state.hydrated);

  useEffect(() => {
    void rehydrateSound();
    const onStorage = (event: StorageEvent) => {
      if (event.key === SOUND_STORAGE_KEY) void rehydrateSound();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (player) {
      void player.then((sound) => sound.setOn(on));
      return;
    }
    if (!on) return;
    const wake = () => {
      for (const type of GESTURES) window.removeEventListener(type, wake, true);
      void farmSound().then((sound) => sound.setOn(useSound.getState().on));
    };
    for (const type of GESTURES) window.addEventListener(type, wake, true);
    return () => {
      for (const type of GESTURES) window.removeEventListener(type, wake, true);
    };
  }, [on, hydrated]);

  const toggle = () => {
    void farmSound();
    useSound.getState().toggle();
  };

  return (
    <button type="button" onClick={toggle} aria-pressed={on} className="sound-switch flex items-center gap-1.5">
      <Icon name={on ? "sound-on" : "sound-off"} className="drop-shadow-hug" />
      <span>{label}</span>
    </button>
  );
}
