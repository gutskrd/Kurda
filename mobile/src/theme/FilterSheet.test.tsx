// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('./Pressable', () => import('../testing/reach'));
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { forgetReach, reachOf } from '../testing/reach';
import { FilterChip, FilterChips, FilterPill, FilterPills, FilterSheet, FilterToggle } from './FilterSheet';

/*
 * The pieces of the sort-and-filter sheet (theme/FilterSheet.tsx), and how
 * far each answers a finger. The chip under a screen's header is two
 * controls that touch, the words and the ✕, so their reaches are set as a
 * pair; chips and pills in a row share the gaps round them half each.
 */

patchReactNativeWeb({ reduceMotion: true });
afterEach(() => {
  cleanup();
  forgetReach();
  localStorage.removeItem('kurda_locale_v1');
});

function twoChips() {
  const opened = vi.fn();
  const cleared = vi.fn();
  renderWithProviders(
    <FilterChips>
      <FilterChip icon="clock" label="This week" clearLabel="Clear this week" onOpen={opened} onClear={cleared} />
      <FilterChip label="Pictures" clearLabel="Clear pictures" onOpen={opened} onClear={cleared} />
    </FilterChips>,
  );
  return { opened, cleared };
}

describe('a filter chip and its ✕', () => {
  it('lets the words reach up and down to half the gap, and nothing toward the ✕', () => {
    twoChips();
    expect(reachOf('This week')).toEqual({ top: 4, bottom: 4, left: 0, right: 0 });
  });

  it('lets the ✕ reach 8 past its circle away from the words, 6 up and down (it sits 2 inside the chip), and nothing toward them', () => {
    twoChips();
    expect(reachOf('Clear this week')).toEqual({ top: 6, bottom: 6, left: 0, right: 8 });
  });

  it('turns the pair round for a language read from the right', async () => {
    localStorage.setItem('kurda_locale_v1', 'ckb');
    twoChips();
    await act(async () => undefined);
    expect(reachOf('Clear this week')).toEqual({ top: 6, bottom: 6, left: 8, right: 0 });
  });

  it('gives the chip’s leading padding to the words, so a tap on the chip before them opens it', async () => {
    twoChips();
    await act(async () => undefined);
    expect(getComputedStyle(screen.getByRole('button', { name: 'This week' })).paddingLeft).toBe('16px');
    localStorage.setItem('kurda_locale_v1', 'ckb');
    cleanup();
    twoChips();
    await act(async () => undefined);
    const words = screen.getAllByRole('button').find((b) => b.getAttribute('aria-label') === 'This week')!;
    expect(getComputedStyle(words).paddingRight).toBe('16px');
  });

  it('still opens from the words and clears from the ✕', () => {
    const { opened, cleared } = twoChips();
    fireEvent.click(screen.getByRole('button', { name: 'Pictures' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear pictures' }));
    expect(opened).toHaveBeenCalledTimes(1);
    expect(cleared).toHaveBeenCalledTimes(1);
  });
});

describe('the filter sheet’s other controls', () => {
  it('lets a row of pills share the gaps round them half each', () => {
    renderWithProviders(
      <FilterPills label="Period">
        <FilterPill label="Today" on onPress={() => undefined} />
        <FilterPill label="This week" count={12} on={false} onPress={() => undefined} />
      </FilterPills>,
    );
    expect(reachOf('Today')).toEqual({ top: 4, bottom: 4, left: 0, right: 0 });
    expect(reachOf('This week, 12')).toEqual({ top: 4, bottom: 4, left: 0, right: 0 });
  });

  it('lets Reset, a word with room round it, reach 8 past every edge', () => {
    renderWithProviders(
      <FilterSheet visible onClose={() => undefined} title="Sort and filter" resetLabel="Reset" resetDisabled={false} onReset={() => undefined} applyLabel="Show 12" onApply={() => undefined}>
        <FilterToggle label="Read aloud" on={false} onChange={() => undefined} />
      </FilterSheet>,
    );
    expect(reachOf('Reset')).toEqual({ top: 8, bottom: 8, left: 8, right: 8 });
  });

  it('turns a switch from its words as well as from the switch, as one switch to a screen reader', () => {
    const onChange = vi.fn();
    renderWithProviders(<FilterToggle label="Read aloud" hint="Stories with a voice" on={false} onChange={onChange} />);
    const row = screen.getByRole('switch', { name: 'Read aloud' });
    expect(screen.getAllByRole('switch')).toHaveLength(1);
    fireEvent.click(screen.getByText('Stories with a voice'));
    expect(onChange).toHaveBeenCalledWith(true);
    expect(row.getAttribute('aria-checked')).toBe('false');
  });
});
