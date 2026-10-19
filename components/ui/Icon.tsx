import { HUG } from "./hug";
import { ICON_SHAPES, type IconName } from "./icon-shapes";

export type { IconName };

/** The outline's width on screen at the usual 1.25em, so the halo starts at its edge. */
const LINE_PX = 1.35;

/**
 * Decorative by design: the meaning always lives in adjacent text. Drawn
 * inline in currentColor; `halo` lays the header's hug under it.
 */
export function Icon({ name, className = "", halo = false }: { name: IconName; className?: string; halo?: boolean }) {
  const shape: { body: string; filled?: true } = ICON_SHAPES[name];
  const line = shape.filled ? 0 : LINE_PX;
  const paint = shape.filled
    ? { fill: "currentColor" }
    : { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" } as const;

  return (
    <span aria-hidden="true" className={`inline-flex flex-none ${className}`}>
      <svg viewBox="0 0 24 24" focusable="false" className="ui-icon">
        {halo && (
          <g className="icon-hug" fill="none" strokeLinecap="round" strokeLinejoin="round">
            {HUG.map(({ reach, opacity }) => (
              <g key={reach} strokeWidth={line + reach * 2} strokeOpacity={opacity} dangerouslySetInnerHTML={{ __html: shape.body }} />
            ))}
          </g>
        )}
        <g {...paint} dangerouslySetInnerHTML={{ __html: shape.body }} />
      </svg>
    </span>
  );
}
