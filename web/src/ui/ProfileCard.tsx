import type { ReactNode } from 'react';
import type { LevelInfo, ProfileBackground, ProfileIcon } from '../lib/types';
import { PersonGlyph } from '../components/icons';
import { CosmeticBackground, IconOverlay, LevelBar, PremiumPill } from '../profile/cosmetic-parts';
import { useT } from '../i18n/I18nProvider';

/**
 * A person, as Hevalo shows one: their background as a banner, their face
 * overlapping it, their name, and how far they are into their level.
 *
 * This is the card from the front page's picture of progress, and it is the
 * same component there and in the app — the profile popup, the full profile —
 * so the picture and the product cannot drift apart. It used to be a 200px
 * photograph with a frosted plate over it and a logo pill in the corner; the
 * front page drew something simpler, and the app now draws that.
 *
 * The background lives in the banner rather than behind the whole card. That
 * is where it reads as *theirs* — like a header image — and it leaves the text
 * on the app's own black, where it is always legible, instead of on somebody's
 * artwork, where it measured as low as 3.3:1.
 *
 * Presentation only. Ownership and premium are settled by the server before a
 * background or an icon ever arrives here.
 */
export interface ProfileCardProps {
  name: string;
  username?: string;
  avatarUrl?: string | null;
  background?: ProfileBackground | null;
  icon?: ProfileIcon | null;
  premium?: boolean;
  online?: boolean;
  level?: Pick<LevelInfo, 'level' | 'xp' | 'nextLevelXp' | 'progress'>;
  /** under the handle: where they are from, what they were given */
  meta?: ReactNode;
  /** beside the name on a wide card: the edit button, the friend actions */
  aside?: ReactNode;
  /** name and level beside the face rather than under it — the full profile */
  wide?: boolean;
  /** only for pictures of the product, which are below the fold */
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
  meta,
  aside,
  wide = false,
  lazy = false,
  children,
}: ProfileCardProps): React.JSX.Element {
  const t = useT();
  return (
    <div className={`pc${wide ? ' pc--wide' : ''}${background ? ' pc--has-bg' : ''}`}>
      <div className="pc-banner">
        {background && <CosmeticBackground background={background} />}
      </div>
      <div className="pc-body">
        <div className="pc-id">
          <span className="pc-face">
            {avatarUrl ? (
              <img
                className="pc-face-img pcard-photo-img"
                src={avatarUrl}
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
            {icon && <IconOverlay icon={icon} />}
          </span>
          <div className="pc-names">
            <div className="pc-name-row">
              <span className="pc-name">{name}</span>
              {premium && <PremiumPill />}
            </div>
            {username && <div className="pc-handle">@{username}</div>}
            {online && (
              <div className="pc-online">
                <span className="presence-dot presence-dot-inline" /> {t('profile.online')}
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
