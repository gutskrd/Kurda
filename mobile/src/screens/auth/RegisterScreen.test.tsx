// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../../reports/testing/stubs'));
vi.mock('@react-navigation/native', () => import('../../auth/guide/testing/navigation'));
const auth = vi.hoisted(() => ({
  register: vi.fn(),
  stopForAge: vi.fn(),
}));
vi.mock('../../auth/AuthContext', () => ({ useAuth: () => auth }));
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { TRANSLATIONS } from '../../i18n/translations';
import { renderWithProviders } from '../../reports/testing/harness';
import { patchReactNativeWeb } from '../../reports/testing/rnWebPatches';
import { STARTING_AGE, birthYearFrom } from '../../auth/guide/age';
import { RegisterScreen } from './RegisterScreen';

/*
 * Signing up one question at a time: the name, the age on the ruler, the
 * month, the address, the password, and the last look with the rules; what
 * the server gets is exactly what the one form sent; and its refusals go
 * back to the question they are about, or become the calm notice.
 */

patchReactNativeWeb({ reduceMotion: true });
const en = TRANSLATIONS.en;

afterEach(() => {
  cleanup();
  auth.register.mockReset();
  auth.stopForAge.mockReset();
});

function renderRegister() {
  const navigation = { navigate: vi.fn(), goBack: vi.fn(), canGoBack: () => false };
  const props = { navigation, route: { key: 'r', name: 'Register' } } as unknown as Parameters<typeof RegisterScreen>[0];
  renderWithProviders(<RegisterScreen {...props} />);
  return navigation;
}

/** a step on its way out has gone */
async function turned(): Promise<void> {
  await waitFor(() => expect(document.querySelector('[data-testid^="slide-out"]')).toBeNull());
}

async function press(name: string): Promise<void> {
  await turned();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
}

/** Answers the questions as somebody signing up with an Apple address would, up to the last look, and sends them. */
async function signUp(email: string, { send = true }: { send?: boolean } = {}) {
  fireEvent.change(screen.getByTestId('username'), { target: { value: 'rojda_k' } });
  await press(en['common.continue']);
  // the ruler rests on an adult's age, which is kept as it is
  expect(await screen.findByRole('slider')).toBeTruthy();
  await press(en['common.continue']);
  fireEvent.click(await screen.findByRole('radio', { name: 'March' }));
  await press(en['common.continue']);
  fireEvent.change(await screen.findByTestId('email'), { target: { value: email } });
  await press(en['common.continue']);
  fireEvent.change(await screen.findByTestId('password'), { target: { value: 'berbang2026' } });
  await press(en['common.continue']);
  expect(await screen.findByText(en['auth.legal.terms'])).toBeTruthy();
  if (send) await press(en['auth.register.submit']);
}

