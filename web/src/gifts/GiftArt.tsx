import type { CSSProperties } from 'react';
import { ItemGlyph } from '../shop/ItemGlyph';
import { ItemPicture } from '../shop/ItemPicture';
import { GiftLoopArt } from './GiftLoop';
import { scatter } from './motion';
import { useSvgId } from './useSvgId';

/**
 * The gift moments' pictures: the wrapped box (GiftBox.tsx, drawn in shared art/gift-box.ts), the night sky a grand
 * gift opens on, and the item itself. Decorative (aria-hidden); the surrounding words say what happens.
 */
export { GiftBox, type GiftBoxMotion } from './GiftBox';
export { useSvgId } from './useSvgId';

/**
 * The night a grand gift opens on: a sky of stars that come out one by one and a slow glow rising behind the gift, in
 * the stage's own gold (`--stage-gold`); CSS twinkles it, and under Reduce Motion it is simply there.
 */
export function NightSky({ className }: { className?: string }): React.JSX.Element {
  const glow = useSvgId('skyglow');
  const stars = Array.from({ length: 46 }, (_, i) => ({
    x: Math.round(scatter(i, 11) * 1000) / 10,
    y: Math.round(scatter(i, 13) * 900) / 10,
    r: 0.1 + scatter(i, 17) * 0.22,
    delay: Math.round(scatter(i, 19) * 1800),
  }));
  return (
    <svg className={`night-sky${className ? ` ${className}` : ''}`} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        {/* the stage's lamp gold, the same in both schemes, fading into the night */}
        <radialGradient id={glow} cx="0.5" cy="0.55" r="0.5">
          <stop offset="0" style={{ stopColor: 'var(--stage-gold)', stopOpacity: 0.5 }} />
          <stop offset="1" style={{ stopColor: 'var(--stage-gold)', stopOpacity: 0 }} />
        </radialGradient>
      </defs>
      <circle className="night-sky-glow" cx="50" cy="55" r="48" fill={`url(#${glow})`} />
      {stars.map((star, i) => (
        <circle key={i} className="night-sky-star" cx={star.x} cy={star.y} r={star.r} fill="currentColor" style={{ animationDelay: `${star.delay}ms` } as CSSProperties} />
      ))}
    </svg>
  );
}

/**
 * The item: its picture when it has one, otherwise its kind's glyph. With `loop`, a gift that has a living round plays
 * it while it is on screen (GiftLoop.tsx); a grid of gifts asks it only of the one picked, so a page never moves many.
 */
export function GiftItemArt({
  assetUrl,
  category,
  size = 96,
  className,
  loop = false,
}: {
  assetUrl: string | null;
  category: string;
  size?: number;
  className?: string;
  loop?: boolean;
}): React.JSX.Element {
  return (
    <span
      className={`gift-item-art gift-item-${category}${className ? ` ${className}` : ''}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {assetUrl ? loop ? <GiftLoopArt src={assetUrl} /> : <ItemPicture src={assetUrl} /> : <ItemGlyph category={category} size={Math.round(size * 0.45)} />}
    </span>
  );
}
