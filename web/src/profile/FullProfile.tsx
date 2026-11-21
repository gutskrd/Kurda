import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { FavoriteRef, LevelInfo, ProfileBackground, ProfileIcon } from '../lib/types';
import { flagUrl } from '../lib/countries';
import { GiftedNote } from './cosmetic-parts';
import type { ProfileLeague, ShowcaseBadge, TreeGlimpse } from '@kurda/shared';
import { ProfileHead } from './ProfileHead';
import { ProfileHighlights } from './ProfileHighlights';
import { CalendarIcon, ChevronIcon, EyeIcon, FlameIcon, LockIcon } from '../components/icons';
import { Sheet } from '../components/Sheet';
import { useLocale, useT } from '../i18n/I18nProvider';
import { useWordFit } from '../lib/useWordFit';

/** Normalized data a Hevalo profile renders (self or another user). */
export interface FullProfileView {
  /** whose profile it is: their horizon is drawn from it where they wear no background */
  id?: string;
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
  /** the year they joined, where it is theirs to know: your own profile says it */
  joinedYear?: number | null;
  /** your own profile only: who can open it, in the words Settings uses, and the page that changes it */
  seenBy?: { who: string; to: string } | null;
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
  /** opens something in place, such as your streak's daily view */
  onOpen?: () => void;
}

/** How far the labels may shrink together in one row before four figures stand two by two instead. */
const FACTS_MIN_FIT = 0.82;
/** The title size over the text size (tokens.css), for figures drawn at the title size beside a face. */
const TITLE_OVER_TEXT = 1.75;

/**
 * A row of up to four figures with their labels; a tile with its own page links there. The label comes first in the
 * markup so screen readers say "Streak, 12 days", while the figure shows first.
 */
export function ProfileFacts({ facts, stack = true }: { facts: readonly ProfileFact[]; /** may four stand two by two */ stack?: boolean }): React.JSX.Element | null {
  // The labels at one size in one row, a little smaller together where the longest needs it; where they would have to
  // shrink further, four figures stand two by two at the full size instead.
  const [row, fit] = useWordFit<HTMLUListElement>(facts.map((f) => f.label), { typeOf: '.mkp-fact', weight: 600, inset: 16 });
  // The figures beside a face are drawn at the title size, and the longest ("12,345") sets how much all of them shrink.
  const [, valueFit] = useWordFit<HTMLUListElement>(facts.map((f) => f.value), { typeOf: '.mkp-fact', weight: 700, inset: 12, scale: TITLE_OVER_TEXT }, row);
  const stacked = stack && facts.length === 4 && fit < FACTS_MIN_FIT;
  if (facts.length === 0) return null;
  return (
    <ul ref={row} className={`mkp-facts${stacked ? ' is-stacked' : ''}`} style={{ '--word-fit': stacked ? 1 : fit, '--value-fit': valueFit } as React.CSSProperties}>
      {facts.map((fact) => {
        const inside = (
          <>
            <span className="mkp-fact-label">{fact.label}</span>
            <span className="mkp-fact-value" aria-hidden={fact.spoken ? true : undefined}>
              {fact.icon && <span className="mkp-fact-icon">{fact.icon}</span>}
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
            ) : fact.onOpen ? (
              <button type="button" className="mkp-fact mkp-fact--link" aria-haspopup="dialog" onClick={fact.onOpen}>
                {inside}
              </button>
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
 * What only the profile's owner sees, as one quiet row above the actions (a social app's dashboard): its title and that it
 * is only theirs, opening the whole of it over the page.
 */
export function OnlyYou({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="mkp-yours-row" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <span className="mkp-yours-row-text">
          <span className="mkp-yours-title">{title}</span>
          <span className="mkp-yours-note">
            <LockIcon size={13} />
            {t('profile.onlyYou')}
          </span>
        </span>
        <ChevronIcon size={18} className="mkp-yours-go" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} label={title}>
        <div className="mkp-yours-sheet">
          <h2 className="hl-sheet-title">{title}</h2>
          <div className="mkp-yours">{children}</div>
        </div>
      </Sheet>
    </>
  );
}

/**
 * A full profile in one column, laid out as a social app's: the head (banner, face and figures, name and level, what is
 * known about them and the bio, who they know, what only the owner sees, the actions), the highlights (tree, league,
 * badges, favourites), any notice for the owner, then what they posted, played, liked, reposted and saved as a grid.
 */
export function FullProfile({
  view,
  own = false,
  corner,
  headerAction,
  showcase,
  notice,
  people,
  yours,
  activity,
  onStreak,
}: {
  view: FullProfileView;
  /** your own profile: the numbers lead to your pages, and an empty bio offers to be written */
  own?: boolean;
  /** the menu in the banner's far corner: your places, or what can be done about somebody else */
  corner?: React.ReactNode;
  /** what can be done here: edit and share, or the friend buttons */
  headerAction?: React.ReactNode;
  /** what the highlights show besides the favourites */
  showcase?: { tree?: TreeGlimpse | null; badges?: readonly ShowcaseBadge[]; league?: ProfileLeague | null };
  /** something only the owner is told, such as a new photo still being checked */
  notice?: React.ReactNode;
  /** who they know (profile/ProfileFriends) */
  people?: React.ReactNode;
  /** what only the owner is shown (`OnlyYou`) */
  yours?: React.ReactNode;
  /** what they have posted and played */
  activity?: React.ReactNode;
  /** your own profile: the streak opens the daily view */
  onStreak?: () => void;
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
      onOpen: own ? onStreak : undefined,
    },
    { key: 'xp', label: t('profile.stat.xp'), value: number(view.xp) },
    ...(view.friends != null ? [{ key: 'friends', label: t('nav.friends'), value: number(view.friends), to: own ? '/app/friends' : undefined }] : []),
    ...(view.badges != null ? [{ key: 'badges', label: t('profile.badges'), value: number(view.badges), to: own ? '/app/badges' : undefined }] : []),
  ];

  return (
    <div className="mkp-page">
      <div className="mkp-wrap">
        <ProfileHead
          id={view.id}
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
          corner={corner}
          stats={<ProfileFacts facts={facts} stack={false} />}
          actions={headerAction}
          meta={
            <>
              {(view.country || view.joinedYear || view.seenBy) && (
                <ul className="mkp-about">
                  {view.country && (
                    <li className="mkp-country">
                      <img className="flag" src={flagUrl(view.country.code)} alt="" width={22} height={16} loading="lazy" />
                      <span>{view.country.name}</span>
                    </li>
                  )}
                  {view.joinedYear && (
                    <li>
                      <CalendarIcon size={15} />
                      <span>{t('profile.joined', { year: view.joinedYear })}</span>
                    </li>
                  )}
                  {/* who can open this page, said on the page itself, and one press from where it is changed */}
                  {view.seenBy && (
                    <li>
                      <Link to={view.seenBy.to} className="mkp-seen">
                        <EyeIcon size={15} />
                        <span>{t('profile.seenBy', { who: view.seenBy.who })}</span>
                      </Link>
                    </li>
                  )}
                </ul>
              )}
              <GiftedNote background={view.background} icon={view.icon} />
              {/* The bio: others' empty bios show nothing, and the owner's offers to be written. */}
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
          {people}
          {yours}
        </ProfileHead>

        <ProfileHighlights own={own} tree={showcase?.tree} badges={showcase?.badges} league={showcase?.league} favPoem={view.favPoem} favStory={view.favStory} />
        {notice}
        {activity}
      </div>
    </div>
  );
}
