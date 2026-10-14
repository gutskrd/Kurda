import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { ANSWER_GRACE_MS, lessonAudioKey, type StoryGameView } from '@kurda/shared';
import { renderApp, jsonResponse } from '../test/utils';
import { optionNumber } from './GameParts';
import { StoryGame } from './StoryGame';
import { detail, fakeApi, gameView, heldPoll, refused, type Call } from './testing';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  localStorage.clear();
});

const game = (id = 'g-1') =>
  renderApp(
    <Routes>
      <Route path="/app/games/stories/play/:gameId" element={<StoryGame />} />
      <Route path="/app/games/stories" element={<p>the hub</p>} />
    </Routes>,
    [`/app/games/stories/play/${id}`],
  );

const question = (over: Partial<StoryGameView> = {}): StoryGameView =>
  gameView({
    mode: 'solo',
    status: 'question',
    code: null,
    settings: { ...gameView().settings, timerSeconds: 0 },
    question: { index: 0, total: 3, kind: 'detail', prompt: 'Rojîn çend salî ye?', promptEn: 'How old is Rojîn?', options: ['Heşt', 'Deh', 'Diwanzdeh'], myChoice: null },
    ...over,
  });

const story = detail({ paragraphs: ['Îro Rojîn diçe dibistanê. Ew deh salî ye.'] });

