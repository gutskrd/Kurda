import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Race } from './Race';
import { renderApp, jsonResponse } from '../test/utils';
import { KEYBOARD_PREFS_KEY, resetKeyboardPrefsForTests } from '../keyboard/prefs';
import { onGameFinished, onGameStarted, type GameFinished } from '../feedback/gameFinished';

const TARGET = 'ez ji welatê xwe hez dikim';

function game(over: Record<string, unknown> = {}) {
  return {
    id: 'r1',
    text: { id: 't1', title: 'Welat', body: TARGET, difficulty: 1, language: 'kmr' },
    dialect: 'kurmanci',
    accentMode: 'forgiving',
    startedAt: new Date().toISOString(),
    ...over,
  };
}

function result(over: Record<string, unknown> = {}) {
  return {
    wpm: 42.5,
    accuracy: 1,
    score: 42,
    correctChars: TARGET.length,
    perfect: true,
    implausible: false,
    accentMode: 'forgiving',
    accentMisses: 0,
    accented: 1,
    errors: 0,
    elapsedMs: 30_000,
    xpAwarded: 15,
    personalBest: false,
    ...over,
  };
}

type Answer = { status: number; body: unknown } | (() => Promise<Response>);

/**
 * Answers POST /race and /race/r1/finish from queues (the last answer repeats),
 * and records what was posted.
 */
function stub({ start = [], finish = [] }: { start?: Answer[]; finish?: Answer[] } = {}) {
  const starts = start.length ? start : [{ status: 200, body: game() }];
  const finishes = finish.length ? finish : [{ status: 200, body: result() }];
  const answer = async (queue: Answer[]): Promise<Response> => {
    const a = queue.length > 1 ? queue.shift()! : queue[0]!;
    return typeof a === 'function' ? a() : jsonResponse(a.status, a.body);
  };
  const fetchMock = vi.fn(async (url: string) => {
    if (String(url).includes('/race/r1/finish') || String(url).includes('/race/r2/finish')) return answer(finishes);
    if (String(url).endsWith('/race')) return answer(starts);
    return jsonResponse(200, {});
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function posted(fetchMock: ReturnType<typeof vi.fn>, path: string): unknown[] {
  return fetchMock.mock.calls
    .filter(([url]) => String(url).endsWith(path))
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)));
}

function finishCalls(fetchMock: ReturnType<typeof vi.fn>): number {
  return fetchMock.mock.calls.filter(([url]) => String(url).includes('/finish')).length;
}

/** The device has seen the keyboard guide, so Start starts. */
function seenGuide(extra: Record<string, unknown> = {}): void {
  localStorage.setItem(KEYBOARD_PREFS_KEY, JSON.stringify({ guideOffered: true, ...extra }));
}

/** Start a race and hand back the field that takes the keystrokes. */
async function begin(user: ReturnType<typeof userEvent.setup>): Promise<HTMLTextAreaElement> {
  renderApp(<Race />, ['/app/games/race']);
  await user.click(screen.getByRole('button', { name: /start race/i }));
  const input = (await screen.findByLabelText('Type the text')) as HTMLTextAreaElement;
  await user.click(input);
  return input;
}

