import type { ReactNode } from 'react';
import type { LevelInfo, ProfileBackground, ProfileIcon } from '../lib/types';
import { PersonGlyph } from '../components/icons';
import { CosmeticBackground, IconOverlay, PremiumPill } from './cosmetic-parts';
import { LevelRing } from './LevelRing';
import { useLocale, useT } from '../i18n/I18nProvider';
import { FrameOverlay } from '../ranks/art';
import { rankTierNamed } from '../ranks/names';
import { useAvatarSrc } from '../art/overrides';
import { Horizon } from '../ui/Horizon';
import type { ProfileWordTag } from '@kurda/shared';
import { TagPill } from './TagPill';

/** The face's size on a full profile, and the frame drawn round it. */
const FACE = 96;

/**
 * The level as a games platform shows it: the number in a ring that fills toward the next level, with what is left
 * said in words for a screen reader and on hover.
 */
export function LevelBadge({ level }: { level: Pick<LevelInfo, 'level' | 'xp' | 'nextLevelXp' | 'progress'> }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const toNext = Math.max(0, level.nextLevelXp - level.xp);
  const said = `${t('profile.levelN', { level: level.level })}, ${t('profile.xpToLevel', { xp: toNext.toLocaleString(locale), level: level.level + 1 })}`;
  return (
    <span className="ph-level" role="img" aria-label={said} title={said}>
      <LevelRing progress={level.progress} />
      <span className="ph-level-n" aria-hidden="true">
        {level.level.toLocaleString(locale)}
      </span>
    </span>
  );
}

/**
 * The top of a full profile, laid out as a social app's: the banner, the face with the figures beside it, the name with
 * the level, the handle with the badge row, what is known about them and the bio, then whatever the page adds under it (who they know, what
 * only the owner sees) and the actions. It sits on the page itself rather than in a card.
 */
export function ProfileHead({
  id,
  name,
  username,
  avatarUrl,
  background,
  icon,
  premium,
  online = false,
  level,
  frameSku,
  frameUrl,
  tag,
  corner,
  stats,
  handleAside,
  meta,
  actions,
  children,
}: {
  /** whose profile it is: the horizon drawn where no background is worn is seeded from it */
  id?: string;
  name: string;
  username: string;
  avatarUrl?: string | null;
  background?: ProfileBackground | null;
  icon?: ProfileIcon | null;
  premium?: boolean;
  online?: boolean;
  level?: Pick<LevelInfo, 'level' | 'xp' | 'nextLevelXp' | 'progress'>;
  frameSku?: string | null;
  frameUrl?: string | null;
  /** the word tag worn by the name */
  tag?: ProfileWordTag | null;
  /** the menu in the banner's far corner */
  corner?: ReactNode;
  /** the figures beside the face */
  stats?: ReactNode;
  /** after the handle on its line, wrapping under it where the line is short: the badge row */
  handleAside?: ReactNode;
  /** where they are from, since when, who can see the page, and the bio */
  meta?: ReactNode;
  /** edit and share on your own profile, the friend buttons on somebody else's */
  actions?: ReactNode;
  /** under the bio and before the actions: who they know, and what only the owner sees */
  children?: ReactNode;
}): React.JSX.Element {
  const t = useT();
  const face = useAvatarSrc(avatarUrl);
  return (
    <header className={`ph${background ? ' ph--has-bg' : ''}`}>
      <div className="ph-banner">{background ? <CosmeticBackground background={background} /> : id ? <Horizon seed={id} /> : null}</div>
      {corner && <div className="ph-corner">{corner}</div>}
      <div className="ph-top">
        <span className="ph-face">
          {face ? (
            <img className="ph-face-img" src={face} alt="" width={FACE} height={FACE} decoding="async" />
          ) : (
            <span className="ph-face-img ph-face-glyph" aria-hidden="true">
              <PersonGlyph size={52} />
            </span>
          )}
          <FrameOverlay sku={frameSku} url={frameUrl} face={FACE} title={(tier) => t('seasons.frameTitle', { tier: rankTierNamed(t, tier).name })} />
          {icon && <IconOverlay icon={icon} />}
          {online && <span className="ph-presence" aria-hidden="true" />}
        </span>
        {stats && <div className="ph-stats">{stats}</div>}
      </div>
      <div className="ph-names">
        <div className="ph-name-row">
          <h1 className="ph-name" dir="auto">
            {name}
          </h1>
          {level && <LevelBadge level={level} />}
          {tag && <TagPill tag={tag} />}
          {premium && <PremiumPill />}
        </div>
        <div className="ph-handle">
          <span dir="ltr">@{username}</span>
          {online && <span className="ph-online">{t('profile.online')}</span>}
          {handleAside}
        </div>
      </div>
      {meta}
      {children}
      {actions && <div className="ph-actions">{actions}</div>}
    </header>
  );
}
