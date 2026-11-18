import { useId } from 'react';
import { DEER_BOARD_TEXT, DEER_INK, DEER_PICTURE, DEER_VIEW, deerBoard, deerCard, deerTiltFor } from '@kurda/shared';

/** The mascot itself, cut free of the icon's card (see `@kurda/shared` deer.ts). */
const MASCOT = '/mascot-deer.png';

/**
 * Hevalo the deer from the app icon, holding up a board drawn over the picture (`@kurda/shared` deer.ts), as on the
 * phone: the five rating stars, or a sign with letters. It bobs gently (feedback.css) and the board tips up as stars
 * are chosen; under Reduce Motion it stands still. Decorative, so hidden from assistive technology.
 */

type DeerBoard = { kind: 'stars'; stars: number } | { kind: 'letters'; letters: string; lang?: string; dir?: 'ltr' | 'rtl' };

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
  /** Width in CSS pixels; the drawing is a little taller than it is wide. */
  size?: number;
  board: DeerBoard;
  /** A small hop, as when every letter is in the keyboard guide's "try it" box. */
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
      {/* The lilac card the logo's deer sits on, as a soft disc that stays put. */}
      <Layer markup={deerCard()} />
      <g className="deer-body">
        <image className="deer-mascot" href={MASCOT} x={DEER_PICTURE.x} y={DEER_PICTURE.y} width={DEER_PICTURE.w} height={DEER_PICTURE.h} />
        {/* The board, held up by both forelegs, tips with the stars. */}
        <g className="deer-board" style={{ ['--deer-tilt' as string]: `${deerTiltFor(stars)}deg` }}>
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
