import { useId, useMemo } from 'react';
import {
  TREE_FOOT,
  TREE_RUSTLE,
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
 * A tree drawn from shared `art/trees.ts`, as on the phone, in the given season or today's. With `alive` it is drawn
 * in layers: the still ground, the plant (with `.tree-art-plant` and `.tree-art-start` wrappers for the page's own
 * animations, so they never cut each other short) swaying in the shared `TREE_SWAY` breeze from the shared clock, a
 * grown tree's crown stirring on it, a great tree's swing hanging from it, and the still front. Otherwise it is one
 * still picture. A kind this build has no drawing for is not drawn.
 *
 * `title` names it for screen readers; leave it empty when nearby text does. With `fluid` it fills its square holder
 * and `size` only sets the drawing's resolution.
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
    const part = (p: 'ground' | 'plant' | 'crown' | 'swing' | 'front', key: string) => ({ __html: treeSvg({ ...base, part: p, idPrefix: `${id}${key}` }) });
    return {
      ground: part('ground', 'g'),
      plant: part('plant', 'p'),
      crown: rig.crown ? part('crown', 'c') : null,
      stir: rig.crown,
      swing: rig.swing ? part('swing', 's') : null,
      front: rig.front ? part('front', 'f') : null,
      hang: rig.swing,
    };
  }, [species, stage, health, size, alive, id, drawnIn]);
  // The breeze's phase, read once, so every tree on the page sways in step.
  const phase = useMemo(() => treePhase(Date.now()), []);
  if (!known || !layers) return null;
  const named = title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true };
  // A withered tree or a seed does not sway.
  const still = health === 'withered' || treeSwayDeg(stage) === 0;
  const foot = `${TREE_FOOT.x * 100}% ${TREE_FOOT.y * 100}%`;
  const breeze = { transformOrigin: foot, animationDuration: `${TREE_SWAY.ms}ms`, animationDelay: `${Math.round(-phase * TREE_SWAY.ms)}ms`, '--sway': `${treeSwayDeg(stage)}deg` } as React.CSSProperties;
  // The crown stirs about its own foot, twice to each breeze and a little after it.
  const stirring = (stir: { x: number; y: number }): React.CSSProperties =>
    ({
      transformOrigin: `${stir.x * 100}% ${stir.y * 100}%`,
      animationDuration: `${TREE_RUSTLE.ms}ms`,
      animationDelay: `${Math.round(-((((phase * 2 - TREE_RUSTLE.lag) % 1) + 1) % 1) * TREE_RUSTLE.ms)}ms`,
      '--rustle': `${TREE_RUSTLE.deg}deg`,
    }) as React.CSSProperties;
  // The swing leans about the line its ropes are tied to, in the same breeze a little later.
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
                {layers.crown && layers.stir ? <span className="tree-art-layer tree-art-crown" style={stirring(layers.stir)} dangerouslySetInnerHTML={layers.crown} /> : null}
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

/** A drop of water, beside a water count or falling from the can. With `fluid` it fills its holder. */
export function WaterDrop({ size, fluid = false }: { size: number; fluid?: boolean }): React.JSX.Element {
  const id = `w${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  const markup = useMemo(() => ({ __html: waterDropSvg({ size, idPrefix: id }) }), [size, id]);
  return <span className={`water-drop${fluid ? ' is-fluid' : ''}`} style={fluid ? undefined : { width: size, height: size }} aria-hidden="true" dangerouslySetInnerHTML={markup} />;
}

/** The watering can. With `fluid` it fills its holder. */
export function WateringCan({ size, fluid = false }: { size: number; fluid?: boolean }): React.JSX.Element {
  const id = `c${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  const markup = useMemo(() => ({ __html: wateringCanSvg({ size, idPrefix: id }) }), [size, id]);
  return <span className={`watering-can${fluid ? ' is-fluid' : ''}`} style={fluid ? undefined : { width: size, height: size }} aria-hidden="true" dangerouslySetInnerHTML={markup} />;
}
