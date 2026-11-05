import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { kingdomSceneSvg } from '@kurda/shared';
import { useT } from '../i18n/I18nProvider';
import './kingdom.css';

/** Where the village is. */
export const KINGDOM_PATH = '/app/games/kingdom';

/** A village part-way grown, to show on the tile what the game is: not the learner's own, which the page itself shows. */
const SAMPLE = { houses: 3, school: 2, teahouse: 2, spring: 3, market: 1, orchard: 3 } as const;

/**
 * Kurdish Kingdom's tile among Learn's games, for a signed-in learner (the
 * village is theirs, so there is nothing to show anyone else). Shaped like the
 * other game tiles, with a village part-way grown as its picture, and one way
 * in. Kept to itself so it can move into the games' shared list as one entry.
 */
export function KingdomTile(): React.JSX.Element {
  const t = useT();
  const picture = useMemo(() => ({ __html: kingdomSceneSvg({ levels: SAMPLE, framed: true, width: 300, title: t('kingdom.title'), idPrefix: 'kgtile' }) }), [t]);
  return (
    <article className="game-tile game-tile--kingdom">
      <div className="game-tile-visual kingdom-tile-visual" aria-hidden="true" dangerouslySetInnerHTML={picture} />
      <div className="game-tile-text">
        <div className="game-tile-head">
          <h3>{t('kingdom.title')}</h3>
        </div>
        <p>{t('kingdom.card')}</p>
        <Link to={KINGDOM_PATH} className="btn btn-primary btn-sm">
          {t('kingdom.open')}
        </Link>
      </div>
    </article>
  );
}
