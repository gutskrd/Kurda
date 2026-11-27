import { useId, useMemo, type CSSProperties } from 'react';
import { CHEST_LAYERS, CHEST_MOTES, CHEST_MOTE_MS, CHEST_TWINKLES, CHEST_TWINKLE_MS, chestDrawing, chestMote, chestTwinkle, type ChestTier } from '@kurda/shared';

/**
 * A quest's chest, drawn as on the phone (shared `art/chest.ts`), one look per tier; `size` is the shut chest's width.
 * Its layers are groups named by `data-part`, which quests.css animates: `open` shows it open and lit, `popping` plays
 * the shared CHEST_HOP opening, with the stars and motes round it after, `shine` makes a waiting chest knock
 * (CHEST_KNOCK) with light at its seam and a glint over its lock, and `reach` scales the shafts. Under Reduce Motion
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
  const twinkles = useMemo(() => (popping ? CHEST_TWINKLES.map((_, i) => chestTwinkle(i, { idPrefix: id })) : []), [popping, id]);
  const motes = useMemo(() => (popping ? CHEST_MOTES.map((_, i) => chestMote(i, { idPrefix: id })) : []), [popping, id]);
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
        {CHEST_LAYERS.filter((part) => part !== 'shadow').map((part) =>
          // The shafts grow inside their group, which sways them: two movements on one element would fight.
          part === 'rays' ? (
            <g key={part} data-part={part}>
              <g className="chest-rays-grow" dangerouslySetInnerHTML={{ __html: drawing.layers.rays.markup }} />
            </g>
          ) : (
            <g key={part} data-part={part} dangerouslySetInnerHTML={{ __html: drawing.layers[part].markup }} />
          ),
        )}
      </g>
      {twinkles.map((layer, i) => {
        const { at, delay } = CHEST_TWINKLES[i]!;
        const style = { transformOrigin: `${at[0]}px ${at[1]}px`, '--delay': `${Math.round(delay * CHEST_TWINKLE_MS)}ms` } as CSSProperties;
        return <g key={`t${i}`} className="chest-twinkle" style={style} dangerouslySetInnerHTML={{ __html: layer.markup }} />;
      })}
      {motes.map((layer, i) => {
        const { rise, delay } = CHEST_MOTES[i]!;
        const style = { '--rise': rise, '--delay': `${Math.round(delay * CHEST_MOTE_MS)}ms` } as CSSProperties;
        return <g key={`m${i}`} className="chest-mote" style={style} dangerouslySetInnerHTML={{ __html: layer.markup }} />;
      })}
    </svg>
  );
}
