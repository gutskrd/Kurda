import { useEffect, useId, useMemo, useState } from 'react';
import { treeCloudSvg, treeSceneSvg, treeSkyAt, type TreeHealth, type TreeSky, type TreeStage } from '@kurda/shared';
import './tree.css';

/**
 * Where the tree stands on its own page: the sky of the hour, the mountains
 * under it, clouds going over, and whatever is in the air round the tree
 * itself. All of it is decoration: a screen reader is told about the tree,
 * not about its weather.
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

/** How far a tree's own weather has gone to dust, by how it fares. */
const DRY: Record<TreeHealth, number> = { fresh: 0, thirsty: 0.2, wilting: 0.55, withered: 1 };

/** The clouds that cross the scene: how high, how big, how long each takes, and where in its crossing it starts. */
const CLOUDS = [
  { top: '-4%', width: '36%', seconds: 110, start: 0.34, opacity: 0.95 },
  { top: '13%', width: '22%', seconds: 150, start: 0.72, opacity: 0.8 },
  { top: '5%', width: '27%', seconds: 190, start: 0.06, opacity: 0.7 },
] as const;

/** The sky, the mountains and the clouds. */
export function TreeSkyScene({ sky, health }: { sky: TreeSky; health: TreeHealth }): React.JSX.Element {
  const id = `s${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  const scene = useMemo(() => ({ __html: treeSceneSvg({ sky, dry: DRY[health], size: 480, idPrefix: id }) }), [sky, health, id]);
  const clouds = useMemo(() => CLOUDS.map((_, i) => ({ __html: treeCloudSvg({ sky, size: 200, idPrefix: `${id}c${i}` }) })), [sky, id]);
  return (
    <span className="tree-scene" aria-hidden="true">
      <span className="tree-scene-sky" dangerouslySetInnerHTML={scene} />
      {CLOUDS.map((c, i) => (
        <span
          key={i}
          className="tree-scene-cloud"
          style={{ top: c.top, width: c.width, opacity: c.opacity * (1 - DRY[health] * 0.5), animationDuration: `${c.seconds}s`, animationDelay: `${-c.seconds * c.start}s` }}
          dangerouslySetInnerHTML={clouds[i]}
        />
      ))}
    </span>
  );
}

/** What is in the air round a tree: light in the sun, petals or leaves coming down, or the night tree's fireflies. */
export type TreeAir = 'motes' | 'petals' | 'leaves' | 'fireflies';

/** What is in the air round this tree, if anything: a tree left to wilt has still air round it. */
export function treeAir(species: string, stage: TreeStage, health: TreeHealth): TreeAir | null {
  if (health === 'wilting' || health === 'withered') return null;
  if (stage >= 3 && species === 'sev') return 'fireflies';
  if (stage >= 3 && species === 'behiv') return 'petals';
  if (stage >= 3 && species === 'payiz') return 'leaves';
  return health === 'fresh' ? 'motes' : null;
}

/** Nine of whatever is in the air, each on a course of its own: where it starts, how long it takes, how far it drifts. */
const AIR = Array.from({ length: 9 }, (_, i) => ({
  x: 10 + ((i * 37) % 80),
  y: 22 + ((i * 23) % 46),
  seconds: 7 + (i % 4) * 1.8,
  start: ((i * 0.37) % 1) * (7 + (i % 4) * 1.8),
  drift: ((i % 3) - 1) * 34 + (i % 2 === 0 ? 10 : -10),
  scale: 0.7 + (i % 3) * 0.22,
}));

/** The air round the tree, moving. */
export function TreeAmbient({ air }: { air: TreeAir | null }): React.JSX.Element | null {
  if (!air) return null;
  return (
    <span className={`tree-ambient is-${air}`} aria-hidden="true">
      {AIR.map((a, i) => (
        <i
          key={i}
          style={
            {
              left: `${a.x}%`,
              top: air === 'fireflies' ? `${a.y}%` : undefined,
              animationDuration: `${a.seconds}s`,
              animationDelay: `${-a.start}s`,
              '--drift': `${a.drift}px`,
              '--scale': a.scale,
            } as React.CSSProperties
          }
        />
      ))}
    </span>
  );
}
