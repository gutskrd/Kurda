import { badgeLeft, badgeTierKey, badgeDef, badgeViewFraction, type BadgeView } from '@kurda/shared';
import { useT } from '../i18n/I18nProvider';
import { BadgeMedal } from '../ranks/art';
import { badgeNamed, badgeTierNamed, unitWord, withMeaning, type Translate } from '../ranks/names';

/**
 * The pieces of a badge every screen draws the same way: its medallion with
 * an accessible name, its tier in words, and its progress in "7 / 30 days".
 */

/** "Agir · Zêr", "Agir · not earned yet", or "Secret badge" — the medal's own label. */
export function medalTitle(t: Translate, view: MedalView): string {
  if (view.hidden) return t('badges.secret');
  const name = withMeaning(t, badgeNamed(t, view.key));
  if (view.tier <= 0) return t('badges.medalLocked', { name });
  const def = badgeDef(view.key);
  const tierKey = def ? badgeTierKey(def, view.tier) : null;
  if (!tierKey || (def?.tiers.length ?? 1) <= 1) return name;
  return t('badges.medalTier', { name, tier: badgeTierNamed(t, tierKey).name });
}

/** Enough of a badge to draw it: a full `BadgeView`, or a profile's `ShowcaseBadge`. */
export interface MedalView {
  key: string;
  tier: number;
  hidden?: boolean;
}

export function Medal({
  view,
  size,
  shine = true,
  playing = false,
}: {
  view: MedalView;
  size: number;
  shine?: boolean;
  playing?: boolean;
}): React.JSX.Element | null {
  const t = useT();
  return (
    <BadgeMedal
      badgeKey={view.key}
      tier={view.tier}
      state={view.hidden ? 'secret' : view.tier > 0 ? 'earned' : 'locked'}
      size={size}
      title={medalTitle(t, view)}
      shine={shine}
      playing={playing}
    />
  );
}

/**
 * "7 / 30 days" towards the next tier, and past halfway what is left ("3 days to
 * go"), the smaller part being the one that keeps people going; null once every
 * tier is earned (or for a hidden secret).
 */
export function progressText(t: Translate, view: BadgeView): string | null {
  if (view.hidden || view.next === null) return null;
  const left = badgeLeft(view);
  if (left !== null && left > 0) return t('badges.toGo', { count: left.toLocaleString(), unit: unitWord(t, view.unit, left) });
  return t('badges.progress', {
    progress: Math.min(view.progress, view.next).toLocaleString(),
    next: view.next.toLocaleString(),
    unit: unitWord(t, view.unit, view.next),
  });
}

/** 0–1 along the way to the next tier, from the last one reached. */
export const progressFraction = badgeViewFraction;

/** The tier's metal as a class, for the tile's accent. */
export function tierClass(view: Pick<BadgeView, 'tierKey' | 'tier' | 'hidden'>): string {
  if (view.hidden) return 'is-secret';
  return view.tier > 0 && view.tierKey ? `metal-${view.tierKey}` : 'is-locked';
}

/** The tier pips under a tile: as many filled as earned, so the tier is never only a colour. */
export function TierPips({ tier, count }: { tier: number; count: number }): React.JSX.Element | null {
  if (count <= 1) return null;
  return (
    <span className="badge-pips" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className={`badge-pip${i < tier ? ' is-on' : ''}`} />
      ))}
    </span>
  );
}
