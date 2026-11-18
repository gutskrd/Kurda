// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('../feedback/gameFinished', () => ({ reportGameFinished: vi.fn(), leftResults: vi.fn() }));
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { reportGameFinished } from '../feedback/gameFinished';
import { rememberCourseDialect, resetCourseDialect } from '../learn/courseDialect';
import { RhymeTrainingScreen } from './RhymeTrainingScreen';

patchReactNativeWeb({ reduceMotion: true });

const round = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  prompt: 'dar',
  windowMs: 60_000,
  remainingMs: 60_000,
  score: 0,
  accepted: 0,
  status: 'active',
  // a round of training is played alone, so the server pays nothing for it
  xpAwarded: 0,
  ...over,
});

beforeEach(() => vi.mocked(reportGameFinished).mockClear());
afterEach(cleanup);

describe('RhymeTrainingScreen', () => {
  it('reports a round ended early with "End round" as given up, so no rating box follows', async () => {
    testAuth.client = fakeClient({
      'POST /rhyme/training': ok(round()),
      'POST /rhyme/training/r1/end': ok({ game: round({ status: 'ended', remainingMs: 0 }) }),
    });
    renderWithProviders(<RhymeTrainingScreen onExit={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: /^Start/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'End round' }));
    await waitFor(() => expect(reportGameFinished).toHaveBeenCalledWith({ moment: 'other', gaveUp: true }));
  });

  it('reports a round that ran out of time as finished', async () => {
    testAuth.client = fakeClient({
      'POST /rhyme/training': ok(round({ remainingMs: 1000 })),
      'POST /rhyme/training/r1/end': ok({ game: round({ status: 'ended', remainingMs: 0, score: 3, accepted: 1 }) }),
    });
    renderWithProviders(<RhymeTrainingScreen onExit={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: /^Start/ }));
    await waitFor(() => expect(reportGameFinished).toHaveBeenCalledWith({ moment: 'other', gaveUp: false }), { timeout: 3000 });
  });

  it('ends a round on its score, with one quiet line about XP and no XP figure', async () => {
    testAuth.client = fakeClient({
      'POST /rhyme/training': ok(round()),
      'POST /rhyme/training/r1/end': ok({ game: round({ status: 'ended', remainingMs: 0, score: 7, accepted: 3 }) }),
    });
    renderWithProviders(<RhymeTrainingScreen onExit={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: /^Start/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'End round' }));
    // over, whether the clock ran out or it was ended: "time's up" was said of a round ended early too
    expect(await screen.findByRole('heading', { name: 'Round finished' })).toBeTruthy();
    expect(screen.getByText('7 pts · 3 found')).toBeTruthy();
    expect(screen.getByText('Played alone, a game earns no XP. Play online with friends to earn it.')).toBeTruthy();
    // nothing earned is shown, not even a zero
    expect(screen.queryByText(/\+\d+ XP/)).toBeNull();
  });

  it('keeps the rhymes found on the screen once the round is over, and says the score in words, not as pts', async () => {
    testAuth.client = fakeClient({
      'POST /rhyme/training': ok(round()),
      'POST /rhyme/training/r1/guesses': ok({ game: round({ score: 5, accepted: 1 }), result: { accepted: true, quality: 'perfect', points: 5, normalized: 'kar' } }),
      'POST /rhyme/training/r1/end': ok({ game: round({ status: 'ended', remainingMs: 0, score: 5, accepted: 1 }) }),
    });
    renderWithProviders(<RhymeTrainingScreen onExit={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: /^Start/ }));
    expect(await screen.findByText('Points: 0')).toBeTruthy();
    // the field says what it is for, to a screen reader too
    const field = screen.getByLabelText('Your rhyme');
    fireEvent.change(field, { target: { value: 'kar' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('kar')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'End round' }));
    expect(await screen.findByRole('heading', { name: 'Round finished' })).toBeTruthy();
    expect(screen.getByText('kar')).toBeTruthy();
    expect(screen.getByLabelText('Rhymes you found')).toBeTruthy();
  });
});

/*
 * A variety without enough curated prompts would open a round on the other
 * variety's word, or on none: it is left out of the choice, and a choice of
 * one is not shown. The screen opens on the learner's own variety when rounds
 * are offered in it.
 */
