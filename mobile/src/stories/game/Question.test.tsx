// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoryGameQuestion, StoryGameView } from '@kurda/shared';
import { fail, fakeClient, ok, testAuth } from '../../reports/testing/auth';
import { renderWithProviders } from '../../reports/testing/harness';
import { resetPrefsCache } from '../prefs';
import { Question, showEnglish } from './Question';

vi.mock('react-native', () => import('../../play/testing/native'));
vi.mock('react-native-svg', () => import('../../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../../reports/testing/stubs'));
vi.mock('../../auth/AuthContext', () => import('../../reports/testing/auth'));

const question = (over: Partial<StoryGameQuestion> = {}): StoryGameQuestion => ({
  index: 0,
  total: 5,
  kind: 'detail',
  prompt: 'Nan çawa bû?',
  promptEn: 'How was the bread?',
  options: ['Sar', 'Germ', 'Şor', 'Şirîn'],
  myChoice: null,
  ...over,
});

function gameView(over: Partial<StoryGameView> = {}, settings: Partial<StoryGameView['settings']> = {}): StoryGameView {
  return {
    id: 'g1',
    code: null,
    mode: 'duo',
    status: 'question',
    version: 4,
    serverNow: new Date().toISOString(),
    phaseEndsAt: null,
    readingSoftCapAt: null,
    readingHardCapAt: null,
    settings: {
      storyId: 's1',
      storyTitle: 'Nanê Germ',
      storySlug: 'nane-germ',
      dialect: 'kurmanci',
      level: 1,
      length: 'short',
      questionCount: 5,
      timerSeconds: 0,
      textDuring: 'hidden',
      access: 'friends',
      ...settings,
    },
    isHost: false,
    extraTime: false,
    players: [],
    activeCount: 2,
    readingDoneCount: 2,
    answeredCount: 0,
    continuedCount: 0,
    meDoneReading: true,
    meContinued: false,
    question: question(),
    reveal: null,
    results: null,
    nextGameId: null,
    ...over,
  };
}

function renderQuestion(view: StoryGameView, extra: { apply?: () => null; refresh?: () => void; announce?: (m: string) => void } = {}) {
  return renderWithProviders(
    <Question
      view={view}
      story={null}
      apply={extra.apply ?? (() => null)}
      refresh={extra.refresh ?? (() => undefined)}
      serverNow={() => Date.now()}
      announce={extra.announce ?? (() => undefined)}
      onGloss={() => undefined}
    />,
  );
}

describe('showEnglish', () => {
  it('shows English at level 1 unless this phone was told otherwise', () => {
    expect(showEnglish(null, 1)).toBe(true);
    expect(showEnglish(null, 2)).toBe(false);
    expect(showEnglish(false, 1)).toBe(false);
    expect(showEnglish(true, 3)).toBe(true);
  });
});

