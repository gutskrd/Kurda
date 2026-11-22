import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { compactCount, hasTreeArt, toLeagueTier, type ProfileLeague, type ShowcaseBadge, type TreeGlimpse } from '@kurda/shared';
import type { FavoriteRef } from '../lib/types';
import { useLocale, useT } from '../i18n/I18nProvider';
import { Sheet } from '../components/Sheet';
import { BookIcon, FeatherIcon, MedalIcon } from '../components/icons';
import { Medal } from '../badges/parts';
import { LeagueEmblem } from '../ranks/art';
import { badgeNamed, leagueName, leagueNamed } from '../ranks/names';
import { TreeArt } from '../tree/TreeArt';
import { ProfileTree } from '../tree/ProfileTree';
import { treeNamed } from '../tree/names';

/** One round tile: a link to its page, or a sheet that says more about it. */
interface Highlight {
  key: string;
  label: string;
  art: ReactNode;
  to?: string;
  /** what the sheet holds, for a highlight with no page of its own */
  sheet?: ReactNode;
  /** the badge case: how many badges, on a chip across the ring's foot */
  count?: string;
  /** what a screen reader hears, where the label alone does not say it all */
  spoken?: string;
}

/** A badge or a league, large, with its name and what it means. */
function Shown({ art, title, meaning, action }: { art: ReactNode; title: string; meaning?: string | null; action?: ReactNode }): React.JSX.Element {
  return (
    <div className="hl-sheet">
      <span className="hl-sheet-art">{art}</span>
      <h2 className="hl-sheet-title">{title}</h2>
      {meaning && <p className="hl-sheet-text">{meaning}</p>}
      {action}
    </div>
  );
}

/**
 * The badge case's picture: up to three chosen badges fanned like a hand of cards, the first in front; the medal glyph
 * while none is chosen. Drawn in a square `size` across.
 */
function BadgeFan({ badges, size }: { badges: readonly ShowcaseBadge[]; size: number }): React.JSX.Element {
  const three = badges.slice(0, 3);
  if (three.length === 0) {
    return (
      <span className="hl-fan is-empty" style={{ width: size, height: size }}>
        <MedalIcon size={Math.round(size * 0.45)} />
      </span>
    );
  }
  // Back to front: the first badge is drawn last, over the others; one alone stands larger in the middle.
  const laid: [ShowcaseBadge, 'only' | 'left' | 'right' | 'front', number][] =
    three.length === 1
      ? [[three[0]!, 'only', 0.72]]
      : three.length === 2
        ? [
            [three[1]!, 'right', 0.56],
            [three[0]!, 'left', 0.56],
          ]
        : [
            [three[1]!, 'left', 0.52],
            [three[2]!, 'right', 0.52],
            [three[0]!, 'front', 0.64],
          ];
  return (
    <span className="hl-fan" style={{ width: size, height: size }}>
      {laid.map(([b, slot, k]) => (
        <span key={b.key} className={`hl-fan-medal is-${slot}`}>
          <Medal view={b} size={Math.round(size * k)} shine={false} />
        </span>
      ))}
    </span>
  );
}

/**
 * What a profile shows off, as a row of round tiles under the actions: the badge case, the tree, the league and the
 * favourite poem and story. Each opens its page, or a sheet with its name and meaning. Nothing shows when there is
 * nothing to show.
 */
