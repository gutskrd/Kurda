import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { hasTreeArt, toLeagueTier, type ProfileLeague, type ShowcaseBadge, type TreeGlimpse } from '@kurda/shared';
import type { FavoriteRef } from '../lib/types';
import { useT } from '../i18n/I18nProvider';
import { Sheet } from '../components/Sheet';
import { BookIcon, FeatherIcon, PlusIcon } from '../components/icons';
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
 * What a profile shows off, as a row of round tiles under the actions: the tree, the league, the chosen badges and the
 * favourite poem and story. Each opens its page, or a sheet with its name and meaning; your own row starts with the way
 * to choose badges. Nothing shows when there is nothing to show.
 */
export function ProfileHighlights({
  tree,
  badges,
  league,
  favPoem,
  favStory,
  own = false,
}: {
  tree?: TreeGlimpse | null;
  badges?: readonly ShowcaseBadge[];
  league?: ProfileLeague | null;
  favPoem?: FavoriteRef | null;
  favStory?: FavoriteRef | null;
  own?: boolean;
}): React.JSX.Element | null {
  const t = useT();
  const [open, setOpen] = useState<Highlight | null>(null);
  const items: Highlight[] = [];

  if (own) items.push({ key: 'choose', label: t('profile.badges'), art: <PlusIcon size={28} />, to: '/app/badges' });

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

  for (const b of badges ?? []) {
    const named = badgeNamed(t, b.key);
    items.push({
      key: `badge:${b.key}`,
      label: named.name,
      art: <Medal view={b} size={56} shine={false} />,
      sheet: (
        <Shown
          art={<Medal view={b} size={128} />}
          title={named.name}
          meaning={named.meaning}
          action={
            own ? (
              <Link to="/app/badges" className="btn btn-secondary btn-sm hl-sheet-action">
                {t('profile.allBadges')}
              </Link>
            ) : undefined
          }
        />
      ),
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
              <span className={`hl-ring${item.key === 'choose' ? ' is-add' : ''}`} aria-hidden="true">
                <span className="hl-art">{item.art}</span>
              </span>
              <span className="hl-label" dir="auto">
                {item.label}
              </span>
            </>
          );
          return (
            <li key={item.key}>
              {item.to ? (
                <Link to={item.to} className="hl">
                  {inside}
                </Link>
              ) : (
                <button type="button" className="hl" aria-haspopup="dialog" onClick={() => setOpen(item)}>
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
