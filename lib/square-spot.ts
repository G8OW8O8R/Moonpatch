/**
 * Where the front page starts. A reload or a fresh visit always starts at the
 * top, on the closed gate (the poster is that very frame). Coming back to the
 * square from somewhere on the farm (a building, the back button) lands where
 * the visitor left it, with the ride already over. The spot is kept for the
 * tab only, in scroll lengths of the section, so a resize cannot move it.
 */
import { z } from "zod";
import { type Track, defaultTrack, trackEnd } from "./square-rig";

export const SPOT_KEY = "moonpatch:square-spot";

const spotSchema = z.strictObject({ scrolled: z.number().finite().nonnegative() });

/** The stored spot, or null when there is none or it cannot be trusted. */
export function readSpot(raw: string | null): number | null {
  if (!raw) return null;
  try {
    const parsed = spotSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.scrolled : null;
  } catch {
    return null;
  }
}

export function writeSpot(scrolled: number): string {
  return JSON.stringify(spotSchema.parse({ scrolled }));
}

/** First scroll offset that is on the square, past the ride (viewport heights). */
export function squareFrom(track: Track = defaultTrack): number {
  return track.gate * track.start;
}

/** Only a spot on the square is worth coming back to: anywhere on the way in, the gate starts closed. */
export function spotToKeep(scrolled: number, track: Track = defaultTrack): number | null {
  if (!Number.isFinite(scrolled) || scrolled < squareFrom(track)) return null;
  return Math.min(scrolled, trackEnd(track));
}

export interface Arrival {
  /** The page is the notice board's own address. */
  board: boolean;
  /** The address asks for the square (`#square`, the way back from a building). */
  square: boolean;
  /** The visitor is coming back (a move inside the site, or the browser's back and forward). */
  returning: boolean;
  spot: number | null;
}

/** Scroll offset into the section to start at (viewport heights); 0 is the closed gate. */
export function startAt({ board, square, returning, spot }: Arrival, track: Track = defaultTrack): number {
  const kept = spot === null ? null : spotToKeep(spot, track);
  if (board) return trackEnd(track);
  if (returning && kept !== null) return kept;
  if (square) return trackEnd(track);
  return 0;
}
