import { Link } from 'react-router-dom';
import type { FavoriteRef, LevelInfo, ProfileBackground, ProfileIcon } from '../lib/types';
import { flagUrl } from '../lib/countries';
import { GiftedNote } from './cosmetic-parts';
import { ProfileCard } from '../ui/ProfileCard';
import { BookIcon, FeatherIcon, FlameIcon, LockIcon, MedalIcon, UsersIcon, XpIcon } from '../components/icons';
import { useLocale, useT } from '../i18n/I18nProvider';

/** Normalized data a Hevalo profile renders (self or another user). */
export interface FullProfileView {
  name: string;
  username: string;
  avatarUrl?: string | null;
  icon?: ProfileIcon | null;
  background?: ProfileBackground | null;
  premium?: boolean;
  /** the whole level, for the bar toward the next one; absent on older responses */
  levelInfo?: LevelInfo;
  xp: number;
  streakDays: number;
  /** how many friends they have; left out where it is not known, or not theirs to show */
  friends?: number | null;
  /** how many badges they have earned; left out where the server does not say */
  badges?: number | null;
  bio?: string | null;
  favPoem?: FavoriteRef | null;
  favStory?: FavoriteRef | null;
  /** somebody else, here now; on your own profile it goes without saying */
  online?: boolean;
  country?: { code: string; name: string } | null;
  /** the frame worn round the avatar, and its picture when it is one from the shop */
  frameSku?: string | null;
  frameUrl?: string | null;
}

/** One number about somebody, with the word for it; a link where there is a page behind the number. */
export interface ProfileFact {
  key: string;
  label: string;
  value: string;
  icon?: React.ReactNode;
  /** how a screen reader says it, where the number alone would not be enough ("12 days") */
  spoken?: string;
  to?: string;
}

/**
 * A row of numbers about somebody: each a figure with its word under it, four
 * to a row at most. Where a number has a page of its own (your friends, your
 * badges) the whole tile is the way in.
 *
 * The word comes first in the markup and the figure first on the screen: read
 * aloud it is "Streak, 12 days", looked at it is a 12 with "Streak" under it.
 */
