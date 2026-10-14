/**
 * The farm's sound, through Web Audio: beds loop as buffers (an MP3 in a
 * looping <audio> leaves a gap at the seam), one gain per bed for the
 * handover between scenes, one master gain for the switch. Loaded only once
 * the visitor has turned the sound on; every file is fetched the first time
 * it is needed.
 */
import {
  type AudioFormat,
  CROSSFADE,
  CUES,
  CUE_LEVEL,
  type Cue,
  MASTER_FADE,
  SOUND_SCENES,
  type SoundScene,
  audioUrl,
  bedTargets,
  timeConstant,
} from "@/lib/sound";
import { type SoundSink, attachSound } from "./sound-bus";

interface Bed {
  gain: GainNode;
  source: AudioBufferSourceNode | null;
  /** Bumped on every change of level, so a bed that came back is not stopped by an older fade. */
  generation: number;
}

/** A one-off sound that is not ready this long after it was asked for has missed its moment. */
const CUE_PATIENCE = 350;

function preferredFormat(): AudioFormat {
  const probe = document.createElement("audio");
  return probe.canPlayType('audio/webm; codecs="opus"') ? "webm" : "mp3";
}

export class FarmSound implements SoundSink {
  private readonly ctx: AudioContext;
  private readonly master: GainNode;
  private readonly beds = new Map<SoundScene, Bed>();
  private readonly buffers = new Map<string, Promise<AudioBuffer | null>>();
  private format: AudioFormat = preferredFormat();
  private on = false;
  private current: SoundScene | null = null;
  private quietTimer = 0;
  private readonly onVisibility = () => {
    if (document.visibilityState === "hidden") void this.ctx.suspend().catch(() => undefined);
    else if (this.on) void this.ctx.resume().catch(() => undefined);
  };

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.ctx.destination);
    document.addEventListener("visibilitychange", this.onVisibility);
    attachSound(this);
  }

  /** The switch: the whole farm fades in or out; once silent, the audio clock stops. */
  setOn(on: boolean) {
    this.on = on;
    window.clearTimeout(this.quietTimer);
    const now = this.ctx.currentTime;
    const gain = this.master.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    if (on) {
      if (document.visibilityState !== "hidden") void this.ctx.resume().catch(() => undefined);
      gain.setTargetAtTime(1, now, timeConstant(MASTER_FADE));
      this.scene(this.current);
      this.warmCues();
      return;
    }
    gain.setTargetAtTime(0, now, timeConstant(MASTER_FADE));
    this.quietTimer = window.setTimeout(() => {
      if (!this.on) void this.ctx.suspend().catch(() => undefined);
    }, MASTER_FADE * 1000 + 100);
  }

  scene(scene: SoundScene | null) {
    this.current = scene;
    if (!this.on) return;
    const targets = bedTargets(scene);
    const now = this.ctx.currentTime;
    for (const name of SOUND_SCENES) {
      const level = targets[name];
      const bed = this.beds.get(name) ?? (level > 0 ? this.bed(name) : null);
      if (!bed) continue;
      const generation = ++bed.generation;
      const gain = bed.gain.gain;
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(gain.value, now);
      gain.setTargetAtTime(level, now, timeConstant(CROSSFADE));
      if (level > 0) {
        if (!bed.source) void this.start(name, bed, generation);
        continue;
      }
      // Out of earshot, the loop stops; it starts again from its buffer if the visitor comes back.
      window.setTimeout(() => {
        if (bed.generation !== generation || !bed.source) return;
        bed.source.stop();
        bed.source.disconnect();
        bed.source = null;
      }, CROSSFADE * 2000);
    }
  }

  cue(cue: Cue) {
    if (!this.on || this.ctx.state !== "running") return;
    const asked = performance.now();
    void this.buffer(cue).then((buffer) => {
      if (!buffer || !this.on || performance.now() - asked > CUE_PATIENCE) return;
      const source = this.ctx.createBufferSource();
      const gain = this.ctx.createGain();
      source.buffer = buffer;
      gain.gain.value = CUE_LEVEL[cue];
      source.connect(gain).connect(this.master);
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
      };
      source.start();
    });
  }

  dispose() {
    attachSound(null);
    window.clearTimeout(this.quietTimer);
    document.removeEventListener("visibilitychange", this.onVisibility);
    void this.ctx.close().catch(() => undefined);
  }

  private bed(name: SoundScene): Bed {
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.master);
    const bed: Bed = { gain, source: null, generation: 0 };
    this.beds.set(name, bed);
    return bed;
  }

  private async start(name: SoundScene, bed: Bed, generation: number) {
    const buffer = await this.buffer(name);
    if (!buffer || bed.source || bed.generation !== generation || this.current !== name) return;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(bed.gain);
    // Each return picks up somewhere along the loop, so it never sounds like a restart.
    source.start(0, Math.random() * buffer.duration);
    bed.source = source;
  }

  /** The small sounds, fetched while the visitor is still listening to the first bed. */
  private warmCues() {
    const warm = () => {
      for (const cue of CUES) void this.buffer(cue);
    };
    if ("requestIdleCallback" in window) window.requestIdleCallback(warm);
    else setTimeout(warm, 200);
  }

  private buffer(name: SoundScene | Cue): Promise<AudioBuffer | null> {
    let pending = this.buffers.get(name);
    if (!pending) {
      pending = this.load(name);
      this.buffers.set(name, pending);
    }
    return pending;
  }

  /** Opus in WebM where the browser plays it; MP3 where it does not, or where it would not decode. */
  private async load(name: SoundScene | Cue): Promise<AudioBuffer | null> {
    for (const format of this.format === "webm" ? (["webm", "mp3"] as const) : (["mp3"] as const)) {
      try {
        const response = await fetch(audioUrl(name, format));
        if (!response.ok) continue;
        const buffer = await this.ctx.decodeAudioData(await response.arrayBuffer());
        this.format = format;
        return buffer;
      } catch {
        // The next format, or silence for this one sound.
      }
    }
    return null;
  }
}
