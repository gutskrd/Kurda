// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../../reports/testing/stubs'));
const auth = vi.hoisted(() => ({ login: vi.fn() }));
vi.mock('../../auth/AuthContext', () => ({ useAuth: () => auth }));
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../reports/testing/harness';
import { patchReactNativeWeb } from '../../reports/testing/rnWebPatches';
import { LoginScreen } from './LoginScreen';

patchReactNativeWeb();

afterEach(() => {
  cleanup();
  auth.login.mockReset();
});

function renderLogin() {
  const navigation = { navigate: vi.fn(), goBack: vi.fn(), canGoBack: () => false };
  const props = { navigation, route: { key: 'l', name: 'Login' } } as unknown as Parameters<typeof LoginScreen>[0];
  renderWithProviders(<LoginScreen {...props} />);
  return navigation;
}

async function signIn(email: string) {
  fireEvent.change(screen.getByTestId('email'), { target: { value: email } });
  fireEvent.change(screen.getByTestId('password'), { target: { value: 'not-the-one-1' } });
  await act(async () => undefined);
  fireEvent.click(screen.getByTestId('submit'));
}

describe('signing in', () => {
  /*
   * After several failed attempts the server wants the challenge, which is
   * not configured yet: there is nothing to solve, so the screen says to wait
   * a little and offers the reset that does not wait.
   */
  it('offers Reset password, carrying the address, when sign-in is held back after failed attempts', async () => {
    const message = 'There have been several failed sign-in attempts. For your safety, wait a few minutes and try again, or reset your password.';
    auth.login.mockResolvedValue({ message, code: 'CAPTCHA_REQUIRED' });
    const navigation = renderLogin();
    await signIn('rojda@icloud.com');
    const notice = await screen.findByTestId('login-held-back');
    expect(notice.textContent).toContain(message);
    await act(async () => undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));
    expect(navigation.navigate).toHaveBeenLastCalledWith('ForgotPassword', { email: 'rojda@icloud.com' });
  });

  it('does the same for a lock, which says how long', async () => {
    const message = 'There have been several failed sign-in attempts. For your safety, wait about 15 minutes and try again, or reset your password.';
    auth.login.mockResolvedValue({ message, code: 'LOCKED' });
    renderLogin();
    await signIn('rojda@icloud.com');
    expect((await screen.findByTestId('login-held-back')).textContent).toContain(message);
  });

  it('keeps a wrong password a plain line on the form', async () => {
    auth.login.mockResolvedValue({ message: 'That email or password isn’t right.', code: 'INVALID_CREDENTIALS' });
    renderLogin();
    await signIn('rojda@icloud.com');
    expect(await screen.findByText('That email or password isn’t right.')).toBeTruthy();
    expect(screen.queryByTestId('login-held-back')).toBeNull();
  });
});