describe('Rhyme training, in the varieties it is offered in', () => {
  const availability = (sorani: boolean) =>
    ok({ dialects: { kurmanci: { prompts: 150, available: true }, sorani: { prompts: sorani ? 80 : 0, available: sorani } }, minimum: 40 });

  afterEach(() => {
    resetCourseDialect();
    localStorage.clear();
  });

  it('leaves a variety with no rounds yet out of the choice, so nothing reads “coming soon”', async () => {
    const client = fakeClient({ 'GET /rhyme/availability': availability(false), 'POST /rhyme/training': ok(round()) });
    testAuth.client = client;
    renderWithProviders(<RhymeTrainingScreen onExit={() => undefined} />);

    // a choice of one is no choice: once the server has said, there is nothing to pick
    await waitFor(() => expect(screen.queryByRole('radio', { name: /Soranî/ })).toBeNull());
    expect(screen.queryByRole('radio', { name: 'Kurmancî' })).toBeNull();
    expect(screen.queryByText(/Coming soon/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^Start/ }));
    await waitFor(() => expect(client.calls.find((c) => c.path === '/rhyme/training')?.body).toEqual({ dialect: 'kurmanci' }));
  });

  it('drops a pick made before the server said that variety has no rounds', async () => {
    let answer: (value: ReturnType<typeof availability>) => void = () => undefined;
    const client = fakeClient({ 'GET /rhyme/availability': () => new Promise((resolve) => (answer = resolve)), 'POST /rhyme/training': ok(round()) });
    testAuth.client = client;
    renderWithProviders(<RhymeTrainingScreen onExit={() => undefined} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Soranî' }));
    await act(async () => answer(availability(false)));
    fireEvent.click(screen.getByRole('button', { name: /^Start/ }));
    await waitFor(() => expect(client.calls.find((c) => c.path === '/rhyme/training')?.body).toEqual({ dialect: 'kurmanci' }));
  });

  it('opens on the variety a Soranî learner is learning once rounds are offered in it, and on Kurmancî before', async () => {
    rememberCourseDialect('sorani');
    testAuth.client = fakeClient({ 'GET /rhyme/availability': availability(false) });
    renderWithProviders(<RhymeTrainingScreen onExit={() => undefined} />);
    await waitFor(() => expect(screen.queryByRole('radio', { name: 'Soranî' })).toBeNull());
    expect(screen.getByRole('button', { name: /^Start/ })).toBeTruthy();
    cleanup();

    const sorani = round({ dialect: 'sorani', prompt: 'باران' });
    const client = fakeClient({ 'GET /rhyme/availability': availability(true), 'POST /rhyme/training': ok(sorani) });
    testAuth.client = client;
    renderWithProviders(<RhymeTrainingScreen onExit={() => undefined} />);
    expect(screen.getByRole('radio', { name: 'Soranî' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: /^Start/ }));
    // the round is the Soranî one, and its word reads right to left on an English screen
    const prompt = await screen.findByText('باران');
    expect(client.calls.find((c) => c.path === '/rhyme/training')?.body).toEqual({ dialect: 'sorani' });
    expect(getComputedStyle(prompt).direction).toBe('rtl');
    expect(screen.queryByText(/Coming soon/)).toBeNull();
  });

  it('offers both, as before, when the server cannot say', async () => {
    testAuth.client = fakeClient({ 'GET /rhyme/availability': { ok: false, error: { kind: 'server', message: 'x', status: 500 } } });
    renderWithProviders(<RhymeTrainingScreen onExit={() => undefined} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Soranî' }));
    expect(screen.getByRole('button', { name: /^Start/ })).toBeTruthy();
    expect(screen.queryByText(/Coming soon/)).toBeNull();
  });
});

describe('Rhyme training, once a round is over', () => {
  const baran = (over: Record<string, unknown> = {}) => round({ prompt: 'baran', dialect: 'kurmanci', ...over });
  const missed = [
    { word: 'nan', meanings: { en: 'bread', fr: 'pain' } },
    { word: 'jiyan', meanings: {} },
  ];

  afterEach(() => localStorage.removeItem('kurda_locale_v1'));

  it('lists the rhymes the round missed, each with what it means in the reader’s language', async () => {
    localStorage.setItem('kurda_locale_v1', 'fr');
    testAuth.client = fakeClient({
      'POST /rhyme/training': ok(baran()),
      'POST /rhyme/training/r1/end': ok({ game: baran({ status: 'ended', remainingMs: 0, missed }) }),
    });
    renderWithProviders(<RhymeTrainingScreen onExit={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: /^Commencer/ }));
    // nothing of what was missed while the clock runs
    await screen.findByText('baran');
    expect(screen.queryByText('nan')).toBeNull();

    fireEvent.click(await screen.findByRole('button', { name: 'Terminer la manche' }));
    const list = await screen.findByTestId('missed-rhymes');
    expect(within(list).getByRole('heading', { name: 'Les rimes qui t’ont échappé' })).toBeTruthy();
    expect(within(list).getByText('nan')).toBeTruthy();
    expect(within(list).getByText('pain')).toBeTruthy();
    // a word nobody has written a meaning for is still a rhyme worth knowing
    expect(within(list).getByText('jiyan')).toBeTruthy();
  });

  it('shows no list when there is nothing the round missed', async () => {
    testAuth.client = fakeClient({
      'POST /rhyme/training': ok(baran()),
      'POST /rhyme/training/r1/end': ok({ game: baran({ status: 'ended', remainingMs: 0, missed: [] }) }),
    });
    renderWithProviders(<RhymeTrainingScreen onExit={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: /^Start/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'End round' }));
    expect(await screen.findByRole('heading', { name: 'Round finished' })).toBeTruthy();
    expect(screen.queryByText('Rhymes you missed')).toBeNull();
  });

  it('turns away a word whose ending does all the rhyming, in general words', async () => {
    // malan is mal with an ending: only the ending rhymes with baran
    testAuth.client = fakeClient({
      'POST /rhyme/training': ok(baran()),
      'POST /rhyme/training/r1/guesses': ok({ game: baran(), result: { accepted: false, quality: 'none', points: 0, normalized: 'malan', reason: 'inflected' } }),
    });
    renderWithProviders(<RhymeTrainingScreen onExit={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: /^Start/ }));
    fireEvent.change(await screen.findByLabelText('Your rhyme'), { target: { value: 'malan' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('Not accepted — try another.')).toBeTruthy();
  });
});
