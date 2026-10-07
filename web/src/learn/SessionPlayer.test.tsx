import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DeliveredExercise, PlayableSession } from '@kurda/shared';
import { renderApp, jsonResponse } from '../test/utils';
import { LESSON_PATHS, PRACTICE_PATHS, SessionPlayer, type SessionPaths } from './SessionPlayer';

/*
 * The lesson player against a fake API: each exercise type, the feedback, a
 * miss asked again through /retry, a resumed lesson, and the results. The
 * server's answers are scripted per exercise, so what is checked is what the
 * player sends and what it shows.
 */

interface Call {
  method: string;
  path: string;
  body: unknown;
  headers: Record<string, string>;
}

type Reply = unknown | ((body: unknown) => unknown);

let calls: Call[] = [];
let played: Array<{ src: string; rate: number }> = [];

function serve(routes: Record<string, Reply>, fallback: (call: Call) => Response | null = () => null): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;
      const method = init?.method ?? 'GET';
      const raw = init?.body;
      const body = typeof raw === 'string' ? (JSON.parse(raw) as unknown) : raw;
      const call = { method, path, body, headers: (init?.headers ?? {}) as Record<string, string> };
      if (path !== '/me') calls.push(call);
      if (path === '/me') return jsonResponse(200, { user: { id: 'me', username: 'me', emailVerified: true } });
      const own = fallback(call);
      if (own) return own;
      const reply = routes[`${method} ${path}`];
      if (reply === undefined) return jsonResponse(404, { code: 'NOT_FOUND', message: `no route ${method} ${path}` });
      if (reply instanceof Response) return reply;
      return jsonResponse(200, typeof reply === 'function' ? (reply as (b: unknown) => unknown)(body) : reply);
    }),
  );
}

/** What the player sent for one exercise, to /answers or /retry. */
const sent = (kind: 'answers' | 'retry', id?: string): Call[] =>
  calls.filter((c) => c.method === 'POST' && c.path.endsWith(`/${kind}`) && (!id || (c.body as { exerciseId?: string }).exerciseId === id));

const right = { verdict: 'correct', accepted: true, duplicate: false };

const results = (over: Record<string, unknown> = {}) => ({
  correct: 3,
  total: 4,
  accuracy: 0.75,
  mistakes: [],
  xpAwarded: 15,
  streak: { current: 3, longest: 5, freezes: 0, lastActiveOn: '2026-10-07' },
  firstCompletion: true,
  ...over,
});

function play(
  session: PlayableSession,
  over: Partial<Parameters<typeof SessionPlayer>[0]> = {},
): { onPractise: ReturnType<typeof vi.fn>; onRestart: ReturnType<typeof vi.fn> } {
  const onPractise = vi.fn();
  const onRestart = vi.fn();
  renderApp(
    <SessionPlayer
      session={session}
      kind="lesson"
      paths={LESSON_PATHS}
      dialect="kurmanji"
      exitTo="/app/learn"
      exitLabel="Back to Learn"
      onPractise={onPractise}
      onRestart={onRestart}
      {...over}
    />,
    ['/app/learn/lesson/l1'],
  );
  return { onPractise, onRestart };
}

const typed = (id: string, prompt: string, type: DeliveredExercise['type'] = 'translate'): DeliveredExercise => ({ id, type, prompt });

async function answerTyped(text: string): Promise<void> {
  const field = await screen.findByRole('textbox');
  await userEvent.type(field, `${text}{Enter}`);
}

/** The verdict, as the feedback panel shows it (the live region says it too). */
async function verdict(text: string): Promise<HTMLElement> {
  const panel = await screen.findByRole('region', { name: 'Feedback' });
  return within(panel).getByText(text);
}

async function next(): Promise<void> {
  await userEvent.click(await screen.findByRole('button', { name: 'Continue' }));
}

