import { useMemo, useRef } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { horizonSvg } from '@kurda/shared';

/**
 * The horizon behind somebody who wears no background: their own sky and
 * mountains (shared `art/horizon.ts`), the same picture the website draws in
 * their banner. No profile opens on an empty band, and no two people share a
 * horizon.
 *
 * The picture is square and composed about its middle line, so it is laid
 * across the band's width and the band shows it through its middle: the sun
 * and the first ridge are inside it whatever shape the band is. It is
 * decoration, and a screen reader is never told about it.
 */

let horizons = 0;
/** An id prefix of this horizon's own, so its gradients are never another drawing's. */
function useHorizonId(): string {
  const id = useRef<string | null>(null);
  if (id.current === null) {
    horizons += 1;
    id.current = `hvh${horizons.toString(36)}`;
  }
  return id.current;
}

export function Horizon({ seed, width, height, style }: { seed: string; width: number; height: number; style?: StyleProp<ViewStyle> }): React.JSX.Element {
  const id = useHorizonId();
  // a band not laid out yet has no width: it is drawn once it has one
  const xml = useMemo(() => (width > 0 ? horizonSvg({ seed, size: width, idPrefix: id }) : null), [seed, width, id]);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[{ width: Math.max(0, width), height, overflow: 'hidden' }, style]}
      testID="profile-horizon"
    >
      {xml ? (
        <View style={{ position: 'absolute', left: 0, top: (height - width) / 2 }}>
          <SvgXml xml={xml} width={width} height={width} />
        </View>
      ) : null}
    </View>
  );
}
