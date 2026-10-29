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
import { cleanup, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import type { RootNavigation } from '../navigation/rootStack';
import { PracticeScreen } from './PracticeScreen';

patchReactNativeWeb({ reduceMotion: true });
afterEach(cleanup);

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

  it('practises what is due when it is given nothing', async () => {
    const client = fakeClient({ 'POST /practice/session': session, 'GET /me': ok({ user: {} }) });
    testAuth.client = client;
    renderWithProviders(<PracticeScreen navigation={navigation} onExit={() => undefined} />);
    await waitFor(() => expect(client.calls.some((c) => c.path === '/practice/session')).toBe(true));
    expect(client.calls.find((c) => c.path === '/practice/session')?.body).toBeUndefined();
  });
});
