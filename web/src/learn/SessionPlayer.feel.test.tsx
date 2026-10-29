import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import type { DeliveredExercise, PlayableSession } from '@kurda/shared';
import { jsonResponse, renderApp } from '../test/utils';
import { LESSON_PATHS, SessionPlayer } from './SessionPlayer';

/*
 * How a lesson feels: pairs answered as they are made, answers built from
 * word tiles, a prompt's words a tap away from their meanings, a run named
 * over the bar and across the screen, and the verdict sheet — against a fake
 * API that grades as each test says.
 */

let answers: Array<{ exerciseId: string; answer: unknown }> = [];
let grade: (body: { exerciseId: string; answer: unknown }) => unknown = () => right;

const right = { verdict: 'correct', accepted: true, duplicate: false };

beforeEach(() => {
  answers = [];
  grade = () => right;
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
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function Where(): React.JSX.Element {
  const { pathname } = useLocation();
  return <output data-testid="where">{pathname}</output>;
}

function lesson(exercises: DeliveredExercise[], dialect = 'kurmanji'): void {
  const session: PlayableSession = { sessionId: 's1', exercises, answered: {} };
  renderApp(
    <>
      <SessionPlayer session={session} kind="lesson" paths={LESSON_PATHS} dialect={dialect} exitTo="/app/learn" exitLabel="Back to Learn" onPractise={vi.fn()} />
      <Where />
    </>,
    ['/app/learn/lesson/l1'],
  );
}

const live = (): string => [...document.querySelectorAll('[aria-live="polite"]')].map((el) => el.textContent).join(' | ');
const sheet = (): Promise<HTMLElement> => screen.findByRole('region', { name: 'Feedback' });

describe('pairs answered as they are made', () => {
  const match: DeliveredExercise = { id: 'm', type: 'match_pairs', lefts: ['sêv', 'av'], rights: ['water', 'apple'], pairOf: [1, 0] };

  it('keeps a right pair from either side, spent, and answers with the last pair made, with no Check to press', async () => {
    lesson([match]);
    await screen.findByText('Match the pairs');
    expect(screen.queryByRole('button', { name: 'Check' })).not.toBeInTheDocument();

    // the meaning first, then its Kurdish card
    await userEvent.click(screen.getByRole('button', { name: 'apple' }));
    expect(screen.getByRole('button', { name: 'apple' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'sêv' }));
    const made = screen.getByRole('button', { name: /sêv.*paired with apple/ });
    expect(made).toBeDisabled();
    expect(made).toHaveClass('is-right', 'is-flash');
    expect(screen.getByRole('button', { name: /apple.*paired with sêv/ })).toBeDisabled();
    expect(live()).toContain('sêv and apple: a pair');
    // settled: spent, flat on its lip
    await waitFor(() => expect(made).toHaveClass('is-spent'));
    expect(answers).toHaveLength(0);

    // and from the keyboard: a number picks a Kurdish card, Shift with it a meaning — the last pair answers at once
    await userEvent.keyboard('2{Shift>}1{/Shift}');
    await sheet();
    expect(answers[0]).toEqual({
      exerciseId: 'm',
      answer: {
        matches: [
          { left: 'sêv', right: 'apple' },
          { left: 'av', right: 'water' },
        ],
      },
    });
  });

  it('flashes a wrong pair, says so, and frees both cards again', async () => {
    lesson([match]);
    await screen.findByText('Match the pairs');
    await userEvent.click(screen.getByRole('button', { name: 'sêv' }));
    await userEvent.click(screen.getByRole('button', { name: 'water' }));
    const sev = screen.getByRole('button', { name: 'sêv' });
    expect(sev).toHaveClass('is-wrong', 'is-flash');
    expect(screen.getByRole('button', { name: 'water' })).toHaveClass('is-wrong', 'is-flash');
    expect(live()).toContain('sêv and water are not a pair');
    // nothing stays picked, and both can be tried again once the flash is over
    expect(sev).toBeEnabled();
    expect(sev).toHaveAttribute('aria-pressed', 'false');
    await waitFor(() => expect(sev).toHaveClass('is-idle'));
    expect(answers).toHaveLength(0);
  });

  it('pairs freely and checks them together when the server sends no pairOf', async () => {
    lesson([{ ...match, pairOf: undefined }]);
    await userEvent.click(await screen.findByRole('button', { name: 'sêv' }));
    await userEvent.click(screen.getByRole('button', { name: 'water' }));
    // a pair made, right or wrong, is kept until Check
    expect(screen.getByRole('button', { name: /sêv.*paired with water/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Check' })).toBeDisabled();
    expect(answers).toHaveLength(0);
  });
});

describe('an answer built from word tiles', () => {
  const translate: DeliveredExercise = { id: 't', type: 'translate', prompt: 'I eat bread', bank: ['nan', 'Ez', 'av', 'dixwim'] };
  const line = (): HTMLElement => screen.getByRole('group', { name: 'Your answer in Kurdish' });
  const bank = (): HTMLElement => screen.getByRole('group', { name: 'Word tiles' });
  const onLine = (): string[] => within(line()).queryAllByRole('button').map((b) => b.textContent ?? '');

  it('lays tiles on the line leaving ghosts, sends one home on a tap, takes the last back with Backspace, and answers with the words', async () => {
    lesson([translate]);
    expect(await screen.findByText('Translate this')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    const check = screen.getByRole('button', { name: 'Check' });
    expect(check).toBeDisabled();

    await userEvent.click(within(bank()).getByRole('button', { name: 'Ez' }));
    expect(onLine()).toEqual(['Ez']);
    // its place in the bank keeps a ghost, which is not a button
    expect(within(bank()).queryByRole('button', { name: 'Ez' })).not.toBeInTheDocument();
    expect(bank().querySelector('.tile-ghost')).toHaveTextContent('Ez');
    expect(live()).toContain('Added Ez');
    expect(check).toBeEnabled();

    await userEvent.click(within(bank()).getByRole('button', { name: 'av' }));
    await userEvent.click(within(bank()).getByRole('button', { name: 'nan' }));
    expect(onLine()).toEqual(['Ez', 'av', 'nan']);
    // a tap on the line sends a tile home; the ones after it close up
    await userEvent.click(within(line()).getByRole('button', { name: 'av' }));
    expect(onLine()).toEqual(['Ez', 'nan']);
    expect(within(bank()).getByRole('button', { name: 'av' })).toBeInTheDocument();
    expect(live()).toContain('Took back av');
    // Backspace takes back the last; a number lays that tile of the bank
    await userEvent.keyboard('{Backspace}');
    expect(onLine()).toEqual(['Ez']);
    await userEvent.keyboard('1');
    expect(onLine()).toEqual(['Ez', 'nan']);
    await userEvent.click(within(bank()).getByRole('button', { name: 'dixwim' }));

    await userEvent.click(check);
    await sheet();
    expect(answers[0]).toEqual({ exerciseId: 't', answer: { text: 'Ez nan dixwim' } });
    // the line stands, wearing the verdict, and its tiles no longer move
    expect(within(line()).getByRole('button', { name: 'nan' })).toHaveClass('is-right');
    expect(within(line()).getByRole('button', { name: 'nan' })).toBeDisabled();
  });

  it('switches to typing on a letter, carrying the tiles over, and remembers the choice on this device', async () => {
    lesson([translate, { ...translate, id: 't2' }]);
    await userEvent.click(within(await screen.findByRole('group', { name: 'Word tiles' })).getByRole('button', { name: 'Ez' }));
    await userEvent.keyboard('n');
    const field = await screen.findByRole('textbox', { name: 'Your answer in Kurdish' });
    expect(field).toHaveValue('Ez n');
    expect(field).toHaveFocus();
    expect(screen.getByText('Write this in Kurdish')).toBeInTheDocument();
    expect(localStorage.getItem('hevalo_answer_mode')).toBe('keys');
    await userEvent.type(field, 'an dixwim{Enter}');
    await sheet();
    expect(answers[0]).toEqual({ exerciseId: 't', answer: { text: 'Ez nan dixwim' } });

    // the next one opens on the keyboard, and the tiles are a tap away
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('textbox');
    await userEvent.click(screen.getByRole('button', { name: 'Use word tiles' }));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Word tiles' })).toBeInTheDocument();
    expect(localStorage.getItem('hevalo_answer_mode')).toBe('tiles');
    await userEvent.click(screen.getByRole('button', { name: 'Use keyboard' }));
    expect(await screen.findByRole('textbox')).toHaveFocus();
  });

  it('lays a Soranî answer right to left, and an English one left to right in the same course', async () => {
    lesson([{ id: 'l', type: 'listening', audioUrl: 'https://cdn.test/av.mp3', bank: ['ئاو', 'من', 'دەخۆمەوە'] }, { ...translate, bank: ['I', 'eat', 'bread'] }], 'sorani');
    expect(await screen.findByText('Tap what you hear')).toBeInTheDocument();
    const heard = screen.getByRole('group', { name: 'What you heard' });
    expect(heard).toHaveAttribute('dir', 'rtl');
    expect(heard).toHaveAttribute('lang', 'ckb');
    await userEvent.click(screen.getByRole('button', { name: 'من' }));
    await userEvent.click(screen.getByRole('button', { name: 'Check' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Continue' }));
    const english = await screen.findByRole('group', { name: 'Your answer in Kurdish' });
    expect(english).toHaveAttribute('dir', 'ltr');
    expect(english).not.toHaveAttribute('lang');
  });

  it('flies a tile from where it was to where it lands, and only fades it in under reduced motion', async () => {
    const flights: Keyframe[][] = [];
    // jsdom has neither layout nor web animations: each tile stands a little further along than the last
    let x = 0;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => {
      x += 40;
      return { left: x, top: x, right: x + 30, bottom: x + 30, width: 30, height: 30, x, y: x, toJSON: () => ({}) } as DOMRect;
    });
    Object.defineProperty(Element.prototype, 'animate', {
      configurable: true,
      value(keyframes: Keyframe[]) {
        flights.push(keyframes);
        return { cancel() {}, onfinish: null, oncancel: null } as unknown as Animation;
      },
    });
    try {
      lesson([translate, { ...translate, id: 't2' }]);
      await userEvent.click(within(await screen.findByRole('group', { name: 'Word tiles' })).getByRole('button', { name: 'Ez' }));
      expect(flights.some((k) => String(k[0]?.transform).startsWith('translate('))).toBe(true);

      flights.length = 0;
      vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList);
      await userEvent.click(within(screen.getByRole('group', { name: 'Word tiles' })).getByRole('button', { name: 'av' }));
      expect(flights).toEqual([[{ opacity: 0 }, { opacity: 1 }]]);
    } finally {
      delete (Element.prototype as { animate?: unknown }).animate;
    }
  });
});

describe('a prompt word and its meanings', () => {
  const mc: DeliveredExercise = {
    id: 'mc',
    type: 'multiple_choice',
    prompt: 'Sêv sor e',
    promptTokens: [{ text: 'Sêv', meanings: ['apple', 'an apple'] }, { text: ' ' }, { text: 'sor', meanings: ['red'] }, { text: ' ' }, { text: 'e' }],
    options: ['The apple is red', 'The water is cold'],
  };

  it('opens the meanings under a word, and closes them on Escape without leaving the lesson, on a second tap and on a tap elsewhere', async () => {
    lesson([mc]);
    const word = await screen.findByRole('button', { name: 'What “Sêv” means' });
    expect(word).toHaveAttribute('aria-expanded', 'false');
    // a word the course does not know is plain text
    expect(screen.queryByRole('button', { name: 'What “e” means' })).not.toBeInTheDocument();

    await userEvent.click(word);
    const list = screen.getByRole('list', { name: 'What “Sêv” means' });
    expect(within(list).getAllByRole('listitem').map((i) => i.textContent)).toEqual(['apple', 'an apple']);
    expect(word).toHaveAttribute('aria-expanded', 'true');
    expect(word).toHaveAttribute('aria-controls', list.id);

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(word).toHaveFocus();
    expect(screen.getByTestId('where')).toHaveTextContent('/app/learn/lesson/l1');

    // from the keyboard: Enter on the word opens it, another word takes its place
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('list', { name: 'What “Sêv” means' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'What “sor” means' }));
    expect(screen.queryByRole('list', { name: 'What “Sêv” means' })).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'What “sor” means' })).toHaveTextContent('red');
    await userEvent.click(screen.getByRole('button', { name: 'What “sor” means' }));
    expect(screen.queryByRole('list')).not.toBeInTheDocument();

    await userEvent.click(word);
    await userEvent.click(screen.getByText('Choose the answer'));
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    // opening a word answered nothing
    expect(answers).toHaveLength(0);
  });

  it('shows the prompt as it is when its pieces do not add up to it', async () => {
    lesson([{ ...mc, promptTokens: [{ text: 'Sêv', meanings: ['apple'] }] }]);
    expect(await screen.findByText('Sêv sor e')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /means/ })).not.toBeInTheDocument();
  });
});

describe('a run of right answers', () => {
  const typed = (id: string): DeliveredExercise => ({ id, type: 'translate', prompt: `word ${id}` });
  const answer = async (text: string): Promise<void> => {
    await userEvent.type(await screen.findByRole('textbox'), `${text}{Enter}`);
    await sheet();
  };
  const goOn = async (): Promise<void> => userEvent.click(await screen.findByRole('button', { name: 'Continue' }));

  it('is named over the bar from three, a new label as it grows, and gone with a miss', async () => {
    grade = (body) => (body.exerciseId === 'e' ? { verdict: 'wrong', accepted: false, correction: 'sêv', duplicate: false } : right);
    lesson(['a', 'b', 'c', 'd', 'e', 'f'].map(typed));
    const label = (): Element | null => document.querySelector('.lesson-progress-wrap .lesson-run-label');
    await answer('x');
    await goOn();
    await answer('x');
    expect(label()).toBeNull();
    await goOn();
    await answer('x');
    expect(label()).toHaveTextContent('×3 in a row');
    const three = label();
    await goOn();
    await answer('x');
    // grown: a new label, which pops as it arrives
    expect(label()).toHaveTextContent('×4 in a row');
    expect(label()).not.toBe(three);
    await goOn();
    await answer('sev');
    expect(label()).toBeNull();
  });

  it('names a milestone across the screen after its Continue, and a key goes on at once without answering anything', async () => {
    lesson(['a', 'b', 'c', 'd', 'e', 'f'].map(typed));
    for (let i = 0; i < 4; i++) {
      await answer('x');
      await goOn();
    }
    await answer('x');
    await goOn();
    const moment = document.querySelector('.lesson-run-moment');
    expect(moment).toHaveTextContent('5 in a row!');
    // the next exercise waits behind it
    expect(screen.getByRole('region', { name: 'Feedback' })).toBeInTheDocument();
    await userEvent.keyboard('{Enter}');
    expect(document.querySelector('.lesson-run-moment')).toBeNull();
    expect(await screen.findByText('word f')).toBeInTheDocument();
    // the Enter that skipped it neither went on twice nor answered the next one
    expect(screen.queryByRole('region', { name: 'Feedback' })).not.toBeInTheDocument();
    expect(answers).toHaveLength(5);
  });

  it('goes on by itself after a moment, under reduced motion too, and a tap skips it', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList);
    lesson(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k'].map(typed));
    for (let i = 0; i < 4; i++) {
      await answer('x');
      await goOn();
    }
    await answer('x');
    await goOn();
    expect(document.querySelector('.lesson-run-moment')).not.toBeNull();
    await waitFor(() => expect(document.querySelector('.lesson-run-moment')).toBeNull(), { timeout: 2500 });
    expect(await screen.findByText('word f')).toBeInTheDocument();
    for (let i = 0; i < 5; i++) {
      await answer('x');
      await goOn();
    }
    const ten = document.querySelector<HTMLElement>('.lesson-run-moment');
    expect(ten).toHaveTextContent('10 in a row!');
    await act(async () => ten!.click());
    expect(document.querySelector('.lesson-run-moment')).toBeNull();
    expect(await screen.findByText('word k')).toBeInTheDocument();
  });
});

describe('the verdict sheet', () => {
  it('rises in the verdict colour with a badge, the words in big type, the answer under its label, and Continue where Check was', async () => {
    grade = () => ({ verdict: 'wrong', accepted: false, correction: 'Good day', duplicate: false });
    lesson([{ id: 'mc', type: 'multiple_choice', prompt: '“Roj baş” tê çi wateyê?', options: ['Good night', 'Good day'] }]);
    await userEvent.click(await screen.findByRole('button', { name: /Good night/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Check' }));
    const panel = await sheet();
    expect(panel.closest('.lesson-bar')).toHaveClass('is-sheet', 'is-notyet');
    expect(panel.querySelector('.lesson-verdict-mark svg')).not.toBeNull();
    expect(within(panel).getByText('Not yet')).toBeInTheDocument();
    expect(within(panel).getByText('Answer:')).toHaveClass('lesson-correction-label');
    expect(within(panel).getByText('Good day')).toBeInTheDocument();
    const go = within(panel).getByRole('button', { name: 'Continue' });
    expect(go).toHaveClass('lesson-bar-go');
    expect(go).toHaveFocus();
  });
});
