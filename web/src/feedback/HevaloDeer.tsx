/**
 * Hevalo the deer, drawn by hand as inline SVG, holding up a wooden board.
 *
 * The deer only ever existed as a picture (the logo, the stickers); this is the
 * same deer in the same colours — sampled from the logo (map3-rating §1): fur,
 * darker antlers, a cream muzzle, freckles, dark eyes, the lilac card — as
 * something that can move. It holds the rating board with its five stars, or a
 * sign with the letters it wants you to be able to type. The phone app draws
 * the same deer from the same coordinates, so it is one character on both.
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

const FUR = '#c08145';
const FUR_DARK = '#b27043';
const FUR_SHADE = '#9c5f37';
const ANTLER = '#785145';
const ANTLER_DARK = '#5b3a2e';
const CREAM = '#f0d4a9';
const CHIN = '#e2b282';
const FRECKLE = '#dda66f';
const EYE = '#4f2e27';
const WHITE = '#fffffe';
const CARD = '#b874f0';
const INNER_EAR = '#eab39a';
const WOOD = '#d6a266';
const WOOD_LIGHT = '#e4b97f';
const WOOD_EDGE = '#8f5d34';
const STAR = '#f5c242';
const STAR_EDGE = '#c98f12';
const BLUSH = '#ec8080';

export type DeerBoard = { kind: 'stars'; stars: number } | { kind: 'letters'; letters: string; lang?: string; dir?: 'ltr' | 'rtl' };

/**
 * The board's angle for a number of stars: tipped down and to one side with
 * none chosen, level at three, held up at a jaunty angle at five.
 */
export function tiltFor(stars: number): number {
  return [-6, -4, -2, 0, 3, 6][clampStars(stars)]!;
}

/**
 * How far the corners of the mouth lift, by stars: a small kind smile with
 * none, a big open one at five. Never below zero — the deer does not frown.
 */
export function smileFor(stars: number): number {
  return [2.5, 3.5, 5, 6.5, 8, 10][clampStars(stars)]!;
}

