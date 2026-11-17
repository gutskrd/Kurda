// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../theme/Pressable', () => import('../testing/reach'));
import { cleanup, screen } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { forgetReach, reachOf } from '../testing/reach';
import { KindChips } from './ItemFilters';

/*
 * The shop's row of kinds (shop/ItemFilters.tsx): chips a fingertip tall in
 * a row that scrolls sideways, which would cut off whatever reaches past it.
 */

patchReactNativeWeb({ reduceMotion: true });
afterEach(() => {
  cleanup();
  forgetReach();
});

describe('a row of kinds', () => {
  it('lets each chip answer a finger above and below it, with room for that inside the row', () => {
    renderWithProviders(
      <KindChips
        label="Kinds"
        value="all"
        onChange={() => undefined}
        options={[
          { key: 'all', label: 'All', count: 3 },
          { key: 'icon', label: 'Icons', count: 3 },
        ]}
      />,
    );
    expect(reachOf('All')).toEqual({ top: 2, bottom: 2, left: 0, right: 0 });
    // the row is padded by the reach and the scroller pulled back by as much, so nothing moves
    const row = screen.getByRole('radio', { name: 'All' }).parentElement!;
    expect(getComputedStyle(row).paddingTop).toBe('2px');
    expect(getComputedStyle(row).paddingBottom).toBe('2px');
    const scroller = row.parentElement!;
    expect(getComputedStyle(scroller).marginTop).toBe('-2px');
    expect(getComputedStyle(scroller).marginBottom).toBe('-2px');
  });
});
