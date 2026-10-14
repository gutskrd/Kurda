// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoryGameResults, StoryGameView } from '@kurda/shared';
import { fakeClient, ok, testAuth } from '../../reports/testing/auth';
import { renderWithProviders } from '../../reports/testing/harness';
import { resetPrefsCache } from '../prefs';
import { NANE_GERM, gameView, standing } from '../testing/views';
import { Results } from './Results';

vi.mock('react-native', () => import('../../play/testing/native'));
vi.mock('react-native-svg', () => import('../../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../../reports/testing/stubs'));
vi.mock('../../auth/AuthContext', () => import('../../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../../play/testing/navigation'));

const review: StoryGameResults['review'] = [
  { index: 0, kind: 'gist', prompt: 'Çîrok li ser çi ye?', promptEn: null, options: ['Nan', 'Av'], correctIndex: 0, myChoice: 0, explanation: null, explanationEn: null, evidenceParagraph: null, evidenceSentence: null },
  { index: 1, kind: 'detail', prompt: 'Nan çawa bû?', promptEn: null, options: ['Sar', 'Germ'], correctIndex: 1, myChoice: 0, explanation: null, explanationEn: null, evidenceParagraph: 0, evidenceSentence: 1 },
];

function finished(results: Partial<StoryGameResults>, over: Partial<StoryGameView> = {}): StoryGameView {
  return gameView(
    {
      status: 'finished',
      results: {
        standings: [],
        me: { place: 1, score: 400, correct: 4, answered: 5, total: 5, xp: 12, learningCounted: true },
        review,
        ...results,
      },
      ...over,
    },
    { questionCount: 5 },
  );
}

function renderResults(view: StoryGameView, onOpenGame = vi.fn()) {
  return renderWithProviders(
    <Results view={view} story={NANE_GERM} onOpenGame={onOpenGame} onRead={() => undefined} onBack={() => undefined} />,
  );
}

describe('Results', () => {
  beforeEach(() => {
    localStorage.clear();
    resetPrefsCache();
  });
  afterEach(cleanup);

  it('puts you first in a duo, without places, and adds the two scores together', () => {
    testAuth.client = fakeClient({ 'GET /play/stories/g1/rematch': ok({ kind: 'pair', offeredByMe: false, offeredByOther: false, otherDeclined: false, nextLobbyId: null, canOpenRound: false, series: null }) });
    renderResults(
      finished({
        standings: [standing({ seat: 2, name: 'Rojda', correct: 5, place: 1 }), standing({ seat: 1, isMe: true, correct: 4, place: 2 })],
      }),
    );
    expect(screen.getByText('You 4/5 · Rojda 5/5')).toBeTruthy();
    expect(screen.getByText('Together 9 of 10')).toBeTruthy();
    expect(screen.queryByText(/place/)).toBeNull();
  });

  it('says what the game earned, and how to make a day count when it did not', () => {
    testAuth.client = fakeClient();
    const view = renderResults(finished({}, { mode: 'solo' }));
    expect(screen.getByLabelText('12 XP earned')).toBeTruthy();
    expect(screen.getByText('This counted as a day of learning.')).toBeTruthy();
    view.rerender(
      <Results
        view={finished({ me: { place: 1, score: 100, correct: 1, answered: 2, total: 5, xp: 3, learningCounted: false } }, { mode: 'solo' })}
        story={NANE_GERM}
        onOpenGame={() => undefined}
        onRead={() => undefined}
        onBack={() => undefined}
      />,
    );
    expect(screen.getByText('Answer at least half the questions in one day to count a day of learning.')).toBeTruthy();
  });

  it('goes over the missed questions first, with the sentence that answers them', () => {
    testAuth.client = fakeClient();
    renderResults(finished({}, { mode: 'solo' }));
    const missed = screen.getByText('Nan çawa bû?');
    const got = screen.getByText('Çîrok li ser çi ye?');
    // document order: the missed one comes first
    expect(missed.compareDocumentPosition(got) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText('“Nan germ e.”')).toBeTruthy();
  });

  it('shows the English under a reviewed question and its explanation where the questions showed it', () => {
    testAuth.client = fakeClient();
    const withEnglish: StoryGameResults['review'] = [
      { ...review[1]!, promptEn: 'How was the bread?', explanation: 'Nan germ bû.', explanationEn: 'The bread was warm.' },
    ];
    const view = renderResults(finished({ review: withEnglish }, { mode: 'solo' }));
    // level 1: shown, in English's own voice
    expect(screen.getByText('How was the bread?').getAttribute('lang')).toBe('en');
    expect(screen.getByText('The bread was warm.')).toBeTruthy();
    view.unmount();
    renderWithProviders(
      <Results
        view={gameView({ status: 'finished', mode: 'solo', results: { standings: [], me: null, review: withEnglish } }, { questionCount: 5, level: 3 })}
        story={NANE_GERM}
        onOpenGame={() => undefined}
        onRead={() => undefined}
        onBack={() => undefined}
      />,
    );
    expect(screen.getByText('Nan çawa bû?')).toBeTruthy();
    expect(screen.queryByText('How was the bread?')).toBeNull();
    expect(screen.queryByText('The bread was warm.')).toBeNull();
  });

  it('alone, plays the same story again with the same settings, straight to the questions', async () => {
    const client = fakeClient({ 'POST /story-games': ok(gameView({ id: 'g2', mode: 'solo', status: 'question' })) });
    testAuth.client = client;
    const onOpenGame = vi.fn();
    renderResults(finished({}, { mode: 'solo' }), onOpenGame);
    fireEvent.click(screen.getByRole('button', { name: 'Quiz yourself again' }));
    await waitFor(() => expect(onOpenGame).toHaveBeenCalledWith('g2'));
    expect(client.calls.find((c) => c.path === '/story-games')?.body).toMatchObject({
      mode: 'solo',
      storyId: 's1',
      questionCount: 5,
      timerSeconds: 0,
      textDuring: 'visible',
      skipReading: true,
    });
  });

  it('with three, lists everyone by seat and tells only you your place', () => {
    testAuth.client = fakeClient({ 'GET /play/stories/g1/rematch': ok({ kind: 'round', offeredByMe: false, offeredByOther: false, otherDeclined: false, nextLobbyId: null, canOpenRound: false, series: null }) });
    renderResults(
      finished(
        {
          standings: [
            standing({ seat: 3, name: 'Azad', correct: 5, place: 1 }),
            standing({ seat: 1, isMe: true, correct: 4, place: 2 }),
            standing({ seat: 2, name: null, correct: 2, place: 3 }),
          ],
        },
        { mode: 'group' },
      ),
    );
    const names = screen.getAllByText(/^(You|Azad|Player 2)$/).map((n) => n.textContent);
    expect(names).toEqual(['You', 'Player 2', 'Azad']);
    expect(screen.getByText('4/5 · place 2')).toBeTruthy();
    expect(within(screen.getByText('Azad').parentElement!).queryByText(/place/)).toBeNull();
  });
});
