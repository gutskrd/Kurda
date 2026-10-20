// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('../feedback/gameFinished', () => ({ reportGameFinished: vi.fn(), leftResults: vi.fn(), useRatingBoxInset: () => 0 }));
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { RaceGameView, RaceResultView } from '@kurda/shared';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fail, fakeClient, ok, testAuth } from '../reports/testing/auth';
import { keyboardPrefs } from '../keyboard/prefs';
import { leftResults, reportGameFinished } from '../feedback/gameFinished';
import { RaceScreen } from './RaceScreen';

patchReactNativeWeb({ reduceMotion: true });

function game(over: Partial<RaceGameView> = {}): RaceGameView {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    text: { id: 't1', title: 'Welat', body: 'ez ji welat', difficulty: 1, language: 'kmr' },
    dialect: 'kurmanci',
    accentMode: 'forgiving',
    startedAt: '2026-10-13T10:00:00.000Z',
    ...over,
  };
}

function result(over: Partial<RaceResultView> = {}): RaceResultView {
  return {
    correctChars: 11,
    accuracy: 1,
    wpm: 42.3,
    score: 42,
    perfect: true,
    implausible: false,
    accentMode: 'forgiving',
    accentMisses: 0,
    accented: 0,
    errors: 0,
    elapsedMs: 3100,
    xpAwarded: 5,
    personalBest: false,
    ...over,
  };
}

const FINISH = 'POST /race/11111111-1111-4111-8111-111111111111/finish';

function field(): HTMLInputElement {
  return screen.getByLabelText('Type the text') as HTMLInputElement;
}

/** The field's text changing to `value` in one go — one keystroke, or a paste. */
function type(value: string): void {
  fireEvent.change(field(), { target: { value } });
}

/** Typing `text` one key at a time onto what is there. */
function typeKeys(text: string): void {
  for (const ch of text) type(field().value + ch);
}

async function startRaceWith(routes: Parameters<typeof fakeClient>[0]) {
  const client = fakeClient(routes);
  testAuth.client = client;
  renderWithProviders(<RaceScreen onExit={() => undefined} />);
  fireEvent.click(screen.getByRole('button', { name: 'Start race' }));
  await screen.findByLabelText('Type the text');
  return client;
}

beforeEach(() => {
  localStorage.clear();
  keyboardPrefs.update({ accentMode: 'forgiving', keyBar: true, backtick: true, guideShown: true, raceDialect: 'kurmanci' });
  vi.mocked(reportGameFinished).mockClear();
});
afterEach(cleanup);