beforeEach(() => {
  resetKeyboardPrefsForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('Typing Race', () => {
  /**
   * The text and the box are one surface. Two boxes meant the text sat on the
   * page as ordinary prose beside an input — select it, copy it, paste it, and
   * the race is over in two keystrokes.
   */
  it('has one place to type, and it is the text itself', async () => {
    stub();
    seenGuide();
    const input = await begin(userEvent.setup());

    expect(screen.queryByLabelText('Your typing')).not.toBeInTheDocument();
    expect(input.closest('.race-type')).not.toBeNull();
    expect(input.closest('.race-type')?.querySelector('.race-text')?.textContent).toBe(TARGET);
    expect(input).toHaveAttribute('aria-describedby', 'race-target');
  });

  it('refuses a paste, and says why rather than doing nothing', async () => {
    stub();
    seenGuide();
    const user = userEvent.setup();
    const input = await begin(user);

    await user.paste(TARGET);

    expect(input).toHaveValue('');
    expect(await screen.findByText(/no pasting/i)).toBeInTheDocument();
  });

  it('refuses a paste that arrives as an edit, with no paste event before it', async () => {
    stub();
    seenGuide();
    const input = await begin(userEvent.setup());

    const edit = new InputEvent('beforeinput', { inputType: 'insertFromPaste', data: TARGET, cancelable: true, bubbles: true });
    act(() => {
      input.dispatchEvent(edit);
    });

    expect(edit.defaultPrevented).toBe(true);
    expect(await screen.findByText(/no pasting/i)).toBeInTheDocument();
  });

  /**
   * A phone keyboard that finishes words for you is a paste with extra steps —
   * and on Kurdish text it also rewrites what you did type.
   */
  it('turns off the keyboard features that type for you', async () => {
    stub();
    seenGuide();
    const input = await begin(userEvent.setup());

    expect(input).toHaveAttribute('autocorrect', 'off');
    expect(input).toHaveAttribute('autocapitalize', 'off');
    expect(input).toHaveAttribute('spellcheck', 'false');
    expect(input).toHaveAttribute('autocomplete', 'off');
  });

  it('marks each character right or wrong as it is typed', async () => {
    stub();
    seenGuide();
    const user = userEvent.setup();
    await begin(user);

    await user.keyboard('ez x');

    const chars = document.querySelectorAll('.race-char');
    expect(chars[0]).toHaveClass('race-ok'); // e
    expect(chars[1]).toHaveClass('race-ok'); // z
    expect(chars[2]).toHaveClass('race-ok'); // space
    expect(chars[3]).toHaveClass('race-bad'); // 'j' typed as 'x'
    // and the caret sits on the next one along
    expect(chars[4]).toHaveClass('race-cursor');
  });

  /** The old scoring compared position by position: one missed letter turned the rest red. */
  it('spoils only the word with a missed letter, not everything after it', async () => {
    stub();
    seenGuide();
    const user = userEvent.setup();
    await begin(user);

    await user.keyboard('ez i welat');

    const chars = [...document.querySelectorAll('.race-char')];
    expect(chars[3]).toHaveClass('race-bad'); // the j left out
    // "welat" after it is still right
    for (const c of chars.slice(6, 11)) expect(c).toHaveClass('race-ok');
  });

  describe('“when someone clicks up the whole game becomes wrong”', () => {
    /**
     * The field has its own caret, and anything that moved it — a click on an
     * earlier line, an arrow key, Home, select-all — put the next letter in the
     * middle of what was typed. Whatever happens to that caret, typing goes on
     * at the end.
     */
    it('types at the end even when the caret was put in the middle', async () => {
      stub();
      seenGuide();
      const user = userEvent.setup();
      const input = await begin(user);

      await user.keyboard('ez ');
      input.setSelectionRange(1, 1);
      await user.keyboard('j');

      expect(input).toHaveValue('ez j');
      expect(document.querySelectorAll('.race-bad')).toHaveLength(0);
    });

    it('ignores arrow keys, Home and End', async () => {
      stub();
      seenGuide();
      const user = userEvent.setup();
      const input = await begin(user);

      await user.keyboard('ez ');
      await user.keyboard('{ArrowUp}{ArrowLeft}{Home}j{End}{ArrowDown}i');

      expect(input).toHaveValue('ez ji');
      expect(input.selectionStart).toBe(5);
    });

    it('does not select everything, so the next key cannot replace the race', async () => {
      stub();
      seenGuide();
      const user = userEvent.setup();
      const input = await begin(user);

      await user.keyboard('ez ');
      await user.keyboard('{Control>}a{/Control}j');

      expect(input).toHaveValue('ez j');
    });

    it('keeps the caret at the end when the box is clicked', async () => {
      stub();
      seenGuide();
      const user = userEvent.setup();
      const input = await begin(user);

      await user.keyboard('ez ji');
      input.setSelectionRange(2, 2);
      fireEvent.mouseUp(input);

      expect(input.selectionStart).toBe(5);
      expect(input.selectionEnd).toBe(5);
    });

    it('deletes back from the end, whatever the caret says', async () => {
      stub();
      seenGuide();
      const user = userEvent.setup();
      const input = await begin(user);

      await user.keyboard('ez jx');
      input.setSelectionRange(1, 1);
      await user.keyboard('{Backspace}i');

      expect(input).toHaveValue('ez ji');
    });

    it('does not take Enter as a character', async () => {
      stub();
      seenGuide();
      const user = userEvent.setup();
      const input = await begin(user);

      await user.keyboard('ez{Enter}');

      expect(input).toHaveValue('ez');
    });
  });

  it('ends the race once the typing reaches the end of the text, and takes nothing after it', async () => {
    const fetchMock = stub({ finish: [{ status: 200, body: result({ perfect: false, accuracy: 0 }) }] });
    seenGuide();
    const user = userEvent.setup();
    const input = await begin(user);

    await user.keyboard('x'.repeat(TARGET.length + 10));

    await screen.findByText('Race finished');
    expect(finishCalls(fetchMock)).toBe(1);
    expect([...input.value]).toHaveLength(TARGET.length);
  });

  it('turns e then a backtick into ê', async () => {
    stub();
    seenGuide();
    const user = userEvent.setup();
    const input = await begin(user);

    await user.keyboard('ez ji welate`');

    expect(input).toHaveValue('ez ji welatê');
  });

  it('types a letter from the key bar at the end, and leaves the focus in the text', async () => {
    stub();
    seenGuide();
    const user = userEvent.setup();
    const input = await begin(user);

    await user.keyboard('ez ji welat');
    input.setSelectionRange(0, 0);
    await user.click(screen.getByRole('button', { name: 'Type ê' }));

    expect(input).toHaveValue('ez ji welatê');
    expect(input).toHaveFocus();
  });

  it('hides the key bar when it is switched off', async () => {
    stub();
    seenGuide({ keyBar: false });
    await begin(userEvent.setup());

    expect(screen.queryByRole('group', { name: 'Kurdish letters' })).not.toBeInTheDocument();
  });

  it('asks for the variety, length and accent mode the racer chose', async () => {
    const fetchMock = stub();
    seenGuide({ accentMode: 'strict' });
    const user = userEvent.setup();
    renderApp(<Race />, ['/app/games/race']);

    await user.click(screen.getByRole('radio', { name: 'Long' }));
    await user.click(screen.getByRole('button', { name: /start race/i }));
    await screen.findByLabelText('Type the text');

    expect(posted(fetchMock, '/race')).toEqual([{ length: 3, dialect: 'kurmanci', accentMode: 'strict' }]);
  });

  it('sets a Soranî text right to left, in Soranî, with the Soranî keys', async () => {
    const body = 'من کوردی دەخوێنم';
    stub({ start: [{ status: 200, body: game({ dialect: 'sorani', text: { id: 't2', title: 'خوێندن', body, difficulty: 1, language: 'ckb' } }) }] });
    seenGuide();
    const user = userEvent.setup();
    renderApp(<Race />, ['/app/games/race']);

    await user.click(screen.getByRole('radio', { name: 'Soranî' }));
    await user.click(screen.getByRole('button', { name: /start race/i }));
    const input = await screen.findByLabelText('Type the text');

    const text = document.getElementById('race-target')!;
    expect(text).toHaveAttribute('dir', 'rtl');
    expect(text).toHaveAttribute('lang', 'ckb');
    expect(text.textContent).toBe(body);
    expect(input).toHaveAttribute('dir', 'rtl');
    expect(screen.getByRole('button', { name: 'Type ێ' })).toBeInTheDocument();
  });

  it('says plainly when the server would not score the run', async () => {
    stub({ finish: [{ status: 200, body: result({ implausible: true, score: 0, xpAwarded: 0, perfect: false, wpm: 1240.5, elapsedMs: 600 }) }] });
    seenGuide();
    const user = userEvent.setup();
    await begin(user);

    await user.keyboard(TARGET);

    expect(await screen.findByText('Not scored')).toBeInTheDocument();
    expect(screen.getByText(/faster than anyone types/i)).toBeInTheDocument();
  });

  it('celebrates an ordinary finished run, and a personal best', async () => {
    stub({ finish: [{ status: 200, body: result({ personalBest: true }) }] });
    seenGuide();
    const user = userEvent.setup();
    await begin(user);

    await user.keyboard(TARGET);

    expect(await screen.findByText('Perfect run!')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('42.5')).toBeInTheDocument());
    expect(screen.getByText('Personal best!')).toBeInTheDocument();
    expect(screen.getByText('Accents: 1 of 1 typed with their accent')).toBeInTheDocument();
    expect(screen.queryByText(/faster than anyone types/i)).not.toBeInTheDocument();
  });

  /**
   * A dead key leaves its accent in the field while it waits for the vowel; a
   * race whose last letter was accented used to end on the accent.
   */
  it('does not finish while a letter is still being composed', async () => {
    const fetchMock = stub();
    seenGuide();
    await begin(userEvent.setup());
    const input = screen.getByLabelText('Type the text');

    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: TARGET } });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(finishCalls(fetchMock)).toBe(0);

    fireEvent.compositionEnd(input);
    await waitFor(() => expect(finishCalls(fetchMock)).toBe(1));
  });

  it('shows a failed finish in the race, and tries again from the same typing', async () => {
    const fetchMock = stub({
      finish: [
        { status: 500, body: { code: 'INTERNAL', message: 'boom' } },
        { status: 200, body: result() },
      ],
    });
    seenGuide();
    const user = userEvent.setup();
    await begin(user);

    await user.keyboard(TARGET);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/went wrong/i);
    // it does not try again on its own, on every key
    expect(finishCalls(fetchMock)).toBe(1);

    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Perfect run!')).toBeInTheDocument();
    expect(posted(fetchMock, '/race/r1/finish').at(-1)).toEqual({ typed: TARGET });
  });

  it('offers a new race when the server had already closed this one', async () => {
    stub({ finish: [{ status: 409, body: { code: 'ALREADY_FINISHED', message: 'over' } }] });
    seenGuide();
    const user = userEvent.setup();
    await begin(user);

    await user.click(screen.getByRole('button', { name: /give up/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('This race was already over. Start a new one.');
    expect(within(alert).getByRole('button', { name: 'New race' })).toBeInTheDocument();
  });

  it('says when there is no text in that variety yet', async () => {
    stub({ start: [{ status: 503, body: { code: 'EMPTY_RACE_POOL', message: 'none' } }] });
    seenGuide();
    const user = userEvent.setup();
    renderApp(<Race />, ['/app/games/race']);

    await user.click(screen.getByRole('button', { name: /start race/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/no texts of this length in this variety yet/i);
  });

  it('keeps “Give up” busy until the answer comes, so it cannot finish twice', async () => {
    let release: (r: Response) => void = () => undefined;
    const fetchMock = stub({ finish: [() => new Promise<Response>((r) => (release = r))] });
    seenGuide();
    const user = userEvent.setup();
    await begin(user);

    const giveUp = screen.getByRole('button', { name: /give up/i });
    await user.click(giveUp);
    expect(screen.getByRole('button', { name: 'Scoring…' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Scoring…' }));
    expect(finishCalls(fetchMock)).toBe(1);

    release(jsonResponse(200, result({ perfect: false })));
    expect(await screen.findByText('Race finished')).toBeInTheDocument();
  });

  /** "Race again" kept the old text, enabled and focused, until the new one arrived. */
  it('starts again from nothing: the old text is gone before the new one arrives', async () => {
    let release: (r: Response) => void = () => undefined;
    stub({
      start: [
        { status: 200, body: game() },
        () => new Promise<Response>((r) => (release = r)),
      ],
    });
    seenGuide();
    const user = userEvent.setup();
    await begin(user);
    await user.keyboard(TARGET);
    await screen.findByText('Perfect run!');

    await user.click(screen.getByRole('button', { name: 'Race again' }));

    expect(screen.queryByLabelText('Type the text')).not.toBeInTheDocument();
    expect(screen.queryByText('Perfect run!')).not.toBeInTheDocument();

    release(jsonResponse(200, game({ id: 'r2' })));
    const input = await screen.findByLabelText('Type the text');
    expect(input).toHaveValue('');
  });

  it('opens the keyboard guide before the first Kurmancî race, and starts when it closes', async () => {
    const fetchMock = stub();
    const user = userEvent.setup();
    renderApp(<Race />, ['/app/games/race']);

    await user.click(screen.getByRole('button', { name: /start race/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Get the Kurmancî keyboard' })).toBeInTheDocument();
    expect(posted(fetchMock, '/race')).toHaveLength(0);

    await user.click(within(dialog).getByRole('button', { name: 'Start race' }));
    expect(await screen.findByLabelText('Type the text')).toBeInTheDocument();
    expect(posted(fetchMock, '/race')).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem(KEYBOARD_PREFS_KEY)!).guideOffered).toBe(true);
  });

  it('closes the guide without starting when it is escaped, and Start then starts', async () => {
    const fetchMock = stub();
    const user = userEvent.setup();
    renderApp(<Race />, ['/app/games/race']);

    await user.click(screen.getByRole('button', { name: /start race/i }));
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(posted(fetchMock, '/race')).toHaveLength(0);

    // offered once on this device: the next Start goes straight in
    await user.click(screen.getByRole('button', { name: /start race/i }));
    expect(await screen.findByLabelText('Type the text')).toBeInTheDocument();
    expect(posted(fetchMock, '/race')).toHaveLength(1);
  });

  it('starts the race forgiving when “Make accents forgiving” is chosen in the guide', async () => {
    const fetchMock = stub();
    localStorage.setItem(KEYBOARD_PREFS_KEY, JSON.stringify({ accentMode: 'strict' }));
    const user = userEvent.setup();
    renderApp(<Race />, ['/app/games/race']);

    await user.click(screen.getByRole('button', { name: /start race/i }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Make accents forgiving' }));

    await screen.findByLabelText('Type the text');
    expect(posted(fetchMock, '/race')).toEqual([{ length: 1, dialect: 'kurmanci', accentMode: 'forgiving' }]);
  });

  it('does not offer the guide again on the result of the race it stood before', async () => {
    stub({ finish: [{ status: 200, body: result({ accentMisses: 5, accented: 6, perfect: false }) }] });
    const heard: GameFinished[] = [];
    const stop = onGameFinished((e) => heard.push(e));
    const user = userEvent.setup();
    renderApp(<Race />, ['/app/games/race']);

    await user.click(screen.getByRole('button', { name: /start race/i }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Start race' }));
    await screen.findByLabelText('Type the text');
    await user.click(screen.getByRole('button', { name: /give up/i }));
    await screen.findByText('Race finished');
    stop();

    expect(screen.queryByRole('heading', { name: 'Get the Kurmancî keyboard' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keyboard help' })).toBeInTheDocument();
    expect(heard).toEqual([{ game: 'race', gaveUp: true, deferred: false }]);
  });

  it('keeps the rating box off a result that offers the keyboard guide', async () => {
    stub({ finish: [{ status: 200, body: result({ accentMisses: 3, accented: 4, perfect: false }) }] });
    seenGuide();
    const heard: GameFinished[] = [];
    const stop = onGameFinished((e) => heard.push(e));
    const user = userEvent.setup();
    const input = await begin(user);

    await user.type(input, TARGET.replace('ê', 'e'));
    await screen.findByRole('heading', { name: 'Get the Kurmancî keyboard' });
    stop();

    expect(heard).toEqual([{ game: 'race', gaveUp: false, deferred: true }]);
  });

  it('hands the focus to the result when the race ends on its own, and says a new race has begun', async () => {
    stub();
    seenGuide();
    let starts = 0;
    const stopStarts = onGameStarted(() => starts++);
    const user = userEvent.setup();
    const input = await begin(user);
    expect(starts).toBe(1);

    await user.keyboard(TARGET);
    const heading = await screen.findByRole('heading', { name: 'Perfect run!' });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(input).not.toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Race again' }));
    expect(starts).toBe(2);
    stopStarts();
  });

  it('offers the keyboard guide on the result after three accents went missing', async () => {
    stub({ finish: [{ status: 200, body: result({ accentMisses: 3, accented: 4, perfect: false }) }] });
    seenGuide();
    const user = userEvent.setup();
    await begin(user);

    await user.click(screen.getByRole('button', { name: /give up/i }));

    expect(await screen.findByRole('heading', { name: 'Get the Kurmancî keyboard' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Maybe later' }));
    expect(screen.queryByRole('heading', { name: 'Get the Kurmancî keyboard' })).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(KEYBOARD_PREFS_KEY)!).guideNudgeDismissedAt).toEqual(expect.any(Number));
  });

  it('changes the keyboard settings from the race screen', async () => {
    stub();
    seenGuide();
    const user = userEvent.setup();
    renderApp(<Race />, ['/app/games/race']);

    await user.click(screen.getByRole('button', { name: 'Keyboard and accents' }));
    await user.click(screen.getByRole('radio', { name: /^Strict/ }));

    expect(JSON.parse(localStorage.getItem(KEYBOARD_PREFS_KEY)!).accentMode).toBe('strict');
    expect(screen.getByText(/Accents: Strict\./)).toBeInTheDocument();
  });

  describe('telling the rating box a game finished', () => {
    it('reports a finished race', async () => {
      stub();
      seenGuide();
      const heard: GameFinished[] = [];
      const stop = onGameFinished((e) => heard.push(e));
      const user = userEvent.setup();
      await begin(user);

      await user.keyboard(TARGET);
      await screen.findByText('Perfect run!');
      stop();

      expect(heard).toEqual([{ game: 'race', gaveUp: false, deferred: false }]);
    });

    it('reports a race given up as given up', async () => {
      stub({ finish: [{ status: 200, body: result({ perfect: false }) }] });
      seenGuide();
      const heard: GameFinished[] = [];
      const stop = onGameFinished((e) => heard.push(e));
      const user = userEvent.setup();
      await begin(user);

      await user.click(screen.getByRole('button', { name: /give up/i }));
      await screen.findByText('Race finished');
      stop();

      expect(heard).toEqual([{ game: 'race', gaveUp: true, deferred: false }]);
    });
  });
});
