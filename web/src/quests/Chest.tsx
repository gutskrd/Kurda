import { useId } from 'react';
import type { ChestTier } from '@kurda/shared';

/**
 * A quest's chest, drawn in Hevalo's own browns and the gold of the sun: a
 * wooden box with gold bands and a cream lock. The tier tints the wood — warm
 * wood for a common chest, a deep blue for a rare one, plum for an epic one —
 * and the bands stay gold, so every chest reads as the same thing.
 *
 * Open, the lid stands up off the back and the inside glows gold. The lid is
 * its own group (`.chest-lid`), raised by the stylesheet (quests.css), which
 * can then pop it open rather than show it so. A picture only: whatever holds
 * it says what it is.
 */
const WOOD: Record<ChestTier, { body: string; dark: string; light: string }> = {
  common: { body: '#b0733d', dark: '#8f5a2c', light: '#cf9560' },
  rare: { body: '#3f7fd0', dark: '#2b5fa6', light: '#6ea6ea' },
  epic: { body: '#8a58d2', dark: '#6a3cb0', light: '#b08ae8' },
};

const GOLD = '#f2c14e';
const GOLD_DARK = '#c48a17';
const GOLD_LIGHT = '#ffe08a';

export function Chest({ tier, open = false, size = 48, className }: { tier: ChestTier; open?: boolean; size?: number; className?: string }): React.JSX.Element {
  const wood = WOOD[tier];
  const id = `chest${useId().replace(/[^A-Za-z0-9]/g, '')}`;
  return (
    <svg
      className={`chest${open ? ' is-open' : ''}${className ? ` ${className}` : ''}`}
      data-tier={tier}
      width={size}
      height={size}
      viewBox="0 0 120 120"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id={`${id}-glow`} cx="0.5" cy="0.4" r="0.6">
          <stop offset="0" stopColor="#fff3c4" />
          <stop offset="0.55" stopColor={GOLD} />
          <stop offset="1" stopColor={GOLD_DARK} />
        </radialGradient>
      </defs>
      {/* its shadow on the ground */}
      <ellipse cx="60" cy="108" rx="44" ry="7" fill="#000" opacity="0.18" />
      {/* the inside, seen once the lid is up */}
      {open && <path d="M18 58 Q60 40 102 58 L100 66 H20 Z" fill={`url(#${id}-glow)`} />}
      {/* the box: planks, and its gold feet and bands */}
      <rect x="16" y="58" width="88" height="46" rx="8" fill={wood.body} />
      <rect x="16" y="74" width="88" height="3" fill={wood.dark} />
      <rect x="16" y="89" width="88" height="3" fill={wood.dark} />
      <path d="M22 100 h14 v6 a3 3 0 0 1 -3 3 h-8 a3 3 0 0 1 -3 -3 z M84 100 h14 v6 a3 3 0 0 1 -3 3 h-8 a3 3 0 0 1 -3 -3 z" fill={GOLD_DARK} />
      <rect x="24" y="58" width="12" height="46" fill={GOLD} />
      <rect x="84" y="58" width="12" height="46" fill={GOLD} />
      <rect x="24" y="58" width="3" height="46" fill={GOLD_LIGHT} />
      <rect x="84" y="58" width="3" height="46" fill={GOLD_LIGHT} />
      {/* the lid, hinged at the back */}
      <g className="chest-lid">
        <path d="M14 60 V40 Q14 22 32 22 H88 Q106 22 106 40 V60 Z" fill={wood.body} />
        <path d="M18 40 Q18 27 32 27 H88 Q102 27 102 40 V44 H18 Z" fill={wood.light} opacity="0.55" />
        <rect x="14" y="47" width="92" height="3" fill={wood.dark} />
        <rect x="24" y="22" width="12" height="38" fill={GOLD} />
        <rect x="84" y="22" width="12" height="38" fill={GOLD} />
        <rect x="24" y="22" width="3" height="38" fill={GOLD_LIGHT} />
        <rect x="84" y="22" width="3" height="38" fill={GOLD_LIGHT} />
        {/* the rim along the lid's edge */}
        <rect x="11" y="55" width="98" height="9" rx="4.5" fill={GOLD} />
        <rect x="11" y="55" width="98" height="3" rx="1.5" fill={GOLD_LIGHT} />
        {/* the lock: a cream plate with a keyhole, on the rim */}
        <path d="M49 52 Q49 46 55 46 H65 Q71 46 71 52 V64 Q71 74 60 76 Q49 74 49 64 Z" fill={GOLD_DARK} />
        <path d="M52 53 Q52 49 56 49 H64 Q68 49 68 53 V63 Q68 71 60 72.5 Q52 71 52 63 Z" fill="#fff6e0" />
        <circle cx="60" cy="58" r="3.4" fill="#5a3a1a" />
        <path d="M58.4 59.5 H61.6 L62.6 67 H57.4 Z" fill="#5a3a1a" />
      </g>
    </svg>
  );
}