export function ProfileFacts({ facts }: { facts: readonly ProfileFact[] }): React.JSX.Element | null {
  if (facts.length === 0) return null;
  return (
    <ul className="mkp-facts">
      {facts.map((fact) => {
        const inside = (
          <>
            <span className="mkp-fact-label">
              {fact.icon && <span className="mkp-fact-icon">{fact.icon}</span>}
              {fact.label}
            </span>
            <span className="mkp-fact-value" aria-hidden={fact.spoken ? true : undefined}>
              {fact.value}
            </span>
            {fact.spoken && <span className="sr-only">{fact.spoken}</span>}
          </>
        );
        return (
          <li key={fact.key}>
            {fact.to ? (
              <Link to={fact.to} className="mkp-fact mkp-fact--link">
                {inside}
              </Link>
            ) : (
              <span className="mkp-fact">{inside}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * A section of a profile that only its owner is shown: what you have earned
 * and hold, which is nobody else's business. It says so, so that nobody has
 * to wonder who else is reading their longest streak.
 */
export function OnlyYou({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  const t = useT();
  return (
    <section className="mkp-showcase-block">
      <div className="mkp-showcase-label mkp-yours-head">
        <h2 className="mkp-yours-title">{title}</h2>
        <span className="mkp-yours-note">
          <LockIcon size={13} />
          {t('profile.onlyYou')}
        </span>
      </div>
      <div className="mkp-showcase mkp-yours">{children}</div>
    </section>
  );
}

/**
 * A whole profile, yours or somebody else's, in one column that reads the
 * same on a phone and on a desk: who this is, then what they have done.
 *
 *   the card   their banner and face, their name, where they are from, what
 *              they say about themselves, what you can do (edit and share
 *              your own; befriend, message or play somebody else), how far
 *              they are into their level, and four numbers: streak, XP,
 *              friends, badges
 *   showcase   the badges they chose to show, their ranks and their league
 *   favourites the poem and the story they picked
 *   people     who they know
 *   yours      on your own profile only: what nobody else is shown
 *   activity   what they posted and played — the long part, and so the last
 *
 * The numbers used to be a second card in a side column, which a phone has
 * no room for and so dropped to the very bottom, under every post somebody
 * had ever written. They are about the person, so they are with the person.
 */
export function FullProfile({
  view,
  own = false,
  headerAction,
  progress,
  people,
  yours,
  activity,
}: {
  view: FullProfileView;
  /** your own profile: the numbers lead to your pages, and an empty bio offers to be written */
  own?: boolean;
  /** what can be done here: edit and share, or the friend actions */
  headerAction?: React.ReactNode;
  /** the showcased badges, ranks and league (profile/ProfileProgress) */
  progress?: React.ReactNode;
  /** who they know (profile/ProfileFriends) */
  people?: React.ReactNode;
  /** what only the owner is shown (`OnlyYou`) */
  yours?: React.ReactNode;
  /** what they have posted and played */
  activity?: React.ReactNode;
}): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const number = (n: number): string => n.toLocaleString(locale);
  const facts: ProfileFact[] = [
    {
      key: 'streak',
      label: t('profile.stat.streak'),
      value: number(view.streakDays),
      // the flame is lit only while there is a streak to speak of
      icon: <FlameIcon size={15} className={view.streakDays > 0 ? 'mkp-fact-lit' : undefined} />,
      spoken: t(view.streakDays === 1 ? 'profile.stat.streakDay' : 'profile.stat.streakDays', { count: number(view.streakDays) }),
    },
    { key: 'xp', label: t('profile.stat.xp'), value: number(view.xp), icon: <XpIcon size={15} /> },
    ...(view.friends != null ? [{ key: 'friends', label: t('nav.friends'), value: number(view.friends), icon: <UsersIcon size={15} />, to: own ? '/app/friends' : undefined }] : []),
    ...(view.badges != null ? [{ key: 'badges', label: t('profile.badges'), value: number(view.badges), icon: <MedalIcon size={15} />, to: own ? '/app/badges' : undefined }] : []),
  ];

  return (
    <div className="mkp-page">
      <div className="mkp-wrap">
        {/*
          The same card as the profile popup and the front page's picture of
          one, only wider. Their background is the banner, where it reads as
          theirs and the text below it stays on the app's own surface.
        */}
        <ProfileCard
          wide
          name={view.name}
          username={view.username}
          avatarUrl={view.avatarUrl}
          background={view.background}
          icon={view.icon}
          premium={view.premium}
          online={view.online ?? false}
          level={view.levelInfo}
          frameSku={view.frameSku}
          frameUrl={view.frameUrl}
          aside={headerAction}
          meta={
            <>
              {view.country && (
                <div className="mkp-country">
                  <img className="flag" src={flagUrl(view.country.code)} alt="" width={22} height={16} loading="lazy" />
                  <span>{view.country.name}</span>
                </div>
              )}
              <GiftedNote background={view.background} icon={view.icon} />
              {/* their own words, with their name: nobody else's profile says "no bio yet", and yours offers to be written */}
              {view.bio ? (
                <p className="mkp-bio" dir="auto">
                  {view.bio}
                </p>
              ) : own ? (
                <Link to="/app/profile/edit" className="mkp-bio-add">
                  {t('profile.addBio')}
                </Link>
              ) : null}
            </>
          }
        >
          <ProfileFacts facts={facts} />
        </ProfileCard>

        <div className="mkp-sections">
          {progress}

          {(view.favPoem || view.favStory) && (
            <div className="mkp-favs">
              {view.favPoem && (
                <div className="mkp-showcase-block">
                  <div className="mkp-showcase-label">{t('profile.favoritePoem')}</div>
                  <div className="mkp-showcase">
                    <Link to="/poems" className="mkp-fav">
                      <span className="mkp-fav-thumb" aria-hidden="true">
                        <FeatherIcon size={26} />
                      </span>
                      <span className="mkp-fav-meta">
                        <span className="mkp-fav-title">{view.favPoem.title}</span>
                      </span>
                    </Link>
                  </div>
                </div>
              )}
              {view.favStory && (
                <div className="mkp-showcase-block">
                  <div className="mkp-showcase-label">{t('profile.favoriteStory')}</div>
                  <div className="mkp-showcase">
                    <Link to="/stories" className="mkp-fav">
                      <span className="mkp-fav-thumb" aria-hidden="true">
                        <BookIcon size={26} />
                      </span>
                      <span className="mkp-fav-meta">
                        <span className="mkp-fav-title">{view.favStory.title}</span>
                      </span>
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )}

          {people}
          {yours}
          {activity}
        </div>
      </div>
    </div>
  );
}
