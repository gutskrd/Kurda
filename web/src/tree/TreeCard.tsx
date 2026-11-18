import { Link } from 'react-router-dom';
import { treeColour } from '@kurda/shared';
import { ChevronIcon } from '../components/icons';
import { useLocale, useT } from '../i18n/I18nProvider';
import { TreeArt, WaterDrop } from './TreeArt';
import { TreePicture } from './TreeScene';
import { healthName, stageName, treeNamed, treeTitle } from './names';
import { useTree } from './useTree';
import './tree.css';

/**
 * The learner's tree on Learn as a slim card linking to it: the tree, its name and stage, and whether there is water
 * to pour, it is thirsty or it is well; before planting, an invitation to plant. It takes no space until loaded, and
 * never shows on a server without trees.
 */
export function TreeCard(): React.JSX.Element | null {
  const t = useT();
  const locale = useLocale();
  const { data } = useTree();
  if (!data) return null;
  const tree = data.tree;
  if (!tree) {
    return (
      <Link to="/app/tree" className="tree-card is-new">
        <span className="tree-card-art">
          <TreeArt species="beru" stage={1} size={56} />
        </span>
        <span className="tree-card-text">
          <span className="tree-card-title">{t('tree.card.plant')}</span>
          <span className="tree-card-sub">{t('tree.card.plantSub')}</span>
        </span>
        <ChevronIcon size={18} className="tree-card-go" />
      </Link>
    );
  }
  const named = treeNamed(t, tree.species);
  const count = new Intl.NumberFormat(locale).format(tree.water);
  // Water to pour comes first, then the tree's health, then that all is well.
  const sub =
    tree.water > 0
      ? tree.health === 'fresh'
        ? t('tree.card.hasWater')
        : t('tree.card.thirstyWater', { health: healthName(t, tree.health) })
      : tree.health === 'fresh'
        ? t('tree.card.well')
        : t('tree.card.thirsty', { health: healthName(t, tree.health) });
  return (
    <Link to="/app/tree" className={`tree-card is-${tree.health}`} style={{ '--tree': treeColour(tree.species) } as React.CSSProperties} aria-label={`${treeTitle(t, tree)}. ${sub}`}>
      <span className="tree-card-art">
        <TreePicture species={tree.species} stage={tree.stage} health={tree.health} size={56} />
      </span>
      <span className="tree-card-text">
        <span className="tree-card-title">
          {named.name}
          <span className="tree-card-stage">{stageName(t, tree.stage)}</span>
        </span>
        <span className="tree-card-sub">{sub}</span>
      </span>
      {tree.water > 0 && (
        <span className="tree-card-water">
          <WaterDrop size={16} />
          <span dir="ltr">{count}</span>
        </span>
      )}
      <ChevronIcon size={18} className="tree-card-go" />
    </Link>
  );
}