describe('Question', () => {
  beforeEach(() => {
    localStorage.clear();
    resetPrefsCache();
  });
  afterEach(cleanup);

  it('heads the question with where it is, and numbers every option', () => {
    testAuth.client = fakeClient();
    renderQuestion(gameView());
    expect(screen.getByRole('heading', { name: 'Question 1 of 5' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^\d\. / }).map((b) => b.getAttribute('aria-label'))).toEqual([
      '1. Sar',
      '2. Germ',
      '3. Şor',
      '4. Şirîn',
    ]);
  });

  it('sends the choice, says it is locked, and then says only how many have answered', async () => {
    const answered = gameView({ answeredCount: 1, question: question({ myChoice: 1 }) });
    const client = fakeClient({ 'POST /story-games/g1/answers': ok(answered) });
    testAuth.client = client;
    const apply = vi.fn(() => null);
    const announce = vi.fn();
    const view = renderQuestion(gameView(), { apply, announce });
    fireEvent.click(screen.getByRole('button', { name: '2. Germ' }));
    await waitFor(() => expect(apply).toHaveBeenCalledWith({ ok: true, data: answered }));
    expect(client.calls[0]?.body).toEqual({ index: 0, choice: 1 });
    expect(announce).toHaveBeenCalledWith('Answer locked');

    view.rerender(
      <Question view={answered} story={null} apply={apply} refresh={() => undefined} serverNow={() => Date.now()} announce={announce} onGloss={() => undefined} />,
    );
    expect(screen.getByText('Answer locked — 1 of 2 answered')).toBeTruthy();
    expect(screen.getByRole('button', { name: '2. Germ' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('button', { name: '1. Sar' }).getAttribute('aria-disabled')).toBe('true');
  });

  it('fetches the game again when the answer had arrived after all', async () => {
    testAuth.client = fakeClient({ 'POST /story-games/g1/answers': fail({ code: 'ALREADY_ANSWERED', status: 409 }) });
    const refresh = vi.fn();
    renderQuestion(gameView(), { refresh });
    fireEvent.click(screen.getByRole('button', { name: '3. Şor' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(screen.queryByText(/didn’t count/)).toBeNull();
  });

  it('tells the player plainly when an answer came too late', async () => {
    testAuth.client = fakeClient({ 'POST /story-games/g1/answers': fail({ code: 'TOO_LATE', status: 409 }) });
    const announce = vi.fn();
    renderQuestion(gameView(), { announce });
    fireEvent.click(screen.getByRole('button', { name: '1. Sar' }));
    expect(await screen.findByText('Time ran out before your answer arrived, so it didn’t count.')).toBeTruthy();
    expect(announce).toHaveBeenCalledWith('Time ran out before your answer arrived, so it didn’t count.');
  });

  it('keeps a refused choice so it can be sent again with one tap', async () => {
    let tries = 0;
    const client = fakeClient({
      'POST /story-games/g1/answers': () => {
        tries += 1;
        return tries === 1 ? fail({ code: 'FORBIDDEN', status: 403, message: 'Not allowed' }) : ok(gameView({ question: question({ myChoice: 3 }) }));
      },
    });
    testAuth.client = client;
    const apply = vi.fn(() => null);
    renderQuestion(gameView(), { apply });
    fireEvent.click(screen.getByRole('button', { name: '4. Şirîn' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Send my answer again' }));
    await waitFor(() => expect(apply).toHaveBeenCalled());
    expect(client.calls.map((c) => c.body)).toEqual([
      { index: 0, choice: 3 },
      { index: 0, choice: 3 },
    ]);
  });

  it('shows English under the prompt at level 1, and remembers when it is hidden', async () => {
    testAuth.client = fakeClient();
    renderQuestion(gameView());
    expect(screen.getByText('How was the bread?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Hide English' }));
    await waitFor(() => expect(screen.queryByText('How was the bread?')).toBeNull());
    expect(JSON.parse(localStorage.getItem('hevalo_stories_prefs_v1') ?? '{}')).toMatchObject({ englishUnder: false });
    cleanup();
    renderQuestion(gameView({}, { level: 3 }));
    // the phone was told: hidden, whatever the level
    expect(screen.getByRole('button', { name: 'Show in English' })).toBeTruthy();
  });

  it('times a timed question with a bar, and says ten seconds once', async () => {
    testAuth.client = fakeClient();
    const announce = vi.fn();
    const base = gameView({ phaseEndsAt: new Date(Date.now() + 45_000).toISOString() }, { timerSeconds: 60 });
    const view = renderQuestion(base, { announce });
    expect(screen.getByRole('progressbar', { name: '45 seconds left' })).toBeTruthy();
    const late = { ...base, phaseEndsAt: new Date(Date.now() + 8_000).toISOString() };
    const again = () =>
      view.rerender(
        <Question view={late} story={null} apply={() => null} refresh={() => undefined} serverNow={() => Date.now()} announce={announce} onGloss={() => undefined} />,
      );
    again();
    await act(async () => undefined);
    again();
    expect(announce.mock.calls.filter(([m]) => m === '10 seconds left')).toHaveLength(1);
  });

  it('shows no clock on an untimed question, only that it closes soon at the very end', () => {
    testAuth.client = fakeClient();
    renderQuestion(gameView({ phaseEndsAt: new Date(Date.now() + 20_000).toISOString() }));
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.getByText('This question closes soon.')).toBeTruthy();
  });

  it('gives the host of an untimed game a way to reveal the answer', async () => {
    const client = fakeClient({ 'POST /story-games/g1/advance': ok(gameView({ status: 'reveal' })) });
    testAuth.client = client;
    const apply = vi.fn(() => null);
    renderQuestion(gameView({ isHost: true }), { apply });
    fireEvent.click(screen.getByRole('button', { name: 'Reveal the answer now' }));
    await waitFor(() => expect(apply).toHaveBeenCalled());
    expect(client.calls[0]?.body).toEqual({ from: { status: 'question', index: 0 } });
  });
});
