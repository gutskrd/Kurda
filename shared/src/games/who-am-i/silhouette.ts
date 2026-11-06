/**
 * Who Am I?'s stage: the player is a silhouette with the hidden word on a
 * card held to their forehead, the way the party game is played — drawn as
 * Hevalo the deer, never as a person's face. The silhouette is the art kit's
 * own Hevalo (characters/hevalo.ts), head and shoulders, flattened to one
 * colour: every fill and stroke in that colour, the gradients and clips gone,
 * so it reads as a flat cut-out shadow in either theme.
 *
 * `FOREHEAD` is where the card sits, as a share of the picture's width and
 * height (its centre), so each app can lay its own card — a native element
 * with real text, in either script — over the drawing at the right place.
 */
import { characterSvg } from '../../characters/index.js';

/** The card's centre over the silhouette, as shares of its width and height, and the card's width as a share of the picture's. */
export const FOREHEAD = { x: 0.5, y: 0.4, width: 0.42 } as const;

/** Hevalo's head and shoulders as a one-colour silhouette, `width` wide (the picture is square). */
export function deerSilhouetteSvg(colour: string, width = 240, title = 'Hevalo'): string {
  // a hex colour or a keyword (currentColor lets a page colour it by theme); anything else is not a colour
  const safe = /^#[0-9a-fA-F]{3,8}$|^[a-zA-Z]+$/.test(colour) ? colour : '#000000';
  return characterSvg('hevalo', { crop: 'bust', width, title, idPrefix: 'whoami' })
    .replace(/<defs>[\s\S]*?<\/defs>/g, '')
    .replace(/ clip-path="[^"]*"/g, '')
    .replace(/ (fill|stroke)-opacity="[^"]*"/g, '')
    .replace(/ fill="(?!none")[^"]*"/g, ` fill="${safe}"`)
    .replace(/ stroke="(?!none")[^"]*"/g, ` stroke="${safe}"`)
    // anything that fills by default, with no colour of its own, is the silhouette's too
    .replace('<svg ', `<svg fill="${safe}" `);
}
