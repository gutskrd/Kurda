// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
import { act, cleanup, screen } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { OverviewGrid, overviewColumns } from './OverviewGrid';

/*
 * The four tiles under the face: two to a row only where a course's or a league's name fits beside its picture, laid
 * out from the right in right-to-left languages.
 */

patchReactNativeWeb({ reduceMotion: true });
afterEach(() => {
  cleanup();
  localStorage.removeItem('kurda_locale_v1');
});

describe('how many tiles to a row', () => {
  it('puts two to a row where "Kurmancî" fits beside its picture, and on a tablet', () => {
    expect(overviewColumns(390, 1)).toBe(2);
    expect(overviewColumns(430, 1)).toBe(2);
    expect(overviewColumns(1024, 1.3)).toBe(2);
  });

  it('puts one to a row on a narrow phone, where half the screen cut the course to “Kur…”', () => {
    expect(overviewColumns(375, 1)).toBe(1);
    expect(overviewColumns(360, 1)).toBe(1);
    expect(overviewColumns(320, 1)).toBe(1);
  });

  it('puts one to a row for a reader who has asked for larger text', () => {
    expect(overviewColumns(430, 1.3)).toBe(1);
  });
});

describe('a tile', () => {
  const tiles = [
    { key: 'course', art: null, value: 'Kurmancî', label: 'Course', onPress: () => undefined },
    { key: 'xp', art: null, value: 57, label: 'XP' },
  ];

  it('starts with its picture on the left where the language is read from the left', async () => {
    renderWithProviders(<OverviewGrid tiles={tiles} />);
    await act(async () => undefined);
    expect(getComputedStyle(screen.getByRole('button', { name: 'Kurmancî Course' })).flexDirection).toBe('row');
  });

  it('starts with its picture on the right, and lines its words up there, in a language read from the right', async () => {
    localStorage.setItem('kurda_locale_v1', 'ckb');
    renderWithProviders(<OverviewGrid tiles={tiles} />);
    await act(async () => undefined);
    const tile = screen.getByRole('button', { name: 'Kurmancî Course' });
    expect(getComputedStyle(tile).flexDirection).toBe('row-reverse');
    expect(getComputedStyle(screen.getByText('Kurmancî')).textAlign).toBe('right');
  });
});
