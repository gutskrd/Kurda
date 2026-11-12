import { useId, useMemo } from 'react';
import { gameEmblemSvg, type GameEmblem } from '@kurda/shared';

/**
 * A game's emblem on the website, drawn from the shared art
 * (shared/src/art/games.ts) so the phone shows the same picture.
 *
 * It is decoration beside the game's name, so it is hidden from a screen
 * reader. A page can show the same emblem twice (the featured game, and its
 * card under a filter), and a drawing's clip paths are found by id, so every
 * one drawn here gets ids of its own.
 */
export function GameArt({ game, size = 96 }: { game: GameEmblem; size?: number }): React.JSX.Element {
  const idPrefix = `ga${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  const markup = useMemo(() => ({ __html: gameEmblemSvg({ game, size, idPrefix }) }), [game, size, idPrefix]);
  return <span className="gp-art" aria-hidden="true" dangerouslySetInnerHTML={markup} />;
}
