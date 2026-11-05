// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../../reports/testing/stubs'));
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
});

async function ask(email: string): Promise<void> {
  renderWithProviders(<ForgotPasswordForm email={email} />);
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
  });
}

describe('asking for a reset link', () => {
  it('says it is on its way once the server has the request', async () => {
    auth.requestPasswordReset.mockResolvedValue(null);
    await ask('r@example.com');
    expect(auth.requestPasswordReset).toHaveBeenCalledWith('r@example.com');
    expect(screen.getByText('If an account exists for this email, a reset link is on its way.')).toBeTruthy();
  });

  /*
   * Offline, nothing was sent: the form stays, with why, so the person tries
   * again instead of waiting for an email that is not coming.
   */
  it('keeps the form and says why when the request never got through', async () => {
    auth.requestPasswordReset.mockResolvedValue('Can’t reach Hevalo right now. Check your connection and try again.');
    await ask('r@example.com');
    expect(screen.queryByText('If an account exists for this email, a reset link is on its way.')).toBeNull();
    expect(screen.getByText('Can’t reach Hevalo right now. Check your connection and try again.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Send reset link' })).toBeTruthy();
  });
});
