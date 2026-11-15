import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DeliveredExercise, PlayableSession } from '@kurda/shared';
import { jsonResponse, renderApp } from '../test/utils';
import { LESSON_PATHS, SessionPlayer } from './SessionPlayer';

/*
 * Items that say what they ask (`ask`): the headline names it, the bubble
 * holds the line alone, a new word is marked and its badge takes the
 * kicker's place, a missing word's gap takes the word as it is chosen or
 * typed, and a picture item's options are pictures, named by what they
 * show. An item without an ask is shown as it always was.
 */

let answers: Array<{ exerciseId: string; answer: unknown }> = [];
let grade: (body: { exerciseId: string; answer: unknown }) => unknown = () => right;
let played: Array<{ src: string; rate: number }> = [];

const right = { verdict: 'correct', accepted: true, duplicate: false };

beforeEach(() => {
  answers = [];
  played = [];
  grade = () => right;
  // the keyboard chosen in one test is not the next one’s choice
  localStorage.clear();
  localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;
      if (path === '/me') return jsonResponse(200, { user: { id: 'me', username: 'me', emailVerified: true } });
      if (init?.method === 'POST' && path.endsWith('/answers')) {
        const body = JSON.parse(init.body as string) as { exerciseId: string; answer: unknown };
        answers.push(body);
        return jsonResponse(200, grade(body));
      }
      return jsonResponse(404, { code: 'NOT_FOUND', message: 'no' });
    }),
  );
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
    played.push({ src: this.src, rate: this.playbackRate });
    return Promise.resolve();
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function lesson(exercises: DeliveredExercise[], dialect = 'kurmanji'): void {
  const session: PlayableSession = { sessionId: 's1', exercises, answered: {} };
  renderApp(
    <SessionPlayer
      session={session}
      kind="lesson"
      paths={LESSON_PATHS}
      title="First steps"
      dialect={dialect}
      exitTo="/app/learn"
      exitLabel="Back to Learn"
      onPractise={vi.fn()}
    />,
    ['/app/learn/lesson/l1'],
  );
}

const headline = (): Promise<HTMLElement> => screen.findByRole('heading', { level: 2 });
const bubble = (): HTMLElement => document.querySelector<HTMLElement>('.lesson-bubble')!;
const line = (): HTMLElement => document.querySelector<HTMLElement>('.lesson-line-text')!;
const gap = (): HTMLElement => document.querySelector<HTMLElement>('.lesson-gap')!;
const kicker = (): Element | null => document.querySelector('.lesson-kicker');
const live = (): string => [...document.querySelectorAll('[aria-live="polite"]')].map((el) => el.textContent).join(' | ');

async function check(): Promise<void> {
  const button = await screen.findByRole('button', { name: 'Check' });
  await waitFor(() => expect(button).toBeEnabled());
  await userEvent.click(button);
}

async function next(): Promise<void> {
  await userEvent.click(await screen.findByRole('button', { name: 'Continue' }));
}

