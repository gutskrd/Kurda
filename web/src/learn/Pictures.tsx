/**
 * The pictures of a "which picture is it?" item (shared art/word-pictures.ts):
 * its options are picture ids, each drawn on a card in place of words. Only
 * the picture says what an option is, so a screen reader is given its English
 * name (`pictureName`) instead.
 */
import { useId, useMemo } from 'react';
import { WORD_PICTURES, wordPictureSvg, type WordPictureId } from '@kurda/shared';

/** The size the picture is drawn at; the card scales it to its own width. */
const DRAWN = 112;

export function isWordPicture(id: string): id is WordPictureId {
  return Object.prototype.hasOwnProperty.call(WORD_PICTURES, id);
}

/**
 * What a picture shows, in English: its name for a screen reader and the
 * right answer the verdict names. An id the catalogue does not know (a newer
 * server than this page) is named by itself.
 */
export function pictureName(id: string): string {
  return isWordPicture(id) ? WORD_PICTURES[id].en : id;
}

/**
 * A word's picture, drawn twice — on the light paper and at dusk — with the
 * stylesheet showing the one the page is in, so a change of theme needs no
 * redraw. Decorative: the card it is on carries the name. An id the
 * catalogue does not know is shown as its name, so the option can still be
 * chosen.
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
