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
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { Alert } from 'react-native';
import { ageRange, birthYearFrom, offsetForAge } from '../../auth/guide/age';
import { fail, fakeClient, ok, testAuth } from '../../reports/testing/auth';
import { renderWithProviders } from '../../reports/testing/harness';
import { patchReactNativeWeb } from '../../reports/testing/rnWebPatches';
import { BirthDatePromptScreen } from './BirthDatePromptScreen';

/*
 * The birth month an account came in without, asked the way sign-up asks it:
 * how old on the ruler, then which month; what the two come to shown back
 * before it is saved once; and the server's answers, each where it belongs.
 */

patchReactNativeWeb({ reduceMotion: true });

/** What the screen asks of the session, as the stand-in session answers it. */
type Session = typeof testAuth & {
  refreshUser: () => Promise<void>;
  stopForAge: (kind: 'refused' | 'closed') => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<{ ok: true; graceDays: number } | { ok: false; message: string }>;
};

function held(answer: Parameters<typeof fakeClient>[0] = { 'POST /me/birth-date': ok({}) }): Session & { client: ReturnType<typeof fakeClient> } {
  const session = testAuth as Session & { client: ReturnType<typeof fakeClient> };
  session.client = fakeClient(answer);
  session.user = { id: 'me', username: 'rojda', email: 'rojda@example.com', displayName: null, profilePhotoUrl: null, emailVerified: true };
  session.refreshUser = vi.fn(async () => undefined);
  session.stopForAge = vi.fn(async () => undefined);
  session.logout = vi.fn(async () => undefined);
  session.deleteAccount = vi.fn(async () => ({ ok: true as const, graceDays: 14 }));
  return session;
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

/** Slides the ruler until `age` is under its pointer. */
function chooseAge(age: number): void {
  act(() => {
    fireEvent.scroll(screen.getByTestId('age-ruler-scroll'), { target: { scrollLeft: offsetForAge(age, ageRange().min) } });
  });
}

/** Answers both questions as somebody `age` years old born in March would, up to Save. */
async function answer(age: number): Promise<void> {
  chooseAge(age);
  await press('Continue');
  fireEvent.click(await screen.findByRole('radio', { name: 'March' }));
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('the birth month an account came in without', () => {
  it('is asked the way sign-up asks it: how old, in Hevalo’s words, with no age chosen for anybody', async () => {
    const session = held();
    renderWithProviders(<BirthDatePromptScreen />);
    expect(screen.getByRole('heading', { name: 'How old are you?' })).toBeTruthy();
    expect(screen.getByText('We ask everyone. Only the month and year are kept, promise.')).toBeTruthy();
    // nothing is answered by tapping on
    await press('Continue');
    expect(screen.getByText('Pick your age on the ruler to go on.')).toBeTruthy();
    expect(session.client.calls).toEqual([]);
  });

  it('shows what the two answers come to before it is saved, and sends exactly that', async () => {
    const session = held();
    renderWithProviders(<BirthDatePromptScreen />);
    await answer(34);
    const year = birthYearFrom(34, 3);
    // read over once: it cannot be changed later
    expect(screen.getByTestId('birth-summary').textContent).toContain(`March ${year}`);
    expect(screen.getByText('Check it before you save: it can’t be changed later.')).toBeTruthy();
    await press('Save');
    await waitFor(() => expect(session.client.calls).toEqual([{ method: 'POST', path: '/me/birth-date', body: { birthYear: year, birthMonth: 3 } }]));
    // the gate lifts once the account no longer says a birth month is needed
    await waitFor(() => expect(session.refreshUser).toHaveBeenCalledTimes(1));
  });

  it('asks for a month before anything is sent', async () => {
    const session = held();
    renderWithProviders(<BirthDatePromptScreen />);
    chooseAge(20);
    await press('Continue');
    await screen.findByRole('radio', { name: 'March' });
    expect(screen.queryByTestId('birth-summary')).toBeNull();
    await press('Save');
    expect(screen.getByText('Pick a month to go on.')).toBeTruthy();
    expect(session.client.calls).toEqual([]);
  });

  it('hands over to the explanation when the answer is under 13, with nothing said under the field', async () => {
    const session = held({ 'POST /me/birth-date': fail({ code: 'UNDER_MINIMUM_AGE' }) });
    renderWithProviders(<BirthDatePromptScreen />);
    await answer(9);
    await press('Save');
    await waitFor(() => expect(session.stopForAge).toHaveBeenCalledWith('closed'));
    expect(screen.queryByTestId('step-error')).toBeNull();
  });

  it('simply goes on when it was answered from another device meanwhile', async () => {
    const session = held({ 'POST /me/birth-date': fail({ code: 'BIRTH_DATE_ALREADY_SET' }) });
    renderWithProviders(<BirthDatePromptScreen />);
    await answer(34);
    await press('Save');
    await waitFor(() => expect(session.refreshUser).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('step-error')).toBeNull();
  });

  it('says why when it could not be saved, and stays on the question', async () => {
    held({ 'POST /me/birth-date': fail({ code: 'NETWORK', message: 'Can’t reach Hevalo right now.' }) });
    renderWithProviders(<BirthDatePromptScreen />);
    await answer(34);
    await press('Save');
    expect(await screen.findByTestId('step-error')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
  });
});

describe('leaving instead', () => {
  it('can be left by signing out, on either step', async () => {
    const session = held();
    renderWithProviders(<BirthDatePromptScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(session.logout).toHaveBeenCalledTimes(1);
    chooseAge(34);
    await press('Continue');
    await screen.findByRole('radio', { name: 'March' });
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(session.logout).toHaveBeenCalledTimes(2);
  });

  it('offers to delete the account without answering first', () => {
    held();
    const asked = vi.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    renderWithProviders(<BirthDatePromptScreen />);
    fireEvent.click(screen.getByTestId('delete-account'));
    expect(asked).toHaveBeenCalledTimes(1);
  });
});
