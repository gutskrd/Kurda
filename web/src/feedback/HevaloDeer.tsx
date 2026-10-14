import { useId } from 'react';
import {
  DEER_BOARD_TEXT,
  DEER_INK,
  DEER_VIEW,
  deerAntlers,
  deerBoard,
  deerCard,
  deerEarLeft,
  deerEarRight,
  deerEyes,
  deerFace,
  deerSmileFor,
  deerTiltFor,
} from '@kurda/shared';

/**
 * Hevalo the deer — the logo's deer — holding up a wooden board.
 *
 * The drawing is shared with the phone (`@kurda/shared` deer.ts), so it is one
 * character on both: the logo's chunky antlers, leaf ears, big white eyes and
 * soft nose. It holds the rating board with its five stars, or a sign with the
 * letters it wants you to be able to type.
 *
 * Alive but calm: it bobs a little, blinks, and now and then twitches an ear
 * (CSS keyframes in feedback.css). As stars are chosen the board tips up and
 * the smile grows — it never frowns, because a low rating is somebody being
 * kind enough to tell us, and a sad mascot would make them feel bad for it
 * (house guidance: no guilt-tripping mascot). With reduced motion it stands
 * still, and the board and smile simply change.
 *
 * Decorative: the words around it say everything it does, so it is hidden from
 * assistive technology.
 */

export type DeerBoard = { kind: 'stars'; stars: number } | { kind: 'letters'; letters: string; lang?: string; dir?: 'ltr' | 'rtl' };

/**
 * The board's angle for a number of stars: tipped down and to one side with
 * none chosen, level at three, held up at a jaunty angle at five.
 */
export const tiltFor = deerTiltFor;

/**
 * How far the corners of the mouth lift, by stars: a small kind smile with
 * none, a big open one at five. Never below zero — the deer does not frown.
 */
export const smileFor = deerSmileFor;

/** A group drawn from the shared deer's markup. */
function Layer({ markup, className, style }: { markup: string; className?: string; style?: React.CSSProperties }): React.JSX.Element {
  return <g className={className} style={style} dangerouslySetInnerHTML={{ __html: markup }} />;
}

export function HevaloDeer({
  size = 160,
  board,
  cheer = false,
  className,
}: {
  /** width in CSS pixels; the drawing is a little taller than it is wide */
  size?: number;
  board: DeerBoard;
  /** a little hop of joy (the keyboard "try it" box, when every letter is in) */
  cheer?: boolean;
  className?: string;
}): React.JSX.Element {
  const stars = board.kind === 'stars' ? Math.max(0, Math.min(5, Math.round(board.stars))) : 4;
  const id = `deer-${useId().replace(/[^\w-]/g, '')}`;
  return (
    <svg
      className={`deer${cheer ? ' deer-cheer' : ''}${className ? ` ${className}` : ''}`}
      width={size}
      height={(size * DEER_VIEW.h) / DEER_VIEW.w}
      viewBox={`0 0 ${DEER_VIEW.w} ${DEER_VIEW.h}`}
      aria-hidden="true"
      focusable="false"
      data-stars={board.kind === 'stars' ? stars : undefined}
    >
      {/* the lilac card the logo's deer sits on, as a soft disc that stays put */}
      <Layer markup={deerCard()} />
      <g className="deer-body">
        <Layer markup={deerAntlers(id)} />
        <Layer className="deer-ear deer-ear-l" markup={deerEarLeft(id)} />
        <Layer className="deer-ear deer-ear-r" markup={deerEarRight(id)} />
        <Layer markup={deerFace(id, stars)} />
        <Layer className="deer-eyes" markup={deerEyes(id)} />
        {/* the board, held up by both forelegs; it tips with the stars */}
        <g className="deer-board" style={{ ['--deer-tilt' as string]: `${tiltFor(stars)}deg` }}>
          <Layer markup={deerBoard(id, board.kind === 'stars' ? { kind: 'stars', stars } : { kind: 'letters' })} />
          {board.kind === 'letters' && (
            <text
              x={DEER_VIEW.w / 2}
              y={DEER_BOARD_TEXT.baseline}
              textAnchor="middle"
              fontSize="24"
              fontWeight="700"
              letterSpacing="2"
              fill={DEER_INK}
              lang={board.lang}
              direction={board.dir}
              className="deer-letters"
            >
              {board.letters}
            </text>
          )}
        </g>
      </g>
    </svg>
  );
}