beforeEach(() => {
  calls = [];
  played = [];
  localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
    played.push({ src: this.src, rate: this.playbackRate });
    return Promise.resolve();
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('multiple choice, feedback, a miss asked again, and the results', () => {
  const mc: DeliveredExercise = {
    id: 'mc',
    type: 'multiple_choice',
    prompt: '“Roj baş” tê çi wateyê?',
    options: ['Good night', 'Good day', 'Goodbye'],
  };
  const session: PlayableSession = {
    sessionId: 's1',
    exercises: [mc, typed('t1', 'apple'), typed('t2', 'water'), typed('t3', 'bread')],
    answered: {},
  };

  it('answers with a key, says “not yet” in words, and asks the miss again three exercises on — through /retry', async () => {
    serve({
      'POST /sessions/s1/answers': (body: unknown) =>
        (body as { exerciseId: string }).exerciseId === 'mc'
          ? { verdict: 'wrong', accepted: false, correction: 'Good day', modelAudioUrl: 'https://cdn.test/rojbas.mp3', duplicate: false }
          : right,
      'POST /sessions/s1/retry': { verdict: 'correct', accepted: true },
      'POST /sessions/s1/complete': results({
        mistakes: [{ exerciseId: 'mc', verdict: 'wrong', prompt: '“Roj baş” tê çi wateyê?', correction: 'Good day' }],
      }),
    });
    const { onPractise } = play(session);

    expect(await screen.findByText('Choose the answer')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Progress' })).toHaveAttribute('aria-valuenow', '0');
    await userEvent.keyboard('1');

    const feedback = await screen.findByRole('region', { name: 'Feedback' });
    expect(within(feedback).getByText('Not yet')).toBeInTheDocument();
    expect(within(feedback).getByText('Good day')).toBeInTheDocument();
    expect(within(feedback).getByText('You will see this one again shortly.')).toBeInTheDocument();
    // the chosen option and the right one are told apart by more than colour
    expect(screen.getByText('your answer')).toBeInTheDocument();
    expect(screen.getByText('right answer')).toBeInTheDocument();
    // the verdict is announced, and the focus is on the feedback for Enter
    expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent('Not yet The answer: Good day');
    expect(feedback).toHaveFocus();
    expect(sent('answers', 'mc')[0]!.body).toEqual({ exerciseId: 'mc', answer: { choice: 0 } });

    // the native recording, now that hearing it gives nothing away
    await userEvent.click(within(feedback).getByRole('button', { name: 'Hear it' }));
    expect(played.at(-1)).toEqual({ src: 'https://cdn.test/rojbas.mp3', rate: 1 });

    // Enter goes on from the panel (the button just pressed would take it itself)
    feedback.focus();
    await userEvent.keyboard('{Enter}');
    for (const word of ['sêv', 'av', 'nan']) {
      await answerTyped(word);
      await next();
    }

    // the miss comes back, marked as a second try, and goes to /retry
    expect(await screen.findByText('Second try')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Good day/ }));
    const second = await screen.findByRole('region', { name: 'Feedback' });
    expect(within(second).getByText('Correct')).toBeInTheDocument();
    expect(within(second).getByText('A second try is practice: it does not change your score.')).toBeInTheDocument();
    expect(sent('retry', 'mc')).toHaveLength(1);
    expect(sent('answers', 'mc')).toHaveLength(1);
    await next();

    // the results: first-try accuracy, XP, the streak, and the mistake with its answer
    expect(await screen.findByRole('heading', { name: 'Lesson finished' })).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByText('3 of 4')).toBeInTheDocument();
    expect(screen.getByText('+15')).toBeInTheDocument();
    const mistakes = screen.getByRole('heading', { name: 'To go over' }).parentElement!;
    expect(within(mistakes).getByText('“Roj baş” tê çi wateyê?')).toBeInTheDocument();
    expect(within(mistakes).getByText('Good day')).toBeInTheDocument();
    expect(calls.filter((c) => c.path === '/sessions/s1/complete')).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: 'Practise these now' }));
    expect(onPractise).toHaveBeenCalledWith(['mc']);
  });

  it('a miss never ends the lesson: every answer wrong still runs to the results', async () => {
    serve({
      'POST /sessions/s1/answers': { verdict: 'wrong', accepted: false, correction: 'x', duplicate: false },
      'POST /sessions/s1/retry': { verdict: 'wrong', accepted: false, correction: 'x' },
      'POST /sessions/s1/complete': results({ correct: 0, accuracy: 0 }),
    });
    play({ sessionId: 's1', exercises: [typed('a', 'one'), typed('b', 'two')], answered: {} });
    // two first asks and two second tries, then the end
    for (let i = 0; i < 4; i++) {
      await answerTyped('no');
      await next();
    }
    expect(await screen.findByRole('heading', { name: 'Lesson finished' })).toBeInTheDocument();
    expect(sent('answers')).toHaveLength(2);
    expect(sent('retry')).toHaveLength(2);
  });
});

