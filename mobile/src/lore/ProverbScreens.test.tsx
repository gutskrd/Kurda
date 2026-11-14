// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProverbRoundItemView, SoloItemState } from '@kurda/shared';
import { fakeClient, fail, ok, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { navigation } from '../play/testing/navigation';
import { ProverbsScreen } from './ProverbsScreen';
import { ProverbScreen } from './ProverbScreen';
import { ProverbRoundScreen } from './ProverbRoundScreen';
import { PROVERBS, proverb } from './test/fixtures';

vi.hoisted(() => {
  window.matchMedia ??= ((media: string) => ({
    matches: false,
    media,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
});

vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
vi.mock('../net/usePullRefresh', () => import('../net/testing/pullRefresh'));

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});
afterEach(cleanup);

describe('the proverbs’ list', () => {
  it('opens on the proverb of the day, each proverb with its translation and where it comes from', async () => {
    testAuth.client = fakeClient({ 'GET /proverbs?dialect=kmr': ok(PROVERBS) });
    renderWithProviders(<ProverbsScreen dialect="kmr" onExit={() => undefined} />);
    const today = await screen.findByTestId('proverb-today');
    expect(today.textContent).toContain('Av dilop dilop dibe gol.');
    expect(today.textContent).toContain('Drop by drop, water becomes a lake.');
    expect(screen.getByRole('heading', { name: 'Gotinên pêşiyan, Proverbs' })).toBeTruthy();
    expect(screen.getByText('Traditional')).toBeTruthy();
    // a new one is never shown as old
    expect(screen.getByText('Newly written')).toBeTruthy();
  });

  it('keeps to one theme when its chip is chosen', async () => {
    testAuth.client = fakeClient({ 'GET /proverbs?dialect=kmr': ok(PROVERBS) });
    renderWithProviders(<ProverbsScreen dialect="kmr" onExit={() => undefined} />);
    await screen.findByTestId('proverb-today');
    expect(screen.getByRole('button', { name: 'Dost ew e ku di roja teng de bê.' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Patience' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Dost ew e ku di roja teng de bê.' })).toBeNull());
  });

  it('opens a proverb, and the round in the variety on show', async () => {
    testAuth.client = fakeClient({ 'GET /proverbs?dialect=kmr': ok(PROVERBS) });
    renderWithProviders(<ProverbsScreen dialect="kmr" onExit={() => undefined} />);
    fireEvent.click(await screen.findByTestId('proverb-today'));
    expect(navigation.navigate).toHaveBeenCalledWith('Proverb', { slug: 'kmr-av-dilop' });
    fireEvent.click(screen.getByTestId('proverbs-round'));
    expect(navigation.navigate).toHaveBeenCalledWith('ProverbRound', { dialect: 'kmr' });
  });
});

describe('a proverb’s page', () => {
  it('sets the saying with its translation, sense, meaning, scene, variants, equivalent and sources', async () => {
    testAuth.client = fakeClient({ 'GET /proverbs/kmr-av-dilop': ok({ proverb: proverb() }) });
    renderWithProviders(<ProverbScreen slug="kmr-av-dilop" onExit={() => undefined} />);
    expect((await screen.findByTestId('proverb-text')).textContent).toBe('Av dilop dilop dibe gol.');
    for (const text of [
      'Drop by drop, water becomes a lake.',
      'Water becomes a pond drop by drop.',
      'Small, steady efforts add up to something big.',
      'Rêzan her êvar pênc peyvên nû hîn dibe. Dapîra wî dikene.',
      'ئاو دڵۆپ دڵۆپ دەبێتە گۆم.',
      'Many a little makes a mickle.',
      'A traditional proverb.',
      'Pirtûka gotinan',
    ]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
    for (const label of ['Word for word', 'What it means', 'When you might hear it', 'Other ways to say it', 'A saying with the same sense', 'Sources']) {
      expect(screen.getByRole('heading', { name: label })).toBeTruthy();
    }
  });

  it('leaves out what a proverb has nothing for, rather than an empty heading', async () => {
    testAuth.client = fakeClient({ 'GET /proverbs/kmr-av-dilop': ok({ proverb: proverb({ variants: [], sources: [] }) }) });
    renderWithProviders(<ProverbScreen slug="kmr-av-dilop" onExit={() => undefined} />);
    await screen.findByTestId('proverb-text');
    expect(screen.queryByRole('heading', { name: 'Other ways to say it' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Sources' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Background' })).toBeNull();
  });

  it('says a proverb that is gone is gone', async () => {
    testAuth.client = fakeClient({ 'GET /proverbs/kmr-x': fail({ status: 404, code: 'NOT_FOUND' }) });
    renderWithProviders(<ProverbScreen slug="kmr-x" onExit={() => undefined} />);
    expect(await screen.findByText('This proverb isn’t available any more.')).toBeTruthy();
  });
});

const items: ProverbRoundItemView[] = [0, 1, 2, 3, 4].map((index) => ({
  index,
  mode: 'meaning',
  dialect: 'kmr',
  proverb: `Gotin ${index}`,
  locale: 'en',
  options: [`Meaning A${index}`, `Meaning B${index}`, `Meaning C${index}`],
}));
const states = (over: Partial<SoloItemState>[] = []): SoloItemState[] =>
  items.map((it, i) => ({ index: it.index, attempts: 0, correct: false, firstTry: false, done: false, ...over[i] }));
const session = (st = states()) => ({ id: 'r1', game: 'proverb-meaning', dialect: 'kmr', difficulty: 'intermediate', items, states: st, maxAttempts: 2, finished: false, expiresAt: '2030-01-01T00:00:00Z' });
const correction = { choice: 1, slug: 'kmr-av-dilop', text: 'Av dilop dilop dibe gol.', locale: 'en', translation: 'Drop by drop, water becomes a lake.', meaning: 'Small, steady efforts add up.' };

describe('the proverbs’ round', () => {
  it('plays five items with a second try and the proverb after each, and says the round pays no XP', async () => {
    let tries = 0;
    const client = fakeClient({
      'GET /proverbs/rounds/open?dialect=kmr&mode=meaning': ok({ id: null }),
      'POST /proverbs/rounds': ok(session()),
      'POST /proverbs/rounds/r1/answers': (body) => {
        const { index, answer, attempt } = body as { index: number; answer: { choice: number }; attempt: number };
        tries += 1;
        const right = answer.choice === 1;
        const done = right || attempt >= 2;
        return ok({ index, attempt, correct: right, firstTry: right && attempt === 1, done, hint: done ? null : { struck: answer.choice }, correction: done ? correction : null, why: done ? 'meaning' : null, xp: 0, repeat: false });
      },
      'POST /proverbs/rounds/r1/finish': ok({ correct: 5, total: 5, firstTry: 4, xp: 0, learningCounted: true, needed: 3, items: [], streak: 4 }),
    });
    testAuth.client = client;
    renderWithProviders(<ProverbRoundScreen dialect="kmr" onExit={() => undefined} />);
    expect(screen.getByRole('radio', { name: 'What does it mean?' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(await screen.findByTestId('proverb-round-start'));
    expect((await screen.findByTestId('proverb-round-prompt')).textContent).toBe('Gotin 0');
    expect(client.calls.find((c) => c.method === 'POST')?.body).toEqual({ dialect: 'kmr', mode: 'meaning' });

    // a wrong first try is crossed out, and a second one is offered
    fireEvent.click(screen.getByRole('button', { name: 'Meaning A0' }));
    expect(await screen.findByText('Not that one. It’s crossed out; choose another.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Meaning B0' }));
    expect(await screen.findByText('Small, steady efforts add up.')).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: 'About this proverb' }));
    expect(navigation.navigate).toHaveBeenCalledWith('Proverb', { slug: 'kmr-av-dilop' });

    for (let i = 1; i < 5; i += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      expect((await screen.findByTestId('proverb-round-prompt')).textContent).toBe(`Gotin ${i}`);
      fireEvent.click(screen.getByRole('button', { name: `Meaning B${i}` }));
      await screen.findByRole('button', { name: i === 4 ? 'See how it went' : 'Next' });
    }
    fireEvent.click(screen.getByRole('button', { name: 'See how it went' }));
    expect(await screen.findByText('5 of 5 right')).toBeTruthy();
    expect(screen.getByText('Today counts for your streak.')).toBeTruthy();
    expect(screen.getByText(/earns no XP/)).toBeTruthy();
    expect(screen.queryByText(/\+\d+ XP/)).toBeNull();
    expect(tries).toBe(6);
  });

  it('offers the round left unfinished first', async () => {
    testAuth.client = fakeClient({
      'GET /proverbs/rounds/open?dialect=ckb&mode=situation': ok({ id: 'r1' }),
      'GET /proverbs/rounds/r1': ok({ ...session(states([{ attempts: 1, correct: true, firstTry: true, done: true }])), expired: false }),
    });
    renderWithProviders(<ProverbRoundScreen dialect="ckb" mode="situation" onExit={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Continue your round' }));
    expect((await screen.findByTestId('proverb-round-prompt')).textContent).toBe('Gotin 1');
  });
});
