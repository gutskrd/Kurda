import { useId, type CSSProperties } from 'react';
import type { GiftTier } from '@kurda/shared';
import { ItemGlyph } from '../shop/ItemGlyph';
import { scatter } from './motion';

/**
 * The pictures of the gift moments, drawn by hand in SVG — no animation
 * library, no image files, nothing licensed from anyone.
 *
 * The wrapping paper is a kilim: the diamond with its hooked corners that
 * Kurdish weavers put in rugs and saddlebags, repeated as a pattern. Each
 * tier has its own colourway — pomegranate red for an everyday gift, indigo
 * for a rare one, Newroz gold for a legendary (limited) one — and the ribbon
 * is the app's gold, the colour of the Zêr it was bought with.
 *
 * Every part has a class so CSS can move it: the lid lifts, the ribbon falls
 * away, the bow pops. The pictures are decoration (aria-hidden); the words
 * around them say what is happening.
 */

interface Palette {
  base: string;
  motif: string;
  inner: string;
  cream: string;
  lid: string;
}

export const KILIM: Readonly<Record<GiftTier, Palette>> = {
  // pomegranate red, gold and indigo: the colours of an Amed kilim
  common: { base: '#9b2335', motif: '#f0c24a', inner: '#24325f', cream: '#f6e7c8', lid: '#7d1b2b' },
  // indigo ground, gold and red: dearer, darker, a little rarer
  rare: { base: '#22305e', motif: '#f0c24a', inner: '#b8324a', cream: '#f6e7c8', lid: '#1a2549' },
  // Newroz: fire-gold ground, deep red and night
  legendary: { base: '#d39a1c', motif: '#8f1d2c', inner: '#2a1a10', cream: '#fff3c4', lid: '#b07f12' },
};

/** An id usable inside url(#…): React's ids carry characters a fragment would need escaped. */
function useSvgId(prefix: string): string {
  return `${prefix}${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
}

/**
 * One kilim tile, 20 units square: a stepped diamond with hooks at its
 * corners, a smaller one inside, a seed at the heart — and the quarter
 * diamonds at the tile's corners, which meet their neighbours' to make the
 * second row of the rug.
 */
function KilimPattern({ id, p, scale = 1 }: { id: string; p: Palette; scale?: number }): React.JSX.Element {
  return (
    <pattern id={id} width={20 * scale} height={20 * scale} patternUnits="userSpaceOnUse">
      <g transform={`scale(${scale})`}>
        <rect width="20" height="20" fill={p.base} />
        <path d="M10 2.5 L17.5 10 L10 17.5 L2.5 10 Z" fill={p.motif} />
        <path d="M10 5.5 L14.5 10 L10 14.5 L5.5 10 Z" fill={p.inner} />
        <path d="M10 8 L12 10 L10 12 L8 10 Z" fill={p.cream} />
        {/* the hooks: little ram's horns on the diamond's points */}
        <path d="M10 2.5 l-1.6 -1.6 M10 2.5 l1.6 -1.6 M10 17.5 l-1.6 1.6 M10 17.5 l1.6 1.6" stroke={p.motif} strokeWidth="0.9" strokeLinecap="round" />
        <path d="M2.5 10 l-1.6 -1.6 M2.5 10 l-1.6 1.6 M17.5 10 l1.6 -1.6 M17.5 10 l1.6 1.6" stroke={p.motif} strokeWidth="0.9" strokeLinecap="round" />
        {/* the corners: quarters of the next row's diamonds */}
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

/**
 * The wrapped present. 120×120; the box sits low so the lid has room to fly.
 * `limited` (a legendary, Newroz item) puts a small flame on the lid.
 */
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
      {/* a soft shadow under the box */}
      <ellipse className="gift-shadow" cx="60" cy="110" rx="40" ry="5" fill="rgba(0,0,0,0.35)" />
      <g className="gift-body">
        <rect x="20" y="54" width="80" height="54" rx="6" fill={`url(#${pat})`} />
        {/* a shade on the body's lower half, so it reads as a box and not a flat card */}
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
          // a Newroz flame stamped on the lid of a limited gift
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
 * The Newroz fire for a legendary gift: three tongues of flame, red, orange
 * and yellow, that flicker as they rise (CSS), with embers drifting up.
 */
export function NewrozFlame({ className }: { className?: string }): React.JSX.Element {
  const glow = useSvgId('flameglow');
  return (
    <svg className={`newroz-flame${className ? ` ${className}` : ''}`} viewBox="0 0 120 160" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={glow} cx="0.5" cy="0.75" r="0.6">
          <stop offset="0" stopColor="rgba(255,190,80,0.75)" />
          <stop offset="1" stopColor="rgba(255,120,40,0)" />
        </radialGradient>
      </defs>
      <ellipse cx="60" cy="118" rx="58" ry="42" fill={`url(#${glow})`} />
      <path className="flame-outer" d="M60 150 C24 150 18 112 34 86 C40 98 46 100 48 92 C46 70 56 44 70 26 C70 52 92 66 94 98 C96 124 84 150 60 150 Z" fill="#d9381e" />
      <path className="flame-mid" d="M60 150 C36 150 34 122 44 104 C48 112 54 112 54 104 C54 90 62 76 70 66 C72 86 86 98 84 120 C82 140 74 150 60 150 Z" fill="#f28c28" />
      <path className="flame-core" d="M60 150 C46 150 44 134 50 122 C54 128 58 126 58 120 C60 112 64 104 68 100 C70 114 78 124 74 138 C72 146 66 150 60 150 Z" fill="#ffd75e" />
    </svg>
  );
}

/**
 * What flies when a gift opens: pomegranate seeds (the fruit of Kurdish
 * autumn tables, deep red with a bright highlight) and sparks of gold. Placed
 * by a seeded scatter, so a burst is the same every time; CSS reads the
 * custom properties for where each piece goes.
 */
export function Confetti({ count = 18, spread = 1, className }: { count?: number; spread?: number; className?: string }): React.JSX.Element {
  return (
    <span className={`gift-confetti${className ? ` ${className}` : ''}`} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2 + scatter(i) * 0.6;
        const distance = (70 + scatter(i, 3) * 90) * spread;
        const style = {
          '--dx': `${Math.round(Math.cos(angle) * distance)}px`,
          '--dy': `${Math.round(Math.sin(angle) * distance - 30 * spread)}px`,
          '--rot': `${Math.round(scatter(i, 5) * 540 - 270)}deg`,
          '--delay': `${Math.round(scatter(i, 9) * 120)}ms`,
        } as CSSProperties;
        return <i key={i} className={i % 3 === 0 ? 'spark' : 'seed'} style={style} />;
      })}
    </span>
  );
}

/** The item itself: its picture when it has one, its kind's glyph when not (a tag is drawn as a tag). */
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
      {assetUrl ? <img src={assetUrl} alt="" loading="lazy" decoding="async" /> : <ItemGlyph category={category} size={Math.round(size * 0.45)} />}
    </span>
  );
}
