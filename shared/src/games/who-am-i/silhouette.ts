/**
 * Who Am I?'s stage: the player as a silhouette with the hidden word on a card at their forehead, drawn as Hevalo (never
 * a person's face): his head and shoulders from characters/hevalo.ts flattened to one colour, gradients and clips gone, so
 * it reads as a flat shadow in either theme. `FOREHEAD` is the card's centre as shares of the picture, so each app can lay
 * its own native card with real text over it.
 */
import { characterSvg } from '../../characters/index.js';

/** The card's centre over the silhouette as shares of its width and height, and the card's width as a share of the picture's. */
export const FOREHEAD = { x: 0.5, y: 0.4, width: 0.42 } as const;

/** Hevalo's head and shoulders as a one-colour silhouette, `width` wide (the picture is square). */
export function deerSilhouetteSvg(colour: string, width = 240, title = 'Hevalo'): string {
  // A hex colour or a keyword (currentColor lets a page colour it by theme); anything else is not a colour.
  const safe = /^#[0-9a-fA-F]{3,8}$|^[a-zA-Z]+$/.test(colour) ? colour : '#000000';
  return characterSvg('hevalo', { crop: 'bust', width, title, idPrefix: 'whoami' })
    .replace(/<defs>[\s\S]*?<\/defs>/g, '')
    .replace(/ clip-path="[^"]*"/g, '')
    .replace(/ (fill|stroke)-opacity="[^"]*"/g, '')
    .replace(/ fill="(?!none")[^"]*"/g, ` fill="${safe}"`)
    .replace(/ stroke="(?!none")[^"]*"/g, ` stroke="${safe}"`)
    // Anything that fills by default, without a colour of its own, takes the silhouette's too.
    .replace('<svg ', `<svg fill="${safe}" `);
}
