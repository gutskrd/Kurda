import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { KINGDOM_FRAME, KINGDOM_PLOTS, kingdomSceneSvg } from '@kurda/shared';
import { useT } from '../i18n/I18nProvider';
import './kingdom.css';

/** Where the village is. */
export const KINGDOM_PATH = '/app/games/village';

/** A village part-way grown, to show on the tile what the game is: not the learner's own, which the page itself shows. */
const SAMPLE = { houses: 3, school: 2, teahouse: 2, spring: 3, market: 1, orchard: 3 } as const;

/**
 * The tile's window onto the village: a wide band across its heart, centred
 * on its buildings, so the picture is as tall as every other game's rather
 * than the whole village standing upright. Drawn to fill its box and cut at
 * the box's edges, whatever the tile's width.
 */
const WINDOW = (() => {
  const boxes = Object.values(KINGDOM_PLOTS).map((p) => p.box);
  const y0 = Math.min(...boxes.map((b) => b.y));
  const y1 = Math.max(...boxes.map((b) => b.y + b.h));
  // as wide as the village's frame allows, so several of its buildings are in the band, never past it (nothing is drawn there)
  const w = KINGDOM_FRAME.w;
  const h = Math.round(w * 0.58);
  return { x: KINGDOM_FRAME.x, y: Math.round((y0 + y1) / 2 - h / 2), w, h };
})();

/**
 * The Village's tile among Learn's games, for a signed-in learner (the
 * village is theirs, so there is nothing to show anyone else). Shaped like the
 * other game tiles, with a band across a village part-way grown as its picture, as tall as theirs, and one way
 * in. Kept to itself so it can move into the games' shared list as one entry.
 */
export function KingdomTile(): React.JSX.Element {
  const t = useT();
  const picture = useMemo(
    () => ({
      // only the band is drawn, so the picture carries only what shows in it
      __html: kingdomSceneSvg({ levels: SAMPLE, window: WINDOW, width: 300, title: t('kingdom.title'), idPrefix: 'kgtile' })
        .replace(/ width="[\d.]+" height="[\d.]+"/, '')
        .replace(/viewBox="[^"]*"/, `viewBox="${WINDOW.x} ${WINDOW.y} ${WINDOW.w} ${WINDOW.h}" preserveAspectRatio="xMidYMid slice"`),
    }),
    [t],
  );
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
