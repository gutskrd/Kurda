// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../../reports/testing/stubs'));
vi.mock('@react-navigation/native', () => import('../../auth/guide/testing/navigation'));
const auth = vi.hoisted(() => ({ login: vi.fn() }));
vi.mock('../../auth/AuthContext', () => ({ useAuth: () => auth }));
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { TRANSLATIONS } from '../../i18n/translations';
import { renderWithProviders } from '../../reports/testing/harness';
import { patchReactNativeWeb } from '../../reports/testing/rnWebPatches';
import { LoginScreen } from './LoginScreen';

/*
 * Signing in in two questions, Hevalo asking: the address, then the password
 * with the reset under it. A wrong password is said under the field with his
 * doubt; a sign-in held back after several attempts gets the calm notice.
 */

patchReactNativeWeb({ reduceMotion: true });
const en = TRANSLATIONS.en;

afterEach(() => {
  cleanup();
  auth.login.mockReset();
});

function renderLogin(params?: { email?: string }) {
  const navigation = { navigate: vi.fn(), goBack: vi.fn(), canGoBack: () => false };
  const props = { navigation, route: { key: 'l', name: 'Login', params } } as unknown as Parameters<typeof LoginScreen>[0];
  renderWithProviders(<LoginScreen {...props} />);
  return navigation;
}

async function turned(): Promise<void> {
  await waitFor(() => expect(document.querySelector('[data-testid^="slide-out"]')).toBeNull());
}

async function press(name: string): Promise<void> {
  await turned();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
}

async function signIn(email: string) {
  fireEvent.change(screen.getByTestId('email'), { target: { value: email } });
  await press(en['common.continue']);
  fireEvent.change(await screen.findByTestId('password'), { target: { value: 'not-the-one-1' } });
  await press(en['auth.login.submit']);
}

describe('signing in', () => {
  it('asks the address, then the password, and sends them', async () => {
    auth.login.mockResolvedValue(null);
    renderLogin();
    expect(screen.getByText(en['guide.email.question'])).toBeTruthy();
    expect(screen.getByTestId('speech-bubble').textContent).toBe(en['guide.login.email.says']);
    await signIn('rojda@icloud.com');
    await waitFor(() => expect(auth.login).toHaveBeenCalledWith('rojda@icloud.com', 'not-the-one-1'));
  });

  it('starts at the password when a screen sent the address along', async () => {
    renderLogin({ email: 'rojda@icloud.com' });
    expect((screen.getByTestId('email') as HTMLInputElement).value).toBe('rojda@icloud.com');
    await press(en['common.continue']);
    expect(await screen.findByText(en['guide.password.question'])).toBeTruthy();
  });

  it('does not go on from an address that is not one', async () => {
    renderLogin();
    fireEvent.change(screen.getByTestId('email'), { target: { value: 'rojda' } });
    await press(en['common.continue']);
    expect(screen.getByTestId('step-error').textContent).toBe(en['field.invalidEmail']);
    expect(screen.getByText(en['guide.email.question'])).toBeTruthy();
    expect(auth.login).not.toHaveBeenCalled();
  });

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

  it('says a wrong password under the field, with Hevalo’s doubt, and no notice', async () => {
    auth.login.mockResolvedValue({ message: 'That email or password isn’t right.', code: 'INVALID_CREDENTIALS' });
    renderLogin();
    await signIn('rojda@icloud.com');
    expect((await screen.findByTestId('step-error')).textContent).toBe('That email or password isn’t right.');
    expect(screen.getByTestId('speech-bubble').textContent).toBe(en['guide.login.wrong.says']);
    expect(screen.queryByTestId('login-held-back')).toBeNull();
  });

  it('keeps the reset under the password and the sign-up under the address, each carrying what was typed', async () => {
    const navigation = renderLogin();
    fireEvent.click(screen.getByRole('button', { name: `${en['auth.login.noAccount']} ${en['auth.login.createAccount']}` }));
    expect(navigation.navigate).toHaveBeenLastCalledWith('Register');
    fireEvent.change(screen.getByTestId('email'), { target: { value: 'rojda@icloud.com' } });
    await press(en['common.continue']);
    await turned();
    fireEvent.click(await screen.findByRole('button', { name: en['auth.login.forgot'] }));
    expect(navigation.navigate).toHaveBeenLastCalledWith('ForgotPassword', { email: 'rojda@icloud.com' });
  });
});
