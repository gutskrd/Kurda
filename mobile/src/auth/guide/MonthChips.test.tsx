// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../../play/testing/native'));
vi.mock('react-native-svg', () => import('../../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../../reports/testing/stubs'));
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../reports/testing/harness';
import { patchReactNativeWeb } from '../../reports/testing/rnWebPatches';
import { MonthChips, monthColumns } from './MonthChips';

/*
 * The months a new account is asked for its birth month by: three to a row
 * where every month's longest word fits, two where one does not, and a name
 * of two words on two lines rather than cut to its first.
 */

patchReactNativeWeb({ reduceMotion: true });
afterEach(() => {
  cleanup();
  localStorage.removeItem('kurda_locale_v1');
});

const GERMAN = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const SORANI = ['کانوونی دووەم', 'شوبات', 'ئازار', 'نیسان', 'ئایار', 'حوزەیران', 'تەمووز', 'ئاب', 'ئەیلوول', 'تشرینی یەکەم', 'تشرینی دووەم', 'کانوونی یەکەم'];

describe('how many months to a row', () => {
  it('keeps three to a row where the longest word fits, and three before the grid is laid out', () => {
    expect(monthColumns(342, 1, GERMAN)).toBe(3);
    expect(monthColumns(0, 1, GERMAN)).toBe(3);
    // Soranî's two-word months take two lines in a third of a 390-point phone
    expect(monthColumns(342, 1, SORANI)).toBe(3);
  });

  it('goes to two to a row where "September" would be cut, and for larger text', () => {
    expect(monthColumns(272, 1, GERMAN)).toBe(2);
    expect(monthColumns(342, 1.3, GERMAN)).toBe(2);
  });
});

describe('the months', () => {
  it('lets a month of two words take a second line, and marks the chosen one as chosen', async () => {
    localStorage.setItem('kurda_locale_v1', 'ckb');
    const onChange = vi.fn();
    renderWithProviders(<MonthChips value={null} onChange={onChange} />);
    await act(async () => undefined);
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(12);
    for (const radio of radios) expect(getComputedStyle(radio.querySelector('div[dir]') as HTMLElement).whiteSpace).not.toBe('nowrap');
    fireEvent.click(radios[4]!);
    expect(onChange).toHaveBeenCalledWith(5);
  });
});
