import { useId, useMemo } from 'react';
import { View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { gameEmblemSvg, type GameEmblem } from '@kurda/shared';

/**
 * A game's emblem on the phone, drawn from the shared art
 * (shared/src/art/games.ts) so the website shows the same picture.
 *
 * It is decoration beside the game's name, so it is hidden from a screen
 * reader. A screen can show the same emblem twice (the featured game, and its
 * card under a filter), and a drawing's clip paths are found by id, so every
 * one drawn here gets ids of its own.
 */
export function GameArt({ game, size = 72 }: { game: GameEmblem; size?: number }): React.JSX.Element {
  const idPrefix = `ga${useId().replace(/[^A-Za-z0-9]/g, '')}`;
  const xml = useMemo(() => gameEmblemSvg({ game, size, idPrefix }), [game, size, idPrefix]);
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <SvgXml xml={xml} width={size} height={size} />
    </View>
  );
}
