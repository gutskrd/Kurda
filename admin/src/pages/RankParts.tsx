/** Parts the Leagues, Badges and Pictures pages and a person's Badges tab share: the art from @kurda/shared, and where a weekly run stands. */
import { useId, useMemo } from 'react';
import {
  badgeSvg,
  hasBadgeArt,
  leagueEmblemSvg,
  placementEmblemSvg,
  rankEmblemSvg,
  seasonFrameSvg,
  type ArtBadgeKey,
  type ArtBadgeTier,
  type Division,
  type LeagueTier,
  type RankTier,
} from '@kurda/shared';
import { Badge, Time } from '../ui';
import { leagueTierName, runState, type LeagueRunStatus } from '../progress';

// ---- The art ----------------------------------------------------------------------

/** A plain identifier for the art's gradient ids, unique on the page (React's ids carry colons). */
function useArtId(): string {
  return `a${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
}

/**
 * One drawing, inline. The SVG comes from the shared builders, never from user input, so it is safe as markup. With a
 * label it is an image of that name; without one it is decoration.
 */
function Art({ svg, label, className }: { svg: string; label?: string; className?: string }): React.JSX.Element {
  return (
    <span
      className={`art${className ? ` ${className}` : ''}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/** A rank emblem: the tier's crest (with its division when given), or the placement emblem while placing. */
export function RankEmblem({
  tier,
  division,
  placing,
  size = 40,
  label,
}: {
  tier: RankTier | null;
  division?: Division | null;
  /** Placement games played, when there is no tier yet. */
  placing?: number;
  size?: number;
  label?: string;
}): React.JSX.Element {
  const id = useArtId();
  // Drawn once per look: a list re-renders on every menu opened, and fifty emblems redrawn each time add up.
  const svg = useMemo(
    () =>
      tier === null
        ? placementEmblemSvg({ done: Math.min(Math.max(placing ?? 0, 0), 5), size, idPrefix: id })
        : rankEmblemSvg({ tier, division: tier === 'sterk' ? undefined : (division ?? undefined), size, idPrefix: id }),
    [tier, division, placing, size, id],
  );
  return <Art svg={svg} label={label} className="art-emblem" />;
}

export function LeagueEmblem({ tier, size = 36, label }: { tier: LeagueTier; size?: number; label?: string }): React.JSX.Element {
  const id = useArtId();
  const svg = useMemo(() => leagueEmblemSvg({ tier, size, idPrefix: id, title: leagueTierName(tier) }), [tier, size, id]);
  return <Art svg={svg} label={label} className="art-emblem" />;
}

export function SeasonFrame({ tier, size = 40 }: { tier: RankTier; size?: number }): React.JSX.Element {
  const id = useArtId();
  const svg = useMemo(() => seasonFrameSvg({ tier, size, shine: tier === 'lutke' || tier === 'sterk', idPrefix: id }), [tier, size, id]);
  return <Art svg={svg} className="art-emblem" />;
}

/** A badge medallion at a tier (1–4), or locked at 0; a key with no drawing (a retired badge) shows a placeholder. */
export function BadgeArt({ badgeKey, tier, tiers, size = 56, label }: { badgeKey: string; tier: number; tiers: number; size?: number; label?: string }): React.JSX.Element {
  const id = useArtId();
  const svg = useMemo(() => {
    if (!hasBadgeArt(badgeKey)) return null;
    const shown = Math.min(Math.max(tier, 1), tiers) as ArtBadgeTier;
    return badgeSvg({ key: badgeKey as ArtBadgeKey, tier: shown, tiers, size, state: tier > 0 ? 'earned' : 'locked', idPrefix: id });
  }, [badgeKey, tier, tiers, size, id]);
  if (svg === null) {
    return (
      <span className="art art-missing" style={{ width: size, height: size }} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
        ?
      </span>
    );
  }
  return <Art svg={svg} label={label} className="art-badge" />;
}

// ---- A weekly run -------------------------------------------------------------------

/** Where a settle or merge stands, with when, and what it did or why it failed. */
export function RunLine({ title, run }: { title: string; run: LeagueRunStatus | null }): React.JSX.Element {
  const state = runState(run);
  return (
    <div className="run-line">
      <div className="run-head">
        <strong>{title}</strong>
        <Badge tone={state.tone}>{state.label}</Badge>
      </div>
      {run && (
        <div className="run-meta subtle">
          {run.finishedAt ? (
            <>
              Finished <Time value={run.finishedAt} />
            </>
          ) : run.startedAt ? (
            <>
              Started <Time value={run.startedAt} />
            </>
          ) : null}
          {run.attempts > 1 && <> · {run.attempts} attempts</>}
        </div>
      )}
      {state.detail && <div className={state.tone === 'bad' ? 'field-error' : 'run-detail'}>{state.detail}</div>}
    </div>
  );
}
