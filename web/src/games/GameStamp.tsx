import { useMemo } from 'react';
import { gameEmblemHue, stampBox, stampLook, stampShapeFor, stampSize, stampSvg, type GameEmblem, type StampLook } from '@kurda/shared';
import { GameArt } from './GameArt';
import './game-stamp.css';

/**
 * A game as a stamp: Hevalo's letters travel by bird, so the thing a game is
 * handed over as is a postage stamp. The phone app draws the same one
 * (mobile/src/games/GameStamp.tsx), from the same outline and the same sizes.
 *
 * The stamp is the shared outline (shared art `stamp.ts`): pale paper in the
 * game's own hue, perforated on all four sides, giving off a soft light in
 * that hue — full for the stamp put forward today, quieter for a stamp among
 * others. By night it is still light paper, a step quieter, with a short
 * faint halo where the day's long glow would be a fog on the dark page. On
 * it, the game's cover with its corners rounded, its Kurdish name as a
 * heading in the hue's deep shade, and under the name what it means in the
 * reader's language, where the two differ. What it is printed in, by day and
 * by night, is the shared stamp's (`stampLook`), which the phone app reads
 * too.
 *
 * Its paper is drawn twice, once with the day's long light and once with the
 * night's short one, and the stylesheet shows the one for the scheme that is
 * on; both are filled and stroked with variables (game-stamp.css), so a
 * change of scheme repaints the stamp without anything being drawn again. By
 * day the variables are the hue's own steps (the `.hue-*` classes of
 * styles/tokens.css). By night the paper and its ink are the day's, which no
 * night step holds, so they are handed to the stylesheet here. The light
 * reaches past the stamp's own box on every side, so each paper is laid
 * outside it by its own reach and takes no room: whoever lays stamps out
 * leaves the air between them.
 *
 * It is a picture with a heading, not a control: whoever shows it lays over
 * it the thing that is pressed, and says to a screen reader what pressing
 * does. Every stamp of one width is the same height, whatever its name's
 * length, so a row of them stands level: its sizes are the shared stamp's
 * (`stampSize`).
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
  const hue = gameEmblemHue(game);
  // the one put forward shines; a page of them glows quietly, or the page is all light and no stamps
  const day = stampLook('light', hue, large);
  const night = stampLook('dark', hue, large);
  // no line round it: the light is what shows where the paper ends
  const papers = useMemo(() => {
    const draw = (scheme: 'light' | 'dark'): { __html: string } => {
      const look = stampLook(scheme, hue, large);
      return { __html: stampSvg({ width, height, paper: 'var(--game-stamp-paper)', glow: 'var(--game-stamp-glow)', strength: look.strength, reach: look.reach, ...stampShapeFor(width) }) };
    };
    return { day: draw('light'), night: draw('dark') };
  }, [width, height, hue, large]);
  // its sizes, for the stylesheet to lay it out by: how wide and how tall, and the margin inside the perforations; and what it is printed in by night
  const style = {
    '--game-stamp-width': `${width}px`,
    '--game-stamp-height': `${height}px`,
    '--game-stamp-pad': `${pad}px`,
    '--game-stamp-night-paper': night.paper,
    '--game-stamp-night-ink': night.ink,
  } as React.CSSProperties;
  // how far each paper is laid outside the stamp: the reach of its own light
  const reach = (look: StampLook): React.CSSProperties => ({ '--game-stamp-reach': `${stampBox(width, height, look.strength, look.reach).inset}px` }) as React.CSSProperties;
  return (
    <div className={`game-stamp hue-${hue}${large ? ' game-stamp--large' : ''}`} style={style}>
      {/* decoration, drawn from the shared outline and two colour names and nothing anybody typed; the name on it says which game this is */}
      <span className="game-stamp-paper game-stamp-paper--day" aria-hidden="true" style={reach(day)} dangerouslySetInnerHTML={papers.day} />
      <span className="game-stamp-paper game-stamp-paper--night" aria-hidden="true" style={reach(night)} dangerouslySetInnerHTML={papers.night} />
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

