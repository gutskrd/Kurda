import { useId, useMemo } from 'react';
import {
  badgeLevelName,
  badgeShineSvg,
  badgeShines,
  badgeSvg,
  dayMedalSvg,
  hasBadgeArt,
  leagueEmblemSvg,
  seasonFrameShineSvg,
  seasonFrameSvg,
  streakMedalSvg,
  SEASON_FRAME_INNER,
  SEASON_FRAME_SHINE,
  type ArtBadgeTier,
  type DayMedal,
  type LeagueTier,
  type RankTier,
} from '@kurda/shared';
import { useArtOverride } from '../art/overrides';

/**
 * The @kurda/shared art inlined as SVG, so the phone and browser match and CSS can animate the shine. Each drawing's
 * `<title>` is the translated name the caller passes. Every drawing gets its own id prefix, since copies sharing
 * gradient ids can paint without gradients when the first copy is hidden. Shine layers are decorative, animated by
 * styles/ranks.css and still under Reduce Motion.
 *
 * An admin-uploaded replacement (art/overrides.ts) draws in the same wrapper, size and title, without shine; an unfound
 * secret badge always shows the secret art, so its picture is never given away.
 */
function useArtId(): string {
  // useId gives «r1»-style ids, but the builders need a plain identifier.
  return `a${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
}

/**
 * The markup object, kept stable while the drawing is unchanged, since React compares the object rather than its
 * markup and a new one would reparse the emblem and restart its shine.
 */
function useMarkup(svg: string): { __html: string } {
  return useMemo(() => ({ __html: svg }), [svg]);
}

function Svg({ svg, className }: { svg: string; className?: string }): React.JSX.Element {
  return <span className={className} dangerouslySetInnerHTML={useMarkup(svg)} />;
}

/** An uploaded picture in a drawing's place, named as the drawing was. */
function Picture({ src, size, title, className }: { src: string; size: number; title: string; className?: string }): React.JSX.Element {
  return (
    <img
      className={`art-picture${className ? ` ${className}` : ''}`}
      src={src}
      alt={title}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      draggable={false}
    />
  );
}

/** A layer laid over a drawing: decorative, never read out. */
function Shine({ svg, className }: { svg: string; className: string }): React.JSX.Element {
  return <span className={className} aria-hidden="true" dangerouslySetInnerHTML={useMarkup(svg)} />;
}

/**
 * A kept streak's medal, the gold pentagon with its laurel (shared art/medals.ts). `unlit` is the grey version shown
 * before today's lesson, which the streak card opens on under the gold one.
 */
export function StreakMedal({ size = 96, title, unlit = false }: { size?: number; title: string; unlit?: boolean }): React.JSX.Element {
  const id = useArtId();
  const svg = useMemo(() => streakMedalSvg({ size, title, idPrefix: id, unlit }), [size, title, id, unlit]);
  return <Svg svg={svg} className={`art art-medal${unlit ? ' is-unlit' : ''}`} />;
}

/** A day's medal in the streak week: gold with a laurel for a day learned, ice with a snowflake for a frozen day. */
export function DayMedalArt({ kind, size = 36, title }: { kind: DayMedal; size?: number; title: string }): React.JSX.Element {
  const id = useArtId();
  const svg = useMemo(() => dayMedalSvg({ kind, size, title, idPrefix: id }), [kind, size, title, id]);
  return <Svg svg={svg} className={`art art-medal is-${kind}`} />;
}

/**
 * A league's emblem. `locked` draws an unreached league as its flat outline with a keyhole, coloured by the
 * stylesheet's `--locked` and `--locked-mark`, so it follows the theme without redrawing.
 */
export function LeagueEmblem({
  tier,
  size = 96,
  title,
  locked = false,
  className,
}: {
  tier: LeagueTier;
  size?: number;
  title: string;
  locked?: boolean;
  className?: string;
}): React.JSX.Element {
  const id = useArtId();
  const picture = useArtOverride('league', tier);
  const svg = useMemo(
    () => (picture ? null : leagueEmblemSvg({ tier, size, title, idPrefix: id, ...(locked ? { locked: LOCKED_DRAWN } : {}) })),
    [picture, tier, size, title, id, locked],
  );
  const cls = `art art-league is-${tier}${locked ? ' is-locked' : ''}${className ? ` ${className}` : ''}`;
  if (picture) {
    // An unreached league's picture is greyed (styles/ranks.css), like the drawn one.
    return (
      <span className={cls}>
        <Picture src={picture} size={size} title={title} />
      </span>
    );
  }
  return <Svg svg={svg ?? ''} className={cls} />;
}
const LOCKED_DRAWN = { body: '#e2e4e8', mark: '#a5a9b0' } as const;

type MedalState = 'earned' | 'locked' | 'secret';

/**
 * A badge medallion. `shine` adds the glint to an earned Zêr or Firûze look, played on hover or focus of the
 * surrounding `.badge-medal` and once in a celebration.
 */
export function BadgeMedal({
  badgeKey,
  tier,
  state = 'earned',
  size = 72,
  title,
  shine = false,
  playing = false,
  bare = false,
}: {
  badgeKey: string;
  /** 1–4; 0 draws the locked medallion. */
  tier: number;
  /** Without the tier's pips or tag, for a picture too small for them to be more than noise (a profile's badge row). */
  bare?: boolean;
  state?: MedalState;
  size?: number;
  title: string;
  shine?: boolean;
  /** Plays the glint now, as in a celebration. */
  playing?: boolean;
}): React.JSX.Element | null {
  const id = useArtId();
  const known = hasBadgeArt(badgeKey);
  const shown: MedalState = state === 'earned' && tier <= 0 ? 'locked' : state;
  const artTier = Math.max(1, Math.min(4, Math.floor(tier) || 1)) as ArtBadgeTier;
  // The level's own picture, then the badge's; an unfound secret never shows one.
  const uploaded = useArtOverride('badge', badgeKey, badgeLevelName(artTier));
  const picture = shown === 'secret' ? null : uploaded;
  const svg = useMemo(
    () => (known && !picture ? badgeSvg({ key: badgeKey as never, tier: artTier, state: shown, size, title, idPrefix: id, ...(bare ? { tiers: 1 } : {}) }) : null),
    [known, picture, badgeKey, artTier, shown, size, title, id, bare],
  );
  const glint = useMemo(
    () =>
      known && !picture && shine && shown === 'earned' && badgeShines(badgeKey, artTier)
        ? badgeShineSvg({ key: badgeKey as never, size, phase: 0, idPrefix: `${id}g` })
        : null,
    [known, picture, shine, shown, badgeKey, artTier, size, id],
  );
  const cls = `art art-badge is-${shown}${playing ? ' is-playing' : ''}`;
  if (picture) {
    // Not earned yet: the picture is greyed (styles/ranks.css), like the pewter drawn medal.
    return (
      <span className={cls} style={{ width: size, height: size }}>
        <Picture src={picture} size={size} title={title} />
      </span>
    );
  }
  if (!svg) return null;
  return (
    <span className={cls} style={{ width: size, height: size }}>
      <Svg svg={svg} />
      {glint && <Shine svg={glint} className="art-badge-shine" />}
    </span>
  );
}

/** The season frame round an avatar, which fills the ring's middle (`SEASON_FRAME_INNER`); Lûtke and Stêrk frames glint. */
export function SeasonFrame({
  tier,
  size,
  title,
  children,
}: {
  tier: RankTier;
  size: number;
  title: string;
  /** The avatar, drawn inside the ring. */
  children: React.ReactNode;
}): React.JSX.Element {
  const id = useArtId();
  // An uploaded ring is laid over the avatar at the drawn ring's size, without the glint.
  const picture = useArtOverride('frame', tier);
  const frame = useMemo(() => (picture ? null : seasonFrameSvg({ tier, size, title, idPrefix: id })), [picture, tier, size, title, id]);
  const shine = useMemo(
    () => (!picture && SEASON_FRAME_SHINE[tier] ? seasonFrameShineSvg({ tier, size, idPrefix: `${id}s` }) : null),
    [picture, tier, size, id],
  );
  const inner = Math.round(size * SEASON_FRAME_INNER);
  return (
    <span className={`art-frame is-${tier}`} style={{ width: size, height: size }}>
      <span className="art-frame-face" style={{ width: inner, height: inner }}>
        {children}
      </span>
      {picture ? <Picture src={picture} size={size} title={title} className="art-frame-ring" /> : <Svg svg={frame ?? ''} className="art-frame-ring" />}
      {shine && <Shine svg={shine} className="art-frame-shine" />}
    </span>
  );
}

/**
 * A shop frame round a face: its ring picture (scripts/cosmetic-art/frames.mjs) laid over the avatar at a season
 * frame's size. Decorative, since its tile or card names it.
 */
export function PictureFrame({ src, size, children }: { src: string; size: number; children: React.ReactNode }): React.JSX.Element {
  const inner = Math.round(size * SEASON_FRAME_INNER);
  return (
    <span className="art-frame is-made" style={{ width: size, height: size }}>
      <span className="art-frame-face" style={{ width: inner, height: inner }}>
        {children}
      </span>
      <Picture src={src} size={size} title="" className="art-frame-ring" />
    </span>
  );
}

/** The tier a season frame SKU is for (`frame_rank_gir`, `frame_rank_lutke_animated`), or null. */
export function frameTier(sku: string | null | undefined): RankTier | null {
  if (!sku) return null;
  const m = /^frame_rank_(dest|gir|zozan|ciya|lutke|sterk)(?:_animated)?$/.exec(sku);
  return m ? (m[1] as RankTier) : null;
}

/**
 * A frame centred over an already drawn avatar, such as the profile card's, so the layout does not move with or
 * without one. CSS sizes it from the face; `face` only picks the drawing's detail. A season frame is drawn from its
 * SKU, a shop frame from its picture (`url`), without a gleam.
 */
export function FrameOverlay({
  sku,
  url,
  face,
  title,
}: {
  sku: string | null | undefined;
  /** The picture of a shop frame; a season frame has none. */
  url?: string | null;
  face: number;
  title: (tier: RankTier) => string;
}): React.JSX.Element | null {
  const id = useArtId();
  const tier = frameTier(sku);
  const size = Math.round(face / SEASON_FRAME_INNER);
  const label = tier ? title(tier) : '';
  const uploaded = useArtOverride('frame', tier ?? '');
  const picture = tier ? uploaded : null;
  const frame = useMemo(
    () => (tier && !picture ? seasonFrameSvg({ tier, size, title: label, idPrefix: id }) : null),
    [tier, picture, size, label, id],
  );
  const shine = useMemo(
    () => (tier && !picture && SEASON_FRAME_SHINE[tier] ? seasonFrameShineSvg({ tier, size, idPrefix: `${id}s` }) : null),
    [tier, picture, size, id],
  );
  if (!tier) {
    if (!sku || !url) return null;
    return (
      <span className="art-frame-overlay is-made">
        <Picture src={url} size={size} title="" className="art-frame-ring" />
      </span>
    );
  }
  if (picture) {
    return (
      <span className={`art-frame-overlay is-${tier}`}>
        <Picture src={picture} size={size} title={label} className="art-frame-ring" />
      </span>
    );
  }
  if (!frame) return null;
  return (
    <span className={`art-frame-overlay is-${tier}`}>
      <Svg svg={frame} className="art-frame-ring" />
      {shine && <Shine svg={shine} className="art-frame-shine" />}
    </span>
  );
}
