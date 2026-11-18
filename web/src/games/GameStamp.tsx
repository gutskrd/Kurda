import { useMemo } from 'react';
import { gameEmblemHue, stampBox, stampLook, stampShapeFor, stampSize, stampSvg, type GameEmblem, type StampLook } from '@kurda/shared';
import { GameArt } from './GameArt';
import './game-stamp.css';

/**
 * A game as a postage stamp, as on the phone (mobile/src/games/GameStamp.tsx), from the shared outline (`stamp.ts`):
 * pale perforated paper in the game's hue with a soft glow (full when featured), the cover, the Kurdish name in the
 * hue's deep shade and its meaning where it differs. Colours come from the shared `stampLook`.
 *
 * The paper is drawn twice, with the day's long glow and the night's short halo, and the stylesheet shows one; both use
 * variables (game-stamp.css), so a scheme change repaints without redrawing. By day the variables are the hue's steps
 * (`.hue-*`, styles/tokens.css); by night the paper and ink are the day's, passed in here. The glow extends past the
 * box and takes no room, so callers leave space between stamps. It is a picture, not a control: the caller overlays the
 * pressable element and its label. Every stamp of one width has the same height (`stampSize`), so rows stay level.
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
  // The sizes for the stylesheet (width, height and the margin inside the perforations), and the night colours.
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
      {/* Decorative, drawn from the shared outline and colour variables; the name printed on it identifies the game. */}
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

