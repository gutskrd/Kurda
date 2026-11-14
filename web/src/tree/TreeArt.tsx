import { useId, useMemo } from 'react';
import {
  TREE_FOOT,
  TREE_SWAY,
  TREE_SWING,
  hasTreeArt,
  treePhase,
  treeRig,
  treeSvg,
  treeSwayDeg,
  waterDropSvg,
  wateringCanSvg,
  type TreeHealth,
  type TreeSeason,
  type TreeStage,
} from '@kurda/shared';
import { useTreeSeason } from './season';
import './tree.css';

/**
 * A tree, drawn (shared `art/trees.ts`), the same picture the phone shows.
 *
 * `alive`, it is drawn in its layers — the ground, which stands still; the
 * plant over it, which the page can bring in (`.tree-art-plant`: dropped in
 * as a seed, grown) and start (`.tree-art-start`: watered, shaken), each on
 * an element of its own so that one never cuts another short, and which
 * sways inside those in the breeze; the
 * swing a great tree has, which hangs from the plant and swings a little
 * after it; and the front, which stands still over the plant's foot. The
 * breeze is the shared one (`TREE_SWAY`), started where the shared clock
 * has it, so a tree drawn again carries on swaying where it was. Otherwise
 * it is one still picture, which is what a profile and a list want. A kind
 * this build has no drawing for (the server knows one newer than the page)
 * is not drawn at all.
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
    const rig = treeRig({ species, stage, health });
    const part = (p: 'ground' | 'plant' | 'swing' | 'front', key: string) => ({ __html: treeSvg({ ...base, part: p, idPrefix: `${id}${key}` }) });
    return { ground: part('ground', 'g'), plant: part('plant', 'p'), swing: rig.swing ? part('swing', 's') : null, front: rig.front ? part('front', 'f') : null, hang: rig.swing };
  }, [species, stage, health, size, alive, id, drawnIn]);
  // where the breeze is now, read once as the tree is laid: every tree on the page, and the one drawn after this, sways in step with it
  const phase = useMemo(() => treePhase(Date.now()), []);
  if (!known || !layers) return null;
  const named = title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true };
  // a withered tree does not sway, nor a seed: there is nothing on them for the air to move
  const still = health === 'withered' || treeSwayDeg(stage) === 0;
  const foot = `${TREE_FOOT.x * 100}% ${TREE_FOOT.y * 100}%`;
  const breeze = { transformOrigin: foot, animationDuration: `${TREE_SWAY.ms}ms`, animationDelay: `${Math.round(-phase * TREE_SWAY.ms)}ms`, '--sway': `${treeSwayDeg(stage)}deg` } as React.CSSProperties;
  // the swing leans about the line its ropes are tied on, the same breeze a little later
  const swinging = (hang: { x: number; y: number }): React.CSSProperties =>
    ({
      transformOrigin: `${hang.x * 100}% ${hang.y * 100}%`,
      animationDuration: `${TREE_SWING.ms}ms`,
      animationDelay: `${Math.round(-((((phase - TREE_SWING.lag) % 1) + 1) % 1) * TREE_SWING.ms)}ms`,
      '--swing': `${TREE_SWING.deg}deg`,
    }) as React.CSSProperties;
  return (
    <span className={`tree-art${fluid ? ' is-fluid' : ''}${className ? ` ${className}` : ''}`} style={fluid ? undefined : { width: size, height: size }} {...named}>
      {'whole' in layers ? (
        <span className="tree-art-layer" dangerouslySetInnerHTML={layers.whole} />
      ) : (
        <>
          <span className="tree-art-layer tree-art-ground" dangerouslySetInnerHTML={layers.ground} />
          <span className="tree-art-layer tree-art-plant" style={{ transformOrigin: foot }}>
            <span className="tree-art-layer tree-art-start" style={{ transformOrigin: foot }}>
              <span className={`tree-art-layer tree-art-sway${still ? '' : ' is-swaying'}`} style={breeze}>
                <span className="tree-art-layer" dangerouslySetInnerHTML={layers.plant} />
                {layers.swing && layers.hang ? <span className="tree-art-layer tree-art-swing" style={swinging(layers.hang)} dangerouslySetInnerHTML={layers.swing} /> : null}
              </span>
            </span>
          </span>
          {layers.front ? <span className="tree-art-layer tree-art-front" dangerouslySetInnerHTML={layers.front} /> : null}
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
