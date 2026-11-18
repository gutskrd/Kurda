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
import { ageRange, birthYearFrom, offsetForAge } from '../../auth/guide/age';
import { RegisterScreen } from './RegisterScreen';

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

/** Waits for the outgoing step to leave. */
async function turned(): Promise<void> {
  await waitFor(() => expect(document.querySelector('[data-testid^="slide-out"]')).toBeNull());
}

async function press(name: string): Promise<void> {
  await turned();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
}

/** Slides the ruler until `age` is under its pointer. */
function chooseAge(age: number): void {
  act(() => {
    fireEvent.scroll(screen.getByTestId('age-ruler-scroll'), { target: { scrollLeft: offsetForAge(age, ageRange().min) } });
  });
}

/** Answers every question as someone `age` years old would, up to the review, and sends them. */
async function signUp(email: string, { send = true, age = 34, name = 'rojda_k' }: { send?: boolean; age?: number; name?: string } = {}) {
  fireEvent.change(screen.getByTestId('username'), { target: { value: name } });
  await press(en['common.continue']);
  // The ruler starts with no age, so slide to one.
  expect(await screen.findByRole('slider')).toBeTruthy();
  chooseAge(age);
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
    await signUp('rojda@example.com');
    await waitFor(() => expect(auth.register).toHaveBeenCalledTimes(1));
    expect(auth.register).toHaveBeenCalledWith({
      email: 'rojda@example.com',
      username: 'rojda_k',
      password: 'berbang2026',
      locale: 'en',
      birthMonth: 3,
      birthYear: birthYearFrom(34, 3),
    });
  });

  // A keyboard that ends a word with a full stop still leaves the address as typed.
  it('writes the name in lowercase as it is typed, and sends it so', async () => {
    auth.register.mockResolvedValue(null);
    renderRegister();
    fireEvent.change(screen.getByTestId('username'), { target: { value: 'Rojda.K' } });
    expect((screen.getByTestId('username') as HTMLInputElement).value).toBe('rojda.k');
    await signUp('rojda@example.com.', { send: false, name: 'ROJDA.K' });
    expect(screen.getByText('rojda.k')).toBeTruthy();
    expect(screen.getByText('rojda@example.com')).toBeTruthy();
    await press(en['auth.register.submit']);
    await waitFor(() => expect(auth.register).toHaveBeenCalledTimes(1));
    expect(auth.register).toHaveBeenCalledWith(expect.objectContaining({ email: 'rojda@example.com', username: 'rojda.k' }));
  });

  it('names a character a username cannot have as it is typed, and keeps it in the field', async () => {
    renderRegister();
    expect(screen.getByTestId('username-line').textContent).toBe('3–30 characters: lowercase letters, ç ê î ş û, numbers, dots and underscores.');
    fireEvent.change(screen.getByTestId('username'), { target: { value: '@rojda' } });
    expect((screen.getByTestId('username') as HTMLInputElement).value).toBe('@rojda');
    expect(screen.getByTestId('username-line').textContent).toBe('“@” can’t be in a username.');
    await press(en['common.continue']);
    expect(screen.getByTestId('step-error').textContent).toBe('“@” can’t be in a username.');
    expect(screen.getByText(en['guide.register.name.question'])).toBeTruthy();
    expect(auth.register).not.toHaveBeenCalled();
  });

  it('waits for Continue to say what more typing may still mend', async () => {
    renderRegister();
    fireEvent.change(screen.getByTestId('username'), { target: { value: 'rojda.' } });
    // The rule stays under the field while a name is still being typed.
    expect(screen.getByTestId('username-line').textContent).toBe(en['username.hint'].replace('{min}', '3').replace('{max}', '30'));
    await press(en['common.continue']);
    expect(screen.getByTestId('step-error').textContent).toBe(en['username.rule.edge']);
  });

  it('types a Kurdish letter from the keys under the field where the caret is', async () => {
    renderRegister();
    const field = screen.getByTestId('username') as HTMLInputElement;
    fireEvent.change(field, { target: { value: 'sr' } });
    field.setSelectionRange(1, 1);
    fireEvent.select(field);
    fireEvent.click(screen.getByRole('button', { name: en['keyboard.bar.type'].replace('{letter}', 'ê') }));
    expect(field.value).toBe('sêr');
    // The five extra letters a username may have, lowercase, with no shift key.
    expect(screen.queryByRole('button', { name: en['keyboard.bar.shift'] })).toBeNull();
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

  // The server reads the birth year as the age, so a preset age would make an adult of anyone who only tapped Continue.
  it('does not go on from the age until the ruler is moved, and chooses none for them', async () => {
    renderRegister();
    fireEvent.change(screen.getByTestId('username'), { target: { value: 'rojda_k' } });
    await press(en['common.continue']);
    await screen.findByRole('slider');
    expect(screen.getByTestId('age-ruler-number').textContent).toBe('–');
    await press(en['common.continue']);
    expect(screen.getByTestId('step-error').textContent).toBe(en['guide.register.age.required']);
    expect(screen.getByText(en['guide.register.age.question'])).toBeTruthy();
    // Sliding to an age removes the message, and then it continues.
    chooseAge(16);
    expect(screen.queryByTestId('step-error')).toBeNull();
    await press(en['common.continue']);
    expect(await screen.findByRole('radio', { name: 'March' })).toBeTruthy();
    expect(auth.register).not.toHaveBeenCalled();
  });

  it('does not go on from the month until one is picked', async () => {
    renderRegister();
    fireEvent.change(screen.getByTestId('username'), { target: { value: 'rojda_k' } });
    await press(en['common.continue']);
    await screen.findByRole('slider');
    chooseAge(34);
    await press(en['common.continue']);
    await screen.findByRole('radio', { name: 'March' });
    await press(en['common.continue']);
    expect(screen.getByTestId('step-error').textContent).toBe(en['guide.register.month.required']);
    expect(screen.getByRole('radio', { name: 'March' })).toBeTruthy();
  });

  // The 409 REGISTRATION_FAILED is deliberately vague so nobody can learn which addresses are registered.
  it('offers Sign in and Reset password, carrying the address, when the address may already have an account', async () => {
    auth.register.mockResolvedValue({ message: 'unable to register', code: 'REGISTRATION_FAILED' });
    const navigation = renderRegister();
    await signUp('Name.Surname+tag@example.com');

    const notice = await screen.findByTestId('register-may-have-account');
    expect(notice.textContent).toContain('We couldn’t create an account with these details. If you already have one, sign in or reset your password.');
    expect(notice.textContent).not.toMatch(/already (registered|in use|exists)/i);
    // The address reaches the server exactly as typed.
    expect(auth.register).toHaveBeenCalledWith(expect.objectContaining({ email: 'Name.Surname+tag@example.com', birthMonth: 3 }));

    await act(async () => undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(navigation.navigate).toHaveBeenLastCalledWith('Login', { email: 'Name.Surname+tag@example.com' });
    fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));
    expect(navigation.navigate).toHaveBeenLastCalledWith('ForgotPassword', { email: 'Name.Surname+tag@example.com' });
  });

  it('goes back to the name when it is taken, with the server’s words and Hevalo’s gentle line', async () => {
    auth.register.mockResolvedValue({ message: 'That username is already taken.', code: 'USERNAME_TAKEN' });
    renderRegister();
    await signUp('name@example.com');
    expect(await screen.findByText('That username is already taken.')).toBeTruthy();
    expect(screen.getByText(en['guide.register.name.question'])).toBeTruthy();
    expect(screen.getByTestId('speech-bubble').textContent).toBe(en['guide.register.name.taken']);
    await turned();
    expect((screen.getByTestId('username') as HTMLInputElement).value).toBe('rojda_k');
    expect(screen.queryByTestId('register-may-have-account')).toBeNull();
  });

  it('goes back to the password when it has been in a data leak', async () => {
    const message = 'This password has shown up in a data leak, so it isn’t safe. Choose a different one.';
    auth.register.mockResolvedValue({ message, code: 'PASSWORD_BREACHED' });
    renderRegister();
    await signUp('name@example.com');
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.getByText(en['guide.register.password.question'])).toBeTruthy();
    await turned();
    expect(screen.getByTestId('password')).toBeTruthy();
  });

  it('says any other refusal under the last step, without the account notice', async () => {
    auth.register.mockResolvedValue({ message: 'Too many accounts from this network.', code: 'SIGNUP_BLOCKED' });
    renderRegister();
    await signUp('name@example.com');
    expect(await screen.findByText('Too many accounts from this network.')).toBeTruthy();
    expect(screen.queryByTestId('register-may-have-account')).toBeNull();
  });

  it('leaves a sign-up for somebody under 13 to the explanation, with no form to try again on', async () => {
    auth.register.mockResolvedValue({ message: 'accounts are for people aged 13 and over', code: 'UNDER_MINIMUM_AGE' });
    renderRegister();
    await signUp('name@example.com', { age: 9 });
    // The age slid to is sent, for the server to refuse.
    await waitFor(() => expect(auth.register).toHaveBeenCalledWith(expect.objectContaining({ birthYear: birthYearFrom(9, 3), birthMonth: 3 })));
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

  // A keyboard that capitalises or corrects an address produces one the person did not mean.
  it('asks for the email with the email keyboard, no capitals and no autocorrect', async () => {
    renderRegister();
    fireEvent.change(screen.getByTestId('username'), { target: { value: 'rojda_k' } });
    await press(en['common.continue']);
    await screen.findByRole('slider');
    chooseAge(34);
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
