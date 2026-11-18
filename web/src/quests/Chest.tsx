import { useId, useMemo, type CSSProperties } from 'react';
import { CHEST_LAYERS, chestDrawing, type ChestTier } from '@kurda/shared';

/**
 * A quest's chest, drawn as on the phone (shared `art/chest.ts`), one look per tier; `size` is the shut chest's width.
 * Its layers are groups named by `data-part`, which quests.css animates: `open` shows it open and lit, `popping` plays
 * the shared CHEST_HOP opening, `shine` passes a glint over the lock, and `reach` scales the rays. Under Reduce Motion
 * everything lands where it ends. Decorative; the holder labels it.
 */
export function Chest({
  tier,
  open = false,
  popping = false,
  shine = false,
  reach = 1,
  size = 48,
  className,
}: {
  tier: ChestTier;
  open?: boolean;
  popping?: boolean;
  shine?: boolean;
  reach?: number;
  size?: number;
  className?: string;
}): React.JSX.Element {
  // Two chests on one page keep their gradients and clips apart.
  const id = `chest${useId().replace(/[^A-Za-z0-9]/g, '')}`;
  const drawing = useMemo(() => chestDrawing(tier, { size, idPrefix: id }), [tier, size, id]);
  const { box } = drawing;
  const classes = ['chest', open ? 'is-open' : null, popping ? 'is-popping' : null, shine && !open ? 'is-shining' : null, className].filter(Boolean).join(' ');
  return (
    <svg
      className={classes}
      data-tier={tier}
      width={size}
      height={(size * box.h) / box.w}
      viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
      style={{ '--chest-reach': reach } as CSSProperties}
      aria-hidden="true"
      focusable="false"
    >
      <g data-part="shadow" dangerouslySetInnerHTML={{ __html: drawing.layers.shadow.markup }} />
      <g className="chest-hop">
        {CHEST_LAYERS.filter((part) => part !== 'shadow').map((part) => (
          <g key={part} data-part={part} dangerouslySetInnerHTML={{ __html: drawing.layers[part].markup }} />
        ))}
      </g>
    </svg>
  );
}
