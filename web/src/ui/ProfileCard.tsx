import type { ReactNode } from 'react';
import type { LevelInfo, ProfileBackground, ProfileIcon } from '../lib/types';
import { PersonGlyph } from '../components/icons';
import { CosmeticBackground, IconOverlay, LevelBar, PremiumPill } from '../profile/cosmetic-parts';
import { useT } from '../i18n/I18nProvider';
import { FrameOverlay } from '../ranks/art';
import { rankTierNamed } from '../ranks/names';
import { useAvatarSrc } from '../art/overrides';
import { Horizon } from './Horizon';
import type { ProfileWordTag } from '@kurda/shared';
import { TagPill } from '../profile/TagPill';

/**
 * A person as Hevalo shows one: their background as a banner, their face overlapping it, their name and level
 * progress. The front page, the profile popup and the full profile all use it. The background stays in the banner so
 * the text sits on the app's own surface and stays legible; with none, a seeded horizon fills it. Presentation only:
 * the server settles ownership before a background or icon arrives.
 */
interface ProfileCardProps {
  name: string;
  username?: string;
  avatarUrl?: string | null;
  background?: ProfileBackground | null;
  icon?: ProfileIcon | null;
  premium?: boolean;
  online?: boolean;
  level?: Pick<LevelInfo, 'level' | 'xp' | 'nextLevelXp' | 'progress'>;
  /** The frame worn round the face: a season frame or one from the shop. */
  frameSku?: string | null;
  /** The picture of a shop frame, which is laid on rather than drawn. */
  frameUrl?: string | null;
  /** The word tag worn by the name. */
  tag?: ProfileWordTag | null;
  /** The person's id, seeding the horizon drawn when no background is worn; without it the banner is plain. */
  seed?: string;
  /** On the banner's far corner: the menu about this person, and whatever closes the card. */
  corner?: ReactNode;
  /** Under the handle, such as where they are from. */
  meta?: ReactNode;
  /** Actions such as edit, share and the friend buttons, in a row under the name or beside the face when wide. */
  aside?: ReactNode;
  /** Name and level beside the face rather than under it, as on the full profile. */
  wide?: boolean;
  /** Only for the front page's pictures, which are below the fold. */
  lazy?: boolean;
  children?: ReactNode;
}

export function ProfileCard({
  name,
  username,
  avatarUrl,
  background,
  icon,
  premium,
  online,
  level,
  frameSku,
  frameUrl,
  tag,
  seed,
  corner,
  meta,
  aside,
  wide = false,
  lazy = false,
  children,
}: ProfileCardProps): React.JSX.Element {
  const t = useT();
  const face = useAvatarSrc(avatarUrl);
  // On a full profile the name is the page heading; elsewhere it is plain text.
  const Name = wide ? 'h1' : 'span';
  return (
    <div className={`pc${wide ? ' pc--wide' : ''}${background ? ' pc--has-bg' : ''}`}>
      <div className="pc-banner">{background ? <CosmeticBackground background={background} /> : seed ? <Horizon seed={seed} /> : null}</div>
      {corner && <div className="pc-corner">{corner}</div>}
      <div className="pc-body">
        <div className="pc-id">
          <span className="pc-face">
            {face ? (
              <img
                className="pc-face-img pcard-photo-img"
                src={face}
                alt=""
                width={88}
                height={88}
                loading={lazy ? 'lazy' : undefined}
                decoding="async"
              />
            ) : (
              <span className="pc-face-img pc-face-glyph" aria-hidden="true">
                <PersonGlyph size={48} />
              </span>
            )}
            <FrameOverlay sku={frameSku} url={frameUrl} face={wide ? 120 : 84} title={(tier) => t('seasons.frameTitle', { tier: rankTierNamed(t, tier).name })} />
            {icon && <IconOverlay icon={icon} />}
            {/* Online: a dot on the face, and words beside the handle. */}
            {online && <span className="pc-presence" aria-hidden="true" />}
          </span>
          <div className="pc-names">
            <div className="pc-name-row">
              <Name className="pc-name" dir="auto">
                {name}
              </Name>
              {tag && <TagPill tag={tag} />}
              {premium && <PremiumPill />}
            </div>
            {(username || online) && (
              <div className="pc-handle">
                {username && <span dir="ltr">@{username}</span>}
                {online && <span className="pc-online">{t('profile.online')}</span>}
              </div>
            )}
            {meta}
          </div>
          {aside && <div className="pc-aside">{aside}</div>}
        </div>
        {level && <LevelBar level={level} />}
        {children}
      </div>
    </div>
  );
}