function clampStars(stars: number): number {
  return Math.max(0, Math.min(5, Math.round(stars)));
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
  const stars = board.kind === 'stars' ? clampStars(board.stars) : 4;
  const s = smileFor(stars);
  const open = stars >= 4;
  return (
    <svg
      className={`deer${cheer ? ' deer-cheer' : ''}${className ? ` ${className}` : ''}`}
      width={size}
      height={(size * 220) / 200}
      viewBox="0 0 200 220"
      aria-hidden="true"
      focusable="false"
      data-stars={board.kind === 'stars' ? stars : undefined}
    >
      {/* the lilac card the logo's deer sits on, as a soft disc that stays put */}
      <circle cx="100" cy="114" r="92" fill={CARD} opacity="0.18" />
      <ellipse cx="100" cy="208" rx="62" ry="7" fill={EYE} opacity="0.14" />

      <g className="deer-body">
        {/* antlers: a main beam, a tine out and one up, each side */}
        <g fill="none" stroke={ANTLER} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M80 54 C76 40 70 30 62 18" />
          <path d="M72 35 C64 35 56 31 50 25" />
          <path d="M66 25 C66 17 68 11 72 7" stroke={ANTLER_DARK} strokeWidth="6" />
          <path d="M120 54 C124 40 130 30 138 18" />
          <path d="M128 35 C136 35 144 31 150 25" />
          <path d="M134 25 C134 17 132 11 128 7" stroke={ANTLER_DARK} strokeWidth="6" />
        </g>

        <g className="deer-ear deer-ear-l">
          <path d="M66 78 C50 81 29 73 21 58 C38 51 58 55 70 70 Z" fill={FUR} />
          <path d="M62 74 C50 74 38 68 31 61 C44 58 56 62 64 70 Z" fill={INNER_EAR} />
        </g>
        <g className="deer-ear deer-ear-r">
          <path d="M134 78 C150 81 171 73 179 58 C162 51 142 55 130 70 Z" fill={FUR} />
          <path d="M138 74 C150 74 162 68 169 61 C156 58 144 62 136 70 Z" fill={INNER_EAR} />
        </g>

        {/* the body under the head, mostly behind the board, with a pale chest */}
        <path d="M62 200 C60 160 72 126 100 122 C128 126 140 160 138 200 Z" fill={FUR_DARK} />
        <path d="M84 200 C84 168 91 140 100 134 C109 140 116 168 116 200 Z" fill={CREAM} opacity="0.9" />

        {/* the head */}
        <ellipse cx="100" cy="86" rx="46" ry="42" fill={FUR} />
        <path
          d="M58 98 C64 121 84 129 100 129 C116 129 136 121 142 98 C130 115 116 121 100 121 C84 121 70 115 58 98 Z"
          fill={FUR_SHADE}
          opacity="0.45"
        />
        {/* the tuft between the antlers */}
        <path d="M90 48 C94 40 100 38 104 42 C106 38 112 40 112 46 C106 46 98 48 90 48 Z" fill={FUR_DARK} />
        {/* freckles, the deer's spots, across the forehead */}
        <g fill={FRECKLE}>
          <circle cx="89" cy="59" r="2.6" />
          <circle cx="100" cy="55" r="3" />
          <circle cx="111" cy="59" r="2.6" />
          <circle cx="94" cy="66" r="1.8" />
          <circle cx="106" cy="66" r="1.8" />
        </g>
        {/* cheeks */}
        <ellipse className="deer-blush" cx="69" cy="101" rx="9" ry="5.5" fill={BLUSH} opacity={0.25 + stars * 0.04} />
        <ellipse className="deer-blush" cx="131" cy="101" rx="9" ry="5.5" fill={BLUSH} opacity={0.25 + stars * 0.04} />

        {/* the eyes: big, dark, with a catchlight each — the part that blinks */}
        <g className="deer-eyes">
          <ellipse cx="82" cy="84" rx="7.5" ry="9.5" fill={EYE} />
          <ellipse cx="118" cy="84" rx="7.5" ry="9.5" fill={EYE} />
          <circle cx="85" cy="80" r="2.8" fill={WHITE} />
          <circle cx="121" cy="80" r="2.8" fill={WHITE} />
          <circle cx="80" cy="88.5" r="1.2" fill={WHITE} opacity="0.8" />
          <circle cx="116" cy="88.5" r="1.2" fill={WHITE} opacity="0.8" />
        </g>

        {/* the muzzle, the chin, the nose */}
        <ellipse cx="100" cy="106" rx="25" ry="18" fill={CREAM} />
        <ellipse cx="100" cy="119" rx="14" ry="5.5" fill={CHIN} opacity="0.85" />
        <path d="M92 96 C92 91 108 91 108 96 C108 101 103 104 100 104 C97 104 92 101 92 96 Z" fill={EYE} />
        <ellipse cx="96.5" cy="95" rx="2.4" ry="1.4" fill={WHITE} opacity="0.7" />
        {/* the smile: wider and lifted with more stars, open at four and five */}
        {open ? (
          <g className="deer-smile">
            <path
              d={`M${92 - s / 3} 108 Q100 ${108 + s * 1.3} ${108 + s / 3} 108 Q100 ${110 + s * 0.4} ${92 - s / 3} 108 Z`}
              fill={EYE}
            />
            <path d={`M${97} ${110 + s * 0.75} Q100 ${109 + s * 0.6} ${103} ${110 + s * 0.75}`} stroke="#d9757a" strokeWidth="2" strokeLinecap="round" fill="none" />
          </g>
        ) : (
          <path
            className="deer-smile"
            d={`M${93 - s / 4} 108 Q100 ${108 + s} ${107 + s / 4} 108`}
            stroke={EYE}
            strokeWidth="2.4"
            strokeLinecap="round"
            fill="none"
          />
        )}

        {/* the board, held up by both forelegs; it tips with the stars */}
        <g className="deer-board" style={{ ['--deer-tilt' as string]: `${tiltFor(stars)}deg` }}>
          <path d="M76 152 C70 147 62 143 55 141" stroke={FUR} strokeWidth="9" strokeLinecap="round" fill="none" />
          <path d="M124 152 C130 147 138 143 145 141" stroke={FUR} strokeWidth="9" strokeLinecap="round" fill="none" />
          <rect x="33" y="140" width="134" height="60" rx="12" fill={WOOD} stroke={WOOD_EDGE} strokeWidth="3" />
          <rect x="39" y="145" width="122" height="6" rx="3" fill={WOOD_LIGHT} opacity="0.7" />
          {/* a little grain */}
          <path d="M46 160 C70 157 96 162 124 158" stroke={WOOD_EDGE} strokeWidth="1.2" opacity="0.3" fill="none" />
          <path d="M70 192 C96 189 126 194 156 190" stroke={WOOD_EDGE} strokeWidth="1.2" opacity="0.3" fill="none" />
          {board.kind === 'stars' ? (
            [0, 1, 2, 3, 4].map((i) => (
              <path
                key={i}
                className={`deer-star${i < stars ? ' is-on' : ''}`}
                d={starPath(56 + i * 22, 172, 9.5)}
                fill={i < stars ? STAR : 'none'}
                stroke={i < stars ? STAR_EDGE : WOOD_EDGE}
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
            ))
          ) : (
            <text
              x="100"
              y="181"
              textAnchor="middle"
              fontSize="24"
              fontWeight="700"
              letterSpacing="2"
              fill={EYE}
              lang={board.lang}
              direction={board.dir}
              className="deer-letters"
            >
              {board.letters}
            </text>
          )}
          {/* the hooves, holding on */}
          <ellipse cx="51" cy="142" rx="8" ry="6.5" fill={ANTLER_DARK} />
          <ellipse cx="149" cy="142" rx="8" ry="6.5" fill={ANTLER_DARK} />
        </g>
      </g>
    </svg>
  );
}

/** A five-pointed star centred on (cx, cy). */
function starPath(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${(cx + rad * Math.cos(a)).toFixed(2)} ${(cy + rad * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join(' L')} Z`;
}
