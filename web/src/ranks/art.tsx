import { useId, useMemo } from 'react';
import {
  ART_BADGES,
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
 */
function useArtId(): string {
  // useId gives «r1»-style ids; the builders accept a plain identifier
  return `a${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
}

function Svg({ svg, className }: { svg: string; className?: string }): React.JSX.Element {
  return <span className={className} dangerouslySetInnerHTML={{ __html: svg }} />;
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
  const svg = useMemo(
    () => rankEmblemSvg({ tier, division: division ?? undefined, season, size, title, idPrefix: id }),
    [tier, division, season, size, title, id],
  );
  return <Svg svg={svg} className={`art art-rank is-${tier}${className ? ` ${className}` : ''}`} />;
}

export function PlacementEmblem({ done, size = 96, title }: { done: number; size?: number; title: string }): React.JSX.Element {
  const id = useArtId();
  const clamped = Math.max(0, Math.min(5, Math.floor(done)));
  const svg = useMemo(() => placementEmblemSvg({ done: clamped, size, title, idPrefix: id }), [clamped, size, title, id]);
  return <Svg svg={svg} className="art art-rank is-placing" />;
}

export function LeagueEmblem({ tier, size = 96, title, className }: { tier: LeagueTier; size?: number; title: string; className?: string }): React.JSX.Element {
  const id = useArtId();
  const svg = useMemo(() => leagueEmblemSvg({ tier, size, title, idPrefix: id }), [tier, size, title, id]);
  return <Svg svg={svg} className={`art art-league is-${tier}${className ? ` ${className}` : ''}`} />;
}

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
  const svg = useMemo(
    () => (known ? badgeSvg({ key: badgeKey as never, tier: artTier, state: shown, size, title, idPrefix: id }) : null),
    [known, badgeKey, artTier, shown, size, title, id],
  );
  const glint = useMemo(
    () =>
      known && shine && shown === 'earned' && badgeShines(badgeKey as never, artTier, ART_BADGES[badgeKey as keyof typeof ART_BADGES].tiers)
        ? badgeShineSvg({ key: badgeKey as never, size, phase: 0, idPrefix: `${id}g` })
        : null,
    [known, shine, shown, badgeKey, artTier, size, id],
  );
  if (!svg) return null;
  return (
    <span className={`art art-badge is-${shown}${playing ? ' is-playing' : ''}`} style={{ width: size, height: size }}>
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
  const frame = useMemo(() => seasonFrameSvg({ tier, size, title, idPrefix: id }), [tier, size, title, id]);
  const shine = useMemo(
    () => (SEASON_FRAME_SHINE[tier] ? seasonFrameShineSvg({ tier, size, idPrefix: `${id}s` }) : null),
    [tier, size, id],
  );
  const inner = Math.round(size * SEASON_FRAME_INNER);
  return (
    <span className={`art-frame is-${tier}`} style={{ width: size, height: size }}>
      <span className="art-frame-face" style={{ width: inner, height: inner }}>
        {children}
      </span>
      <Svg svg={frame} className="art-frame-ring" />
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
 * not move whether or not a frame is worn.
 */
export function FrameOverlay({ sku, face, title }: { sku: string | null | undefined; face: number; title: (tier: RankTier) => string }): React.JSX.Element | null {
  const id = useArtId();
  const tier = frameTier(sku);
  const size = Math.round(face / SEASON_FRAME_INNER);
  const label = tier ? title(tier) : '';
  const frame = useMemo(() => (tier ? seasonFrameSvg({ tier, size, title: label, idPrefix: id }) : null), [tier, size, label, id]);
  const shine = useMemo(
    () => (tier && SEASON_FRAME_SHINE[tier] ? seasonFrameShineSvg({ tier, size, idPrefix: `${id}s` }) : null),
    [tier, size, id],
  );
  if (!tier || !frame) return null;
  return (
    <span className={`art-frame-overlay is-${tier}`} style={{ width: size, height: size }}>
      <Svg svg={frame} className="art-frame-ring" />
      {shine && <Shine svg={shine} className="art-frame-shine" />}
    </span>
  );
}
