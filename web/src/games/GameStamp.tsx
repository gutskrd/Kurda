import { useMemo } from 'react';
import { STAMP_SHELF_GLOW, gameEmblemHue, stampBox, stampShapeFor, stampSize, stampSvg, type GameEmblem } from '@kurda/shared';
import { GameArt } from './GameArt';
import './game-stamp.css';

/**
 * A game as a stamp: Hevalo's letters travel by bird, so the thing a game is
 * handed over as is a postage stamp. The phone app draws the same one
 * (mobile/src/games/GameStamp.tsx), from the same outline and the same sizes.
 *
 * The stamp is the shared outline (shared art `stamp.ts`): paper in the
 * game's own hue, perforated on all four sides, giving off a soft light in
 * that hue — full for the stamp put forward today, quieter for a stamp among
 * others, and quieter again by night, where a saturated glow on a dark page
 * glares. On it, the game's cover with its corners rounded, its Kurdish name
 * as a heading in the hue's deep shade, and under the name what it means in
 * the reader's language, where the two differ.
 *
 * The paper and the light are drawn in the hue's own variables (the `.hue-*`
 * classes of styles/tokens.css, and game-stamp.css for which step is the
 * paper), not in colours worked out here: a change of scheme repaints the
 * stamp without anything being drawn again. The light reaches past the
 * stamp's own box on every side, so the paper is laid outside it and takes no
 * room: whoever lays stamps out leaves the air between them.
 *
 * It is a picture with a heading, not a control: whoever shows it lays over
 * it the thing that is pressed, and says to a screen reader what pressing
 * does. Every stamp of one width is the same height, whatever its name's
 * length, so a row of them stands level: its sizes and how much of its light
 * a stamp among others gives off are the shared stamp's (`stampSize`,
 * `STAMP_SHELF_GLOW`); how much is left by night is the stylesheet's to say,
 * and is held to the shared figure by this component's tests.
 */
export function GameStamp({
  game,
  name,
  meaning,
  width,
  large = false,
  moving = false,
  after = 0,
  again = 0,
  coverRef,
}: {
  game: GameEmblem;
  name: string;
  /** what the name means, where the interface is not Kurdish; left out when it is the name again */
  meaning?: string | null;
  width: number;
  /** the stamp put forward today: larger words, and room for them */
  large?: boolean;
  /** how the cover acts (games/GameArt.tsx): for as long as it is seen, or through once */
  moving?: boolean | 'once';
  after?: number;
  again?: number;
  /** the cover's own box, for whoever carries it to the game's page (lib/viewTransition.tsx) */
  coverRef?: React.Ref<HTMLSpanElement>;
}): React.JSX.Element {
  const { height, pad, art } = stampSize(width, large);
  // the one put forward shines; a page of them glows quietly, or the page is all light and no stamps
  const strength = large ? 1 : STAMP_SHELF_GLOW;
  // no line round it: the light is what shows where the paper ends
  const paper = useMemo(
    () => ({ __html: stampSvg({ width, height, paper: 'var(--game-stamp-paper)', glow: 'var(--game-stamp-glow)', strength, ...stampShapeFor(width) }) }),
    [width, height, strength],
  );
  // its sizes, for the stylesheet to lay it out by: how wide and how tall, the margin inside the perforations, how far the light reaches
  const sizes = {
    '--game-stamp-width': `${width}px`,
    '--game-stamp-height': `${height}px`,
    '--game-stamp-pad': `${pad}px`,
    '--game-stamp-reach': `${stampBox(width, height, strength).inset}px`,
  } as React.CSSProperties;
  return (
    <div className={`game-stamp hue-${gameEmblemHue(game)}${large ? ' game-stamp--large' : ''}`} style={sizes}>
      {/* decoration, drawn from the shared outline and two colour names and nothing anybody typed; the name on it says which game this is */}
      <span className="game-stamp-paper" aria-hidden="true" dangerouslySetInnerHTML={paper} />
      <div className="game-stamp-face">
        <GameArt game={game} size={art} moving={moving} after={after} again={again} ref={coverRef} />
        <div className="game-stamp-words">
          {/* each in its own direction: a Kurmancî name on an Arabic page keeps its question mark at its end */}
          <h3 className="game-stamp-name" dir="auto">
            {name}
          </h3>
          {meaning ? (
            <p className="game-stamp-meaning" dir="auto">
              {meaning}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

