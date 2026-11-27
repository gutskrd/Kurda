/**
 * The admission ticket both apps draw on the "Join with a code" card and sheet: a stub, a notched tear line and three
 * code tiles. Drawn left-to-right (a right-to-left page mirrors it); colours are the caller's.
 */

/** The ticket's box, in the units of the paths below. */
export const TICKET_ART_BOX = { width: 58, height: 32 } as const;

/** Where the tear line runs, from the start edge. */
export const TICKET_ART_TEAR = 16;

/** The whole outline: rounded corners of 5, and a notch of 3.5 at each end of the tear line. */
export const TICKET_ART_OUTLINE =
  'M5 0H12.5A3.5 3.5 0 0 0 19.5 0H53A5 5 0 0 1 58 5V27A5 5 0 0 1 53 32H19.5A3.5 3.5 0 0 0 12.5 32H5A5 5 0 0 1 0 27V5A5 5 0 0 1 5 0Z';

/** The stub alone: the start of the outline up to the tear line, half of each notch included. */
export const TICKET_ART_STUB = 'M5 0H12.5A3.5 3.5 0 0 0 16 3.5V28.5A3.5 3.5 0 0 0 12.5 32H5A5 5 0 0 1 0 27V5A5 5 0 0 1 5 0Z';

/** The tear line between the notches, for a dashed stroke. */
export const TICKET_ART_PERFORATION = 'M16 6.5V25.5';

/** The three tiles on the body, centred between the tear line and the far edge. */
export const TICKET_ART_TILES: readonly { x: number; y: number; width: number; height: number; r: number }[] = [20.5, 32.5, 44.5].map((x) => ({
  x,
  y: 10,
  width: 9,
  height: 12,
  r: 2.5,
}));

/**
 * The podium the rankings card wears beside the ticket, on the same canvas (`TICKET_ART_BOX`) so the two cards read as
 * a pair: three blocks standing on one line, the second place left, the first in the middle and tallest, the third
 * right, each with its place on its face, and a star over the first. Drawn left-to-right like the ticket.
 */
export const PODIUM_ART_BLOCKS: readonly { place: 1 | 2 | 3; x: number; y: number; width: number; height: number }[] = [
  { place: 2, x: 0, y: 13, width: 18, height: 19 },
  { place: 1, x: 20, y: 4, width: 18, height: 28 },
  { place: 3, x: 40, y: 19, width: 18, height: 13 },
];

/** Each block's top corners: round, as the ticket's are; the foot stands square on the line. */
export const PODIUM_ART_RADIUS = 3;

/** A block's outline, from its box. */
export function podiumBlockPath(b: { x: number; y: number; width: number; height: number }): string {
  const r = PODIUM_ART_RADIUS;
  const [x, y, w, h] = [b.x, b.y, b.width, b.height];
  return `M${x} ${y + h}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h}Z`;
}

/**
 * The places as single strokes, for a round-capped line about 1.8 wide, in a box `PODIUM_ART_NUMERAL` wide and high
 * from its top left; a block sets its place in the middle of its face.
 */
export const PODIUM_ART_NUMERAL = { width: 4.4, height: 7 } as const;
export const PODIUM_ART_NUMERALS: Record<1 | 2 | 3, string> = {
  1: 'M1.1 1.5L2.7 0V7',
  2: 'M0.4 1.7C0.7 0.5 1.5 0 2.3 0C3.4 0 4.2 0.8 4.2 1.9C4.2 3.1 3.2 3.9 0.4 7H4.3',
  3: 'M0.4 0.9C0.9 0.3 1.6 0 2.3 0C3.4 0 4.1 0.7 4.1 1.7C4.1 2.8 3.2 3.4 1.9 3.4C3.4 3.4 4.3 4.1 4.3 5.2C4.3 6.3 3.4 7 2.2 7C1.4 7 0.7 6.7 0.2 6.1',
};

/** The star over the first place: five points above the tallest block, with a little air under it; it stands on the card, not the paper. */
export const PODIUM_ART_STAR = ((): string => {
  const [cx, cy, outer, inner] = [29, -1.9, 3.6, 1.55];
  const at = (k: number): string => {
    const a = (Math.PI / 5) * k - Math.PI / 2;
    const r = k % 2 === 0 ? outer : inner;
    return `${Math.round((cx + r * Math.cos(a)) * 100) / 100} ${Math.round((cy + r * Math.sin(a)) * 100) / 100}`;
  };
  return `M${Array.from({ length: 10 }, (_, k) => at(k)).join('L')}Z`;
})();
