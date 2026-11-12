import { useId, useMemo } from 'react';
import { View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { impostorCategorySvg, impostorEmblemSvg, impostorWaySvg, type ImpostorEmblem, type ImpostorWay } from '@kurda/shared';

/**
 * Kurdish Impostor's pictures on the phone: a category's, a way to play's and
 * the game's own emblem, drawn from the shared art
 * (shared/src/art/impostor.ts) so the website shows the same ones.
 *
 * Each is decoration beside its name, so it is hidden from a screen reader.
 * A screen can show the same picture twice (a category on its tile and again
 * on a card), and a drawing's clip paths are found by id, so every one drawn
 * here gets ids of its own.
 */
function useArtId(): string {
  return `ia${useId().replace(/[^A-Za-z0-9]/g, '')}`;
}

function Picture({ xml, size }: { xml: string; size: number }): React.JSX.Element {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <SvgXml xml={xml} width={size} height={size} />
    </View>
  );
}

/** The picture of a category by its slug; of "any category" for null. */
export function CategoryArt({ category, size = 52 }: { category: string | null; size?: number }): React.JSX.Element {
  const idPrefix = useArtId();
  const xml = useMemo(() => impostorCategorySvg({ category, size, idPrefix }), [category, size, idPrefix]);
  return <Picture xml={xml} size={size} />;
}

/** The picture of one way to play. */
export function WayArt({ way, size = 64 }: { way: ImpostorWay; size?: number }): React.JSX.Element {
  const idPrefix = useArtId();
  const xml = useMemo(() => impostorWaySvg({ way, size, idPrefix }), [way, size, idPrefix]);
  return <Picture xml={xml} size={size} />;
}

/** The game's emblem: the hand of cards for its start, the mask for a card's back. */
export function EmblemArt({ emblem, size = 120 }: { emblem: ImpostorEmblem; size?: number }): React.JSX.Element {
  const idPrefix = useArtId();
  const xml = useMemo(() => impostorEmblemSvg({ emblem, size, idPrefix }), [emblem, size, idPrefix]);
  return <Picture xml={xml} size={size} />;
}
