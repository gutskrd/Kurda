// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../../play/testing/native'));
vi.mock('react-native-svg', () => import('../../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../../reports/testing/stubs'));
vi.mock('../../auth/AuthContext', () => import('../../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../../auth/guide/testing/navigation'));
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { Alert } from 'react-native';
import { renderWithProviders } from '../../reports/testing/harness';
import { patchReactNativeWeb } from '../../reports/testing/rnWebPatches';
import { fakeClient, testAuth } from '../../reports/testing/auth';
import { VerifyEmailScreen } from './VerifyEmailScreen';

patchReactNativeWeb({ reduceMotion: true });

/** What the screen asks of the session, as the stand-in session answers it. */
type Session = typeof testAuth & {
  verifyEmailCode: (code: string) => Promise<string | null>;
  resendVerificationCode: () => Promise<string | null>;
  changePendingEmail: (email: string) => Promise<string | null>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<{ ok: true; graceDays: number } | { ok: false; message: string }>;
};

function unconfirmed(over: Partial<Session> = {}): Session {
  const session = testAuth as Session;
  session.client = fakeClient();
  session.user = { id: 'me', username: 'rojda', email: 'rojda@exmaple.com', displayName: null, profilePhotoUrl: null, emailVerified: false };
  session.verifyEmailCode = vi.fn(async () => null);
  session.resendVerificationCode = vi.fn(async () => null);
  session.changePendingEmail = vi.fn(async (email: string) => {
    session.user = { ...session.user, email };
    return null;
  });
  session.logout = vi.fn(async () => undefined);
  session.deleteAccount = vi.fn(async () => ({ ok: true as const, graceDays: 0 }));
  Object.assign(session, over);
  return session;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('confirming an address', () => {
  it('shows the address the code went to, and how long the sign-up is kept', () => {
    unconfirmed();
    renderWithProviders(<VerifyEmailScreen />);
    expect(screen.getByText('rojda@exmaple.com')).toBeTruthy();
    expect(screen.getByText('A sign-up that isn’t confirmed within 7 days is removed.')).toBeTruthy();
  });

  it('puts a mistyped address right in place, and says where the code went', async () => {
    const session = unconfirmed();
    renderWithProviders(<VerifyEmailScreen />);
    // the field is not there until it is asked for
    expect(screen.queryByTestId('new-address')).toBeNull();
    fireEvent.click(screen.getByTestId('change-address'));
    fireEvent.change(screen.getByTestId('new-address'), { target: { value: ' rojda@example.com ' } });
    fireEvent.click(screen.getByText('Send the code there'));

    await waitFor(() => expect(session.changePendingEmail).toHaveBeenCalledWith('rojda@example.com'));
    expect(await screen.findByText('We sent a code to your new address.')).toBeTruthy();
    expect(screen.queryByTestId('new-address')).toBeNull();
  });

  it('keeps the field open and says why when the address cannot be used', async () => {
    unconfirmed({ changePendingEmail: vi.fn(async () => 'That address can’t be used.') });
    renderWithProviders(<VerifyEmailScreen />);
    fireEvent.click(screen.getByTestId('change-address'));
    fireEvent.change(screen.getByTestId('new-address'), { target: { value: 'taken@example.com' } });
    fireEvent.click(screen.getByText('Send the code there'));
    expect(await screen.findByText('That address can’t be used.')).toBeTruthy();
    expect(screen.getByTestId('new-address')).toBeTruthy();
  });

  it('offers to delete the sign-up, and says it goes at once rather than in fourteen days', () => {
    unconfirmed();
    const alert = vi.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    renderWithProviders(<VerifyEmailScreen />);
    fireEvent.click(screen.getByTestId('delete-account'));
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls[0]?.[1]).toBe('Your sign-up will be deleted straight away. This can’t be undone.');
  });
});
