// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('expo-notifications', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('@react-native-community/netinfo', () => import('../reports/testing/netinfo'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('expo-audio', () => import('../recording/testing/fakeMic'));
vi.mock('expo-file-system/legacy', () => import('../recording/testing/fakeMic'));
vi.mock('../lesson/useRecorder', () => import('../lesson/useRecorder.native'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fail, fakeClient, ok, testAuth } from '../reports/testing/auth';
import { onHaptic } from '../feedback/haptics';
import type { HapticEvent } from '../feedback/hapticPacing';
import { JumpTestScreen } from './JumpTestScreen';

patchReactNativeWeb({ reduceMotion: true });
afterEach(cleanup);

const test = (triesLeft: number) =>
  ok({
    sessionId: 'p1',
    exercises: [{ id: 'mc', type: 'multiple_choice', prompt: 'Water?', options: ['av', 'nan'] }],
    answered: {},
    jump: { unitId: 'u3', unitNumber: 3, unitTitle: 'Out and about', mistakesAllowed: 2, triesLeft },
  });
const STREAK = { current: 3, longest: 3, freezes: 0, lastActiveOn: '2026-10-27' };
const finished = (passed: boolean, correct: number) =>
  ok({ correct, total: 10, accuracy: correct / 10, mistakes: [], xpAwarded: 0, streak: STREAK, jump: { unitId: 'u3', passed, correct, total: 10, mistakesAllowed: 2 } });

function serve(start: ReturnType<typeof test> | ReturnType<typeof fail>, complete = finished(true, 9)) {
  const client = fakeClient({
    'POST /courses/c1/jump': start,
    'POST /practice/sessions/p1/answers': ok({ verdict: 'correct', accepted: true, duplicate: false }),
    'POST /practice/sessions/p1/complete': complete,
    'GET /me': ok({ user: { skipSpeaking: false } }),
    'GET /me/daily-goal': ok({ completed: false }),
  });
  testAuth.client = client;
  return client;
}

function open(ways: { onPath?: () => void; onAgain?: () => void } = {}) {
  renderWithProviders(
    <JumpTestScreen courseId="c1" unitId="u3" onExit={() => undefined} onPath={ways.onPath ?? (() => undefined)} onAgain={ways.onAgain ?? (() => undefined)} />,
  );
}

/** Answer the one item, and go on to the results. */
async function sitIt(): Promise<void> {
  fireEvent.click(await screen.findByRole('radio', { name: 'av' }));
  fireEvent.click(screen.getByRole('button', { name: 'Check' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));
}

describe('the test that jumps ahead', () => {
  it('is played as a practice session, and says the unit is open when it is passed', async () => {
    const client = serve(test(2));
    const onPath = vi.fn();
    const felt: HapticEvent[] = [];
    const stop = onHaptic((event) => felt.push(event));
    open({ onPath });
    await sitIt();
    expect(await screen.findByRole('heading', { name: 'Unit 3 is open!' })).toBeTruthy();
    expect(screen.getByText('9 of 10 right. The lessons you skipped stay open to come back to.')).toBeTruthy();
    // Hevalo cheers it, his head in at the window
    expect(within(screen.getByTestId('jump-results')).getByTestId('hevalo-window')).toBeTruthy();
    expect(felt).toContain('celebrate');
    stop();
    expect(client.calls.find((c) => c.path === '/courses/c1/jump')?.body).toEqual({ unitId: 'u3' });
    expect(client.calls.some((c) => c.path === '/practice/sessions/p1/answers')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Go to Unit 3' }));
    expect(onPath).toHaveBeenCalled();
  });

  it('says not yet, and how many open the unit, with a way back to learning and another try', async () => {
    serve(test(1), finished(false, 6));
    const onPath = vi.fn();
    const onAgain = vi.fn();
    open({ onPath, onAgain });
    await sitIt();
    expect(await screen.findByRole('heading', { name: 'Not yet' })).toBeTruthy();
    expect(screen.getByText('6 of 10 right. Unit 3 opens with 8 right.')).toBeTruthy();
    expect(screen.getByText('Tries left today: 1')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onAgain).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Keep learning' }));
    expect(onPath).toHaveBeenCalled();
  });

  it('offers no other try once the tries for the day are used', async () => {
    serve(test(0), finished(false, 4));
    open();
    await sitIt();
    expect(await screen.findByText('No more tries today. Come back tomorrow.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('says when the tries for the day at a unit are used up, before any test starts', async () => {
    serve(fail({ code: 'JUMP_LIMIT', status: 429, kind: 'rate_limited', message: 'no more tests at this unit today' }));
    const onPath = vi.fn();
    open({ onPath });
    expect(await screen.findByRole('heading', { name: 'No more tries today' })).toBeTruthy();
    expect(screen.getByText('Each unit’s test can be tried 3 times a day. Keep learning, or try again tomorrow.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Keep learning' }));
    expect(onPath).toHaveBeenCalled();
  });
});