describe('RaceScreen', () => {
  it('starts a race in the chosen variety and accent mode', async () => {
    keyboardPrefs.update({ accentMode: 'strict' });
    const client = await startRaceWith({ 'POST /race': ok(game({ accentMode: 'strict' })) });
    expect(client.calls.find((c) => c.path === '/race')?.body).toEqual({ length: 1, dialect: 'kurmanci', accentMode: 'strict' });
  });

  it('reads a letter put in the middle as the next letter at the end', async () => {
    const client = await startRaceWith({ 'POST /race': ok(game()), [FINISH]: ok(result()) });
    typeKeys('ez ji');
    // the cursor moved to offset 3 and "w" went in there
    type('ez wji');
    expect(field().value).toBe('ez jiw');
    expect(client.calls.some((c) => c.path.endsWith('/finish'))).toBe(false);
  });

  it('refuses a paste and says why, keeping what was typed', async () => {
    await startRaceWith({ 'POST /race': ok(game()) });
    typeKeys('ez');
    type('ez ji welat');
    expect(field().value).toBe('ez');
    expect(screen.getByText('Pasting is off in a race — type it out.')).toBeTruthy();
  });

  it('types the key bar’s letters at the end, and capitals after shift', async () => {
    await startRaceWith({ 'POST /race': ok(game()) });
    typeKeys('ez');
    fireEvent.click(screen.getByRole('button', { name: 'Type ê' }));
    expect(field().value).toBe('ezê');
    fireEvent.click(screen.getByRole('button', { name: 'Capital letter' }));
    fireEvent.click(screen.getByRole('button', { name: 'Type Ş' }));
    expect(field().value).toBe('ezêŞ');
  });

  it('hides the key bar when it is switched off', async () => {
    keyboardPrefs.update({ keyBar: false });
    await startRaceWith({ 'POST /race': ok(game()) });
    expect(screen.queryByRole('button', { name: 'Type ê' })).toBeNull();
  });

  it('finishes by itself at the end of the text, once, and reports the finished game', async () => {
    const client = await startRaceWith({ 'POST /race': ok(game()), [FINISH]: ok(result({ personalBest: true })) });
    typeKeys('ez ji welat');
    await screen.findByText('Perfect run!');
    expect(client.calls.filter((c) => c.path.endsWith('/finish'))).toHaveLength(1);
    expect(client.calls.find((c) => c.path.endsWith('/finish'))?.body).toEqual({ typed: 'ez ji welat' });
    expect(screen.getByText('Personal best!')).toBeTruthy();
    expect(reportGameFinished).toHaveBeenCalledWith({ moment: 'personal_best', gaveUp: false });
  });

  it('shows a failed finish in the race, and lets it be finished again', async () => {
    let calls = 0;
    const client = await startRaceWith({
      'POST /race': ok(game()),
      [FINISH]: () => (++calls === 1 ? fail({ kind: 'server', status: 500, message: 'down' }) : ok(result())),
    });
    /*
     * Given up inside act(), so the failed finish has been shown and the
     * button made pressable again — on screen and in its press handler, which
     * hears it in an effect after the draw — before it is pressed a second
     * time. Waiting only for it to look enabled let a press land in between.
     */
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Give up and score' }));
    });
    expect(screen.getByRole('button', { name: 'Give up and score' }).getAttribute('aria-disabled')).not.toBe('true');
    expect(screen.getByLabelText('Type the text')).toBeTruthy();
    expect(document.body.textContent).toMatch(/server|wrong|try again/i);
    fireEvent.click(screen.getByRole('button', { name: 'Give up and score' }));
    await screen.findByText('Race again');
    expect(client.calls.filter((c) => c.path.endsWith('/finish'))).toHaveLength(2);
    // giving up is never a moment for the rating box
    expect(reportGameFinished).toHaveBeenCalledWith({ moment: 'other', gaveUp: true });
  });

  it('scores a finished race again when scoring it failed, never as given up', async () => {
    let calls = 0;
    const client = await startRaceWith({
      'POST /race': ok(game()),
      [FINISH]: () => (++calls === 1 ? fail({ kind: 'server', status: 500, message: 'down' }) : ok(result())),
    });
    typeKeys('ez ji welat');
    const retry = await screen.findByRole('button', { name: 'Try again' });
    expect(screen.queryByRole('button', { name: 'Give up and score' })).toBeNull();
    // the field is back, with the keyboard
    await waitFor(() => expect(document.activeElement).toBe(field()));
    fireEvent.click(retry);
    await screen.findByText('Race again');
    expect(client.calls.filter((c) => c.path.endsWith('/finish'))).toHaveLength(2);
    expect(reportGameFinished).toHaveBeenCalledWith({ moment: 'other', gaveUp: false });
  });

  it('offers a new race, not another finish, when the server says the race is already over', async () => {
    await startRaceWith({
      'POST /race': ok(game()),
      [FINISH]: fail({ code: 'ALREADY_FINISHED', status: 409 }),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Give up and score' }));
    expect(await screen.findByText('This race was already over. Start a new one.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Give up and score' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Race again' })).toBeTruthy();
  });

  it('starts in the accent mode chosen in the guide that opened before it', async () => {
    keyboardPrefs.update({ guideShown: false, accentMode: 'strict' });
    const client = fakeClient({ 'POST /race': ok(game()) });
    testAuth.client = client;
    renderWithProviders(<RaceScreen onExit={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start race' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Make accents forgiving' }));
    await screen.findByLabelText('Type the text');
    expect(client.calls.find((c) => c.path === '/race')?.body).toMatchObject({ accentMode: 'forgiving' });
  });

  it('gives a screen reader a way back to typing', async () => {
    await startRaceWith({ 'POST /race': ok(game()) });
    field().blur();
    fireEvent.click(screen.getByRole('button', { name: 'Tap here to type' }));
    expect(document.activeElement).toBe(field());
  });

  it('starts again from nothing: the old text and typing are gone before the new race arrives', async () => {
    let starts = 0;
    let release: (v: unknown) => void = () => undefined;
    const client = await startRaceWith({
      'POST /race': () => {
        starts++;
        if (starts === 1) return ok(game());
        return new Promise((r) => (release = r)).then(() => ok(game({ id: '22222222-2222-4222-8222-222222222222' })));
      },
      [FINISH]: ok(result()),
    });
    typeKeys('ez ji welat');
    await screen.findByText('Race again');
    fireEvent.click(screen.getByRole('button', { name: 'Race again' }));
    // the rating box, if it came, went with the results
    expect(leftResults).toHaveBeenCalled();
    // while the next text loads there is no field to type into the old race
    await waitFor(() => expect(screen.queryByLabelText('Type the text')).toBeNull());
    await act(async () => release(undefined));
    await screen.findByLabelText('Type the text');
    expect(field().value).toBe('');
    expect(client.calls.filter((c) => c.path === '/race')).toHaveLength(2);
  });

  it('says so when there is no text to race yet', async () => {
    testAuth.client = fakeClient({ 'POST /race': fail({ status: 503, code: 'EMPTY_RACE_POOL', kind: 'server' }) });
    renderWithProviders(<RaceScreen onExit={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start race' }));
    expect(await screen.findByText(/no race texts|not.*yet/i)).toBeTruthy();
  });

  it('opens the keyboard guide before the first Kurmancî race, and starts the race when it closes', async () => {
    keyboardPrefs.update({ guideShown: false });
    const client = fakeClient({ 'POST /race': ok(game()) });
    testAuth.client = client;
    renderWithProviders(<RaceScreen onExit={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start race' }));
    expect(await screen.findByText('Get the Kurmancî keyboard')).toBeTruthy();
    // the clock has not started: nothing was asked of the server yet
    expect(client.calls.filter((c) => c.path === '/race')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await screen.findByLabelText('Type the text');
    expect(keyboardPrefs.current.guideShown).toBe(true);
  });

  it('offers the keyboard guide after a race with accents left out', async () => {
    await startRaceWith({
      'POST /race': ok(game()),
      [FINISH]: ok(result({ accented: 5, accentMisses: 3, perfect: false })),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Give up and score' }));
    expect(await screen.findByText('Accents: 2 of 5 typed with their accent')).toBeTruthy();
    // the deer holds up the letters of the race's own variety
    expect(screen.getByText('ç ê î')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Accents giving you trouble/ }));
    expect(await screen.findByText('Get the Kurmancî keyboard')).toBeTruthy();
  });
});
