import { Link } from 'react-router-dom';
import { hasTreeArt, treeColour, type TreeGlimpse } from '@kurda/shared';
import { useLocale, useT } from '../i18n/I18nProvider';
import { TreeArt } from './TreeArt';
import { TreePicture } from './TreeScene';
import { healthName, stageName, treeNamed, treeTitle } from './names';
import './tree.css';

/**
 * A tree on a profile: the tree today, its kind, growth, age and harvest, with its health only when unwell. On one's
 * own profile it links to the tree or invites planting one; on others it shows only once they have a tree.
 * `tree` is undefined on a server without trees, and then nothing shows.
 */
export function ProfileTree({ tree, own = false }: { tree: TreeGlimpse | null | undefined; own?: boolean }): React.JSX.Element | null {
  const t = useT();
  const locale = useLocale();
  if (tree === undefined) return null;
  if (tree === null || !hasTreeArt(tree.species)) {
    if (!own || tree !== null) return null;
    return (
      <div className="mkp-showcase-block profile-tree">
        <div className="mkp-showcase-label profile-progress-head">{t('tree.profile.title')}</div>
        <Link to="/app/tree" className="profile-tree-plant">
          <TreeArt species="beru" stage={1} size={64} />
          <span>{t('tree.card.plant')}</span>
        </Link>
      </div>
    );
  }
  const number = (n: number): string => new Intl.NumberFormat(locale).format(n);
  const named = treeNamed(t, tree.species);
  const facts = [stageName(t, tree.stage), t('tree.day', { count: number(tree.age + 1) }), tree.harvests > 0 ? t('tree.harvests', { count: number(tree.harvests) }) : null].filter(Boolean);
  return (
    <div className="mkp-showcase-block profile-tree" style={{ '--tree': treeColour(tree.species) } as React.CSSProperties}>
      <div className="mkp-showcase-label profile-progress-head">
        {t('tree.profile.title')}
        {own && (
          <Link to="/app/tree" className="profile-progress-link">
            {t('tree.title')}
          </Link>
        )}
      </div>
      <div className={`profile-tree-body is-${tree.health}`}>
        <span className="profile-tree-art">
          <TreePicture species={tree.species} stage={tree.stage} health={tree.health} size={132} title={treeTitle(t, tree)} />
        </span>
        <span className="profile-tree-text">
          <span className="profile-tree-name">{named.name}</span>
          {named.meaning && <span className="profile-tree-meaning">{named.meaning}</span>}
          <span className="profile-tree-facts">{facts.join(' · ')}</span>
          {tree.health !== 'fresh' && <span className={`profile-tree-health is-${tree.health}`}>{healthName(t, tree.health)}</span>}
        </span>
      </div>
    </div>
  );
}
