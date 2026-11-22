// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
import { cleanup } from '@testing-library/react';
import { View } from 'react-native';
import { renderWithProviders } from '../reports/testing/harness';
import { GlassFill, SYSTEM_GLASS, useGlassShape } from './LiquidGlass';
import { DARK, LIGHT } from './palette';

afterEach(cleanup);

function Shape(): React.JSX.Element {
  const glass = useGlassShape('control');
  return (
    <View testID="shape" style={glass}>
      <GlassFill />
    </View>
  );
}

const rgb = (hex: string): string => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

describe('LiquidGlass', () => {
  // The system's glass is iOS 26 only; every other phone keeps a solid shape with a line of light round it.
  it('draws the bar’s solid fill with a lit rim where the system has no glass', () => {
    expect(SYSTEM_GLASS).toBe(false);
    const { getByTestId } = renderWithProviders(<Shape />);
    const shape = getByTestId('shape');
    expect([rgb(LIGHT.barFill), rgb(DARK.barFill)]).toContain(getComputedStyle(shape).backgroundColor);
    const rim = shape.firstElementChild as HTMLElement;
    expect(getComputedStyle(rim).borderTopWidth).toBe('1px');
    expect(getComputedStyle(rim).pointerEvents).toBe('none');
  });
});
