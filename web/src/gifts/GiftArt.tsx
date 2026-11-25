import { useId, type CSSProperties } from 'react';
import type { GiftTier } from '@kurda/shared';
import { ItemGlyph } from '../shop/ItemGlyph';
import { ItemPicture } from '../shop/ItemPicture';
import { scatter } from './motion';

/**
 * The gift moments' pictures, drawn in SVG. The wrapping is a kilim pattern of hooked diamonds, in pomegranate red,
 * indigo or Newroz gold by tier, with a gold ribbon. Every part has a class for CSS to animate. Decorative
 * (aria-hidden); the surrounding words say what happens.
 */

interface Palette {
  base: string;
  motif: string;
  inner: string;
  cream: string;
  lid: string;
}

const KILIM: Readonly<Record<GiftTier, Palette>> = {
  // Pomegranate red, gold and indigo, the colours of an Amed kilim.
  common: { base: '#9b2335', motif: '#f0c24a', inner: '#24325f', cream: '#f6e7c8', lid: '#7d1b2b' },
  // Indigo ground with gold and red, darker for a rarer gift.
  rare: { base: '#22305e', motif: '#f0c24a', inner: '#b8324a', cream: '#f6e7c8', lid: '#1a2549' },
  // Newroz: fire-gold ground, deep red and night.
  legendary: { base: '#d39a1c', motif: '#8f1d2c', inner: '#2a1a10', cream: '#fff3c4', lid: '#b07f12' },
  // The night sky: deep indigo with silver-gold stars, for the moon, the sun and the galaxy.
  grand: { base: '#141a3c', motif: '#e8c66a', inner: '#3b4aa0', cream: '#f4eedb', lid: '#0d1230' },
};

/** An id usable inside url(#…), since React's ids contain characters a fragment would need escaped. */
export function useSvgId(prefix: string): string {
  return `${prefix}${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
}

/**
 * One 20-unit kilim tile: a hooked stepped diamond with a smaller one and a seed inside, and quarter diamonds at the
 * corners that meet the neighbours' to form the second row.
 */
function KilimPattern({ id, p, scale = 1 }: { id: string; p: Palette; scale?: number }): React.JSX.Element {
  return (
    <pattern id={id} width={20 * scale} height={20 * scale} patternUnits="userSpaceOnUse">
      <g transform={`scale(${scale})`}>
        <rect width="20" height="20" fill={p.base} />
        <path d="M10 2.5 L17.5 10 L10 17.5 L2.5 10 Z" fill={p.motif} />
        <path d="M10 5.5 L14.5 10 L10 14.5 L5.5 10 Z" fill={p.inner} />
        <path d="M10 8 L12 10 L10 12 L8 10 Z" fill={p.cream} />
        {/* The hooks: small ram's horns on the diamond's points. */}
        <path d="M10 2.5 l-1.6 -1.6 M10 2.5 l1.6 -1.6 M10 17.5 l-1.6 1.6 M10 17.5 l1.6 1.6" stroke={p.motif} strokeWidth="0.9" strokeLinecap="round" />
        <path d="M2.5 10 l-1.6 -1.6 M2.5 10 l-1.6 1.6 M17.5 10 l1.6 -1.6 M17.5 10 l1.6 1.6" stroke={p.motif} strokeWidth="0.9" strokeLinecap="round" />
        {/* The corners: quarters of the next row's diamonds. */}
        <path d="M0 0 L3 0 L0 3 Z M20 0 L17 0 L20 3 Z M0 20 L3 20 L0 17 Z M20 20 L17 20 L20 17 Z" fill={p.cream} opacity="0.85" />
      </g>
    </pattern>
  );
}

/** The gold of the ribbon, lit from the top-left. */
function RibbonGradient({ id }: { id: string }): React.JSX.Element {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stopColor="#ffe9a6" />
      <stop offset="0.45" stopColor="#f0c24a" />
      <stop offset="1" stopColor="#b8860b" />
    </linearGradient>
  );
}

/** The wrapped present, 120×120, sitting low so the lid has room to fly; `limited` puts a small flame on the lid. */
export function GiftBox({
  tier,
  size = 120,
  className,
  limited = tier === 'legendary',
}: {
  tier: GiftTier;
  size?: number;
  className?: string;
  limited?: boolean;
}): React.JSX.Element {
  const p = KILIM[tier];
  const pat = useSvgId('kilim');
  const rib = useSvgId('ribbon');
  return (
    <svg
      className={`gift-box gift-box-${tier}${className ? ` ${className}` : ''}`}
      width={size}
      height={size}
      viewBox="0 0 120 120"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <KilimPattern id={pat} p={p} />
        <RibbonGradient id={rib} />
      </defs>
      {/* A soft shadow under the box. */}
      <ellipse className="gift-shadow" cx="60" cy="110" rx="40" ry="5" fill="rgba(0,0,0,0.35)" />
      <g className="gift-body">
        <rect x="20" y="54" width="80" height="54" rx="6" fill={`url(#${pat})`} />
        {/* A shade on the lower half, so it reads as a box rather than a flat card. */}
        <rect x="20" y="54" width="80" height="54" rx="6" fill="none" stroke="rgba(0,0,0,0.25)" strokeWidth="1" />
        <rect x="20" y="82" width="80" height="26" rx="0" fill="rgba(0,0,0,0.12)" />
        <rect className="gift-ribbon" x="54" y="54" width="12" height="54" fill={`url(#${rib})`} />
      </g>
      <g className="gift-lid">
        <rect x="14" y="40" width="92" height="18" rx="5" fill={`url(#${pat})`} />
        <rect x="14" y="40" width="92" height="18" rx="5" fill={p.lid} opacity="0.35" />
        <rect x="14" y="54" width="92" height="4" fill="rgba(0,0,0,0.22)" />
        <rect className="gift-ribbon" x="53" y="40" width="14" height="18" fill={`url(#${rib})`} />
        <g className="gift-bow">
          <path d="M60 40 C46 24 30 30 36 39 C40 45 52 43 60 40 Z" fill={`url(#${rib})`} stroke="#9c7208" strokeWidth="1.2" />
          <path d="M60 40 C74 24 90 30 84 39 C80 45 68 43 60 40 Z" fill={`url(#${rib})`} stroke="#9c7208" strokeWidth="1.2" />
          <path d="M57 41 L50 54 L55 53 L58 57 Z M63 41 L70 54 L65 53 L62 57 Z" fill="#d9a520" />
          <circle cx="60" cy="40" r="5" fill="#f6d27a" stroke="#9c7208" strokeWidth="1.2" />
        </g>
        {limited && (
          // A Newroz flame stamped on the lid of a limited gift.
          <path
            className="gift-lid-flame"
            d="M26 54 C22 50 24 46 27 43 C27 46 29 46 29 44 C31 47 32 50 29 54 Z"
            fill="#d9381e"
            stroke="#fff3c4"
            strokeWidth="0.8"
          />
        )}
      </g>
    </svg>
  );
}

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

/** The item: its picture when it has one, otherwise its kind's glyph. */
export function GiftItemArt({
  assetUrl,
  category,
  size = 96,
  className,
}: {
  assetUrl: string | null;
  category: string;
  size?: number;
  className?: string;
}): React.JSX.Element {
  return (
    <span
      className={`gift-item-art gift-item-${category}${className ? ` ${className}` : ''}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {assetUrl ? <ItemPicture src={assetUrl} /> : <ItemGlyph category={category} size={Math.round(size * 0.45)} />}
    </span>
  );
}
