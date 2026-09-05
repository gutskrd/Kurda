/** Inline line icons — no icon dependency, no external requests. */
type P = { size?: number; className?: string };
const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
});

/** Filled head-and-shoulders silhouette (the contact-card figure). */
export const PersonGlyph = ({ size = 128, className }: P): React.JSX.Element => (
  <svg width={size} height={size} viewBox="0 0 128 128" className={className} fill="currentColor" aria-hidden="true">
    <circle cx="64" cy="40" r="28" />
    <path d="M18 118a46 34 0 0 1 92 0 6 6 0 0 1-6 6H24a6 6 0 0 1-6-6z" />
  </svg>
);

export const BookIcon = ({ size = 22, className }: P): React.JSX.Element => (
  <svg {...base(size)} className={className}>
    <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" />
    <path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5A2.5 2.5 0 0 1 4 20.5z" />
  </svg>
);

export const FeatherIcon = ({ size = 22, className }: P): React.JSX.Element => (
  <svg {...base(size)} className={className}>
    <path d="M20.2 4.8a6 6 0 0 0-8.5 0L4 12.5V20h7.5l7.7-7.7a6 6 0 0 0 0-8.5z" />
    <path d="M16 8 8 16M13 5.5 5.5 13" />
  </svg>
);

export const GameIcon = ({ size = 22, className }: P): React.JSX.Element => (
  <svg {...base(size)} className={className}>
    <rect x="2.5" y="6" width="19" height="12" rx="4" />
    <path d="M7 10v4M5 12h4M15.5 11h.01M18 13.5h.01" />
  </svg>
);

export const TrophyIcon = ({ size = 22, className }: P): React.JSX.Element => (
  <svg {...base(size)} className={className}>
    <path d="M7 4h10v4a5 5 0 0 1-10 0z" />
    <path d="M7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3M9.5 13h5l-.5 4h-4z M8 20h8" />
  </svg>
);

export const UserIcon = ({ size = 22, className }: P): React.JSX.Element => (
  <svg {...base(size)} className={className}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20a8 8 0 0 1 16 0" />
  </svg>
);

export const SparkIcon = ({ size = 22, className }: P): React.JSX.Element => (
  <svg {...base(size)} className={className}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.5 2.5M15.2 15.2l2.5 2.5M17.7 6.3l-2.5 2.5M8.8 15.2l-2.5 2.5" />
  </svg>
);

export const CoinIcon = ({ size = 22, className }: P): React.JSX.Element => (
  <svg {...base(size)} className={className}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5v9M9.6 9.5h3.2a1.7 1.7 0 0 1 0 3.4H9.6h3.4a1.7 1.7 0 0 1 0 3.4H9.6" />
  </svg>
);

/**
 * A row of letter tiles with one solved — the Wordle board, reduced to its
 * smallest recognisable form.
 */
export const TilesIcon = ({ size = 22, className }: P): React.JSX.Element => (
  <svg {...base(size)} className={className}>
    <rect x="2.6" y="9.4" width="5.2" height="5.2" rx="1.4" />
    <rect x="9.4" y="9.4" width="5.2" height="5.2" rx="1.4" fill="currentColor" stroke="none" />
    <rect x="16.2" y="9.4" width="5.2" height="5.2" rx="1.4" />
  </svg>
);

/** A spoken waveform — sound, for the rhyming game. */
export const WaveformIcon = ({ size = 22, className }: P): React.JSX.Element => (
  <svg {...base(size)} className={className}>
    <path d="M4 10.5v3M8 7.5v9M12 5v14M16 8.5v7M20 10.5v3" />
  </svg>
);

/** The "there is more this way" chevron, for a row that leads somewhere. */
export const ChevronIcon = ({ size = 18, className }: P): React.JSX.Element => (
  <svg {...base(size)} className={className}>
    <path d="M9 5.5 15.5 12 9 18.5" />
  </svg>
);

export const MenuIcon = ({ size = 22, className }: P): React.JSX.Element => (
  <svg {...base(size)} className={className}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);

export const CloseIcon = ({ size = 22, className }: P): React.JSX.Element => (
  <svg {...base(size)} className={className}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export const SunIcon = ({ size = 20, className }: P): React.JSX.Element => (
  <svg {...base(size)} className={className}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" />
  </svg>
);

export const MoonIcon = ({ size = 20, className }: P): React.JSX.Element => (
  <svg {...base(size)} className={className}>
    <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" />
  </svg>
);

export const EyeIcon = ({ size = 19, off = false }: P & { off?: boolean }): React.JSX.Element =>
  off ? (
    <svg {...base(size)}>
      <path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8" />
      <path d="M9.4 5.2A9.5 9.5 0 0 1 12 5c5 0 9 4.5 9 7-.5 1-1.4 2.2-2.7 3.2M6.5 6.5C4.6 7.7 3.4 9.4 3 12c.7 1.6 3.4 5 9 5 1 0 1.9-.1 2.7-.4" />
    </svg>
  ) : (
    <svg {...base(size)}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );

export const GearIcon = ({ size = 20, className }: P): React.JSX.Element => (
  <svg {...base(size)} className={className}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

export const ArrowIcon = ({ size = 18, className }: P): React.JSX.Element => (
  <svg {...base(size)} className={className}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
