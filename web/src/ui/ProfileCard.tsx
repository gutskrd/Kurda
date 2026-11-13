import type { ReactNode } from 'react';
import type { LevelInfo, ProfileBackground, ProfileIcon } from '../lib/types';
import { PersonGlyph } from '../components/icons';
import { CosmeticBackground, IconOverlay, LevelBar, PremiumPill } from '../profile/cosmetic-parts';
import { useT } from '../i18n/I18nProvider';
import { FrameOverlay } from '../ranks/art';
import { rankTierNamed } from '../ranks/names';
import { useAvatarSrc } from '../art/overrides';
import { Horizon } from './Horizon';

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
 * Somebody who wears no background has a horizon of their own there (`seed`),
 * so no profile opens on an empty band. The corner of the banner is where the
 * menu about this person is — the place such a menu is looked for — and what
 * can be done with them (`aside`) sits in a row of its own under their words,
 * or beside their face where the card is wide.
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
  /** the frame worn round the face: a season frame (contract 4 §R5) or one from the shop; none without */
  frameSku?: string | null;
  /** the picture of a frame from the shop, which is laid on rather than drawn */
  frameUrl?: string | null;
  /** who this is, for the horizon drawn where no background is worn: their id; without it the banner is plain */
  seed?: string;
  /** on the banner's far corner: the menu about this person, and whatever closes the card */
  corner?: ReactNode;
  /** under the handle: where they are from, what they were given */
  meta?: ReactNode;
  /** what can be done: the edit and share buttons, the friend actions */
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
  frameSku,
  frameUrl,
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
  // on a full profile the page is about this person, and their name is its heading; on a card among others it is a name
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
            {/* here now: a dot on the face, as everywhere a person is listed, and said in words beside the handle */}
            {online && <span className="pc-presence" aria-hidden="true" />}
          </span>
          <div className="pc-names">
            <div className="pc-name-row">
              <Name className="pc-name" dir="auto">
                {name}
              </Name>
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
