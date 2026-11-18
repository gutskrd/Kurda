// @vitest-environment jsdom
/**
 * One exercise giving way to the next: the answered question leaves as it stood while the next arrives, and nothing
 * else turns. Kept apart because it holds every animation until the test releases it; otherwise animations end at
 * once under test and the leaving exercise is never seen.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('expo-notifications', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('@react-native-community/netinfo', () => import('../reports/testing/netinfo'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('expo-audio', () => import('../recording/testing/fakeMic'));
vi.mock('expo-file-system/legacy', () => import('../recording/testing/fakeMic'));
vi.mock('./useRecorder', () => import('./useRecorder.native'));
vi.mock('../navigation/hardwareBack', () => import('../navigation/testing/hardwareBack'));
vi.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: vi.fn(), goBack: vi.fn(), addListener: () => () => undefined, isFocused: () => true }),
  useFocusEffect: (run: () => void | (() => void)) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require('react') as typeof import('react');
    useEffect(() => run(), [run]);
  },
}));
const held = vi.hoisted(() => ({ runs: [] as { finish: () => void }[] }));
vi.mock('../theme/animate', async (original) => ({
  ...(await original<typeof import('../theme/animate')>()),
  timing: () => {
    const run = { finish: () => undefined as void };
    held.runs.push(run);
    return {
      start: (cb?: (r: { finished: boolean }) => void) => {
        run.finish = () => cb?.({ finished: true });
      },
      stop: () => undefined,
      reset: () => undefined,
    };
  },
}));

import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { mic } from '../recording/testing/fakeMic';
import { FakeAudio } from '../characters/testing/audio';
import { TRANSLATIONS } from '../i18n/translations';
import { SessionPlayer } from './LessonPlayerScreen';
import type { SessionView } from './types';

patchReactNativeWeb({ reduceMotion: true });
beforeEach(() => {
  held.runs = [];
  globalThis.localStorage?.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Runs every held animation to its end, so whatever was leaving is gone. */
function finishAll(): void {
  act(() => held.runs.splice(0).forEach((run) => run.finish()));
}

const paths = { answers: () => '/sessions/s1/answers', retry: () => '/sessions/s1/retry', complete: () => '/sessions/s1/complete' };
const right = { 'POST /sessions/s1/answers': ok({ verdict: 'correct', accepted: true, duplicate: false }) };
const standing = (skipSpeaking: boolean) => ({ 'GET /me': ok({ user: { skipSpeaking } }), 'GET /me/daily-goal': ok({ completed: false }) });
const session = (exercises: SessionView['exercises']): SessionView => ({
  sessionId: 's1',
  lessonId: 'l1',
  expiresAt: '2999-01-01T00:00:00Z',
  completed: false,
  answered: {},
  exercises,
});
const water = { id: 'mc1', type: 'multiple_choice' as const, prompt: 'Water?', options: ['av', 'nan'], position: 1 };
const bread = { id: 'mc2', type: 'multiple_choice' as const, prompt: 'Bread?', options: ['nan', 'av'], position: 2 };

