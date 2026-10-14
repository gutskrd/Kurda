// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { WordleKeyboard } from '../wordle/WordleKeyboard';
import { KurdishAnswerInput } from '../lesson/components/KurdishAnswerInput';
import { KeyboardGuide } from './KeyboardGuide';
import { KeyboardSettingsSection } from './KeyboardSettings';
import { keyboardPrefs } from './prefs';

patchReactNativeWeb({ reduceMotion: true });

beforeEach(() => {
  localStorage.clear();
  keyboardPrefs.update({ accentMode: 'strict', keyBar: true, backtick: true, wordleLayout: 'qwerty', raceDialect: null, guideShown: true });
});
afterEach(cleanup);

function keyNames(): string[] {
  return within(screen.getByLabelText('Kurdish keyboard'))
    .getAllByRole('button')
    .map((b) => b.getAttribute('aria-label') ?? '');
}

describe('WordleKeyboard', () => {
  it('is QWERTY with ç ê î ş û as a row of their own, Enter and Delete named', () => {
    renderWithProviders(<WordleKeyboard keyboard={{}} onKey={() => undefined} />);
    const names = keyNames();
    expect(names.slice(0, 10)).toEqual(['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p']);
    expect(names.slice(-5)).toEqual(['ç', 'ê', 'î', 'ş', 'û']);
    expect(names).toContain('Enter');
    expect(names).toContain('Backspace');
    expect(names.filter((n) => n !== 'Enter' && n !== 'Backspace')).toHaveLength(31);
  });

  it('follows the device’s “Alphabet order” setting', () => {
    keyboardPrefs.update({ wordleLayout: 'alphabet' });
    renderWithProviders(<WordleKeyboard keyboard={{}} onKey={() => undefined} />);
    expect(keyNames().slice(0, 8)).toEqual(['a', 'b', 'c', 'ç', 'd', 'e', 'ê', 'f']);
  });

  it('tells a screen reader how each letter has scored', () => {
    renderWithProviders(<WordleKeyboard keyboard={{ ê: 'green', s: 'yellow', z: 'gray' }} onKey={() => undefined} />);
    expect(screen.getByRole('button', { name: 'ê, correct' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 's, present' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'z, absent' })).toBeTruthy();
  });

  it('types a letter, deletes and enters', () => {
    const onKey = vi.fn();
    renderWithProviders(<WordleKeyboard keyboard={{}} onKey={onKey} />);
    fireEvent.click(screen.getByRole('button', { name: 'ş' }));
    fireEvent.click(screen.getByRole('button', { name: 'Backspace' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enter' }));
    expect(onKey.mock.calls.map((c) => c[0])).toEqual(['ş', 'DEL', 'ENTER']);
  });

  it('takes no keys while a guess is being checked', () => {
    const onKey = vi.fn();
    renderWithProviders(<WordleKeyboard keyboard={{}} onKey={onKey} disabled />);
    fireEvent.click(screen.getByRole('button', { name: 'ş' }));
    expect(onKey).not.toHaveBeenCalled();
  });
});

function Answer({ dialect }: { dialect: string | null }) {
  const [text, setText] = useState('');
  return (
    <KurdishAnswerInput
      text={text}
      onChangeText={setText}
      dialect={dialect}
      disabled={false}
      placeholder=""
      placeholderTextColor="#999"
      accessibilityLabel="Your answer"
    />
  );
}

describe('the lesson key bar', () => {
  it('offers the Kurmancî letters on a Kurmancî course, and types one into the answer', () => {
    renderWithProviders(<Answer dialect="kurmanci" />);
    fireEvent.click(screen.getByRole('button', { name: 'Type ê' }));
    expect((screen.getByLabelText('Your answer') as HTMLInputElement).value).toBe('ê');
    // a lesson answer is not case-sensitive: no shift key
    expect(screen.queryByRole('button', { name: 'Capital letter' })).toBeNull();
  });

  it('offers the Soranî letters on a Soranî course', () => {
    renderWithProviders(<Answer dialect="sorani" />);
    expect(screen.getByRole('button', { name: 'Type ڕ' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Type ê' })).toBeNull();
  });
});

describe('KeyboardGuide', () => {
  it('shows one phone’s steps with the names on its screens, and lights each letter typed', () => {
    renderWithProviders(<KeyboardGuide visible dialect="kurmanci" onClose={() => undefined} />);
    expect(screen.getByText('Get the Kurmancî keyboard')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'Android' }));
    expect(screen.getByRole('radio', { name: 'Android' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('Kurdish (Latin)')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'iPhone' }));
    expect(screen.getByText(/iPhone has no Kurdish \(Kurmancî\) keyboard yet/)).toBeTruthy();

    const box = screen.getByLabelText('Type the letters here to try your keyboard');
    expect(screen.getByLabelText('ç, not yet')).toBeTruthy();
    fireEvent.change(box, { target: { value: 'çê' } });
    expect(screen.getByLabelText('ç, typed')).toBeTruthy();
    expect(screen.getByText('2 of 5')).toBeTruthy();
    fireEvent.change(box, { target: { value: 'çêîşû' } });
    expect(screen.getByText('Bijî! You’ve got all of them.')).toBeTruthy();
  });

  it('offers the two ways out, and each one sets what it says', () => {
    const onClose = vi.fn();
    keyboardPrefs.update({ keyBar: false, accentMode: 'strict' });
    renderWithProviders(<KeyboardGuide visible dialect="kurmanci" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Make accents forgiving' }));
    expect(keyboardPrefs.current.accentMode).toBe('forgiving');
    fireEvent.click(screen.getByRole('button', { name: 'Use the on-screen keys' }));
    expect(keyboardPrefs.current.keyBar).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('is the Soranî guide for a Soranî racer', () => {
    renderWithProviders(<KeyboardGuide visible dialect="sorani" onClose={() => undefined} />);
    expect(screen.getByText('Get the Soranî keyboard')).toBeTruthy();
  });
});

describe('KeyboardSettingsSection', () => {
  it('changes the accent mode, the key bar and the backtick shortcut on the device', () => {
    renderWithProviders(<KeyboardSettingsSection />);
    fireEvent.click(screen.getByRole('radio', { name: /^Forgiving/ }));
    expect(keyboardPrefs.current.accentMode).toBe('forgiving');
    expect(screen.getByRole('radio', { name: /^Forgiving/ }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByLabelText('Kurdish letter keys'));
    expect(keyboardPrefs.current.keyBar).toBe(false);
    fireEvent.click(screen.getByLabelText('Backtick shortcut'));
    expect(keyboardPrefs.current.backtick).toBe(false);
  });

  it('opens the keyboard guide from Keyboard help', () => {
    renderWithProviders(<KeyboardSettingsSection />);
    fireEvent.click(screen.getByRole('button', { name: 'Keyboard help' }));
    expect(screen.getByText('Get the Kurmancî keyboard')).toBeTruthy();
  });
});
