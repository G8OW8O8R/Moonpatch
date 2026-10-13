"use client";

import { useEffect } from "react";
import type { ArmId } from "@/lib/square-props";
import { warmSquare } from "./warm";

/** Inside a building: the square is made ready for the way back, so it is there the moment the visitor returns. */
export function SquareWarmup({ arms, lang }: { arms: Record<ArmId, string>; lang: string }) {
  useEffect(() => warmSquare({ labels: arms, lang }), [arms, lang]);
  return null;
}
