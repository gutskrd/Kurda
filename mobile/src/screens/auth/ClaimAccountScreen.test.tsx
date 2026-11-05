// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../../reports/testing/stubs'));
vi.mock('@react-navigation/native', () => import('../../auth/guide/testing/navigation'));
const auth = vi.hoisted(() => ({
  user: { id: 'g', username: 'heval4821930', email: null, guest: true, emailVerified: true } as { username: string; guest: boolean } | null,
  claimAccount: vi.fn(),
  oauthSignIn: vi.fn(),
  stopForAge: vi.fn(),
  logout: vi.fn(),
}));
vi.mock('../../auth/AuthContext', () => ({ useAuth: () => auth }));
// a build without Google's client ids, unless a test says it has them
const google = vi.hoisted(() => ({ configured: false, signIn: vi.fn() }));
vi.mock('../../auth/google', () => ({
  signInWithGoogle: google.signIn,
  get isGoogleConfigured() {
    return google.configured;
  },
}));
const apple = vi.hoisted(() => ({ available: false, signInAsync: vi.fn() }));
// Apple's sheet is native: its button is a plain one here, and the sheet answers what each test says
vi.mock('expo-apple-authentication', async () => {
  const { createElement } = await import('react');
  return {
    isAvailableAsync: async () => apple.available,
    signInAsync: apple.signInAsync,
    AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
    AppleAuthenticationButtonType: { SIGN_IN: 0, CONTINUE: 1 },
    AppleAuthenticationButtonStyle: { WHITE: 0, WHITE_OUTLINE: 1, BLACK: 2 },
    AppleAuthenticationButton: ({ onPress }: { onPress: () => void }) =>
      createElement('button', { type: 'button', onClick: onPress }, 'Continue with Apple'),
  };
});
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { TRANSLATIONS } from '../../i18n/translations';
import { renderWithProviders } from '../../reports/testing/harness';
import { patchReactNativeWeb } from '../../reports/testing/rnWebPatches';
import { ageRange, birthYearFrom, offsetForAge } from '../../auth/guide/age';
import { ClaimAccountScreen } from './ClaimAccountScreen';

/*
 * A guest making the account their own, one question at a time: the name
 * they were given, kept or changed; the address and a password; the age and
 * the month; and the last look with the rules. The claim sends what the form
 * sent, the name only when it changed.
 */

patchReactNativeWeb({ reduceMotion: true });
const en = TRANSLATIONS.en;

afterEach(() => {
  cleanup();
  google.configured = false;
  google.signIn.mockReset();
  apple.available = false;
  apple.signInAsync.mockReset();
  auth.oauthSignIn.mockReset();
  auth.claimAccount.mockReset();
  auth.stopForAge.mockReset();
  auth.logout.mockReset();
});

function renderClaim() {
  const handlers = { onExit: vi.fn(), onSignIn: vi.fn(), onForgotPassword: vi.fn() };
  renderWithProviders(<ClaimAccountScreen {...handlers} />);
  return handlers;
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

/** Slides the ruler until `age` is under its pointer. */
function chooseAge(age: number): void {
  act(() => {
    fireEvent.scroll(screen.getByTestId('age-ruler-scroll'), { target: { scrollLeft: offsetForAge(age, ageRange().min) } });
  });
}

/** Up to the age: keeps the name (or types `name`), then gives the address and a password. */
async function toAge(email: string, name?: string) {
  if (name !== undefined) fireEvent.change(screen.getByTestId('username'), { target: { value: name } });
  await press(en['common.continue']);
  fireEvent.change(await screen.findByTestId('email'), { target: { value: email } });
  await press(en['common.continue']);
  fireEvent.change(await screen.findByTestId('password'), { target: { value: 'berbang2026' } });
  await press(en['common.continue']);
  await screen.findByRole('slider');
}

/** Keeps the name (or types `name`), then answers the rest as somebody `age` years old and makes the account. */
async function claim(email: string, { name, age = 34 }: { name?: string; age?: number } = {}) {
  await toAge(email, name);
  // the ruler starts with no age, so it is slid to one
  chooseAge(age);
  await press(en['common.continue']);
  fireEvent.click(await screen.findByRole('radio', { name: 'March' }));
  await press(en['common.continue']);
  await screen.findByText(en['auth.legal.terms']);
  await press(en['guest.createAccount']);
}

describe('claiming the guest account', () => {
  it('starts on the name the guest was given, and sends the claim without it when it is kept', async () => {
    auth.claimAccount.mockResolvedValue(null);
    renderClaim();
    expect((screen.getByTestId('username') as HTMLInputElement).value).toBe('heval4821930');
    expect(screen.getByTestId('speech-bubble').textContent).toBe('You’ve been heval4821930 so far. Keep it, or pick a new one.');
    await claim('rojda@example.com');
    await waitFor(() => expect(auth.claimAccount).toHaveBeenCalledTimes(1));
    expect(auth.claimAccount).toHaveBeenCalledWith({
      email: 'rojda@example.com',
      password: 'berbang2026',
      locale: 'en',
      birthMonth: 3,
      birthYear: birthYearFrom(34, 3),
    });
  });

  it('sends a new name when one was chosen', async () => {
    auth.claimAccount.mockResolvedValue(null);
    renderClaim();
    await claim('rojda@example.com', { name: 'rojda_k' });
    await waitFor(() => expect(auth.claimAccount).toHaveBeenCalledWith(expect.objectContaining({ username: 'rojda_k' })));
  });

  it('offers Sign in and Reset password, carrying the address, when the address may already have an account', async () => {
    auth.claimAccount.mockResolvedValue({ message: 'unable to register', code: 'REGISTRATION_FAILED' });
    const handlers = renderClaim();
    await claim('rojda@example.com');
    const notice = await screen.findByTestId('claim-may-have-account');
    expect(notice.textContent).toContain(en['error.code.registrationFailed']);
    await act(async () => undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(handlers.onSignIn).toHaveBeenCalledWith('rojda@example.com');
    fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));
    expect(handlers.onForgotPassword).toHaveBeenCalledWith('rojda@example.com');
  });

  it('waits on the age until the ruler is moved, choosing none for the guest', async () => {
    renderClaim();
    await toAge('rojda@example.com');
    expect(screen.getByTestId('age-ruler-number').textContent).toBe('–');
    await press(en['common.continue']);
    expect(screen.getByTestId('step-error').textContent).toBe(en['guide.register.age.required']);
    expect(screen.getByText(en['guide.register.age.question'])).toBeTruthy();
    chooseAge(15);
    await press(en['common.continue']);
    expect(await screen.findByRole('radio', { name: 'March' })).toBeTruthy();
    expect(auth.claimAccount).not.toHaveBeenCalled();
  });

  it('ends the guest session and leaves the explanation when the guest is under 13', async () => {
    auth.claimAccount.mockResolvedValue({ message: 'accounts are for people aged 13 and over', code: 'UNDER_MINIMUM_AGE' });
    renderClaim();
    await claim('rojda@example.com', { age: 11 });
    await waitFor(() => expect(auth.claimAccount).toHaveBeenCalledWith(expect.objectContaining({ birthYear: birthYearFrom(11, 3), birthMonth: 3 })));
    await waitFor(() => expect(auth.stopForAge).toHaveBeenCalledWith('refused'));
    expect(auth.logout).toHaveBeenCalledTimes(1);
  });

  it('leaves from the first question by the way it came, and offers the sign-in for an account that exists', async () => {
    const handlers = renderClaim();
    fireEvent.click(screen.getByRole('button', { name: en['welcome.haveAccount'] }));
    expect(handlers.onSignIn).toHaveBeenCalledWith();
    await press(en['common.back']);
    expect(handlers.onExit).toHaveBeenCalledTimes(1);
  });
});

