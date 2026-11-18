import { useWindowDimensions } from 'react-native';
import { clampFontScale, type FontScaleOptions } from './dynamicType';

/**
 * The live, clamped OS font scale; `useWindowDimensions` re-renders when the system text size changes.
 *
 *   const scale = useFontScale({ max: 1.3 });
 *   <Text style={{ fontSize: scaledFontSize(16, scale) }} allowFontScaling={false}>…</Text>
 */
export function useFontScale(opts?: FontScaleOptions): number {
  const { fontScale } = useWindowDimensions();
  return clampFontScale(fontScale, opts);
}
