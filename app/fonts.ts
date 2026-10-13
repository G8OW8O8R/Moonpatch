import { Caveat, Fraunces, Instrument_Sans } from "next/font/google";

/** Headlines and the wordmark's italic voice. Not on the first screen, so no preload. */
export const fraunces = Fraunces({
  subsets: ["latin", "latin-ext"],
  style: ["normal", "italic"],
  axes: ["SOFT", "WONK", "opsz"],
  variable: "--font-fraunces",
  display: "swap",
  preload: false,
});

/** Interface and body copy. */
export const instrumentSans = Instrument_Sans({
  subsets: ["latin", "latin-ext"],
  variable: "--font-instrument-sans",
  display: "swap",
});

/** Hand-lettered accents: ingredients and notes on the board. */
export const caveat = Caveat({
  subsets: ["latin", "latin-ext"],
  variable: "--font-caveat",
  display: "swap",
  preload: false,
});

export const fontVariables = [fraunces.variable, instrumentSans.variable, caveat.variable].join(" ");
