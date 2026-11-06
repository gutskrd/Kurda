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
vi.mock('../navigation/hardwareBack', () => import('../navigation/testing/hardwareBack'));
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import type { ApiResult } from '../api/types';
import type { RootNavigation } from '../navigation/rootStack';
import { PracticeScreen } from './PracticeScreen';
import { pressBack, resetHardwareBack } from '../navigation/testing/hardwareBack';

patchReactNativeWeb({ reduceMotion: true });
afterEach(() => {
  cleanup();
  resetHardwareBack();
});

const navigation = { navigate: vi.fn(), replace: vi.fn() } as unknown as RootNavigation;
const session = ok({ sessionId: 'p1', exercises: [{ id: 'mc2', type: 'multiple_choice', prompt: 'Bread?', options: ['av', 'nan'] }] });

describe('practice', () => {
  // "Practise these now" from a lesson's results: the server builds the session from those, not from what is due
  it('practises the exercises it is given', async () => {
    const client = fakeClient({ 'POST /practice/session': session, 'GET /me': ok({ user: {} }) });
    testAuth.client = client;
    renderWithProviders(<PracticeScreen navigation={navigation} exerciseIds={['mc2', 'tr']} onExit={() => undefined} />);
    expect(await screen.findByText('Bread?')).toBeTruthy();
    expect(client.calls.find((c) => c.path === '/practice/session')?.body).toEqual({ exerciseIds: ['mc2', 'tr'] });
  });

  it('starts the kind of practice the hub chose', async () => {
    const client = fakeClient({ 'POST /practice/session': session, 'GET /me': ok({ user: {} }) });
    testAuth.client = client;
    renderWithProviders(<PracticeScreen navigation={navigation} mode="unit" unitId="u1" onExit={() => undefined} />);
    expect(await screen.findByText('Bread?')).toBeTruthy();
    expect(client.calls.find((c) => c.path === '/practice/session')?.body).toEqual({ mode: 'unit', unitId: 'u1' });
  });

  it('says plainly when a kind of practice has nothing in it', async () => {
    testAuth.client = fakeClient({ 'POST /practice/session': ok({ empty: true, suggestion: { lessonId: 'l1', title: 'Food' } }) });
    renderWithProviders(<PracticeScreen navigation={navigation} mode="listen" onExit={() => undefined} />);
    expect(await screen.findByText('Nothing to practise here right now')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
  });

  // a full-screen modal with no header: while the session is on its way, the ✕ is the way out
  it('can be closed while it is still starting', () => {
    testAuth.client = fakeClient({ 'POST /practice/session': () => new Promise<ApiResult<never>>(() => undefined) });
    const onExit = vi.fn();
    renderWithProviders(<PracticeScreen navigation={navigation} onExit={onExit} />);
    expect(screen.getByLabelText('Loading…')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  // Learn's Continue review: the session left part-way, read back with its answers, and never a new one started
  it('picks up a review left part-way through where it stopped', async () => {
    const client = fakeClient({
      'GET /practice/sessions/p9': ok({
        sessionId: 'p9',
        completed: false,
        exercises: [
          { id: 'mc1', type: 'multiple_choice', prompt: 'Water?', options: ['av', 'nan'] },
          { id: 'mc2', type: 'multiple_choice', prompt: 'Bread?', options: ['av', 'nan'] },
        ],
        answered: { mc1: { verdict: 'correct', accepted: true } },
      }),
      'GET /me': ok({ user: {} }),
    });
    testAuth.client = client;
    renderWithProviders(<PracticeScreen navigation={navigation} sessionId="p9" onExit={() => undefined} />);
    expect(await screen.findByText('Bread?')).toBeTruthy();
    expect(screen.queryByText('Water?')).toBeNull();
    expect(client.calls.some((c) => c.path === '/practice/session')).toBe(false);

    // Android's back asks before leaving a review with answers in it, as the ✕ does
    const onExit = vi.fn();
    cleanup();
    renderWithProviders(<PracticeScreen navigation={navigation} sessionId="p9" onExit={onExit} />);
    await screen.findByText('Bread?');
    act(() => {
      pressBack();
    });
    expect(await screen.findByText('Leave for now?')).toBeTruthy();
    expect(onExit).not.toHaveBeenCalled();
  });

  it('practises what is due when it is given nothing', async () => {
    const client = fakeClient({ 'POST /practice/session': session, 'GET /me': ok({ user: {} }) });
    testAuth.client = client;
    renderWithProviders(<PracticeScreen navigation={navigation} onExit={() => undefined} />);
    await waitFor(() => expect(client.calls.some((c) => c.path === '/practice/session')).toBe(true));
    expect(client.calls.find((c) => c.path === '/practice/session')?.body).toBeUndefined();
  });
});