describe('a typed answer', () => {
  it('puts a Kurdish letter at the caret and sets the answer above the right one, marking what differs', async () => {
    serve({
      'POST /sessions/s1/answers': { verdict: 'typo', accepted: true, correction: 'sêv', duplicate: false },
      'POST /sessions/s1/complete': results(),
    });
    play({ sessionId: 's1', exercises: [typed('t', 'apple')], answered: {} });

    const field = await screen.findByRole<HTMLInputElement>('textbox', { name: 'Your answer in Kurdish' });
    expect(field).toHaveFocus();
    expect(field).toHaveAttribute('lang', 'ku');
    await userEvent.type(field, 'sv');
    field.setSelectionRange(1, 1);
    await userEvent.click(screen.getByRole('button', { name: 'Type ê' }));
    expect(field).toHaveValue('sêv');
    expect(field).toHaveFocus();
    expect(field.selectionStart).toBe(2);

    // what was sent is a different spelling, so the panel has something to mark
    await userEvent.clear(field);
    await userEvent.type(field, 'sev{Enter}');
    const feedback = await screen.findByRole('region', { name: 'Feedback' });
    expect(within(feedback).getByText('Almost — it counts, but check the letters')).toBeInTheDocument();
    const marks = [...feedback.querySelectorAll('mark')].map((m) => m.textContent);
    expect(marks).toEqual(['e', 'ê']);
    expect(within(feedback).getByText('You wrote').nextElementSibling).toHaveTextContent('sev');
    expect(within(feedback).getByText('Right answer').nextElementSibling).toHaveTextContent('sêv');
    expect(sent('answers')[0]!.body).toEqual({ exerciseId: 't', answer: { text: 'sev' } });
  });

  it('offers the Soranî letters, right to left, in a Soranî course', async () => {
    serve({});
    play({ sessionId: 's1', exercises: [typed('t', 'house')], answered: {} }, { dialect: 'sorani' });
    const field = await screen.findByRole('textbox');
    expect(field).toHaveAttribute('lang', 'ckb');
    expect(field).toHaveAttribute('dir', 'rtl');
    expect(screen.getByRole('button', { name: 'Type ڕ' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Type ê' })).not.toBeInTheDocument();
  });
});

describe('listening', () => {
  const clip = 'https://cdn.test/av.mp3';

  it('plays the recording, slower on request, and is graded on what was typed', async () => {
    serve({ 'POST /sessions/s1/answers': right, 'POST /sessions/s1/complete': results() });
    play({ sessionId: 's1', exercises: [{ id: 'l', type: 'listening', audioUrl: clip }], answered: {} });

    expect(await screen.findByText('Type what you hear')).toBeInTheDocument();
    await waitFor(() => expect(played).toContainEqual({ src: clip, rate: 1 }));
    await userEvent.click(screen.getByRole('button', { name: 'Slower (0.75×)' }));
    expect(played.at(-1)).toEqual({ src: clip, rate: 0.75 });
    await answerTyped('av');
    expect(await verdict('Correct')).toBeInTheDocument();
    expect(sent('answers')[0]!.body).toEqual({ exerciseId: 'l', answer: { text: 'av' } });
  });

  it('“Can’t listen now” moves on without an answer, a mistake or a second try', async () => {
    serve({ 'POST /sessions/s1/answers': right, 'POST /sessions/s1/complete': results() });
    play({ sessionId: 's1', exercises: [{ id: 'l', type: 'listening', audioUrl: clip }, typed('t', 'apple')], answered: {} });

    await userEvent.click(await screen.findByRole('button', { name: 'Can’t listen now' }));
    expect(await screen.findByText('Write this in Kurdish')).toBeInTheDocument();
    await answerTyped('sêv');
    await next();
    await screen.findByRole('heading', { name: 'Lesson finished' });
    expect(sent('answers').map((c) => (c.body as { exerciseId: string }).exerciseId)).toEqual(['t']);
    expect(sent('retry')).toHaveLength(0);
  });

  it('is put off by itself when it has no recording to play', async () => {
    serve({});
    play({ sessionId: 's1', exercises: [{ id: 'l', type: 'listening' }, typed('t', 'apple')], answered: {} });
    expect(await screen.findByText('Write this in Kurdish')).toBeInTheDocument();
    expect(screen.queryByText('Type what you hear')).not.toBeInTheDocument();
    expect(sent('answers')).toHaveLength(0);
  });
});

describe('speaking', () => {
  class FakeRecorder {
    static isTypeSupported = (): boolean => true;
    state = 'inactive';
    mimeType: string;
    ondataavailable: ((e: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    constructor(_stream: unknown, options?: { mimeType?: string }) {
      this.mimeType = options?.mimeType ?? 'audio/webm';
    }
    start(): void {
      this.state = 'recording';
    }
    stop(): void {
      this.state = 'inactive';
      this.ondataavailable?.({ data: new Blob([new Uint8Array(4000)], { type: this.mimeType }) });
      this.onstop?.();
    }
  }

  let now = 1_000_000;
  const speaking: DeliveredExercise = { id: 'sp', type: 'speaking', prompt: 'Say “Silav”', modelAudioUrl: 'https://cdn.test/silav.mp3' };

  function microphone(getUserMedia: () => Promise<unknown>): void {
    vi.stubGlobal('MediaRecorder', FakeRecorder);
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    URL.createObjectURL = vi.fn(() => 'blob:take');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(Date, 'now').mockImplementation(() => now);
  }

  afterEach(() => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
  });

  it('records after a tap, uploads, plays both voices and sends the learner’s own rating', async () => {
    const track = { stop: vi.fn() };
    microphone(async () => ({ getTracks: () => [track] }));
    serve(
      {
        'POST /media/uploads': { key: 'speaking/abc', url: 'https://cdn.test/speaking/abc', contentType: 'audio/webm' },
        'POST /sessions/s1/answers': { verdict: 'typo', accepted: true, correction: 'Silav', duplicate: false },
      },
      (call) => (call.path === '/media/uploads' ? jsonResponse(201, { key: 'speaking/abc' }) : null),
    );
    play({ sessionId: 's1', exercises: [speaking], answered: {} });

    expect(await screen.findByText('Say it aloud')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Hear a native speaker' }));
    expect(played.at(-1)?.src).toBe('https://cdn.test/silav.mp3');

    await userEvent.click(screen.getByRole('button', { name: 'Record' }));
    expect(await screen.findByText('Recording… say it, then press Stop.')).toBeInTheDocument();
    now += 2000;
    await userEvent.click(screen.getByRole('button', { name: 'Stop' }));

    // the microphone is handed back, the take goes up as plain WebM
    expect(track.stop).toHaveBeenCalled();
    expect(await screen.findByText('How did it sound to you?')).toBeInTheDocument();
    const upload = calls.find((c) => c.path === '/media/uploads')!;
    expect(upload.headers['content-type']).toBe('audio/webm');

    await userEvent.click(screen.getByRole('button', { name: 'Hear yourself' }));
    expect(played.at(-1)?.src).toBe('blob:take');

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(await verdict('You said it was close')).toBeInTheDocument();
    expect(sent('answers')[0]!.body).toEqual({ exerciseId: 'sp', answer: { audioKey: 'speaking/abc', selfRating: 'close' } });
  });

  it('turns away a slipped tap before spending an upload', async () => {
    microphone(async () => ({ getTracks: () => [] }));
    serve({});
    play({ sessionId: 's1', exercises: [speaking], answered: {} });
    await userEvent.click(await screen.findByRole('button', { name: 'Record' }));
    now += 200;
    await userEvent.click(await screen.findByRole('button', { name: 'Stop' }));
    expect(await screen.findByText('That was very short. Record the whole phrase.')).toBeInTheDocument();
    expect(calls.some((c) => c.path === '/media/uploads')).toBe(false);
  });

  it('says plainly when the microphone is refused, and can be skipped', async () => {
    microphone(async () => {
      throw new DOMException('denied', 'NotAllowedError');
    });
    serve({ 'POST /sessions/s1/answers': right });
    play({ sessionId: 's1', exercises: [speaking, typed('t', 'apple')], answered: {} });
    await userEvent.click(await screen.findByRole('button', { name: 'Record' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Hevalo was not allowed to use the microphone');
    await userEvent.click(screen.getByRole('button', { name: 'Can’t speak now' }));
    expect(await screen.findByText('Write this in Kurdish')).toBeInTheDocument();
    expect(sent('answers')).toHaveLength(0);
  });
});

describe('match pairs', () => {
  it('pairs a Kurdish card with its meaning, numbers the pair on both, plays the card, and sends the pairs', async () => {
    serve({ 'POST /sessions/s1/answers': right });
    play({
      sessionId: 's1',
      exercises: [{ id: 'm', type: 'match_pairs', lefts: ['sêv', 'av'], rights: ['water', 'apple'], audio: { sêv: 'https://cdn.test/sev.mp3' } }],
      answered: {},
    });

    const check = await screen.findByRole('button', { name: 'Check' });
    expect(check).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'sêv' }));
    expect(played.at(-1)?.src).toBe('https://cdn.test/sev.mp3');
    expect(screen.getByRole('button', { name: 'sêv' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'apple' }));
    expect(screen.getByRole('button', { name: /sêv.*paired with apple/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /apple.*paired with sêv/ })).toBeInTheDocument();
    // a Kurdish card is marked as Kurdish for a screen reader
    expect(screen.getByText('sêv')).toHaveAttribute('lang', 'ku');

    await userEvent.click(screen.getByRole('button', { name: 'av' }));
    await userEvent.click(screen.getByRole('button', { name: 'water' }));
    await userEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(await verdict('Correct')).toBeInTheDocument();
    expect(sent('answers')[0]!.body).toEqual({
      exerciseId: 'm',
      answer: {
        matches: [
          { left: 'sêv', right: 'apple' },
          { left: 'av', right: 'water' },
        ],
      },
    });
  });
});

describe('leaving and coming back', () => {
  const exercises = ['a', 'b', 'c', 'd', 'e'].map((id) => typed(id, `word ${id}`));

  it('picks up at the first unanswered exercise, with an earlier miss still to come back', async () => {
    serve({ 'POST /sessions/s9/answers': right, 'POST /sessions/s9/retry': right });
    play({ sessionId: 's9', exercises, answered: { a: { verdict: 'correct', accepted: true }, b: { verdict: 'wrong', accepted: false } } });

    expect(await screen.findByText('word c')).toBeInTheDocument();
    for (let i = 0; i < 3; i++) {
      await answerTyped('x');
      await next();
    }
    expect(await screen.findByText('Second try')).toBeInTheDocument();
    expect(screen.getByText('word b')).toBeInTheDocument();
  });

  it('does not ask a second time what this tab already asked again', async () => {
    sessionStorage.setItem('hevalo:reasked:s9', JSON.stringify(['b']));
    serve({ 'POST /sessions/s9/answers': right, 'POST /sessions/s9/complete': results() });
    play({ sessionId: 's9', exercises, answered: { a: { verdict: 'correct', accepted: true }, b: { verdict: 'wrong', accepted: false } } });
    for (const id of ['c', 'd', 'e']) {
      expect(await screen.findByText(`word ${id}`)).toBeInTheDocument();
      await answerTyped('x');
      await next();
    }
    expect(await screen.findByRole('heading', { name: 'Lesson finished' })).toBeInTheDocument();
    expect(sent('retry')).toHaveLength(0);
  });
});

describe('when the server says no', () => {
  it('offers to send the same answer again after a network failure', async () => {
    let fail = true;
    serve({}, (call) => {
      if (call.path !== '/sessions/s1/answers') return null;
      if (fail) {
        fail = false;
        throw new TypeError('network down');
      }
      return jsonResponse(200, right);
    });
    play({ sessionId: 's1', exercises: [typed('t', 'apple')], answered: {} });
    await answerTyped('sêv');
    const alert = await screen.findByRole('alert');
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await verdict('Correct')).toBeInTheDocument();
    expect(sent('answers').map((c) => c.body)).toEqual([
      { exerciseId: 't', answer: { text: 'sêv' } },
      { exerciseId: 't', answer: { text: 'sêv' } },
    ]);
  });

  it('says a session has closed and offers a fresh one', async () => {
    serve({
      'POST /sessions/s1/answers': jsonResponse(409, { code: 'SESSION_EXPIRED', message: 'session has expired' }),
    });
    const { onRestart } = play({ sessionId: 's1', exercises: [typed('t', 'apple')], answered: {} });
    await answerTyped('sêv');
    expect(await screen.findByText('This session has closed')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRestart).toHaveBeenCalled();
  });

  it('lets a second try go when the server will not grade it', async () => {
    serve({
      'POST /sessions/s1/answers': { verdict: 'wrong', accepted: false, correction: 'sêv', duplicate: false },
      'POST /sessions/s1/retry': jsonResponse(409, { code: 'EXERCISE_NOT_ANSWERED', message: 'no' }),
      'POST /sessions/s1/complete': results(),
    });
    play({ sessionId: 's1', exercises: [typed('t', 'apple')], answered: {} });
    await answerTyped('nan');
    await next();
    expect(await screen.findByText('Second try')).toBeInTheDocument();
    await answerTyped('sêv');
    expect(await screen.findByRole('heading', { name: 'Lesson finished' })).toBeInTheDocument();
  });
});

describe('a review', () => {
  it('plays in the same player against the practice endpoints, and ends with its misses', async () => {
    serve({
      'POST /practice/sessions/p1/answers': { verdict: 'wrong', accepted: false, correction: 'sêv', duplicate: false },
      'POST /practice/sessions/p1/retry': right,
      'POST /practice/sessions/p1/complete': results({
        correct: 0,
        total: 1,
        accuracy: 0,
        xpAwarded: 3,
        firstCompletion: undefined,
        mistakes: [{ exerciseId: 't', verdict: 'wrong', prompt: 'apple', correction: 'sêv' }],
      }),
    });
    const paths: SessionPaths = PRACTICE_PATHS;
    play({ sessionId: 'p1', exercises: [typed('t', 'apple')] }, { kind: 'practice', paths, dialect: undefined });
    await answerTyped('nan');
    await next();
    await answerTyped('sêv');
    await next();
    expect(await screen.findByRole('heading', { name: 'Review finished' })).toBeInTheDocument();
    expect(screen.getByText('sêv')).toHaveAttribute('lang', 'ku');
    expect(sent('retry')).toHaveLength(1);
    expect(calls.some((c) => c.path === '/practice/sessions/p1/complete')).toBe(true);
  });
});

describe('Tips', () => {
  it('opens the skill’s grammar note over the lesson, drawn as elements and not as markup', async () => {
    serve({});
    play(
      { sessionId: 's1', exercises: [typed('t', 'apple')], answered: {} },
      { grammarMd: '# Silavkirin\n\n- **Silav** — hello\n\n<img src=x onerror=alert(1)>' },
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Tips' }));
    const dialog = screen.getByRole('dialog', { name: 'Tips' });
    expect(within(dialog).getByRole('heading', { name: 'Silavkirin' })).toBeInTheDocument();
    expect(within(dialog).getByText('Silav').tagName).toBe('STRONG');
    expect(dialog.querySelector('img')).toBeNull();
    await act(async () => {
      await userEvent.keyboard('{Escape}');
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('takes no answer, and goes on from no feedback, from a key pressed while the Tips are open', async () => {
    serve({ 'POST /sessions/s1/answers': right });
    play(
      { sessionId: 's1', exercises: [{ id: 'mc', type: 'multiple_choice', options: ['a', 'b'] }, typed('t', 'apple')], answered: {} },
      { grammarMd: '# Silavkirin' },
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Tips' }));
    await userEvent.keyboard('1');
    expect(sent('answers')).toHaveLength(0);
    await act(async () => {
      await userEvent.keyboard('{Escape}');
    });

    await userEvent.keyboard('2');
    await screen.findByRole('region', { name: 'Feedback' });
    await userEvent.click(screen.getByRole('button', { name: 'Tips' }));
    await userEvent.keyboard('{Enter}');
    // still on the feedback behind the dialog
    expect(screen.getByRole('region', { name: 'Feedback' })).toBeInTheDocument();
    expect(screen.queryByText('apple')).not.toBeInTheDocument();
  });
});
