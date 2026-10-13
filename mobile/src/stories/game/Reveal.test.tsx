// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoryGameReveal, StoryGameView } from '@kurda/shared';
import { fakeClient, ok, testAuth } from '../../reports/testing/auth';
import { renderWithProviders } from '../../reports/testing/harness';
import { resetPrefsCache } from '../prefs';
import { NANE_GERM, gameView } from '../testing/views';
import { Reveal } from './Reveal';

vi.mock('react-native', () => import('../../play/testing/native'));
vi.mock('react-native-svg', () => import('../../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../../reports/testing/stubs'));
vi.mock('../../auth/AuthContext', () => import('../../reports/testing/auth'));

const reveal = (over: Partial<StoryGameReveal> = {}): StoryGameReveal => ({
  index: 1,
  correctIndex: 1,
  explanation: 'Dayik nan dipêje, û nan germ e.',
  explanationEn: 'The bread is warm.',
  evidenceParagraph: 0,
  evidenceSentence: 1,
  answeredCount: 4,
  correctCount: 3,
  myChoice: 0,
  myCorrect: false,
  ...over,
});

function revealView(over: Partial<StoryGameView> = {}): StoryGameView {
  return gameView({
    status: 'reveal',
    mode: 'group',
    activeCount: 4,
    question: { index: 1, total: 5, kind: 'detail', prompt: 'Nan çawa bû?', promptEn: 'How was the bread?', options: ['Sar', 'Germ', 'Şor', 'Şirîn'], myChoice: 0 },
    reveal: reveal(),
    ...over,
  });
}

describe('Reveal', () => {
  beforeEach(() => {
    localStorage.clear();
    resetPrefsCache();
  });
  afterEach(cleanup);

  it('says the verdict and the right answer once, with words as well as colour', () => {
    testAuth.client = fakeClient();
    const announce = vi.fn();
    const view = renderWithProviders(<Reveal view={revealView()} story={NANE_GERM} apply={() => null} announce={announce} />);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith('Not quite. The answer is: Germ');
    expect(screen.getByLabelText('2. Germ, Right answer')).toBeTruthy();
    expect(screen.getByLabelText('1. Sar, Your answer')).toBeTruthy();
    // a new view of the same reveal (somebody continued) says nothing again
    view.rerender(<Reveal view={revealView({ continuedCount: 2, version: 9 })} story={NANE_GERM} apply={() => null} announce={announce} />);
    expect(announce).toHaveBeenCalledTimes(1);
  });

  it('quotes the sentence of the story that answers it, and counts who got it without naming anyone', () => {
    testAuth.client = fakeClient();
    renderWithProviders(<Reveal view={revealView()} story={NANE_GERM} apply={() => null} announce={() => undefined} />);
    expect(screen.getByText('Nan germ e.')).toBeTruthy();
    expect(screen.getByText('3 of 4 got it')).toBeTruthy();
    expect(screen.getByText('You’ll see every answer again at the end.')).toBeTruthy();
  });

  it('continues with the index it was shown, then waits for the others', async () => {
    const client = fakeClient({ 'POST /story-games/g1/continue': ok(revealView({ meContinued: true, continuedCount: 1 })) });
    testAuth.client = client;
    const apply = vi.fn(() => null);
    const view = renderWithProviders(<Reveal view={revealView()} story={NANE_GERM} apply={apply} announce={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(client.calls.find((c) => c.path === '/story-games/g1/continue')?.body).toEqual({ index: 1 }));
    expect(apply).toHaveBeenCalled();
    view.rerender(<Reveal view={revealView({ meContinued: true, continuedCount: 1 })} story={NANE_GERM} apply={apply} announce={() => undefined} />);
    expect(screen.getByText('Waiting for the others — 1 of 4 ready')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
  });

  it('alone, goes on with Next, and the last one leads to the results', () => {
    testAuth.client = fakeClient();
    const solo = revealView({ mode: 'solo', reveal: reveal({ myChoice: 1, myCorrect: true }) });
    const view = renderWithProviders(<Reveal view={solo} story={NANE_GERM} apply={() => null} announce={() => undefined} />);
    expect(screen.getByText('Right!')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next' })).toBeTruthy();
    expect(screen.queryByText(/got it/)).toBeNull();
    const last = revealView({
      mode: 'solo',
      question: { index: 4, total: 5, kind: 'detail', prompt: 'Kî?', promptEn: null, options: ['A', 'B'], myChoice: 1 },
      reveal: reveal({ index: 4, myChoice: 1, myCorrect: true }),
    });
    view.rerender(<Reveal view={last} story={NANE_GERM} apply={() => null} announce={() => undefined} />);
    expect(screen.getByRole('button', { name: 'See the results' })).toBeTruthy();
  });
});