describe('one exercise giving way to the next', () => {
  it('sends the answered question off as it stood while the next arrives, and turns neither the bar nor the footer', async () => {
    testAuth.client = fakeClient({ ...standing(false), ...right });
    renderWithProviders(<SessionPlayer view={session([water, bread])} paths={paths} onExit={() => undefined} />);
    fireEvent.click(await screen.findByRole('radio', { name: 'av' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));

    // Going forward in a left-to-right language: out by the start side.
    const leaving = await screen.findByTestId('slide-out-start');
    const arriving = screen.getByTestId('slide-in');
    expect(leaving.textContent).toContain('Water?');
    expect(arriving.textContent).toContain('Bread?');
    // Exactly as it stood: the given answer is still chosen and marked right.
    expect(within(leaving).getByRole('radio', { name: /^av/, hidden: true }).getAttribute('aria-checked')).toBe('true');
    // Screen readers are offered only the arriving question's two options, with nothing chosen.
    const offered = screen.getAllByRole('radio');
    expect(offered).toHaveLength(2);
    for (const option of offered) {
      expect(arriving.contains(option)).toBe(true);
      expect(option.getAttribute('aria-checked')).toBe('false');
    }
    // The bar above and the footer below stay put.
    for (const fixed of [screen.getByRole('progressbar'), screen.getByRole('button', { name: 'Check' })]) {
      expect(leaving.contains(fixed)).toBe(false);
      expect(arriving.contains(fixed)).toBe(false);
    }

    finishAll();
    expect(screen.queryByTestId('slide-out-start')).toBeNull();
    expect(document.body.textContent).not.toContain('Water?');
    expect(screen.getByTestId('slide-in').textContent).toContain('Bread?');
  });

  it('leaves by the other side in Soranî, which is read from the right', async () => {
    localStorage.setItem('kurda_locale_v1', 'ckb');
    const ckb = TRANSLATIONS.ckb;
    testAuth.client = fakeClient({ ...standing(false), ...right });
    renderWithProviders(<SessionPlayer view={session([water, bread])} paths={paths} onExit={() => undefined} />);
    fireEvent.click(await screen.findByRole('radio', { name: 'av' }));
    fireEvent.click(screen.getByRole('button', { name: ckb['lesson.check'] }));
    fireEvent.click(await screen.findByRole('button', { name: ckb['common.continue'] }));
    expect((await screen.findByTestId('slide-out-end')).textContent).toContain('Water?');
    expect(screen.queryByTestId('slide-out-start')).toBeNull();
  });

  // Put off while still answerable, the leaving exercise keeps its field open; typing there must not fill in the next one.
  it('takes nothing from the exercise that is leaving as the next one’s answer', async () => {
    FakeAudio.made = [];
    vi.stubGlobal('Audio', FakeAudio);
    testAuth.client = fakeClient({ ...standing(false), ...right });
    const heard = { id: 'ls', type: 'listening' as const, audioUrl: 'https://media.test/silav.mp3', position: 1 };
    const written = { id: 'wr', type: 'writing' as const, prompt: 'Write: hello', position: 2 };
    renderWithProviders(<SessionPlayer view={session([heard, written])} paths={paths} onExit={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Can’t listen now — skip' }));

    const leaving = await screen.findByTestId('slide-out-start');
    fireEvent.change(within(leaving).getByRole('textbox', { hidden: true }), { target: { value: 'silav' } });
    const field = screen.getByRole('textbox') as HTMLInputElement | HTMLTextAreaElement;
    expect(screen.getByTestId('slide-in').contains(field)).toBe(true);
    expect(field.value).toBe('');
    expect(screen.getByRole('button', { name: 'Check' }).getAttribute('aria-disabled')).toBe('true');

    finishAll();
    expect((screen.getByRole('textbox') as HTMLInputElement | HTMLTextAreaElement).value).toBe('');
  });

  // For someone who turned speaking off, a skipped speaking exercise is never shown, arriving or leaving.
  it('never draws a speaking exercise that is passed over, and never opens its microphone', async () => {
    mic.reset();
    testAuth.client = fakeClient({ ...standing(true), ...right });
    const said = { id: 'sp', type: 'speaking' as const, prompt: 'Silav', position: 2 };
    renderWithProviders(<SessionPlayer view={session([water, said, { ...bread, position: 3 }])} paths={paths} onExit={() => undefined} />);
    fireEvent.click(await screen.findByRole('radio', { name: 'av' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));

    // The answered question leaves, and the one after the speaking exercise arrives.
    const leaving = await screen.findByTestId('slide-out-start');
    expect(leaving.textContent).toContain('Water?');
    expect(screen.getByTestId('slide-in').textContent).toContain('Bread?');
    expect(document.body.textContent).not.toContain('Silav');
    expect(screen.queryByRole('button', { name: 'Start recording', hidden: true })).toBeNull();
    expect(mic.calls).toEqual([]);
    expect(mic.modes).toEqual([]);
  });
});
