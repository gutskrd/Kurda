/**
 * react-native-svg for component tests: the real package needs React Native's Flow sources, which do not load under
 * Node, and SVG in a browser is just SVG. Each element is the DOM element of the same name with its props passed
 * through.
 */
import { createElement, type ReactNode } from 'react';

type Props = Record<string, unknown> & { children?: ReactNode };

function element(tag: string) {
  return function SvgElement({ children, ...props }: Props) {
    // testID is React Native's; the DOM's is data-testid.
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

/** An SVG drawn from a string (the art drawn by code): a box of its size, with the string kept for a test to read. */
export function SvgXml({ xml, width, height }: { xml: string; width?: number; height?: number }) {
  return createElement('svg', { width, height, 'data-xml': xml.length > 0 ? 'drawn' : 'empty', 'data-markup': xml });
}