describe('what does this mean', () => {
  const meaning: DeliveredExercise = {
    id: 'm1',
    type: 'multiple_choice',
    ask: 'meaning',
    prompt: 'Silav!',
    promptTokens: [{ text: 'Silav', meanings: ['greeting', 'hello'] }, { text: '!' }],
    newWords: [{ ku: 'silav', en: 'hello' }],
    modelAudioUrl: 'https://cdn.test/silav.mp3',
    modelAudioVoice: { speaker: 'hamo' },
    options: ['Goodbye!', 'Hello!', 'Thank you!'],
  };

  it('asks it in the headline, with the line alone in the bubble, its play and slow play, and a badge for the new word', async () => {
    lesson([meaning, { ...meaning, id: 'm2', newWords: undefined }]);
    expect(await headline()).toHaveTextContent('What does this mean?');
    // the kicker gives way to the badge, which is read out
    expect(screen.getByText('New word')).toBeInTheDocument();
    expect(kicker()).toBeNull();
    // the bubble holds the line and the two buttons that play it, and nothing else
    expect(line()).toHaveTextContent(/^Silav!$/);
    expect(line()).toHaveAttribute('lang', 'ku');
    const inBubble = within(bubble());
    expect(inBubble.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Listen', 'Slower (0.75×)', 'What “Silav” means']);
    await userEvent.click(inBubble.getByRole('button', { name: 'Slower (0.75×)' }));
    expect(played.at(-1)).toEqual({ src: 'https://cdn.test/silav.mp3', rate: 0.75 });
    await userEvent.click(inBubble.getByRole('button', { name: 'Listen' }));
    expect(played.at(-1)).toEqual({ src: 'https://cdn.test/silav.mp3', rate: 1 });
    // the new word is marked, and its own meaning comes before the dictionary’s
    const word = inBubble.getByRole('button', { name: 'What “Silav” means' });
    expect(word).toHaveClass('is-new');
    await userEvent.click(word);
    const meanings = within(screen.getByRole('list', { name: 'What “Silav” means' })).getAllByRole('listitem');
    expect(meanings.map((li) => li.textContent)).toEqual(['hello', 'greeting']);
    await userEvent.keyboard('{Escape}');

    // the options are cards of words, as before
    await userEvent.click(screen.getByRole('button', { name: /Hello!/ }));
    await check();
    expect(answers[0]).toEqual({ exerciseId: 'm1', answer: { choice: 1 } });
    await next();

    // the same item with no new word: the lesson’s name over it again
    expect(await headline()).toHaveTextContent('What does this mean?');
    await waitFor(() => expect(kicker()).toHaveTextContent('First steps'));
    expect(screen.queryByText('New word')).toBeNull();
  });

  it('says “New words” over an item that brings in more than one', async () => {
    lesson([{ ...meaning, prompt: 'Ez Hamo me.', promptTokens: undefined, newWords: [{ ku: 'ez', en: 'I' }, { ku: 'me', en: 'am' }] }]);
    expect(await screen.findByText('New words')).toBeInTheDocument();
    expect(within(bubble()).getByRole('button', { name: 'What “Ez” means' })).toHaveClass('is-new');
    expect(within(bubble()).getByRole('button', { name: 'What “me” means' })).toHaveClass('is-new');
  });
});

describe('a reply, and the Kurdish for an English line', () => {
  it('shows a reply’s options in Kurdish, and its cue under the line', async () => {
    lesson([
      {
        id: 'r1',
        type: 'multiple_choice',
        ask: 'reply',
        prompt: 'Silav!',
        cue: 'to Hamo, when you meet',
        modelAudioUrl: 'https://cdn.test/silav.mp3',
        options: ['Silav, Hamo!', 'Na, na!', 'Ez Hamo me.'],
      },
    ]);
    expect(await headline()).toHaveTextContent('What do you answer?');
    expect(line()).toHaveTextContent(/^Silav!$/);
    expect(screen.getByText('to Hamo, when you meet')).toHaveClass('lesson-cue');
    const option = screen.getByText('Silav, Hamo!');
    expect(option).toHaveAttribute('lang', 'ku');
    expect(option.closest('.lesson-options')).toHaveClass('is-kurdish');
  });

  it('shows an English line in plain words with nothing to hear, and the options in Kurdish', async () => {
    lesson([
      {
        id: 'c1',
        type: 'multiple_choice',
        ask: 'choose-kurdish',
        prompt: 'I am well.',
        // were one sent, it would say the answer: an English line plays nothing
        modelAudioUrl: 'https://cdn.test/answer.mp3',
        options: ['Ez baş im.', 'Tu baş im.', 'Ez baş me.'],
      },
    ]);
    expect(await headline()).toHaveTextContent('Select the correct translation');
    expect(line()).toHaveTextContent(/^I am well\.$/);
    expect(line()).toHaveClass('is-english');
    expect(line()).not.toHaveAttribute('lang');
    expect(within(bubble()).queryByRole('button', { name: 'Listen' })).toBeNull();
    expect(screen.getByText('Ez baş im.')).toHaveAttribute('lang', 'ku');
  });
});

describe('a missing word', () => {
  it('shows the gap as an empty slot, fills it with the word chosen, and marks it once graded', async () => {
    grade = () => ({ verdict: 'wrong', accepted: false, correction: 'baş', duplicate: false });
    lesson([{ id: 'g1', type: 'multiple_choice', ask: 'missing', prompt: 'Ez ___ im.', options: ['silav', 'baş', 'Hamo'] }]);
    expect(await headline()).toHaveTextContent('Fill in the missing word');
    // empty, and said as a blank
    expect(gap()).toHaveTextContent(/^blank$/);
    expect(gap()).not.toHaveClass('is-filled');
    expect(line()).toHaveTextContent('Ez blank im.');
    // the options are word chips; a tap or a number puts the word in the gap, and another replaces it
    expect(screen.getByRole('button', { name: 'silav' })).toHaveClass('lesson-chip');
    await userEvent.click(screen.getByRole('button', { name: 'silav' }));
    expect(gap()).toHaveTextContent(/^silav$/);
    expect(gap()).toHaveClass('is-filled');
    await userEvent.keyboard('3');
    expect(gap()).toHaveTextContent(/^Hamo$/);
    await userEvent.keyboard('1');
    await check();
    expect(answers[0]).toEqual({ exerciseId: 'g1', answer: { choice: 0 } });
    await screen.findByRole('region', { name: 'Feedback' });
    expect(gap()).toHaveClass('is-wrong');
    expect(screen.getByRole('button', { name: /baş/ })).toHaveTextContent('right answer');
    expect(screen.getByRole('button', { name: /silav/ })).toHaveTextContent('your answer');
  });

  it('fills the gap with what is typed, for a written item', async () => {
    lesson([{ id: 'w1', type: 'writing', ask: 'missing', prompt: 'Ez Hamo ___.' }]);
    expect(await headline()).toHaveTextContent('Fill in the missing word');
    expect(gap()).toHaveTextContent(/^blank$/);
    await userEvent.type(await screen.findByRole('textbox'), 'me');
    expect(gap()).toHaveTextContent(/^me$/);
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(answers[0]).toEqual({ exerciseId: 'w1', answer: { text: 'me' } }));
    await waitFor(() => expect(gap()).toHaveClass('is-right'));
  });
});

