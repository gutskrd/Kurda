// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../reports/testing/harness';
import { forgetReach, reachLimitOf, reachOf } from '../testing/reach';
import { ChoiceChips } from './ui';

vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
// Records each control as it is drawn, so its reach can be read.
vi.mock('../theme/Pressable', () => import('../testing/reach'));

afterEach(() => {
  cleanup();
  forgetReach();
});

const LENGTHS = ['short', 'medium', 'long'] as const;
const NAMES = { short: 'Short · 5 min', medium: 'Medium · 10 min', long: 'Long · 20 min' };

describe('ChoiceChips', () => {
  it('lets each chip answer a finger up to half the gap to its neighbours, every way, and no further', () => {
    renderWithProviders(<ChoiceChips label="Length" options={LENGTHS} value="short" onChange={() => undefined} labelOf={(l) => NAMES[l]} />);
    for (const name of Object.values(NAMES)) {
      // Chips are 8 apart across and between rows: 4 each, so two never overlap.
      expect(reachLimitOf(name)).toEqual({ top: 4, bottom: 4, left: 4, right: 4 });
      expect(reachOf(name)).toEqual({ top: 4, bottom: 4, left: 4, right: 4 });
    }
  });

  it('is a radio group whose chips choose as they are tapped', () => {
    const onChange = vi.fn();
    renderWithProviders(<ChoiceChips label="Length" options={LENGTHS} value="short" onChange={onChange} labelOf={(l) => NAMES[l]} />);
    expect(screen.getByRole('radiogroup', { name: 'Length' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: NAMES.short }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: NAMES.long }));
    expect(onChange).toHaveBeenCalledWith('long');
  });
});
