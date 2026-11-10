// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../../play/testing/native'));
vi.mock('react-native-svg', () => import('../../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../../reports/testing/stubs'));
vi.mock('expo-audio', () => import('../../reports/testing/stubs'));
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

const type = (code: string): void => {
  fireEvent.change(screen.getByTestId('code'), { target: { value: code } });
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('confirming an address', () => {
  it('is asked the way the rest of signing up is: Hevalo says what happened, over one question', () => {
    unconfirmed();
    renderWithProviders(<VerifyEmailScreen />);
    expect(screen.getByText('I sent a code to your email. Type it in and we’re off!')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Confirm your email' })).toBeTruthy();
    // the address it went to, as it was typed, and how long each thing lasts
    expect(screen.getByText('rojda@exmaple.com')).toBeTruthy();
    expect(screen.getByText(/The code expires 15 minutes after it was sent\. A sign-up that isn’t confirmed within 7 days is removed\./)).toBeTruthy();
    // one question, so nothing to count
    expect(screen.queryByTestId('step-progress')).toBeNull();
  });

  it('sends the code as its last digit lands, without the button', async () => {
    const session = unconfirmed();
    renderWithProviders(<VerifyEmailScreen />);
    type('48213');
    expect(session.verifyEmailCode).not.toHaveBeenCalled();
    type('482137');
    await waitFor(() => expect(session.verifyEmailCode).toHaveBeenCalledWith('482137'));
    expect(session.verifyEmailCode).toHaveBeenCalledTimes(1);
  });

  it('keeps to digits, and to six of them', async () => {
    const session = unconfirmed();
    renderWithProviders(<VerifyEmailScreen />);
    type('48-21 37 99');
    await waitFor(() => expect(session.verifyEmailCode).toHaveBeenCalledWith('482137'));
  });

  it('says a wrong code is wrong under the boxes, with Hevalo’s second look, and clears it to be typed again', async () => {
    const session = unconfirmed({ verifyEmailCode: vi.fn(async () => 'That code isn’t right.') });
    renderWithProviders(<VerifyEmailScreen />);
    type('111111');
    expect(await screen.findByText('That code isn’t right.')).toBeTruthy();
    expect(screen.getByText('Hmm, have another look at that one.')).toBeTruthy();
    expect((screen.getByTestId('code') as HTMLInputElement).value).toBe('');
    // and the next whole code is sent again
    type('482137');
    await waitFor(() => expect(session.verifyEmailCode).toHaveBeenCalledTimes(2));
  });

  it('asks for all six digits when the button is pressed early, and sends nothing', async () => {
    const session = unconfirmed();
    renderWithProviders(<VerifyEmailScreen />);
    type('482');
    fireEvent.click(screen.getByRole('button', { name: 'Confirm email' }));
    expect(await screen.findByText('Enter the 6-digit code from your email')).toBeTruthy();
    expect(session.verifyEmailCode).not.toHaveBeenCalled();
  });

  it('sends a new code, says so, and waits before offering another', async () => {
    const session = unconfirmed();
    renderWithProviders(<VerifyEmailScreen />);
    fireEvent.click(screen.getByTestId('resend'));
    await waitFor(() => expect(session.resendVerificationCode).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('We sent a new code. It can take a minute to arrive.')).toBeTruthy();
    expect(screen.getByTestId('resend').textContent).toMatch(/send a new code \(\d+s\)/);
    fireEvent.click(screen.getByTestId('resend'));
    expect(session.resendVerificationCode).toHaveBeenCalledTimes(1);
  });

  it('says so when no more emails can be sent today', async () => {
    unconfirmed({ resendVerificationCode: vi.fn(async () => 'Too many emails for today.') });
    renderWithProviders(<VerifyEmailScreen />);
    fireEvent.click(screen.getByTestId('resend'));
    expect(await screen.findByText('Too many emails for today.')).toBeTruthy();
  });
});

describe('a mistyped address', () => {
  it('is put right in place: the address is the way in, and the code goes to the new one', async () => {
    const session = unconfirmed();
    renderWithProviders(<VerifyEmailScreen />);
    // the field is not there until it is asked for
    expect(screen.queryByTestId('new-address')).toBeNull();
    fireEvent.click(screen.getByTestId('change-address'));
    expect(await screen.findByRole('heading', { name: 'What’s your email?' })).toBeTruthy();
    expect(screen.getByText('No problem. Where should I send it?')).toBeTruthy();
    fireEvent.change(screen.getByTestId('new-address'), { target: { value: ' rojda@example.com ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send the code there' }));

    await waitFor(() => expect(session.changePendingEmail).toHaveBeenCalledWith('rojda@example.com'));
    // back at the code, which is on its way to the new address
    expect(await screen.findByRole('heading', { name: 'Confirm your email' })).toBeTruthy();
    expect(screen.getByText('We sent a code to your new address.')).toBeTruthy();
    expect(screen.queryByTestId('new-address')).toBeNull();
  });

  it('stays on the question and says why when the address cannot be used', async () => {
    unconfirmed({ changePendingEmail: vi.fn(async () => 'That address can’t be used.') });
    renderWithProviders(<VerifyEmailScreen />);
    fireEvent.click(screen.getByTestId('change-address'));
    fireEvent.change(await screen.findByTestId('new-address'), { target: { value: 'taken@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send the code there' }));
    expect(await screen.findByText('That address can’t be used.')).toBeTruthy();
    expect(screen.getByTestId('new-address')).toBeTruthy();
  });

  it('can be backed out of, to the code as it was', async () => {
    unconfirmed();
    renderWithProviders(<VerifyEmailScreen />);
    fireEvent.click(screen.getByTestId('change-address'));
    fireEvent.click(await screen.findByTestId('step-back'));
    expect(await screen.findByRole('heading', { name: 'Confirm your email' })).toBeTruthy();
    expect(screen.getByText('rojda@exmaple.com')).toBeTruthy();
  });
});

describe('leaving instead', () => {
  it('offers to delete the sign-up, and says it goes at once rather than in fourteen days', () => {
    unconfirmed();
    const alert = vi.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    renderWithProviders(<VerifyEmailScreen />);
    fireEvent.click(screen.getByTestId('delete-account'));
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls[0]?.[1]).toBe('Your sign-up will be deleted straight away. This can’t be undone.');
  });

  it('signs out to start over', () => {
    const session = unconfirmed();
    renderWithProviders(<VerifyEmailScreen />);
    fireEvent.click(screen.getByText('Sign out and start over'));
    expect(session.logout).toHaveBeenCalledTimes(1);
  });
});
