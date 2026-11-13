import { useEffect, useId, useMemo, useState } from 'react';
import { LETTER_BIRD_FEET, LETTER_SILL, letterBirdSvg, letterWindowSvg, type SongbirdPose } from '@kurda/shared';
import { useTreeSky } from '../tree/TreeScene';

/**
 * Your window on the letters page (shared/src/art/letters.ts): the hour's sky
 * through it and, on the sill, a bird.
 *
 * What the bird does is the page's news, so it is acted rather than written:
 *   - `home`: your bird on the sill, turning its head now and then;
 *   - `leaving`: your bird takes the letter in its beak and flies off, up and
 *     out of the window;
 *   - `away`: the sill is empty — your bird is out;
 *   - `arriving`: their bird flies in with their letter and lands.
 * Only transform and opacity move, and a reader who asked for less motion
 * sees each state as it ends. The whole picture is decoration: the page says
 * in words what the bird is doing.
 */
export type WindowScene = { kind: 'home'; bird: number } | { kind: 'leaving'; bird: number } | { kind: 'away' } | { kind: 'arriving'; bird: number };

/** Where a bird's own square goes so that its feet stand on the sill, as shares of the window. */
const PLACE = {
  left: `${(LETTER_SILL.x / 120 - (LETTER_SILL.birdShare * LETTER_BIRD_FEET.x) / 120) * 100}%`,
  top: `${(LETTER_SILL.y / 120 - (LETTER_SILL.birdShare * LETTER_BIRD_FEET.y) / 120) * 100}%`,
  width: `${LETTER_SILL.birdShare * 100}%`,
};

function Bird({ bird, pose, facingLeft = false, className }: { bird: number; pose: SongbirdPose; facingLeft?: boolean; className: string }): React.JSX.Element {
  const id = `b${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  const svg = useMemo(() => ({ __html: letterBirdSvg({ bird, pose, facingLeft, size: 120, idPrefix: id }) }), [bird, pose, facingLeft, id]);
  return <span className={`lw-bird ${className}`} style={PLACE} dangerouslySetInnerHTML={svg} />;
}

export function LetterWindow({ scene, onDone }: { scene: WindowScene; onDone?: () => void }): React.JSX.Element {
  const sky = useTreeSky();
  const id = `w${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  const window_ = useMemo(() => ({ __html: letterWindowSvg({ sky, size: 480, idPrefix: id }) }), [sky, id]);
  // an arriving bird lands carrying its letter, and then stands on the sill like any other
  const [landed, setLanded] = useState(false);
  useEffect(() => setLanded(false), [scene]);

  return (
    <div className="lw" aria-hidden="true">
      <span className="lw-window" dangerouslySetInnerHTML={window_} />
      {scene.kind === 'home' && <Bird bird={scene.bird} pose="perched" className="lw-bird--home" />}
      {scene.kind === 'leaving' && (
        <span className="lw-flight lw-flight--out" onAnimationEnd={onDone}>
          <Bird bird={scene.bird} pose="carrying" className="" />
        </span>
      )}
      {scene.kind === 'arriving' &&
        (landed ? (
          <Bird bird={scene.bird} pose="perched" facingLeft className="lw-bird--landed" />
        ) : (
          <span
            className="lw-flight lw-flight--in"
            onAnimationEnd={() => {
              setLanded(true);
              onDone?.();
            }}
          >
            <Bird bird={scene.bird} pose="carrying" facingLeft className="" />
          </span>
        ))}
    </div>
  );
}
