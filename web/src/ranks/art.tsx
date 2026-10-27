import { useId, useMemo } from 'react';
import {
  badgeLevelName,
  badgeShineSvg,
  badgeShines,
  badgeSvg,
  hasBadgeArt,
  leagueEmblemSvg,
  placementEmblemSvg,
  rankEmblemSvg,
  seasonFrameShineSvg,
  seasonFrameSvg,
  SEASON_FRAME_INNER,
  SEASON_FRAME_SHINE,
  type ArtBadgeTier,
  type Division,
  type LeagueTier,
  type RankTier,
  type SeasonName,
} from '@kurda/shared';
import { useArtOverride } from '../art/overrides';

/**
 * The art from @kurda/shared, drawn in the page (contract 4 §B3).
 *
 * The builders return SVG strings so the phone and the browser draw the same
 * pixels; here they are inlined, which keeps them sharp at any size and lets
 * the page's own CSS move their shine. Each drawing carries its own `<title>`
 * as its accessible name — the caller passes the translated one, because the
 * builders only know Kurmancî and English.
 *
 * Every drawing gets an id prefix of its own. Two copies of the same emblem on
 * one page would otherwise share their gradient ids, and if the first copy sits
 * in something hidden (a closed sheet, a collapsed row) Chrome paints the
 * second one without its gradients.
 *
 * The shine layers are decoration: hidden from screen readers, moved by CSS
 * (styles/ranks.css), and still under `prefers-reduced-motion`.
 *
 * A drawing an admin has replaced with an uploaded picture (art/overrides.ts)
 * is that picture instead, in the same wrapper at the same size, named by the
 * same title. An upload has no shine of its own to move, so it is drawn
 * without one; a secret badge not found yet is always the secret's own art, so
 * that its picture is never given away.
 */
function useArtId(): string {
  // useId gives «r1»-style ids; the builders accept a plain identifier
  return `a${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
}

function Svg({ svg, className }: { svg: string; className?: string }): React.JSX.Element {
  return <span className={className} dangerouslySetInnerHTML={{ __html: svg }} />;
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
  return <span className={className} aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />;
}

export function RankEmblem({
  tier,
  division,
  season,
  size = 96,
  title,
  className,
}: {
  tier: RankTier;
  division?: Division | null;
  season?: { name: SeasonName; year: number };
  size?: number;
  title: string;
  className?: string;
}): React.JSX.Element {
  const id = useArtId();
  // one picture for the tier, whatever the division or season it is drawn for
  const picture = useArtOverride('rank', tier);
  const svg = useMemo(
    () => (picture ? null : rankEmblemSvg({ tier, division: division ?? undefined, season, size, title, idPrefix: id })),
    [picture, tier, division, season, size, title, id],
  );
  const cls = `art art-rank is-${tier}${className ? ` ${className}` : ''}`;
  if (picture) {
    return (
      <span className={cls}>
        <Picture src={picture} size={size} title={title} />
      </span>
    );
  }
  return <Svg svg={svg ?? ''} className={cls} />;
}

export function PlacementEmblem({ done, size = 96, title }: { done: number; size?: number; title: string }): React.JSX.Element {
  const id = useArtId();
  const clamped = Math.max(0, Math.min(5, Math.floor(done)));
  const svg = useMemo(() => placementEmblemSvg({ done: clamped, size, title, idPrefix: id }), [clamped, size, title, id]);
  return <Svg svg={svg} className="art art-rank is-placing" />;
}

/**
 * A league's emblem. `locked` is a league not reached yet: the tier's own
 * outline, flat, with a keyhole. Its two colours are the stylesheet's
 * (`--locked`, `--locked-mark`, which change with the scheme), laid over the
 * light ones it is drawn with, so it follows the theme without being drawn again.
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
    // a league not reached yet is its picture greyed (styles/ranks.css), as the drawn one is flat grey
    return (
      <span className={cls}>
        <Picture src={picture} size={size} title={title} />
      </span>
    );
  }
  return <Svg svg={svg ?? ''} className={cls} />;
}
const LOCKED_DRAWN = { body: '#e2e4e8', mark: '#a5a9b0' } as const;

export type MedalState = 'earned' | 'locked' | 'secret';

/**
 * A badge medallion. `shine` lays the glint over an earned Zêr or Firûze
 * badge (and the single badges that wear those looks); it plays on hover and
 * focus of the surrounding `.badge-medal`, and once in a celebration.
 */
export function BadgeMedal({
  badgeKey,
  tier,
  state = 'earned',
  size = 72,
  title,
  shine = false,
  playing = false,
}: {
  badgeKey: string;
  /** 1–4 (0 draws the locked medallion) */
  tier: number;
  state?: MedalState;
  size?: number;
  title: string;
  shine?: boolean;
  /** play the glint now (the celebration) */
  playing?: boolean;
}): React.JSX.Element | null {
  const id = useArtId();
  const known = hasBadgeArt(badgeKey);
  const shown: MedalState = state === 'earned' && tier <= 0 ? 'locked' : state;
  const artTier = Math.max(1, Math.min(4, Math.floor(tier) || 1)) as ArtBadgeTier;
  // the level's own picture, then the badge's; a secret not found yet never shows one
  const uploaded = useArtOverride('badge', badgeKey, badgeLevelName(artTier));
  const picture = shown === 'secret' ? null : uploaded;
  const svg = useMemo(
    () => (known && !picture ? badgeSvg({ key: badgeKey as never, tier: artTier, state: shown, size, title, idPrefix: id }) : null),
    [known, picture, badgeKey, artTier, shown, size, title, id],
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
    // not earned yet: the picture greyed (styles/ranks.css), as the drawn medal is in pewter
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

/**
 * The season frame round an avatar: the avatar sits in the ring's empty
 * middle (`SEASON_FRAME_INNER` of its width), and Lûtke and Stêrk frames carry
 * a glint that travels round the ring.
 */
export function SeasonFrame({
  tier,
  size,
  title,
  children,
}: {
  tier: RankTier;
  size: number;
  title: string;
  /** the avatar, drawn inside the ring */
  children: React.ReactNode;
}): React.JSX.Element {
  const id = useArtId();
  // an uploaded ring is laid over the avatar at the drawn ring's size, with no glint to travel round it
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

/** The tier a season frame SKU is for (`frame_rank_gir`, `frame_rank_lutke_animated`), or null. */
export function frameTier(sku: string | null | undefined): RankTier | null {
  if (!sku) return null;
  const m = /^frame_rank_(dest|gir|zozan|ciya|lutke|sterk)(?:_animated)?$/.exec(sku);
  return m ? (m[1] as RankTier) : null;
}

/**
 * A season frame laid round an avatar that is already drawn (the profile
 * card's face): absolutely placed and centred on it, so the card's layout does
 * not move whether or not a frame is worn. Its size follows the face's in CSS
 * (the face is the ring's empty middle); `face` only picks the drawing's
 * detail, large or small.
 */
export function FrameOverlay({ sku, face, title }: { sku: string | null | undefined; face: number; title: (tier: RankTier) => string }): React.JSX.Element | null {
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
  if (!tier) return null;
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
