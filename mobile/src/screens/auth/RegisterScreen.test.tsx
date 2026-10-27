// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../../reports/testing/stubs'));
const auth = vi.hoisted(() => ({
  register: vi.fn(),
  stopForAge: vi.fn(),
}));
vi.mock('../../auth/AuthContext', () => ({ useAuth: () => auth }));
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../reports/testing/harness';
import { patchReactNativeWeb } from '../../reports/testing/rnWebPatches';
import { RegisterScreen } from './RegisterScreen';

patchReactNativeWeb();

afterEach(() => {
  cleanup();
  auth.register.mockReset();
});

function renderRegister() {
  const navigation = { navigate: vi.fn(), goBack: vi.fn(), canGoBack: () => false };
  const props = { navigation, route: { key: 'r', name: 'Register' } } as unknown as Parameters<typeof RegisterScreen>[0];
  renderWithProviders(<RegisterScreen {...props} />);
  return navigation;
}

/** Fills the form as somebody signing up with an Apple address would, and sends it. */
async function signUp(email: string) {
  fireEvent.change(screen.getByTestId('email'), { target: { value: email } });
  fireEvent.change(screen.getByTestId('username'), { target: { value: 'rojda_k' } });
  fireEvent.change(screen.getByTestId('password'), { target: { value: 'berbang2026' } });
  fireEvent.click(screen.getByTestId('birth-month'));
  fireEvent.click(await screen.findByRole('button', { name: 'March' }));
  fireEvent.click(screen.getByTestId('birth-year'));
  fireEvent.click(await screen.findByRole('button', { name: '1998' }));
  // the press handlers are wired in an effect after the draw: let it run before pressing
  await act(async () => undefined);
  fireEvent.click(screen.getByTestId('submit'));
}

describe('signing up', () => {
  /*
   * An address that already has an account is refused with 409
   * REGISTRATION_FAILED, kept vague so nobody can learn which addresses are
   * registered. It used to arrive as a bare error line; it reads now as what
   * it may be, with the two ways on, and still never says the address exists.
   */
  it('offers Log in and Reset password, carrying the address, when the address may already have an account', async () => {
    auth.register.mockResolvedValue({ message: 'unable to register', code: 'REGISTRATION_FAILED' });
    const navigation = renderRegister();
    await signUp('Name.Surname+tag@me.com');

    const notice = await screen.findByTestId('register-may-have-account');
    expect(notice.textContent).toContain('We couldn’t create an account with these details. If you already have one, log in or reset your password.');
    expect(notice.textContent).not.toMatch(/already (registered|in use|exists)/i);
    // the address went to the server as typed, capitals and plus tag and all
    expect(auth.register).toHaveBeenCalledWith(expect.objectContaining({ email: 'Name.Surname+tag@me.com', birthMonth: 3, birthYear: 1998 }));

    await act(async () => undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(navigation.navigate).toHaveBeenLastCalledWith('Login', { email: 'Name.Surname+tag@me.com' });
    fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));
    expect(navigation.navigate).toHaveBeenLastCalledWith('ForgotPassword', { email: 'Name.Surname+tag@me.com' });
  });

  it('says any other refusal on the form, without the account notice', async () => {
    auth.register.mockResolvedValue({ message: 'That username is already taken.', code: 'USERNAME_TAKEN' });
    renderRegister();
    await signUp('name@icloud.com');
    expect(await screen.findByText('That username is already taken.')).toBeTruthy();
    expect(screen.queryByTestId('register-may-have-account')).toBeNull();
  });

  /* a password found in a data leak is about the password, so it is said under it */
  it('says on the password field when the password has been in a data leak', async () => {
    const message = 'This password has shown up in a data leak, so it isn’t safe. Choose a different one.';
    auth.register.mockResolvedValue({ message, code: 'PASSWORD_BREACHED' });
    renderRegister();
    await signUp('name@icloud.com');
    const said = await screen.findByText(message);
    // in the password's own field, beside the box it is about
    expect(said.parentElement!.contains(screen.getByTestId('password'))).toBe(true);
    expect(screen.queryByText('At least 8 characters, including a letter and a number.')).toBeNull();
  });

  it('takes an Apple private relay address without a word from the phone', async () => {
    auth.register.mockResolvedValue(null);
    renderRegister();
    await signUp('x@privaterelay.appleid.com');
    await waitFor(() => expect(auth.register).toHaveBeenCalledWith(expect.objectContaining({ email: 'x@privaterelay.appleid.com' })));
    expect(screen.queryByText('Enter a valid email address')).toBeNull();
  });

  /*
   * The email keyboard, and nothing that rewrites what is typed: an
   * address capitalised or "corrected" by the keyboard is an address the
   * person did not mean.
   */
  it('asks for the email with the email keyboard, no capitals and no autocorrect', () => {
    renderRegister();
    const field = screen.getByTestId('email');
    expect(field.getAttribute('type') ?? field.getAttribute('inputmode')).toMatch(/email/);
    expect(field.getAttribute('autocapitalize')).toBe('none');
    expect(field.getAttribute('autocorrect')).toBe('off');
    expect(field.getAttribute('autocomplete')).toBe('email');
  });
});
