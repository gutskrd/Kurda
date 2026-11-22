import { useId, useMemo } from 'react';
import { impostorCategorySvg, impostorEmblemSvg, impostorWaySvg, type ImpostorEmblem, type ImpostorWay } from '@kurda/shared';
import './art.css';

/**
 * Impostor's pictures (categories, ways to play and the emblem) from shared/src/art/impostor.ts, decorative and hidden
 * from screen readers. Each drawing gets its own ids, since a page can show one twice and clip paths are found by id.
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

/** The game's emblem: the hand of cards for its start, the back every card shows, and the wolf and the deer on a card's face. */
export function EmblemArt({ emblem, size = 120 }: { emblem: ImpostorEmblem; size?: number }): React.JSX.Element {
  const idPrefix = useArtId();
  const markup = useMemo(() => ({ __html: impostorEmblemSvg({ emblem, size, idPrefix }) }), [emblem, size, idPrefix]);
  return <span className="imp-art" aria-hidden="true" dangerouslySetInnerHTML={markup} />;
}
