// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hexToRgb } from '../a11y/contrast';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { Loading } from './Loading';
import { DARK, LIGHT } from './palette';

vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));

patchReactNativeWeb();
afterEach(cleanup);

const css = (hex: string): string => {
  const { r, g, b } = hexToRgb(hex);
  return `rgb(${r}, ${g}, ${b})`;
};

describe('Loading', () => {
  it('says what it is to a screen reader, and waits in the quiet grey', () => {
    const { container } = renderWithProviders(<Loading />);
    expect(screen.getByRole('progressbar', { name: 'Loading…' })).toBeTruthy();
    // whichever scheme the test's device is in: the caption's grey, not the ink of something to press
    const drawn = [...container.querySelectorAll('circle')].map((c) => c.style.stroke);
    expect(drawn.length).toBeGreaterThan(0);
    const grey = [LIGHT.textSecondary, DARK.textSecondary].flatMap((hex) => [hex, css(hex)]);
    for (const stroke of drawn) expect(grey).toContain(stroke);
  });

  it('says something more exact where that is known', () => {
    renderWithProviders(<Loading label="Adding up your answers" size="large" />);
    expect(screen.getByRole('progressbar', { name: 'Adding up your answers' })).toBeTruthy();
    expect(screen.queryByRole('progressbar', { name: 'Loading…' })).toBeNull();
  });
});
