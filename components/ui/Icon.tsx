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
  | "ticket"
  | "recipe"
  | "tag";

/**
 * Decorative by design: the meaning always lives in adjacent text.
 * `className` lands on a wrapper, because a mask would clip any filter
 * (such as a drop shadow) set on the masked element itself.
 */
export function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  return (
    <span aria-hidden="true" className={`inline-flex flex-none ${className}`}>
      <span className="mask-icon" style={{ "--mask": `url(/icons/${name}.svg)` } as CSSProperties} />
    </span>
  );
}
