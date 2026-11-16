// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { GlassRow } from './glass';

/*
 * The list row a card of settings is made of (theme/glass.tsx): which side
 * it starts on, and which way its chevron points. It was laid out left to
 * right in every language, so a Soranî reader's row began at its far end.
 */

patchReactNativeWeb({ reduceMotion: true });
afterEach(() => {
  cleanup();
  localStorage.removeItem('kurda_locale_v1');
});

/** The row a pressable row draws: its icon, its words, and what closes it. */
function rowOf(button: HTMLElement): HTMLElement {
  return button.firstElementChild as HTMLElement;
}

describe('a list row', () => {
  it('starts with its icon, and ends on a chevron that points on, where the language is read from the left', async () => {
    const onPress = vi.fn();
    renderWithProviders(<GlassRow icon="flag" title="Your reports" subtitle="What you have told us about" onPress={onPress} />);
    await act(async () => undefined);
    const button = screen.getByRole('button', { name: 'Your reports' });
    const row = rowOf(button);
    expect(getComputedStyle(row).flexDirection).toBe('row');
    const chevron = row.lastElementChild as HTMLElement;
    expect(chevron.style.transform).not.toMatch(/scaleX\(-1\)/);
    fireEvent.click(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('mirrors itself for a language read from the right: the row, its words and its chevron', async () => {
    localStorage.setItem('kurda_locale_v1', 'ckb');
    renderWithProviders(<GlassRow icon="flag" title="ڕاپۆرتەکانت" subtitle="ئەوەی پێت ڕاگەیاندووین" onPress={() => undefined} />);
    await act(async () => undefined);
    const row = rowOf(screen.getByRole('button', { name: 'ڕاپۆرتەکانت' }));
    expect(getComputedStyle(row).flexDirection).toBe('row-reverse');
    const title = screen.getByText('ڕاپۆرتەکانت');
    expect(getComputedStyle(title).textAlign).toBe('right');
    expect(getComputedStyle(screen.getByText('ئەوەی پێت ڕاگەیاندووین')).textAlign).toBe('right');
    // the chevron is the last thing in the row, which is now its left end, and points left
    expect((row.lastElementChild as HTMLElement).style.transform).toMatch(/scaleX\(-1\)/);
  });

  it('is not a button, and has no chevron, where there is nothing to open', () => {
    renderWithProviders(<GlassRow title="Version" value="1.0" />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('1.0')).toBeTruthy();
  });
});
