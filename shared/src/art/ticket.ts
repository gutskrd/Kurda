/**
 * The ticket both apps draw on their "Join with a code" card and sheet: one
 * outline, so the website and the phone hand over the same ticket.
 *
 * It is a plain admission ticket lying flat: a stub on the side where reading
 * starts, a tear line with a notch bitten from the top and the bottom edge
 * where it meets them (the same place the lobby's code ticket has its
 * notches), and three tiles on the body where a code goes. The geometry is
 * drawn for left-to-right; a right-to-left page mirrors the whole picture.
 * Colours are the caller's, so each app paints it from its own palette.
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