describe('which picture', () => {
  const picture: DeliveredExercise = {
    id: 'p1',
    type: 'multiple_choice',
    ask: 'picture',
    prompt: 'sêv',
    newWords: [{ ku: 'sêv', en: 'apple' }],
    modelAudioUrl: 'https://cdn.test/sev.mp3',
    options: ['tea', 'apple', 'water'],
  };

  it('offers a picture for each option, named by what it shows, and the word large in the bubble', async () => {
    grade = () => ({ verdict: 'wrong', accepted: false, correction: 'apple', duplicate: false });
    lesson([picture]);
    expect(await headline()).toHaveTextContent('Which picture is it?');
    expect(line()).toHaveClass('is-big');
    expect(line()).toHaveTextContent(/^sêv$/);
    const group = screen.getByRole('group', { name: 'Answers' });
    const cards = within(group).getAllByRole('button');
    expect(cards.map((card) => card.textContent?.replace(/^\d/, ''))).toEqual(['tea', 'apple', 'water']);
    for (const card of cards) {
      expect(card).toHaveClass('lesson-picture');
      expect(card.querySelector('svg')).not.toBeNull();
    }
    // a number picks a picture as it picks an option
    await userEvent.keyboard('3');
    expect(within(group).getByRole('button', { name: 'water' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(within(group).getByRole('button', { name: 'tea' }));
    await check();
    expect(answers[0]).toEqual({ exerciseId: 'p1', answer: { choice: 0 } });
    // the verdict names the right picture by what it shows, not by its id
    await screen.findByRole('region', { name: 'Feedback' });
    expect(live()).toContain('The answer: apple');
    expect(within(group).getByRole('button', { name: /apple/ })).toHaveTextContent('right answer');
    expect(within(group).getByRole('button', { name: /tea/ })).toHaveTextContent('your answer');
  });

  it('names a picture this page does not know by its id, so it can still be chosen', async () => {
    lesson([{ ...picture, options: ['apple', 'kite'] }]);
    expect(await screen.findByRole('button', { name: 'kite' })).toBeInTheDocument();
  });
});

describe('translating, hearing and repeating', () => {
  it('asks to translate a Kurdish line, playing it, and to write an English one in Kurmancî', async () => {
    lesson([
      { id: 't1', type: 'translate', ask: 'to-english', prompt: 'Ez baş im.', modelAudioUrl: 'https://cdn.test/ez.mp3', bank: ['I', 'am', 'well', 'you'] },
      { id: 't2', type: 'translate', ask: 'to-kurdish', prompt: 'Yes, I am well.', bank: ['Erê', 'ez', 'baş', 'im', 'tu'] },
    ]);
    expect(await headline()).toHaveTextContent('Translate this sentence');
    expect(line()).toHaveTextContent(/^Ez baş im\.$/);
    expect(within(bubble()).getByRole('button', { name: 'Slower (0.75×)' })).toBeInTheDocument();
    // the headline stays when the keyboard is chosen
    await userEvent.click(screen.getByRole('button', { name: 'Use keyboard' }));
    expect(await headline()).toHaveTextContent('Translate this sentence');
    await userEvent.type(await screen.findByRole('textbox'), 'I am well{Enter}');
    await next();
    await waitFor(async () => expect(await headline()).toHaveTextContent('Write this in Kurmancî'));
    expect(line()).toHaveClass('is-english');
  });

  it('asks a listening item as before', async () => {
    lesson([{ id: 'h1', type: 'listening', ask: 'hear', audioUrl: 'https://cdn.test/h.mp3', bank: ['Silav', 'Ez', 'Hamo', 'me'] }]);
    expect(await headline()).toHaveTextContent('Tap what you hear');
    expect(screen.getByRole('button', { name: 'Slower (0.75×)' })).toBeInTheDocument();
  });

  it('asks to repeat after whoever says the model', async () => {
    lesson([
      { id: 's1', type: 'speaking', ask: 'repeat', prompt: 'Silav! Ez baş im.', modelAudioUrl: 'https://cdn.test/s.mp3', modelAudioVoice: { speaker: 'hamo' } },
    ]);
    expect(await headline()).toHaveTextContent('Repeat after Hamo');
  });
});

describe('an item without an ask', () => {
  it('is shown as it always was: its own question whole in the bubble, the lesson’s name over it, and no badge', async () => {
    lesson([{ id: 'o1', type: 'multiple_choice', prompt: '“Roj baş” tê çi wateyê?', options: ['Good day', 'Good night'] }]);
    expect(await headline()).toHaveTextContent('Choose the answer');
    expect(bubble()).toHaveTextContent('“Roj baş” tê çi wateyê?');
    expect(document.querySelector('.lesson-line-text')).toBeNull();
    expect(kicker()).toHaveTextContent('First steps');
    expect(screen.getByText('Good day').closest('.lesson-options')).not.toHaveClass('is-kurdish');
  });
});