export function ProfileHighlights({
  tree,
  badges,
  earned,
  league,
  favPoem,
  favStory,
  own = false,
}: {
  tree?: TreeGlimpse | null;
  /** the badges chosen to show */
  badges?: readonly ShowcaseBadge[];
  /** how many badges have been earned; left out where the server does not say */
  earned?: number | null;
  league?: ProfileLeague | null;
  favPoem?: FavoriteRef | null;
  favStory?: FavoriteRef | null;
  own?: boolean;
}): React.JSX.Element | null {
  const t = useT();
  const locale = useLocale();
  const [open, setOpen] = useState<Highlight | null>(null);
  const items: Highlight[] = [];

  // The badge case leads: the chosen badges fanned in one ring with how many have been earned across its foot. Yours
  // opens the badges, where the three on show are chosen; somebody else's lays out the ones they show, with meanings.
  const shown = badges ?? [];
  if (own || shown.length > 0 || (earned ?? 0) > 0) {
    // No chip while there are none: an empty case invites, a nought would only look bare.
    const count = earned ? compactCount(earned, locale) : undefined;
    items.push({
      key: 'badges',
      label: t('profile.badges'),
      spoken: earned != null ? `${t('profile.badges')}: ${earned.toLocaleString(locale)}` : undefined,
      art: <BadgeFan badges={shown} size={62} />,
      count,
      ...(own
        ? { to: '/app/badges' }
        : {
            sheet: (
              <div className="hl-sheet">
                <span className="hl-sheet-art">
                  <BadgeFan badges={shown} size={128} />
                </span>
                <h2 className="hl-sheet-title hl-case-title">
                  {t('profile.badges')}
                  {count && <span className="hl-count is-inline">{count}</span>}
                </h2>
                {shown.length > 0 && (
                  <ul className="hl-case-list">
                    {shown.map((b) => {
                      const named = badgeNamed(t, b.key);
                      return (
                        <li key={b.key}>
                          <Medal view={b} size={48} shine={false} />
                          <div>
                            <p className="hl-case-name">{named.name}</p>
                            {named.meaning && <p className="hl-sheet-text">{named.meaning}</p>}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ),
          }),
    });
  }

  if (tree && hasTreeArt(tree.species)) {
    const named = treeNamed(t, tree.species);
    items.push({
      key: 'tree',
      label: named.name,
      art: <TreeArt species={tree.species} stage={tree.stage} health={tree.health} size={56} />,
      ...(own ? { to: '/app/tree' } : { sheet: <ProfileTree tree={tree} /> }),
    });
  } else if (own && tree === null) {
    items.push({ key: 'tree', label: t('tree.profile.title'), art: <TreeArt species="beru" stage={1} size={56} />, to: '/app/tree' });
  }

  const tier = toLeagueTier(league?.tier ?? null);
  if (tier) {
    const named = leagueNamed(t, tier);
    items.push({
      key: 'league',
      label: leagueName(t, tier),
      art: <LeagueEmblem tier={tier} size={52} title="" />,
      // your own opens the rankings, where your league stands; somebody else's says what it is
      ...(own
        ? { to: '/app/rankings' }
        : { sheet: <Shown art={<LeagueEmblem tier={tier} size={112} title="" />} title={leagueName(t, tier)} meaning={named.meaning} /> }),
    });
  }

  if (favPoem) items.push({ key: 'poem', label: favPoem.title, art: <FeatherIcon size={28} />, to: '/poems' });
  if (favStory) items.push({ key: 'story', label: favStory.title, art: <BookIcon size={28} />, to: '/stories' });

  if (items.length === 0) return null;

  return (
    <>
      <ul className="hl-row">
        {items.map((item) => {
          const inside = (
            <>
              <span className={`hl-ring${item.key === 'badges' ? ' is-case' : ''}`} aria-hidden="true">
                <span className="hl-art">{item.art}</span>
                {item.count && <span className="hl-count">{item.count}</span>}
              </span>
              <span className="hl-label" dir="auto">
                {item.label}
              </span>
            </>
          );
          return (
            <li key={item.key}>
              {item.to ? (
                <Link to={item.to} className="hl" aria-label={item.spoken}>
                  {inside}
                </Link>
              ) : (
                <button type="button" className="hl" aria-haspopup="dialog" aria-label={item.spoken} onClick={() => setOpen(item)}>
                  {inside}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <Sheet open={open !== null} onClose={() => setOpen(null)} label={open?.label ?? ''} className="hl-sheet-panel">
        {open?.sheet}
      </Sheet>
    </>
  );
}
