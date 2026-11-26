// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deerMarkPath } from '@kurda/shared';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { Loading, LOADING_SIZE } from './Loading';
import { DARK, LIGHT } from './palette';

vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));

patchReactNativeWeb();
afterEach(cleanup);

describe('Loading', () => {
  it('says what it is to a screen reader, and waits as the deer in the ink', () => {
    const { container } = renderWithProviders(<Loading />);
    const bar = screen.getByRole('progressbar', { name: 'Loading…' });
    expect(bar).toBeTruthy();
    const path = container.querySelector('path') as SVGPathElement;
    // He starts as the small mark itself (no eyes, one tine to each antler), in the ink of whichever scheme the device is in.
    expect(path.getAttribute('d')).toBe(deerMarkPath({ small: true }));
    expect([LIGHT.primary, DARK.primary]).toContain(path.getAttribute('fill'));
    expect(container.querySelector('svg')?.getAttribute('width')).toBe(String(LOADING_SIZE.small));
  });

  it('says something more exact where that is known, and is bigger for a whole screen', () => {
    const { container } = renderWithProviders(<Loading label="Adding up your answers" size="large" />);
    expect(screen.getByRole('progressbar', { name: 'Adding up your answers' })).toBeTruthy();
    expect(screen.queryByRole('progressbar', { name: 'Loading…' })).toBeNull();
    expect(container.querySelector('svg')?.getAttribute('width')).toBe(String(LOADING_SIZE.large));
    expect(container.querySelector('path')?.getAttribute('d')).toBe(deerMarkPath());
  });
});
