// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('@react-native-community/netinfo', () => import('../reports/testing/netinfo'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('expo-audio', () => import('../recording/testing/fakeMic'));
vi.mock('expo-file-system/legacy', () => import('../recording/testing/fakeMic'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { Linking } from 'react-native';
import type { PracticeHub } from '@kurda/shared';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { navigation } from '../play/testing/navigation';
import { DENIED, mic } from '../recording/testing/fakeMic';
import { onHaptic, resetHaptics } from '../feedback/haptics';
import type { HapticEvent } from '../feedback/hapticPacing';
import { PracticeHubScreen } from './PracticeHubScreen';

const nothing: PracticeHub = { due: 0, available: 0, mistakes: 0, listen: false, speak: false, words: false, skipSpeaking: false, units: [] };
const learned: PracticeHub = {
  due: 8,
  available: 30,
  mistakes: 3,
  listen: true,
  speak: true,
  words: true,
  skipSpeaking: false,
  units: [
    { unitId: 'u2', title: 'Food', number: 2, tone: 'river' },
    { unitId: 'u1', title: 'Greetings', number: 1, tone: 'meadow' },
  ],
};

let felt: HapticEvent[] = [];
let stopFeeling: () => void = () => undefined;
let openSettings = vi.fn(async () => undefined);

beforeEach(() => {
  patchReactNativeWeb({ reduceMotion: true });
  mic.reset();
  vi.clearAllMocks();
  openSettings = vi.fn(async () => undefined);
  Linking.openSettings = openSettings;
  resetHaptics();
  felt = [];
  stopFeeling = onHaptic((e) => felt.push(e));
});
afterEach(() => {
  stopFeeling();
  cleanup();
});

function open(hub: PracticeHub) {
  testAuth.client = fakeClient({ 'GET /practice/hub': ok(hub) });
  renderWithProviders(<PracticeHubScreen onExit={() => undefined} />);
}

const row = (name: RegExp) => screen.getByRole('button', { name });

describe('the practice hub', () => {
  it('puts the words due at the top, with how many, and starts a review from there', async () => {
    open(learned);
    const hero = await screen.findByTestId('practice-hero');
    expect(within(hero).getByText('8 words due')).toBeTruthy();
    fireEvent.click(within(hero).getByRole('button', { name: 'Start, 8 words due' }));
    expect(navigation.navigate).toHaveBeenCalledWith('Practice', { mode: 'review' });
  });

  it('offers the unit finished last when nothing is due', async () => {
    open({ ...learned, due: 0 });
    const hero = await screen.findByTestId('practice-hero');
    expect(within(hero).getByText('Unit 2 review')).toBeTruthy();
    fireEvent.click(within(hero).getByRole('button', { name: 'Start, Food' }));
    expect(navigation.navigate).toHaveBeenCalledWith('Practice', { mode: 'unit', unitId: 'u2' });
  });

  it('starts each kind of practice from its row, with a tick', async () => {
    open(learned);
    fireEvent.click(await screen.findByRole('button', { name: 'Mistakes, 3 to put right' }));
    expect(navigation.navigate).toHaveBeenLastCalledWith('Practice', { mode: 'mistakes' });
    expect(felt).toContain('select');
    fireEvent.click(row(/^Words, /));
    expect(navigation.navigate).toHaveBeenLastCalledWith('Practice', { mode: 'words' });
    fireEvent.click(row(/^Listen, /));
    expect(navigation.navigate).toHaveBeenLastCalledWith('Practice', { mode: 'listen' });
    fireEvent.click(row(/^Speak, /));
    expect(navigation.navigate).toHaveBeenLastCalledWith('Practice', { mode: 'speak' });
  });

  it('picks a unit to review from a sheet of the units finished', async () => {
    open(learned);
    fireEvent.click(await screen.findByRole('button', { name: 'Review a unit, 2 units finished' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Unit 1, Greetings' }));
    expect(navigation.navigate).toHaveBeenCalledWith('Practice', { mode: 'unit', unitId: 'u1' });
  });

  it('shows every kind with nothing in it, dimmed, saying why', async () => {
    open(nothing);
    const hero = await screen.findByTestId('practice-hero');
    expect(within(hero).getByText('Practice starts with a lesson')).toBeTruthy();
    for (const name of [
      'Mistakes, No mistakes to put right',
      'Words, Finish a lesson to practise its words',
      'Listen, Finish a lesson with listening first',
      'Speak, Finish a lesson with speaking first',
      'Review a unit, Finish a unit to review it here',
    ]) {
      const button = screen.getByRole('button', { name });
      expect(button.getAttribute('aria-disabled')).toBe('true');
      fireEvent.click(button);
    }
    expect(navigation.navigate).not.toHaveBeenCalled();
    fireEvent.click(within(hero).getByRole('button', { name: 'Go to lessons' }));
    expect(navigation.navigate).toHaveBeenCalledWith('Tabs', { screen: 'Learn', params: { view: 'lessons' } });
  });

  it('keeps speaking off when the learner turned it off', async () => {
    open({ ...learned, skipSpeaking: true });
    const speak = await screen.findByRole('button', { name: 'Speak, Speaking is turned off for your lessons' });
    expect(speak.getAttribute('aria-disabled')).toBe('true');
  });

  it('sends speaking to Settings when the microphone was refused for good', async () => {
    mic.answer = DENIED;
    open(learned);
    fireEvent.click(await screen.findByRole('button', { name: 'Speak, Allow the microphone in Settings' }));
    expect(openSettings).toHaveBeenCalled();
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('shows no placeholder for an answer that comes quickly', async () => {
    vi.useFakeTimers();
    try {
      testAuth.client = fakeClient({ 'GET /practice/hub': () => new Promise(() => undefined) });
      renderWithProviders(<PracticeHubScreen onExit={() => undefined} />);
      const loading = screen.getByLabelText('Loading…');
      expect(loading.style.opacity).toBe('0');
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(loading.style.opacity).toBe('1');
    } finally {
      vi.useRealTimers();
    }
  });
});
