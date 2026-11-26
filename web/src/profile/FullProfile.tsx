import { Suspense, useLayoutEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { FavoriteRef, LevelInfo, ProfileBackground, ProfileIcon } from '../lib/types';
import { Flag } from '../components/Flag';
import { badgesInOrder, compactCount, fireLevel, toLeagueTier, type ProfileBadge, type ProfileLeague, type ProfileWordTag, type ShowcaseBadge, type TreeGlimpse } from '@kurda/shared';
import { ProfileHead } from './ProfileHead';
import { BadgePill } from './BadgeRow';
import { Fire } from '../components/Fire';
import { BookIcon, CalendarIcon, ChevronIcon, FeatherIcon, LockIcon } from '../components/icons';
import { Sheet } from '../components/Sheet';
import { useLocale, useT } from '../i18n/I18nProvider';
import { useWordFit } from '../lib/useWordFit';
import { lazyPart } from '../lib/lazyPart';

// The collection, with every badge, tree and frame drawn, loads apart from the profile it opens from (lib/lazyPart.ts).
const CollectionSheet = lazyPart(() => import('./CollectionSheet').then((m) => m.CollectionSheet));

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
  /** the word tag worn by the name */
  tag?: ProfileWordTag | null;
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
/** How far the figures beside a face may shrink together before they stand two by two instead. */
const ROW_MIN_FIT = 0.62;

/**
 * A row of up to four figures with their labels; a tile with its own page links there. The label comes first in the
 * markup so screen readers say "Streak, 12 days", while the figure shows first.
 */
export function ProfileFacts({ facts, stack = true }: { facts: readonly ProfileFact[]; /** may four stand two by two */ stack?: boolean }): React.JSX.Element | null {
  // The labels at one size in one row, a little smaller together where the longest needs it; where they would have to
  // shrink further, four figures stand two by two at the full size instead.
  const [row, fit] = useWordFit<HTMLUListElement>(facts.map((f) => f.label), { typeOf: '.mkp-fact', weight: 600, inset: 16 });
  const stacked = stack && facts.length === 4 && fit < FACTS_MIN_FIT;
  // Beside a face (`stack` off) each figure is as wide as it needs; the whole row shrinks together only if it overflows.
  const key = facts.map((f) => `${f.value}|${f.label}`).join('\n');
  useLayoutEffect(() => {
    const el = row.current;
    if (!el || stack) return;
    // The words scale with the fit while the icons and gaps do not, so the row's natural width is measured at two fits
    // and the fit that makes it as wide as its room is worked out from them. Where the room beside the face would need
    // a fit under ROW_MIN_FIT (long short forms such as German's "12,3 Tsd."), the row moves under the face instead.
    const top = el.closest<HTMLElement>('.ph-top');
    const face = top?.querySelector<HTMLElement>('.ph-face');
    const needs = (at: number): number => {
      el.style.setProperty('--row-fit', String(at));
      el.style.width = 'max-content';
      const w = el.getBoundingClientRect().width;
      el.style.width = '';
      return w;
    };
    let seen = -1;
    const measure = (): void => {
      const whole = top?.clientWidth ?? el.clientWidth;
      if (whole === seen || whole === 0) return;
      seen = whole;
      const gap = top ? parseFloat(getComputedStyle(top).columnGap) || 0 : 0;
      const beside = top && face ? whole - face.offsetWidth - gap : whole;
      const full = needs(1);
      const words = (full - needs(0.5)) * 2;
      const fitIn = (room: number): number => (full <= room || words <= 0 ? 1 : Math.max(0, (room - (full - words)) / words));
      const fit = fitIn(beside);
      if (fit >= ROW_MIN_FIT) {
        delete el.dataset.crowded;
        el.style.setProperty('--row-fit', String(Math.floor(fit * 100) / 100));
      } else {
        el.dataset.crowded = '';
        el.style.setProperty('--row-fit', String(Math.floor(Math.min(1, fitIn(whole)) * 100) / 100));
      }
    };
    measure();
    void document.fonts?.ready.then(() => {
      seen = -1;
      measure();
    });
    const watch = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    watch?.observe(top ?? el);
    return () => watch?.disconnect();
  }, [row, stack, key]);
  if (facts.length === 0) return null;
  return (
    <ul ref={row} className={`mkp-facts${stacked ? ' is-stacked' : ''}`} style={{ '--word-fit': stacked ? 1 : fit } as React.CSSProperties}>
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
          <h2 className="mkp-sheet-title">{title}</h2>
          <div className="mkp-yours">{children}</div>
        </div>
      </Sheet>
    </>
  );
}

/**
 * A full profile in one column, laid out as a social app's: the head (banner, face and figures, name and level, the
 * handle with the badge row that opens their collection, what is known about them, the bio and favourites, who they
 * know, what only the owner sees, the actions), any notice for the owner, then what they posted, played, liked,
 * reposted and saved as a grid.
 */
export function FullProfile({
  view,
  own = false,
  corner,
  headerAction,
  showcase,
  onShowcase,
  onWorn,
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
  /** what the badge row and the collection show: the league, the tree, the three chosen badges and every earned one */
  showcase?: { tree?: TreeGlimpse | null; badges?: readonly ShowcaseBadge[]; earned?: readonly ProfileBadge[]; league?: ProfileLeague | null };
  /** your own profile: the three badges shown first were chosen again in the collection */
  onShowcase?: (keys: string[]) => void;
  /** your own profile: another icon is worn, chosen in the collection */
  onWorn?: () => void;
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
  const [collecting, setCollecting] = useState(false);
  const number = (n: number): string => n.toLocaleString(locale);
  // Figures beside the face are shortened (5230 → 5.2K) so all three fit; a screen reader is given the whole number.
  // Badges are in the row beside the handle rather than a fourth figure.
  const short = (n: number): string => compactCount(n, locale);
  const whole = (n: number): string | undefined => (short(n) === number(n) ? undefined : number(n));
  const facts: ProfileFact[] = [
    {
      key: 'streak',
      label: t('profile.stat.streak'),
      value: short(view.streakDays),
      // Hevalo's own fire, burning as big as the streak; cold and still without one
      icon: <Fire size={18} level={fireLevel(view.streakDays)} still />,
      spoken: t(view.streakDays === 1 ? 'profile.stat.streakDay' : 'profile.stat.streakDays', { count: number(view.streakDays) }),
      onOpen: own ? onStreak : undefined,
    },
    { key: 'xp', label: t('profile.stat.xp'), value: short(view.xp), spoken: whole(view.xp) },
    ...(view.friends != null ? [{ key: 'friends', label: t('nav.friends'), value: short(view.friends), spoken: whole(view.friends), to: own ? '/app/friends' : undefined }] : []),
  ];

  const badges = badgesInOrder(showcase?.badges, showcase?.earned);
  const collectionTitle = own ? t('collection.title.own') : t('collection.title.other', { name: view.name });
  const favourites = [
    view.favPoem && { key: 'poem', ref: view.favPoem, to: '/poems', icon: <FeatherIcon size={16} />, kind: t('profile.favoritePoem') },
    view.favStory && { key: 'story', ref: view.favStory, to: '/stories', icon: <BookIcon size={16} />, kind: t('profile.favoriteStory') },
  ].filter((f) => !!f);

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
          tag={view.tag}
          corner={corner}
          stats={<ProfileFacts facts={facts} stack={false} />}
          handleAside={
            showcase && (
              <BadgePill
                league={toLeagueTier(showcase.league?.tier ?? null)}
                tree={showcase.tree}
                badges={badges}
                own={own}
                title={collectionTitle}
                onOpen={() => setCollecting(true)}
              />
            )
          }
          actions={headerAction}
          meta={
            <>
              {(view.country || view.joinedYear) && (
                <ul className="mkp-about">
                  {view.country && (
                    <li className="mkp-country">
                      <Flag code={view.country.code} />
                      <span>{view.country.name}</span>
                    </li>
                  )}
                  {view.joinedYear && (
                    <li>
                      <CalendarIcon size={15} />
                      <span>{t('profile.joined', { year: view.joinedYear })}</span>
                    </li>
                  )}
                </ul>
              )}
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
              {/* The favourite poem and story, where they are set, leading where the library keeps them. */}
              {favourites.length > 0 && (
                <ul className="mkp-favs">
                  {favourites.map((f) => (
                    <li key={f.key}>
                      <Link to={f.to} className="chip mkp-fav" aria-label={`${f.kind}: ${f.ref.title}`}>
                        {f.icon}
                        <span className="mkp-fav-title" dir="auto">
                          {f.ref.title}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </>
          }
        >
          {people}
          {yours}
        </ProfileHead>

        {showcase && view.id && (
          <Suspense fallback={null}>
            <CollectionSheet
              open={collecting}
              onClose={() => setCollecting(false)}
              owner={{ userId: view.id, name: view.name, own, league: showcase.league, tree: showcase.tree, showcase: showcase.badges, earned: showcase.earned }}
              onShowcase={onShowcase}
              onWorn={onWorn}
            />
          </Suspense>
        )}
        {notice}
        {activity}
      </div>
    </div>
  );
}
