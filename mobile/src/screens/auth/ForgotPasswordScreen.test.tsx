// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../../reports/testing/stubs'));
vi.mock('expo-audio', () => import('../../reports/testing/stubs'));
vi.mock('@react-navigation/native', () => import('../../auth/guide/testing/navigation'));
const auth = vi.hoisted(() => ({ requestPasswordReset: vi.fn() }));
vi.mock('../../auth/AuthContext', () => ({ useAuth: () => auth }));
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../reports/testing/harness';
import { patchReactNativeWeb } from '../../reports/testing/rnWebPatches';
import { ForgotPasswordForm } from './ForgotPasswordScreen';

patchReactNativeWeb({ reduceMotion: true });

afterEach(() => {
  cleanup();
  auth.requestPasswordReset.mockReset();
  onBackToLogin.mockReset();
});

const onBackToLogin = vi.fn();

async function ask(email: string): Promise<void> {
  renderWithProviders(<ForgotPasswordForm email={email} onBackToLogin={onBackToLogin} />);
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
  });
}

describe('asking for a reset link', () => {
  it('is asked the way signing in is: Hevalo asks where to send it, over the address already typed', () => {
    renderWithProviders(<ForgotPasswordForm email="r@example.com" onBackToLogin={onBackToLogin} />);
    expect(screen.getByText('It happens to all of us. Where shall I send the link?')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'What’s your email?' })).toBeTruthy();
    expect((screen.getByTestId('email') as HTMLInputElement).value).toBe('r@example.com');
    // one question, so nothing to count
    expect(screen.queryByTestId('step-progress')).toBeNull();
  });

  it('says it is on its way once the server has the request, and shows the address back', async () => {
    auth.requestPasswordReset.mockResolvedValue(null);
    await ask(' r@example.com ');
    expect(auth.requestPasswordReset).toHaveBeenCalledWith('r@example.com');
    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeTruthy();
    // whether an account exists is not something to tell whoever asks
    expect(screen.getByText('If an account exists for this email, a reset link is on its way.')).toBeTruthy();
    expect(screen.getByTestId('reset-sent-to').textContent).toContain('r@example.com');
    // and the way on is back to signing in, with the address
    fireEvent.click(screen.getByRole('button', { name: 'Back to sign in' }));
    expect(onBackToLogin).toHaveBeenCalledWith('r@example.com');
  });

  it('checks the address before the server is asked', async () => {
    await ask('not an address');
    expect(auth.requestPasswordReset).not.toHaveBeenCalled();
    expect(screen.getByTestId('step-error')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Check your email' })).toBeNull();
  });

  /*
   * Offline, nothing was sent: the question stays, with why, so the person
   * tries again instead of waiting for an email that is not coming.
   */
  it('stays on the question and says why when the request never got through', async () => {
    auth.requestPasswordReset.mockResolvedValue('Can’t reach Hevalo right now. Check your connection and try again.');
    await ask('r@example.com');
    expect(screen.queryByText('If an account exists for this email, a reset link is on its way.')).toBeNull();
    expect(screen.getByText('Can’t reach Hevalo right now. Check your connection and try again.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Send reset link' })).toBeTruthy();
  });

  it('ends on Done where there is no sign-in to go back to', async () => {
    auth.requestPasswordReset.mockResolvedValue(null);
    const onBack = vi.fn();
    renderWithProviders(<ForgotPasswordForm email="r@example.com" onBack={onBack} />);
    expect(screen.queryByRole('button', { name: 'Back to sign in' })).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Done' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
