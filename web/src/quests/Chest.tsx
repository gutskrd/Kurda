import { useId, useMemo, type CSSProperties } from 'react';
import { CHEST_LAYERS, chestDrawing, type ChestTier } from '@kurda/shared';

/**
 * A quest's chest, the drawing the phone shows too (shared `art/chest.ts`):
 * a chunky trunk seen from three quarters, amber wood in iron for a common
 * chest, in gold for a rare one, pomegranate lacquer in gold with a garnet
 * in its lock for an epic one. `size` is how wide the shut chest is; the
 * height follows.
 *
 * Its layers are groups named by part (`data-part`), which the stylesheet
 * (quests.css) moves: `open` stands it open with the light out of it,
 * `popping` plays the opening — the chest hops (the shared CHEST_HOP: a
 * crouch, a spring up with the lid bursting open at the top, a landing),
 * everything but the shadow moving as one group (`chest-hop`) about the
 * chest's foot while the shadow shrinks under it, the light blooms, the rays
 * turn and the stars burst as it lands — `shine` passes a glint over its lock
 * now and then, and `reach` is how far the rays go, as a multiple of the
 * drawing's own. Under reduced motion the stylesheet lets everything land
 * where it ends. A picture only: whatever holds it says what it is.
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
  // two chests on one page keep their gradients and clips apart
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
