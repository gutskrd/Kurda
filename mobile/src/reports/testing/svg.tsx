/**
 * react-native-svg for component tests.
 *
 * The real package requires React Native's own sources, which are Flow and do
 * not load under Node; the tests render the phone's components through
 * react-native-web instead (see `rnWeb.ts`), and SVG in a browser is just SVG.
 * So each element is the DOM element of the same name with its props passed
 * through — enough to assert what was drawn, which is all a test needs.
 */
import { createElement, type ReactNode } from 'react';

type Props = Record<string, unknown> & { children?: ReactNode };

function element(tag: string) {
  return function SvgElement({ children, ...props }: Props) {
    // testID is React Native's; the DOM's is data-testid
    const { testID, accessibilityLabel, ...rest } = props as Props & { testID?: string; accessibilityLabel?: string };
    return createElement(
      tag,
      { ...rest, 'data-testid': testID, 'aria-label': accessibilityLabel },
      children,
    );
  };
}

const Svg = element('svg');
export default Svg;
export { Svg };
export const Path = element('path');
export const Circle = element('circle');
export const Ellipse = element('ellipse');
export const G = element('g');
export const Rect = element('rect');
export const Line = element('line');
export const Polygon = element('polygon');
export const Polyline = element('polyline');
export const Defs = element('defs');
export const LinearGradient = element('linearGradient');
export const RadialGradient = element('radialGradient');
export const Stop = element('stop');
export const ClipPath = element('clipPath');
export const Pattern = element('pattern');
