import { useMemo, useRef } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { horizonSvg } from '@kurda/shared';

/**
 * The horizon behind somebody who wears no background: their own sky and mountains (shared `art/horizon.ts`), as the
 * website draws their banner, so no two people share one. The square picture is laid across the band's width and shows
 * through its middle, where the sun and first ridge sit whatever the band's shape. Decorative.
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
  // A band not laid out yet has no width: it is drawn once it has one.
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