describe('signing up', () => {
  it('asks one question at a time, Hevalo guiding, and sends exactly what the form sent', async () => {
    auth.register.mockResolvedValue(null);
    renderRegister();
    expect(screen.getByText(en['guide.register.name.question'])).toBeTruthy();
    expect(screen.getByTestId('speech-bubble').textContent).toBe(en['guide.register.name.says']);
    await signUp('rojda@icloud.com');
    await waitFor(() => expect(auth.register).toHaveBeenCalledTimes(1));
    expect(auth.register).toHaveBeenCalledWith({
      email: 'rojda@icloud.com',
      username: 'rojda_k',
      password: 'berbang2026',
      locale: 'en',
      birthMonth: 3,
      birthYear: birthYearFrom(STARTING_AGE, 3),
    });
  });

  it('does not go on from a name that breaks the rules, and says why under the field', async () => {
    renderRegister();
    fireEvent.change(screen.getByTestId('username'), { target: { value: 'ro' } });
    await press(en['common.continue']);
    expect(screen.getByTestId('step-error').textContent).toBe('At least 3 characters.');
    expect(screen.getByText(en['guide.register.name.question'])).toBeTruthy();
    expect(screen.getByTestId('speech-bubble').textContent).toBe(en['guide.refused.says']);
    expect(auth.register).not.toHaveBeenCalled();
  });

  it('does not go on from the month until one is picked', async () => {
    renderRegister();
    fireEvent.change(screen.getByTestId('username'), { target: { value: 'rojda_k' } });
    await press(en['common.continue']);
    await screen.findByRole('slider');
    await press(en['common.continue']);
    await screen.findByRole('radio', { name: 'March' });
    await press(en['common.continue']);
    expect(screen.getByTestId('step-error').textContent).toBe(en['guide.register.month.required']);
    expect(screen.getByRole('radio', { name: 'March' })).toBeTruthy();
  });

  /*
   * An address that already has an account is refused with 409
   * REGISTRATION_FAILED, kept vague so nobody can learn which addresses are
   * registered. It reads as what it may be, with the two ways on, and still
   * never says the address exists.
   */
  it('offers Log in and Reset password, carrying the address, when the address may already have an account', async () => {
    auth.register.mockResolvedValue({ message: 'unable to register', code: 'REGISTRATION_FAILED' });
    const navigation = renderRegister();
    await signUp('Name.Surname+tag@me.com');

    const notice = await screen.findByTestId('register-may-have-account');
    expect(notice.textContent).toContain('We couldn’t create an account with these details. If you already have one, log in or reset your password.');
    expect(notice.textContent).not.toMatch(/already (registered|in use|exists)/i);
    // the address went to the server as typed, capitals and plus tag and all
    expect(auth.register).toHaveBeenCalledWith(expect.objectContaining({ email: 'Name.Surname+tag@me.com', birthMonth: 3 }));

    await act(async () => undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(navigation.navigate).toHaveBeenLastCalledWith('Login', { email: 'Name.Surname+tag@me.com' });
    fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));
    expect(navigation.navigate).toHaveBeenLastCalledWith('ForgotPassword', { email: 'Name.Surname+tag@me.com' });
  });

  it('goes back to the name when it is taken, with the server’s words and Hevalo’s gentle line', async () => {
    auth.register.mockResolvedValue({ message: 'That username is already taken.', code: 'USERNAME_TAKEN' });
    renderRegister();
    await signUp('name@icloud.com');
    expect(await screen.findByText('That username is already taken.')).toBeTruthy();
    expect(screen.getByText(en['guide.register.name.question'])).toBeTruthy();
    expect(screen.getByTestId('speech-bubble').textContent).toBe(en['guide.register.name.taken']);
    await turned();
    expect((screen.getByTestId('username') as HTMLInputElement).value).toBe('rojda_k');
    expect(screen.queryByTestId('register-may-have-account')).toBeNull();
  });

  /* a password found in a data leak is about the password, so it is said on its step */
  it('goes back to the password when it has been in a data leak', async () => {
    const message = 'This password has shown up in a data leak, so it isn’t safe. Choose a different one.';
    auth.register.mockResolvedValue({ message, code: 'PASSWORD_BREACHED' });
    renderRegister();
    await signUp('name@icloud.com');
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.getByText(en['guide.register.password.question'])).toBeTruthy();
    await turned();
    expect(screen.getByTestId('password')).toBeTruthy();
  });

  it('says any other refusal under the last step, without the account notice', async () => {
    auth.register.mockResolvedValue({ message: 'Too many accounts from this network.', code: 'SIGNUP_BLOCKED' });
    renderRegister();
    await signUp('name@icloud.com');
    expect(await screen.findByText('Too many accounts from this network.')).toBeTruthy();
    expect(screen.queryByTestId('register-may-have-account')).toBeNull();
  });

  it('leaves a sign-up for somebody under 13 to the explanation, with no form to try again on', async () => {
    auth.register.mockResolvedValue({ message: 'accounts are for people aged 13 and over', code: 'UNDER_MINIMUM_AGE' });
    renderRegister();
    await signUp('name@icloud.com');
    await waitFor(() => expect(auth.stopForAge).toHaveBeenCalledWith('refused'));
    expect(screen.queryByText('accounts are for people aged 13 and over')).toBeNull();
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
  it('asks for the email with the email keyboard, no capitals and no autocorrect', async () => {
    renderRegister();
    fireEvent.change(screen.getByTestId('username'), { target: { value: 'rojda_k' } });
    await press(en['common.continue']);
    await screen.findByRole('slider');
    await press(en['common.continue']);
    fireEvent.click(await screen.findByRole('radio', { name: 'March' }));
    await press(en['common.continue']);
    const field = await screen.findByTestId('email');
    expect(field.getAttribute('type') ?? field.getAttribute('inputmode')).toMatch(/email/);
    expect(field.getAttribute('autocapitalize')).toBe('none');
    expect(field.getAttribute('autocorrect')).toBe('off');
    expect(field.getAttribute('autocomplete')).toBe('email');
  });
});
