// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('@react-native-community/netinfo', () => import('../reports/testing/netinfo'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, testAuth } from '../reports/testing/auth';
import { navigation } from '../play/testing/navigation';
import { MessagesScreen } from './MessagesScreen';

patchReactNativeWeb({ reduceMotion: true });

const FULL = { ...testAuth.user };

beforeEach(() => {
  navigation.navigate.mockReset();
  testAuth.user = { ...FULL, username: 'mevan_4821', email: '', guest: true };
});
afterEach(() => {
  cleanup();
  testAuth.user = FULL;
});

describe('Messages for a guest', () => {
  /*
   * A guest has no conversations and may start none, and every list the tab
   * reads is refused to one. So the tab asks for nothing and says what an
   * account opens here, with the way to one.
   */
  it('asks the server for nothing and offers an account instead of an empty list', () => {
    const client = fakeClient();
    testAuth.client = client;
    renderWithProviders(<MessagesScreen />);
    expect(screen.getByTestId('messages-guest')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Your messages will live here' })).toBeTruthy();
    expect(screen.getByText('Create an account to write to friends and join groups.')).toBeTruthy();
    expect(client.calls).toHaveLength(0);
    // the tab keeps its name and its pencil, as every tab has them
    expect(screen.getByRole('button', { name: 'New message' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Create my account' }));
    expect(navigation.navigate).toHaveBeenLastCalledWith('ClaimAccount');
  });
});
