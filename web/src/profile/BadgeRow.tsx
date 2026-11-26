import { badgeRow, type BadgeRowItem, type ShowcaseBadge, type LeagueTier, type TreeGlimpse } from '@kurda/shared';
import { useLocale, useT } from '../i18n/I18nProvider';
import { MedalIcon } from '../components/icons';
import { Medal } from '../badges/parts';
import { LeagueEmblem } from '../ranks/art';
import { TreeArt } from '../tree/TreeArt';
import './collection.css';

/** The pictures in the row: small, so the row stays lighter than the name, and still easy to tell apart. */
const ICON = 26;

/** One picture of the row, decorative: the pill's own name says what it holds. */
function RowArt({ item }: { item: BadgeRowItem }): React.JSX.Element {
  if (item.kind === 'league') return <LeagueEmblem tier={item.tier} size={ICON} title="" />;
  if (item.kind === 'tree') return <TreeArt species={item.tree.species} stage={item.tree.stage} health={item.tree.health} size={ICON} />;
  return <Medal view={item.badge} size={ICON} shine={false} bare />;
}

/**
 * The badge row beside a profile's handle: the league, the tree and the badges in a quiet row, without their tier
 * marks, and "+N" for the rest as a muted count, the whole row one press that opens the profile's collection. Somebody with nothing to show has none; your own shows a quiet one, since the
 * collection also shows what there is to earn.
 */
export function BadgePill({
  league,
  tree,
  badges,
  own = false,
  title,
  onOpen,
}: {
  league?: LeagueTier | null;
  tree?: TreeGlimpse | null;
  /** earned badges in the order they show (`badgesInOrder`) */
  badges: readonly ShowcaseBadge[];
  own?: boolean;
  /** the collection's name, "Your collection" or "Hamo’s collection", which the pill is named after */
  title: string;
  onOpen: () => void;
}): React.JSX.Element | null {
  const t = useT();
  const locale = useLocale();
  const { shown, more } = badgeRow({ league, tree, badges });
  if (shown.length === 0 && !own) return null;
  const said = `${title}, ${t('profile.badges')}: ${badges.length.toLocaleString(locale)}`;
  return (
    <button type="button" className={`chip bdg-pill${shown.length === 0 ? ' is-quiet' : ''}`} aria-haspopup="dialog" aria-label={said} onClick={onOpen}>
      {shown.length === 0 ? (
        <>
          <MedalIcon size={16} />
          <span>{t('profile.badges')}</span>
        </>
      ) : (
        <span className="bdg-pill-art" aria-hidden="true">
          {shown.map((item) => (
            <span key={item.kind === 'badge' ? item.badge.key : item.kind} className="bdg-pill-icon">
              <RowArt item={item} />
            </span>
          ))}
        </span>
      )}
      {more > 0 && (
        // "+7" reads the same way round in every direction.
        <span className="bdg-pill-more" aria-hidden="true" dir="ltr">
          +{more.toLocaleString(locale)}
        </span>
      )}
    </button>
  );
}
