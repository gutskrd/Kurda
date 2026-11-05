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
  stopForAge: vi.fn(),
  logout: vi.fn(),
}));
vi.mock('../../auth/AuthContext', () => ({ useAuth: () => auth }));
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
    await claim('rojda@icloud.com');
    await waitFor(() => expect(auth.claimAccount).toHaveBeenCalledTimes(1));
    expect(auth.claimAccount).toHaveBeenCalledWith({
      email: 'rojda@icloud.com',
      password: 'berbang2026',
      locale: 'en',
      birthMonth: 3,
      birthYear: birthYearFrom(34, 3),
    });
  });

  it('sends a new name when one was chosen', async () => {
    auth.claimAccount.mockResolvedValue(null);
    renderClaim();
    await claim('rojda@icloud.com', { name: 'rojda_k' });
    await waitFor(() => expect(auth.claimAccount).toHaveBeenCalledWith(expect.objectContaining({ username: 'rojda_k' })));
  });

  it('offers Sign in and Reset password, carrying the address, when the address may already have an account', async () => {
    auth.claimAccount.mockResolvedValue({ message: 'unable to register', code: 'REGISTRATION_FAILED' });
    const handlers = renderClaim();
    await claim('rojda@icloud.com');
    const notice = await screen.findByTestId('claim-may-have-account');
    expect(notice.textContent).toContain(en['error.code.registrationFailed']);
    await act(async () => undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(handlers.onSignIn).toHaveBeenCalledWith('rojda@icloud.com');
    fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));
    expect(handlers.onForgotPassword).toHaveBeenCalledWith('rojda@icloud.com');
  });

  it('waits on the age until the ruler is moved, choosing none for the guest', async () => {
    renderClaim();
    await toAge('rojda@icloud.com');
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
    await claim('rojda@icloud.com', { age: 11 });
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
