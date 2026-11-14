import { useId, useMemo } from 'react';
import { TREE_FOOT, hasTreeArt, treeSvg, waterDropSvg, wateringCanSvg, type TreeHealth, type TreeSeason, type TreeStage } from '@kurda/shared';
import { useTreeSeason } from './season';
import './tree.css';

/**
 * A tree, drawn (shared `art/trees.ts`), the same picture the phone shows.
 *
 * `alive`, it is drawn in its two layers — the ground, which stands still,
 * and the plant over it, which sways a little about its foot and can be made
 * to start as it is watered (tree.css). Otherwise it is one still picture,
 * which is what a profile and a list want. A kind this build has no drawing
 * for (the server knows one newer than the page) is not drawn at all.
 *
 * It is drawn in a season, standing on its round of grass with its long
 * shadow (shared `art/trees.ts`): the one given, or the learner's own today.
 *
 * `title` names it for a screen reader; leave it empty where the words beside
 * it already say what it is. `fluid`, it fills whatever holds it (which gives
 * it its size, and keeps it square) and `size` is only how finely it is drawn.
 */
export function TreeArt({
  species,
  stage,
  health = 'fresh',
  season,
  size,
  title = '',
  alive = false,
  fluid = false,
  className,
}: {
  species: string;
  stage: TreeStage;
  health?: TreeHealth;
  season?: TreeSeason;
  size: number;
  title?: string;
  alive?: boolean;
  fluid?: boolean;
  className?: string;
}): React.JSX.Element | null {
  const id = `t${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  const today = useTreeSeason();
  const drawnIn = season ?? today;
  const known = hasTreeArt(species);
  const layers = useMemo(() => {
    if (!hasTreeArt(species)) return null;
    const base = { species, stage, health, size, season: drawnIn };
    if (!alive) return { whole: { __html: treeSvg({ ...base, idPrefix: id }) } };
    return { ground: { __html: treeSvg({ ...base, part: 'ground', idPrefix: `${id}g` }) }, plant: { __html: treeSvg({ ...base, part: 'plant', idPrefix: `${id}p` }) } };
  }, [species, stage, health, size, alive, id, drawnIn]);
  if (!known || !layers) return null;
  const named = title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true };
  // a withered tree does not sway: there is nothing on it for the air to move
  const still = health === 'withered' || stage === 0;
  return (
    <span className={`tree-art${fluid ? ' is-fluid' : ''}${className ? ` ${className}` : ''}`} style={fluid ? undefined : { width: size, height: size }} {...named}>
      {'whole' in layers ? (
        <span className="tree-art-layer" dangerouslySetInnerHTML={layers.whole} />
      ) : (
        <>
          <span className="tree-art-layer" dangerouslySetInnerHTML={layers.ground} />
          <span
            className={`tree-art-layer tree-art-plant${still ? '' : ' is-swaying'}`}
            style={{ transformOrigin: `${TREE_FOOT.x * 100}% ${TREE_FOOT.y * 100}%` }}
            dangerouslySetInnerHTML={layers.plant}
          />
        </>
      )}
    </span>
  );
}

/** A drop of water, drawn: beside a count of water, and falling from the can. `fluid`, it fills what holds it. */
export function WaterDrop({ size, fluid = false }: { size: number; fluid?: boolean }): React.JSX.Element {
  const id = `w${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  const markup = useMemo(() => ({ __html: waterDropSvg({ size, idPrefix: id }) }), [size, id]);
  return <span className={`water-drop${fluid ? ' is-fluid' : ''}`} style={fluid ? undefined : { width: size, height: size }} aria-hidden="true" dangerouslySetInnerHTML={markup} />;
}

/** The watering can, drawn. `fluid`, it fills what holds it. */
export function WateringCan({ size, fluid = false }: { size: number; fluid?: boolean }): React.JSX.Element {
  const id = `c${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  const markup = useMemo(() => ({ __html: wateringCanSvg({ size, idPrefix: id }) }), [size, id]);
  return <span className={`watering-can${fluid ? ' is-fluid' : ''}`} style={fluid ? undefined : { width: size, height: size }} aria-hidden="true" dangerouslySetInnerHTML={markup} />;
}