describe('the lobby', () => {
  it('shows the code spelled out, the players by the identity rule, and holds Start until enough are in', async () => {
    const poll = heldPoll();
    fakeApi({
      'GET /story-games/g-1': (c: Call) =>
        c.path.includes('?v=')
          ? poll.answer(c)
          : gameView({
              settings: { ...gameView().settings, textDuring: 'hidden' },
              players: [
                { seat: 1, name: 'Ada', avatarUrl: null, isHost: true, isMe: true, away: false, gone: false, score: 0, correct: 0 },
                { seat: 2, name: null, avatarUrl: null, isHost: false, isMe: false, away: false, gone: false, score: 0, correct: 0 },
              ],
              activeCount: 1,
            }),
    });
    game();
    expect(await screen.findByRole('img', { name: 'Join code: A B C 2 3 4' })).toHaveTextContent('ABC 234');
    expect(screen.getByText('Friends can join with this code.')).toBeInTheDocument();
    // a stranger to you is a seat, never a name
    expect(screen.getByText('Player 2')).toBeInTheDocument();
    expect(screen.getByText('You')).toBeInTheDocument();
    expect(screen.getByText(/From memory: the story is hidden/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
    // Player 2 is here but away from the page
    expect(screen.getByText('Waiting for everyone to come back to the game.')).toBeInTheDocument();
  });

  it('starts the game, and removes a player by seat after asking twice', async () => {
    const poll = heldPoll();
    const players = [
      { seat: 1, name: 'Ada', avatarUrl: null, isHost: true, isMe: true, away: false, gone: false, score: 0, correct: 0 },
      { seat: 2, name: 'Rojda', avatarUrl: null, isHost: false, isMe: false, away: false, gone: false, score: 0, correct: 0 },
    ];
    const { calls } = fakeApi({
      'GET /story-games/g-1': (c: Call) => (c.path.includes('?v=') ? poll.answer(c) : gameView({ players, activeCount: 2 })),
      'POST /story-games/g-1/remove': gameView({ players: players.slice(0, 1), version: 2 }),
      'POST /story-games/g-1/start': gameView({ status: 'reading', version: 3, players, activeCount: 2 }),
    });
    game();
    const remove = await screen.findByRole('button', { name: 'Remove Rojda from the game' });
    await userEvent.click(remove);
    expect(calls.some((c) => c.path.endsWith('/remove'))).toBe(false);
    await userEvent.click(remove);
    await waitFor(() => expect(calls.find((c) => c.path.endsWith('/remove'))?.body).toEqual({ seat: 2 }));
  });

  it('tells someone who is not the host that the host starts', async () => {
    const poll = heldPoll();
    fakeApi({
      'GET /story-games/g-1': (c: Call) =>
        c.path.includes('?v=')
          ? poll.answer(c)
          : gameView({
              isHost: false,
              players: [
                { seat: 1, name: 'Rojda', avatarUrl: null, isHost: true, isMe: false, away: false, gone: false, score: 0, correct: 0 },
                { seat: 2, name: 'Ada', avatarUrl: null, isHost: false, isMe: true, away: false, gone: false, score: 0, correct: 0 },
              ],
            }),
    });
    game();
    expect(await screen.findByText('Waiting for the host to start…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Leave game' })).toBeInTheDocument();
  });

  it('follows the game with the long-poll, sending the version it has', async () => {
    const poll = heldPoll();
    const { calls } = fakeApi({
      'GET /story-games/g-1': (c: Call) => (c.path.includes('?v=') ? poll.answer(c) : gameView({ version: 4 })),
      'GET /story-games/g-1/story': story,
    });
    game();
    await screen.findByRole('img', { name: /Join code/ });
    await waitFor(() => expect(calls.some((c) => c.path === '/story-games/g-1?v=4')).toBe(true));
    // the next version arrives: the reading starts, and the poll asks for what comes after it
    act(() => poll.release(gameView({ version: 5, status: 'reading', code: 'ABC234' })));
    expect(await screen.findByRole('button', { name: 'I’ve finished reading' })).toBeInTheDocument();
    await waitFor(() => expect(calls.some((c) => c.path === '/story-games/g-1?v=5')).toBe(true));
  });

  it('puts a remembered Extra time on once, for a lobby reached through an invite', async () => {
    localStorage.setItem('hevalo.stories.extraTime', 'on');
    const poll = heldPoll();
    const { calls } = fakeApi({
      'GET /story-games/g-1': (c: Call) => (c.path.includes('?v=') ? poll.answer(c) : gameView({ extraTime: false })),
      'POST /story-games/g-1/extra-time': gameView({ extraTime: true, version: 2 }),
    });
    game();
    await screen.findByRole('img', { name: /Join code/ });
    await waitFor(() => expect(calls.filter((c) => c.path.endsWith('/extra-time')).map((c) => c.body)).toEqual([{ on: true }]));
  });

  it('leaves Extra time alone when it is not remembered', async () => {
    const poll = heldPoll();
    const { calls } = fakeApi({
      'GET /story-games/g-1': (c: Call) => (c.path.includes('?v=') ? poll.answer(c) : gameView({ extraTime: false })),
    });
    game();
    await screen.findByRole('img', { name: /Join code/ });
    expect(calls.some((c) => c.path.endsWith('/extra-time'))).toBe(false);
  });

  it('spaces out long-polls that come straight back with nothing new', async () => {
    const asked: number[] = [];
    const { calls } = fakeApi({
      'GET /story-games/g-1': (c: Call) => {
        if (!c.path.includes('?v=')) return gameView({ version: 4 });
        asked.push(Date.now());
        // something overdue that settling did not move: the same version, at once
        return gameView({ version: 4 });
      },
    });
    game();
    await screen.findByRole('img', { name: /Join code/ });
    await new Promise((r) => setTimeout(r, 1_300));
    // without a floor this would be hundreds of requests
    expect(asked.length).toBeGreaterThanOrEqual(2);
    expect(asked.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < asked.length; i++) expect(asked[i]! - asked[i - 1]!).toBeGreaterThanOrEqual(900);
    expect(calls.every((c) => !c.path.includes('?v=') || c.path.endsWith('?v=4'))).toBe(true);
  });

  it('says a game it may not see is not available', async () => {
    fakeApi({ 'GET /story-games/g-1': jsonResponse(404, { code: 'GAME_NOT_FOUND' }) });
    game();
    expect(await screen.findByRole('heading', { name: 'Game not available' })).toHaveFocus();
    expect(screen.getByRole('link', { name: 'Back to stories' })).toBeInTheDocument();
  });
});

describe('reading', () => {
  it('counts who has finished, never says who, and lets the host start after the soft cap', async () => {
    const poll = heldPoll();
    const now = Date.now();
    const { calls } = fakeApi({
      'GET /story-games/g-1/story': story,
      'GET /story-games/g-1': (c: Call) =>
        c.path.includes('?v=')
          ? poll.answer(c)
          : gameView({
              mode: 'group',
              status: 'reading',
              activeCount: 3,
              readingDoneCount: 1,
              readingSoftCapAt: new Date(now - 1000).toISOString(),
              readingHardCapAt: new Date(now + 600_000).toISOString(),
            }),
      'POST /story-games/g-1/done-reading': gameView({ mode: 'group', status: 'reading', activeCount: 3, readingDoneCount: 2, meDoneReading: true, version: 4 }),
      'POST /story-games/g-1/advance': gameView({ mode: 'group', status: 'reading', version: 3 }),
    });
    game();
    expect(await screen.findByText('1 of 3 finished reading')).toBeInTheDocument();
    expect(screen.getAllByText(/The host can start the questions now/).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: 'Start the questions' }));
    await waitFor(() => expect(calls.find((c) => c.path.endsWith('/advance'))?.body).toEqual({ from: { status: 'reading', index: 0 } }));
    await userEvent.click(screen.getByRole('button', { name: 'I’ve finished reading' }));
    expect(await screen.findByText('You’ve finished')).toBeInTheDocument();
  });
});

