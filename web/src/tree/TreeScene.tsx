import { useEffect, useId, useMemo, useState } from 'react';
import {
  TREE_FOOT,
  TREE_STUDIO,
  TREE_STUDIO_PLACE,
  treeSkyAt,
  treeStudioSvg,
  type TreeHealth,
  type TreeSeason,
  type TreeSeasonAir,
  type TreeSky,
  type TreeStage,
} from '@kurda/shared';
import { TreeArt } from './TreeArt';
import { useTreeSeason } from './season';
import './tree.css';

/**
 * Where the tree stands, as in the owner's reference: a soft scene in the
 * colour of the season — blush in spring, sky blue in summer, cream in
 * autumn, deep blue in winter — with the tree on its round of grass on the
 * floor, and the season blowing past it to the left. All of it is
 * decoration: a screen reader is told about the tree, not about its weather.
 */

/** The sky over the learner now, by their own clock; looked at again every few minutes, so a page left open sees the evening come. */
export function useTreeSky(): TreeSky {
  const [sky, setSky] = useState<TreeSky>(() => treeSkyAt(new Date().getHours()));
  useEffect(() => {
    const id = window.setInterval(() => setSky(treeSkyAt(new Date().getHours())), 5 * 60_000);
    return () => window.clearInterval(id);
  }, []);
  return sky;
}

/** How far a tree's own scene has gone to dust, by how it fares. */
const DRY: Record<TreeHealth, number> = { fresh: 0, thirsty: 0.2, wilting: 0.55, withered: 1 };

/** The colour behind the scene while its picture comes in, and above it where a wide page shows more than the square. */
export function studioColour(season: TreeSeason): string {
  return TREE_STUDIO[season].wall[0];
}

/**
 * Where the tree's own square stands in a scene of any shape: as tall as the
 * shared share of the scene's height, with the drawing's foot on the floor
 * where the phone puts it too.
 */
export const TREE_PLACE: React.CSSProperties = {
  height: `${TREE_STUDIO_PLACE.share * 100}%`,
  bottom: `${(1 - TREE_STUDIO_PLACE.foot - TREE_STUDIO_PLACE.share * (1 - TREE_FOOT.y)) * 100}%`,
};

/** The season's wall and floor, laid at the foot of the stage. */
export function TreeStudioScene({ season, health }: { season: TreeSeason; health: TreeHealth }): React.JSX.Element {
  const id = `s${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  const scene = useMemo(() => ({ __html: treeStudioSvg({ season, dry: DRY[health], size: 480, idPrefix: id }) }), [season, health, id]);
  return (
    <span className="tree-scene" aria-hidden="true">
      <span className="tree-scene-wall" dangerouslySetInnerHTML={scene} />
    </span>
  );
}

/**
 * A tree in its season as a still picture: what a profile, a card and the
 * nursery show, where nothing needs to move. It is today's season unless one
 * is given. `title` names the tree; the scene behind it is never read out.
 */
export function TreePicture({
  species,
  stage,
  health = 'fresh',
  season: given,
  size,
  title = '',
}: {
  species: string;
  stage: TreeStage;
  health?: TreeHealth;
  season?: TreeSeason;
  size: number;
  title?: string;
}): React.JSX.Element {
  const id = `p${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  const today = useTreeSeason();
  const season = given ?? today;
  const scene = useMemo(() => ({ __html: treeStudioSvg({ season, dry: DRY[health], size, idPrefix: id }) }), [season, health, size, id]);
  return (
    <span className="tree-picture" style={{ width: size, height: size, background: studioColour(season) }}>
      <span className="tree-picture-wall" aria-hidden="true" dangerouslySetInnerHTML={scene} />
      <span className="tree-picture-tree" style={TREE_PLACE}>
        <TreeArt species={species} stage={stage} health={health} season={season} size={Math.round(size * TREE_STUDIO_PLACE.share)} title={title} fluid />
      </span>
    </span>
  );
}

/**
 * What blows past the tree, each on a course of its own: where it leaves the
 * crown, how long it takes to cross, and how far it falls on the way. The
 * wind is the reference's, always toward the left.
 */
const BLOWN = Array.from({ length: 14 }, (_, i) => ({
  x: 40 + ((i * 29) % 40),
  y: 16 + ((i * 17) % 42),
  seconds: 6.5 + (i % 4) * 1.4,
  start: ((i * 0.41) % 1) * (6.5 + (i % 4) * 1.4),
  drop: 70 + ((i * 53) % 150),
  scale: 0.75 + (i % 3) * 0.2,
}));

/** Snow, across the whole scene: where each flake starts, how slowly it falls, and how far the wind takes it. */
const FLAKES = Array.from({ length: 24 }, (_, i) => ({
  x: 2 + ((i * 41) % 104),
  seconds: 9 + (i % 5) * 1.7,
  start: ((i * 0.53) % 1) * (9 + (i % 5) * 1.7),
  drift: -(30 + ((i * 37) % 70)),
  scale: 0.6 + (i % 4) * 0.22,
}));

/** The season in the air round the tree, moving: petals or leaves blown off to the left, or snow coming down. */
export function TreeSeasonAmbient({ air }: { air: TreeSeasonAir | null }): React.JSX.Element | null {
  if (!air) return null;
  const snow = air.air === 'snow';
  return (
    <span className={`tree-ambient is-${air.air}`} aria-hidden="true">
      {snow
        ? FLAKES.map((f, i) => (
            <i
              key={i}
              style={
                {
                  left: `${f.x}%`,
                  animationDuration: `${f.seconds}s`,
                  animationDelay: `${-f.start}s`,
                  '--drift': `${f.drift}px`,
                  '--scale': f.scale,
                  '--c': air.colours[i % 3],
                } as React.CSSProperties
              }
            />
          ))
        : BLOWN.map((b, i) => (
            <i
              key={i}
              style={
                {
                  left: `${b.x}%`,
                  top: `${b.y}%`,
                  animationDuration: `${b.seconds}s`,
                  animationDelay: `${-b.start}s`,
                  '--drop': `${b.drop}px`,
                  '--scale': b.scale,
                  '--c': air.colours[i % 3],
                } as React.CSSProperties
              }
            />
          ))}
    </span>
  );
}
