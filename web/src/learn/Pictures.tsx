/**
 * The pictures of a "which picture is it?" item (shared art/word-pictures.ts): options are picture ids drawn on cards,
 * named for screen readers by their English name (`pictureName`).
 */
import { useId, useMemo } from 'react';
import { WORD_PICTURES, wordPictureSvg, type WordPictureId } from '@kurda/shared';

/** The size the picture is drawn at; the card scales it to its own width. */
const DRAWN = 112;

export function isWordPicture(id: string): id is WordPictureId {
  return Object.prototype.hasOwnProperty.call(WORD_PICTURES, id);
}

/** What a picture shows, in English, for screen readers and the verdict; an unknown id (a newer server) is named by itself. */
export function pictureName(id: string): string {
  return isWordPicture(id) ? WORD_PICTURES[id].en : id;
}

/**
 * A word's picture drawn twice, light and dusk, with the stylesheet showing the page's one so a theme change needs no
 * redraw. Decorative; the card carries the name. An unknown id shows as its name so it can still be chosen.
 */
export function PictureArt({ id }: { id: string }): React.JSX.Element {
  const base = `wp${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  const art = useMemo(
    () =>
      isWordPicture(id)
        ? {
            light: { __html: wordPictureSvg({ id, size: DRAWN, idPrefix: `${base}l` }) },
            dark: { __html: wordPictureSvg({ id, dark: true, size: DRAWN, idPrefix: `${base}d` }) },
          }
        : null,
    [id, base],
  );
  if (!art)
    return (
      <span className="lesson-picture-art is-word" aria-hidden="true">
        {id}
      </span>
    );
  return (
    <>
      <span className="lesson-picture-art is-light" aria-hidden="true" dangerouslySetInnerHTML={art.light} />
      <span className="lesson-picture-art is-dark" aria-hidden="true" dangerouslySetInnerHTML={art.dark} />
    </>
  );
}