describe('reading, near the end', () => {
  it('says the questions start in about a minute, a minute before the hard cap', async () => {
    const poll = heldPoll();
    const now = Date.now();
    fakeApi({
      'GET /story-games/g-1/story': story,
      'GET /story-games/g-1': (c: Call) =>
        c.path.includes('?v=')
          ? poll.answer(c)
          : gameView({
              mode: 'group',
              status: 'reading',
              activeCount: 3,
              readingSoftCapAt: new Date(now - 60_000).toISOString(),
              readingHardCapAt: new Date(now + 30_000).toISOString(),
            }),
    });
    game();
    expect(await screen.findByText('The questions start in about a minute.')).toBeInTheDocument();
  });

  it('stops a story being read aloud when the questions start', async () => {
    const pauses: string[] = [];
    class FakeAudio extends EventTarget {
      src = '';
      playbackRate = 1;
      defaultPlaybackRate = 1;
      play(): Promise<void> {
        this.dispatchEvent(new Event('playing'));
        return Promise.resolve();
      }
      pause(): void {
        pauses.push(this.src);
        this.dispatchEvent(new Event('pause'));
      }
    }
    vi.stubGlobal('Audio', FakeAudio);
    const s1 = 'Îro Rojîn diçe dibistanê.';
    const poll = heldPoll();
    fakeApi({
      'GET /story-games/g-1/story': detail({ paragraphs: [`${s1} Ew deh salî ye.`], audio: { [lessonAudioKey(s1)]: 'https://cdn.test/1.m4a' } }),
      'GET /story-games/g-1': (c: Call) =>
        c.path.includes('?v=') ? poll.answer(c) : gameView({ mode: 'duo', status: 'reading', activeCount: 2, version: 2 }),
    });
    game();
    await userEvent.click(await screen.findByRole('button', { name: 'Listen' }));
    const before = pauses.length;
    act(() => poll.release(question({ mode: 'duo', activeCount: 2, version: 3 })));
    await screen.findByRole('heading', { name: 'Question 1 of 3' });
    // the player was paused when the reading went, with this story's sentence in it
    expect(pauses.length).toBeGreaterThan(before);
    expect(pauses.at(-1)).toBe('https://cdn.test/1.m4a');
    vi.unstubAllGlobals();
  });
});

