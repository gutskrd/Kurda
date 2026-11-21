// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hexToRgb } from '../a11y/contrast';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { CHASE } from '@kurda/shared';
import { Loading } from './Loading';
import { DARK, LIGHT } from './palette';

vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));

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
    // Whichever scheme the test device is in: the caption grey, not the ink of something pressable.
    const drawn = [...container.querySelectorAll('circle')].map((c) => c.style.stroke);
    expect(drawn.length).toBeGreaterThan(0);
    const grey = [LIGHT.textSecondary, DARK.textSecondary].flatMap((hex) => [hex, css(hex)]);
    for (const stroke of drawn) expect(grey).toContain(stroke);
  });

  it('shows a whole page waiting Hevalo galloping after his apple, one drawing of his stride at a time', () => {
    renderWithProviders(<Loading size="large" />);
    const loader = screen.getByRole('progressbar', { name: 'Loading…' });
    expect(loader.getAttribute('data-testid')).toBe('chase-loader');
    // The ground, each drawing of the stride, and the apple with its two wings, each laid once.
    expect(loader.querySelectorAll('svg[data-xml="drawn"]')).toHaveLength(1 + CHASE.frames + 3);
    const shown = [...loader.querySelectorAll<HTMLElement>('svg[data-xml="drawn"]')]
      .map((svg) => svg.parentElement!)
      .filter((view) => view.style.opacity !== '' && Number(view.style.opacity) === 1);
    expect(shown).toHaveLength(1);
  });

  it('says something more exact where that is known', () => {
    renderWithProviders(<Loading label="Adding up your answers" size="large" />);
    expect(screen.getByRole('progressbar', { name: 'Adding up your answers' })).toBeTruthy();
    expect(screen.queryByRole('progressbar', { name: 'Loading…' })).toBeNull();
  });
});
