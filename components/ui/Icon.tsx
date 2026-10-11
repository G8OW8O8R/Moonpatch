import type { CSSProperties } from "react";

export type IconName =
  | "moon"
  | "wheelbarrow"
  | "sound-on"
  | "sound-off"
  | "close"
  | "arrow-left"
  | "plus"
  | "minus"
  | "pin"
  | "calendar"
  | "ticket";

/** Decorative by design: the meaning always lives in adjacent text. */
export function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`mask-icon ${className}`}
      style={{ "--mask": `url(/icons/${name}.svg)` } as CSSProperties}
    />
  );
}
