// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
vi.mock('../theme/Pressable', () => import('../testing/reach'));
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { forgetReach, reachOf } from '../testing/reach';
import { KeyboardGuide } from './KeyboardGuide';
import { KeyboardSettingsSheet } from './KeyboardSettings';
import { keyboardPrefs } from './prefs';

/*
 * The race's own settings sheet (keyboard/KeyboardSettings.tsx): each switch
 * is its whole row, so a tap on its words turns it as a tap on the switch
 * does, and a screen reader meets one switch rather than words and a switch.
 */

patchReactNativeWeb({ reduceMotion: true });

beforeEach(() => {
  localStorage.clear();
  keyboardPrefs.update({ accentMode: 'strict', keyBar: true, backtick: true, wordleLayout: 'qwerty', raceDialect: null, guideShown: true });
});
afterEach(() => {
  cleanup();
  forgetReach();
});

describe('the race’s settings sheet', () => {
  it('turns the key bar and the backtick shortcut from a tap on their words', () => {
    renderWithProviders(<KeyboardSettingsSheet visible dialect="kurmanci" midRace={false} onClose={() => undefined} />);
    fireEvent.click(screen.getByText('Kurdish letter keys'));
    expect(keyboardPrefs.current.keyBar).toBe(false);
    fireEvent.click(screen.getByText('Backtick shortcut'));
    expect(keyboardPrefs.current.backtick).toBe(false);
    fireEvent.click(screen.getByText('Kurdish letter keys'));
    expect(keyboardPrefs.current.keyBar).toBe(true);
  });

  it('is one switch per setting to a screen reader, saying whether it is on', () => {
    renderWithProviders(<KeyboardSettingsSheet visible dialect="kurmanci" midRace={false} onClose={() => undefined} />);
    const keys = screen.getAllByRole('switch', { name: 'Kurdish letter keys' });
    expect(keys).toHaveLength(1);
    expect(keys[0]!.getAttribute('aria-checked')).toBe('true');
    expect(screen.getAllByRole('switch', { name: 'Backtick shortcut' })).toHaveLength(1);
  });
});

describe('the keyboard guide', () => {
  it('lets its close button, alone at the top of the card, answer 8 past every edge', () => {
    renderWithProviders(<KeyboardGuide visible dialect="kurmanci" onClose={() => undefined} />);
    expect(reachOf('Close')).toEqual({ top: 8, bottom: 8, left: 8, right: 8 });
  });
});