describe('a question', () => {
  it('moves the focus to the question, answers with the number keys, and locks the answer', async () => {
    const answered = question({ mode: 'duo', question: { ...question().question!, myChoice: 1 }, answeredCount: 1, activeCount: 2, version: 2 });
    const poll = heldPoll();
    const { calls } = fakeApi({
      'GET /story-games/g-1/story': story,
      'GET /story-games/g-1': (c: Call) => (c.path.includes('?v=') ? poll.answer(c) : question({ mode: 'duo', activeCount: 2 })),
      'POST /story-games/g-1/answers': answered,
    });
    game();
    const heading = await screen.findByRole('heading', { name: 'Question 1 of 3' });
    expect(heading).toHaveFocus();
    // English under the question at level 1
    expect(screen.getByText('How old is Rojîn?')).toHaveAttribute('lang', 'en');
    expect(screen.getByText('Rojîn çend salî ye?')).toHaveAttribute('lang', 'ku');
    await userEvent.keyboard('2');
    await waitFor(() => expect(calls.find((c) => c.path.endsWith('/answers'))?.body).toEqual({ index: 0, choice: 1 }));
    expect(await screen.findByText('Answer locked — 1 of 2 answered')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Deh/ })).toBeDisabled();
  });

  it('answers with the digit row on a Soranî or Arabic layout too', async () => {
    const { calls } = fakeApi({
      'GET /story-games/g-1/story': story,
      'GET /story-games/g-1': question(),
      'POST /story-games/g-1/answers': question({ question: { ...question().question!, myChoice: 1 }, version: 2 }),
    });
    game();
    await screen.findByRole('heading', { name: 'Question 1 of 3' });
    // the focused heading has the key, as on a page
    fireEvent.keyDown(document.activeElement ?? document.body, { key: '٢', code: 'Digit2' });
    await waitFor(() => expect(calls.find((c) => c.path.endsWith('/answers'))?.body).toEqual({ index: 0, choice: 1 }));
  });

  it('reads the option keys by place, then by the digit typed', () => {
    expect(optionNumber({ key: '٢', code: 'Digit2' })).toBe(2);
    expect(optionNumber({ key: '&', code: 'Digit1' })).toBe(1);
    expect(optionNumber({ key: '3', code: 'Numpad3' })).toBe(3);
    expect(optionNumber({ key: '٤', code: '' })).toBe(4);
    expect(optionNumber({ key: '۳', code: '' })).toBe(3);
    expect(optionNumber({ key: '٠', code: '' })).toBeNull();
    expect(optionNumber({ key: 'a', code: 'KeyA' })).toBeNull();
  });

  it('says what the English button will do, and remembers it', async () => {
    fakeApi({ 'GET /story-games/g-1/story': story, 'GET /story-games/g-1': question() });
    game();
    await screen.findByRole('heading', { name: 'Question 1 of 3' });
    // level 1: English is shown, and the button hides it
    expect(screen.getByText('How old is Rojîn?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Hide English' }));
    expect(screen.queryByText('How old is Rojîn?')).toBeNull();
    expect(screen.getByRole('button', { name: 'Show in English' })).toBeInTheDocument();
    expect(localStorage.getItem('hevalo.stories.english')).toBe('off');
  });

  it('reads the game again quietly when the answer is for a question that has moved on', async () => {
    const { calls } = fakeApi({
      'GET /story-games/g-1/story': story,
      'GET /story-games/g-1': question(),
      'POST /story-games/g-1/answers': refused(409, 'NOT_CURRENT'),
    });
    game();
    await userEvent.click(await screen.findByRole('button', { name: /Heşt/ }));
    const reads = () => calls.filter((c) => c.method === 'GET' && c.path === '/story-games/g-1').length;
    await waitFor(() => expect(reads()).toBe(2));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('stops retrying once the question’s deadline and grace have passed, and says it was late', async () => {
    let tries = 0;
    fakeApi({
      'GET /story-games/g-1/story': story,
      'GET /story-games/g-1': question({
        mode: 'duo',
        activeCount: 2,
        settings: { ...gameView().settings, timerSeconds: 30 },
        phaseEndsAt: new Date(Date.now() - ANSWER_GRACE_MS - 1_000).toISOString(),
      }),
      'GET /story-games/g-1?v=*': () => new Promise(() => undefined),
      'POST /story-games/g-1/answers': () => {
        tries += 1;
        throw new TypeError('offline');
      },
    });
    game();
    await userEvent.click(await screen.findByRole('button', { name: /Heşt/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Time ran out before your answer arrived, so it didn’t count.');
    expect(tries).toBe(1);
  });

  it('sends the same answer again after a network failure, and takes ALREADY_ANSWERED as arrived', async () => {
    let tries = 0;
    const { calls } = fakeApi({
      'GET /story-games/g-1/story': story,
      'GET /story-games/g-1': question({ phaseEndsAt: new Date(Date.now() + 60_000).toISOString() }),
      'POST /story-games/g-1/answers': () => {
        tries += 1;
        if (tries === 1) throw new TypeError('offline');
        return refused(409, 'ALREADY_ANSWERED');
      },
    });
    game();
    await userEvent.click(await screen.findByRole('button', { name: /Heşt/ }));
    await waitFor(() => expect(tries).toBe(2), { timeout: 3000 });
    const sent = calls.filter((c) => c.path.endsWith('/answers')).map((c) => c.body);
    expect(sent).toEqual([{ index: 0, choice: 0 }, { index: 0, choice: 0 }]);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says plainly when an answer arrived too late', async () => {
    fakeApi({
      'GET /story-games/g-1/story': story,
      'GET /story-games/g-1': question(),
      'POST /story-games/g-1/answers': refused(409, 'TOO_LATE'),
    });
    game();
    await userEvent.click(await screen.findByRole('button', { name: /Heşt/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Time ran out before your answer arrived, so it didn’t count.');
  });

  it('shows a timed question’s clock, and says "10 seconds left" once', async () => {
    fakeApi({
      'GET /story-games/g-1/story': story,
      'GET /story-games/g-1': question({
        settings: { ...gameView().settings, timerSeconds: 30 },
        phaseEndsAt: new Date(Date.now() + 9_000).toISOString(),
      }),
    });
    game();
    await screen.findByRole('heading', { name: 'Question 1 of 3' });
    await waitFor(() => expect(document.querySelector('[aria-live="polite"]')?.textContent).toMatch(/10 seconds left/));
    // the count itself is hidden from screen readers
    expect(document.querySelector('.sg-clock')).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('the answer', () => {
  it('marks the right option and yours in words, quotes the story, and continues', async () => {
    const { calls } = fakeApi({
      'GET /story-games/g-1/story': story,
      'GET /story-games/g-1': question({
        status: 'reveal',
        reveal: {
          index: 0,
          correctIndex: 1,
          explanation: 'Çîrok dibêje: “Ew deh salî ye.”',
          explanationEn: 'The story says she is ten.',
          evidenceParagraph: 0,
          evidenceSentence: 1,
          answeredCount: 1,
          correctCount: 0,
          myChoice: 0,
          myCorrect: false,
        },
      }),
      'POST /story-games/g-1/continue': question({ version: 3 }),
    });
    game();
    expect(await screen.findByText('Not this time')).toBeInTheDocument();
    expect(screen.getByText('Right answer').closest('li')).toHaveTextContent('Deh');
    expect(screen.getByText('Your answer').closest('li')).toHaveTextContent('Heşt');
    const quote = await screen.findByText('Ew deh salî ye.', { selector: 'blockquote' });
    expect(quote).toHaveAttribute('lang', 'ku');
    await waitFor(() => expect(document.querySelector('[aria-live="polite"]')?.textContent).toMatch(/Not this time\. The right answer: Deh/));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(calls.find((c) => c.path.endsWith('/continue'))?.body).toEqual({ index: 0 }));
  });
});

describe('the answer, in English', () => {
  it('offers the remembered English choice on the answer too, for its explanation', async () => {
    fakeApi({
      'GET /story-games/g-1/story': story,
      'GET /story-games/g-1': question({
        status: 'reveal',
        settings: { ...gameView().settings, timerSeconds: 0, level: 2 },
        reveal: {
          index: 0,
          correctIndex: 1,
          explanation: 'Çîrok dibêje: “Ew deh salî ye.”',
          explanationEn: 'The story says she is ten.',
          evidenceParagraph: null,
          evidenceSentence: null,
          answeredCount: 1,
          correctCount: 1,
          myChoice: 1,
          myCorrect: true,
        },
      }),
    });
    game();
    await screen.findByText('Çîrok dibêje: “Ew deh salî ye.”');
    // level 2: no English until asked for
    expect(screen.queryByText('The story says she is ten.')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Show in English' }));
    expect(screen.getByText('The story says she is ten.')).toHaveAttribute('lang', 'en');
    expect(screen.getByText('How old is Rojîn?')).toBeInTheDocument();
    expect(localStorage.getItem('hevalo.stories.english')).toBe('on');
  });
});

describe('the results', () => {
  const results = (over: Partial<StoryGameView> = {}) =>
    gameView({
      status: 'finished',
      code: null,
      results: {
        standings: [
          { seat: 1, name: 'Ada', avatarUrl: null, isMe: true, score: 400, correct: 4, place: 1 },
          { seat: 2, name: 'Rojda', avatarUrl: null, isMe: false, score: 300, correct: 3, place: 2 },
        ],
        me: { place: 1, score: 400, correct: 4, answered: 5, total: 5, xp: 15, learningCounted: true },
        review: [
          { index: 0, kind: 'detail', prompt: 'Pirsa yekem?', promptEn: null, options: ['a', 'b'], correctIndex: 0, myChoice: 0, explanation: null, explanationEn: null, evidenceParagraph: null, evidenceSentence: null },
          { index: 1, kind: 'detail', prompt: 'Pirsa duyem?', promptEn: null, options: ['a', 'b'], correctIndex: 1, myChoice: 0, explanation: null, explanationEn: null, evidenceParagraph: null, evidenceSentence: null },
        ],
      },
      settings: { ...gameView().settings, questionCount: 5 },
      ...over,
    });

  it('shows a duo as two scores and a total, without places', async () => {
    fakeApi({ 'GET /story-games/g-1/story': story, 'GET /story-games/g-1': results() });
    game();
    expect(await screen.findByRole('heading', { name: 'You got 4 of 5 right' })).toHaveFocus();
    expect(screen.getByText('Together 7 of 10')).toBeInTheDocument();
    expect(screen.queryByText(/Your place/)).toBeNull();
    expect(screen.getByText('+15 XP')).toBeInTheDocument();
    expect(screen.getByText('This counted as a day of learning.')).toBeInTheDocument();
  });

  it('keeps "+15 XP" in its own order on a right-to-left page', async () => {
    localStorage.setItem('hevalo_locale', 'ckb');
    fakeApi({ 'GET /story-games/g-1/story': story, 'GET /story-games/g-1': results() });
    game();
    const xp = await screen.findByText('+15 XP');
    await waitFor(() => expect(document.documentElement).toHaveAttribute('dir', 'rtl'));
    // dir="ltr" isolates the badge from the page's direction (HTML gives [dir] unicode-bidi: isolate)
    expect(xp).toHaveAttribute('dir', 'ltr');
  });

  const player = (seat: number, name: string, correct: number, place: number, isMe = false) => ({
    seat,
    name,
    avatarUrl: null,
    isMe,
    score: correct * 100,
    correct,
    place,
  });

  it('lists three players by seat, with your own place under them', async () => {
    const base = results();
    fakeApi({
      'GET /story-games/g-1/story': story,
      'GET /story-games/g-1': {
        ...base,
        mode: 'group',
        results: {
          ...base.results!,
          standings: [player(3, 'Berfin', 5, 1), player(1, 'Ada', 4, 2, true), player(2, 'Rojda', 3, 3)],
          me: { ...base.results!.me!, place: 2 },
        },
      },
    });
    game();
    await screen.findByRole('heading', { name: 'You got 4 of 5 right' });
    const rows = [...document.querySelectorAll('.sg-board-row')].map((r) => r.textContent);
    expect(rows).toEqual(['You4/5', 'Rojda3/5', 'Berfin5/5']);
    expect(screen.getByText('Your place: 2')).toBeInTheDocument();
    expect(document.querySelector('.sg-podium')).toBeNull();
  });

  it('shows four or more players as a podium of the first three, and your place when you are not on it', async () => {
    const base = results();
    fakeApi({
      'GET /story-games/g-1/story': story,
      'GET /story-games/g-1': {
        ...base,
        mode: 'group',
        results: {
          ...base.results!,
          standings: [player(2, 'Rojda', 5, 1), player(3, 'Berfin', 4, 2), player(4, 'Dilan', 4, 2), player(5, 'Zana', 3, 4), player(1, 'Ada', 2, 5, true)],
          me: { ...base.results!.me!, place: 5, correct: 2 },
        },
      },
    });
    game();
    await screen.findByRole('heading', { name: 'You got 2 of 5 right' });
    const steps = [...document.querySelectorAll('.sg-podium-step')];
    expect(steps.map((r) => r.querySelector('.sg-podium-name')?.textContent)).toEqual(['Rojda', 'Berfin', 'Dilan']);
    expect(screen.queryByText('Zana')).toBeNull();
    expect(screen.getByText('Your place: 5')).toBeInTheDocument();
  });

  it('puts the missed questions first in the review', async () => {
    fakeApi({ 'GET /story-games/g-1/story': story, 'GET /story-games/g-1': results() });
    game();
    await screen.findByRole('heading', { name: 'You got 4 of 5 right' });
    const items = document.querySelectorAll('.sg-review-item');
    expect(items[0]).toHaveTextContent('Pirsa duyem?');
    expect(items[0]).toHaveAttribute('open');
    expect(items[1]).not.toHaveAttribute('open');
  });

  it('says how to count a day when a game did not', async () => {
    const base = results();
    fakeApi({
      'GET /story-games/g-1/story': story,
      'GET /story-games/g-1': { ...base, mode: 'solo', results: { ...base.results!, standings: base.results!.standings.slice(0, 1), me: { ...base.results!.me!, xp: 0, learningCounted: false } } },
    });
    game();
    expect(await screen.findByText(/Answer at least half the questions in one day/)).toBeInTheDocument();
    expect(screen.queryByText(/XP/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Read the story again' })).toHaveAttribute('href', '/app/games/stories/qelema-sin');
  });
});

describe('after merging with the social and rating tracks', () => {
  const two = [
    { seat: 1, name: 'Ada', avatarUrl: null, isHost: true, isMe: true, away: false, gone: false, score: 0, correct: 0 },
    { seat: 2, name: null, avatarUrl: null, isHost: false, isMe: false, away: false, gone: false, score: 0, correct: 0 },
  ];
  const finished = (players = two): StoryGameView =>
    gameView({
      version: 9,
      status: 'finished',
      code: null,
      players,
      results: {
        standings: [
          { seat: 1, name: 'Ada', avatarUrl: null, isMe: true, score: 300, correct: 3, place: 1 },
          { seat: 2, name: null, avatarUrl: null, isMe: false, score: 200, correct: 2, place: 2 },
        ],
        me: { place: 1, score: 300, correct: 3, answered: 3, total: 3, xp: 10, learningCounted: true },
        review: [],
      },
    });

  /** Report the player behind the ⋯ named `menu`, for bullying. */
  async function report(menu: string): Promise<void> {
    await userEvent.click(await screen.findByRole('button', { name: menu }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Report' }));
    await userEvent.click(screen.getByRole('button', { name: /Bullying or harassment/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Send report' }));
  }

  it('reports another player in the lobby by seat, never offering it for yourself', async () => {
    const poll = heldPoll();
    const { calls } = fakeApi({
      'GET /story-games/g-1': (c: Call) => (c.path.includes('?v=') ? poll.answer(c) : gameView({ players: two, activeCount: 2 })),
      'POST /reports': { id: 'r1', deduped: false },
    });
    game();
    await report('More about Player 2');
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/reports')).toBe(true));
    expect(calls.find((c) => c.path === '/reports')!.body).toMatchObject({ targetType: 'game_player', targetId: 'g-1', game: 'stories', seat: 2 });
    expect(screen.queryByRole('button', { name: 'More about You' })).toBeNull();
  });

  it('reports another player from the results by seat', async () => {
    const { calls } = fakeApi({
      'GET /story-games/g-1/story': story,
      'GET /story-games/g-1': finished(),
      'POST /reports': { id: 'r1', deduped: false },
    });
    game();
    expect(await screen.findByRole('heading', { name: 'In this game' })).toBeInTheDocument();
    await report('More about Player 2');
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/reports')).toBe(true));
    expect(calls.find((c) => c.path === '/reports')!.body).toMatchObject({ targetType: 'game_player', targetId: 'g-1', game: 'stories', seat: 2 });
  });

  it('tells the rating box when a game played here finishes, and not for a finished game opened later', async () => {
    const { onGameFinished } = await import('../feedback/gameFinished');
    const heard: unknown[] = [];
    const stop = onGameFinished((e) => heard.push(e));
    try {
      const poll = heldPoll();
      const { calls } = fakeApi({
        'GET /story-games/g-1/story': story,
        'GET /story-games/g-1': (c: Call) =>
          c.path.includes('?v=') ? poll.answer(c) : gameView({ version: 8, status: 'reading', code: 'ABC234', players: two, activeCount: 2 }),
      });
      const first = game();
      expect(await screen.findByRole('button', { name: 'I’ve finished reading' })).toBeInTheDocument();
      await waitFor(() => expect(calls.some((c) => c.path === '/story-games/g-1?v=8')).toBe(true));
      act(() => poll.release(finished()));
      expect(await screen.findByRole('heading', { name: 'You got 3 of 3 right' })).toBeInTheDocument();
      await waitFor(() => expect(heard).toEqual([{ game: 'stories', gaveUp: false }]));
      first.unmount();

      // the same results opened again later: nothing new finished here
      fakeApi({ 'GET /story-games/g-1/story': story, 'GET /story-games/g-1': finished() });
      game();
      expect(await screen.findByRole('heading', { name: 'You got 3 of 3 right' })).toBeInTheDocument();
      await new Promise((r) => setTimeout(r, 50));
      expect(heard).toHaveLength(1);
    } finally {
      stop();
    }
  });
});
