import { useWindowDimensions } from 'react-native';
import { clampFontScale, type FontScaleOptions } from './dynamicType';

/**
 * The live, clamped OS font scale (KUR-266). `useWindowDimensions` re-renders
 * when the user changes the system text size, so this tracks Dynamic Type
 * automatically:
 *
 *   const scale = useFontScale({ max: 1.3 });
 *   <Text style={{ fontSize: scaledFontSize(16, scale) }} allowFontScaling={false}>…</Text>
 *
 * Kept thin so the clamp policy stays in the pure, unit-tested dynamicType module.
 */
export function useFontScale(opts?: FontScaleOptions): number {
  const { fontScale } = useWindowDimensions();
  return clampFontScale(fontScale, opts);
}
