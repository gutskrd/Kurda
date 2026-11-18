// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { onHaptic, resetHaptics } from '../feedback/haptics';
import type { HapticEvent } from '../feedback/hapticPacing';
import { GoalPicker } from './GoalPicker';

/* The daily goal picker, as a guest first picks it and as the Learn bar changes it. */

patchReactNativeWeb({ reduceMotion: true });
afterEach(() => {
  cleanup();
  localStorage.removeItem('kurda_locale_v1');
});

describe('the day’s goal', () => {
  it('names each of the four for what it means, with the goal set checked', () => {
    renderWithProviders(<GoalPicker value={20} onChange={() => undefined} />);
    expect(screen.getByRole('radiogroup')).toBeTruthy();
    const radios = screen.getAllByRole('radio');
    expect(radios.map((r) => r.getAttribute('aria-label'))).toEqual(['10 XP a day', '20 XP a day', '30 XP a day', '50 XP a day']);
    expect(screen.getByRole('radio', { name: '20 XP a day', checked: true })).toBeTruthy();
    expect(screen.getAllByRole('radio', { checked: false })).toHaveLength(3);
  });

  it('sets a new goal with a tick, and nothing is felt for the one already set', () => {
    const onChange = vi.fn();
    const felt: HapticEvent[] = [];
    resetHaptics();
    const stop = onHaptic((e) => felt.push(e));
    try {
      renderWithProviders(<GoalPicker value={20} onChange={onChange} />);
      fireEvent.click(screen.getByRole('radio', { name: '50 XP a day' }));
      expect(onChange).toHaveBeenLastCalledWith(50);
      expect(felt).toEqual(['select']);
      fireEvent.click(screen.getByRole('radio', { name: '20 XP a day' }));
      expect(onChange).toHaveBeenLastCalledWith(20);
      expect(felt).toEqual(['select']);
    } finally {
      stop();
    }
  });

  it('takes no choice while the goal is being saved', () => {
    const onChange = vi.fn();
    renderWithProviders(<GoalPicker value={20} onChange={onChange} disabled />);
    const fifty = screen.getByRole('radio', { name: '50 XP a day' });
    expect(fifty.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(fifty);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('reads each goal in Soranî, in the reader’s own digits', async () => {
    localStorage.setItem('kurda_locale_v1', 'ckb');
    renderWithProviders(<GoalPicker value={30} onChange={() => undefined} />);
    await act(async () => undefined);
    expect(screen.getByRole('radio', { name: 'ڕۆژانە ٣٠ XP', checked: true })).toBeTruthy();
    expect(screen.getByText('٥٠')).toBeTruthy();
  });
});