/*
 * Where the phone offers Apple or Google, the claim opens on the same choice
 * the sign-in screen gives: either one makes this account the guest's (the
 * server claims the guest on a provider sign-in), and Continue with email
 * goes on to the questions.
 */
describe('claiming the guest account with Apple or Google', () => {
  it('opens on the choice, and claims the account through Google', async () => {
    google.configured = true;
    google.signIn.mockResolvedValue({ kind: 'success', idToken: 'google-id-token' });
    auth.oauthSignIn.mockResolvedValue(null);
    renderClaim();
    expect(screen.getByText(en['guide.claim.method.question'])).toBeTruthy();
    expect(screen.getByTestId('speech-bubble').textContent).toBe(en['guide.claim.method.says']);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: en['welcome.google'] }));
    });
    expect(auth.oauthSignIn).toHaveBeenCalledWith('google', 'google-id-token');
    expect(auth.claimAccount).not.toHaveBeenCalled();
  });

  it('claims the account through Apple where the phone has it, with the code and the shared name', async () => {
    google.configured = true;
    apple.available = true;
    apple.signInAsync.mockResolvedValue({
      user: '001234.abcdef',
      state: null,
      fullName: { namePrefix: null, givenName: 'Rojda', middleName: null, familyName: null, nameSuffix: null, nickname: null },
      email: null,
      realUserStatus: 1,
      identityToken: 'identity-token-from-apple',
      authorizationCode: 'c1a2b3.0.authorization-code',
    });
    auth.oauthSignIn.mockResolvedValue(null);
    renderClaim();
    const button = await screen.findByRole('button', { name: 'Continue with Apple' });
    await act(async () => {
      fireEvent.click(button);
    });
    expect(auth.oauthSignIn).toHaveBeenCalledWith('apple', 'identity-token-from-apple', {
      authorizationCode: 'c1a2b3.0.authorization-code',
      fullName: 'Rojda',
    });
  });

  it('goes on to the email questions from Continue with email, with the sign-in on the first step only', async () => {
    google.configured = true;
    const handlers = renderClaim();
    fireEvent.click(screen.getByRole('button', { name: en['welcome.haveAccount'] }));
    expect(handlers.onSignIn).toHaveBeenCalledWith();
    await press(en['welcome.email']);
    expect(await screen.findByText(en['guide.claim.name.question'])).toBeTruthy();
    await turned();
    expect(screen.queryByRole('button', { name: en['welcome.haveAccount'] })).toBeNull();
    expect(google.signIn).not.toHaveBeenCalled();
  });

  it('asks only for the email account where neither Apple nor Google is offered', () => {
    renderClaim();
    expect(screen.queryByText(en['guide.claim.method.question'])).toBeNull();
    expect(screen.getByText(en['guide.claim.name.question'])).toBeTruthy();
  });
});
