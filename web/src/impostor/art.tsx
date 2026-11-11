import { useId, useMemo } from 'react';
import { impostorCategorySvg, impostorEmblemSvg, impostorWaySvg, type ImpostorEmblem, type ImpostorWay } from '@kurda/shared';

/**
 * Kurdish Impostor's pictures on the website: a category's, a way to play's
 * and the game's own emblem, drawn from the shared art
 * (shared/src/art/impostor.ts) so the phone shows the same ones.
 *
 * Each is decoration beside its name, so it is hidden from a screen reader.
 * A page can show the same picture twice (a category on its tile and again on
 * a card), and a drawing's clip paths are found by id, so every one drawn here
 * gets ids of its own.
 */
function useArtId(): string {
  return `ia${useId().replace(/[^A-Za-z0-9]/g, '')}`;
}

/** The picture of a category by its slug; of "any category" for null. */
export function CategoryArt({ category, size = 56 }: { category: string | null; size?: number }): React.JSX.Element {
  const idPrefix = useArtId();
  const markup = useMemo(() => ({ __html: impostorCategorySvg({ category, size, idPrefix }) }), [category, size, idPrefix]);
  return <span className="imp-art" aria-hidden="true" dangerouslySetInnerHTML={markup} />;
}

/** The picture of one way to play. */
export function WayArt({ way, size = 72 }: { way: ImpostorWay; size?: number }): React.JSX.Element {
  const idPrefix = useArtId();
  const markup = useMemo(() => ({ __html: impostorWaySvg({ way, size, idPrefix }) }), [way, size, idPrefix]);
  return <span className="imp-art" aria-hidden="true" dangerouslySetInnerHTML={markup} />;
}

/** The game's emblem: the hand of cards for its start, the mask for a card's back. */
export function EmblemArt({ emblem, size = 120 }: { emblem: ImpostorEmblem; size?: number }): React.JSX.Element {
  const idPrefix = useArtId();
  const markup = useMemo(() => ({ __html: impostorEmblemSvg({ emblem, size, idPrefix }) }), [emblem, size, idPrefix]);
  return <span className="imp-art" aria-hidden="true" dangerouslySetInnerHTML={markup} />;
}
