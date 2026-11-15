import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { DEFAULT_PAPER, NOTES_MAX, PAPER_RULE, PAPER_TOP, type LetterDecor, type LetterItem, type LetterThread, type LettersHome } from '@kurda/shared';
import { renderApp, jsonResponse } from '../test/utils';
import { LettersPage } from './LettersPage';
import { LetterThreadPage } from './LetterThreadPage';

/*
 * The letter's own paper: writing on it, the tools under it — Draw, Text,
 * Paper — what a first letter to a stranger may carry, what is sent, and every
 * letter read on the paper it was written on.
 */

/** jsdom has no PointerEvent: a mouse event that says which pointer it was and what kind. */
class TestPointerEvent extends MouseEvent {
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    Object.defineProperty(this, 'pointerId', { value: init.pointerId ?? 1, configurable: true });
    Object.defineProperty(this, 'pointerType', { value: init.pointerType ?? 'mouse', configurable: true });
  }
}
beforeAll(() => {
  if (!('PointerEvent' in window)) Object.defineProperty(window, 'PointerEvent', { value: TestPointerEvent, configurable: true });
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const home = (over: Partial<LettersHome> = {}): LettersHome => ({
  refusal: null,
  bird: 2,
  birdChosen: true,
  zer: 0,
  out: null,
  visitor: null,
  birdsOut: 0,
  sky: [],
  callsLeft: 5,
  homecoming: null,
  arrival: null,
  penPals: [],
  roomForMore: true,
  paper: DEFAULT_PAPER,
  ...over,
});
const words = 'Silav! Ez Rojda me.';
const at = '2026-11-13T19:00:00.000Z';
const item = (over: Partial<LetterItem>): LetterItem => ({ id: 'l1', mine: false, body: 'Silav Rojda!', decor: null, removed: false, sentAt: at, readAt: null, ...over });

/** Signed in, with the letters API answering from `answers` (method and path to body), and every request kept. */
function signIn(answers: Record<string, unknown>): Array<{ method: string; url: string; body: unknown }> {
  const calls: Array<{ method: string; url: string; body: unknown }> = [];
  localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : null });
      if (url.includes('/me')) return jsonResponse(200, { user: { id: 'me', username: 'ada', displayName: 'Ada', email: 'a@b.com', emailVerified: true } });
      const key = Object.keys(answers).find((k) => {
        const [m, path] = k.split(' ');
        return m === method && new URL(url, 'http://x').pathname.endsWith(path!);
      });
      return key ? jsonResponse(200, answers[key]) : jsonResponse(200, {});
    }),
  );
  return calls;
}

const thread = (over: Partial<LetterThread> = {}): LetterThread => ({
  threadId: 't1',
  person: { id: 'baran', name: 'Baran', bird: 4 },
  letters: [item({ id: 'l1', mine: true, body: 'Silav Baran!' }), item({ id: 'l2', body: 'Silav Rojda! Ez Baran im.' })],
  yourTurn: true,
  closed: false,
  ...over,
});

/** A correspondence where it is your turn to write, and what was sent to it. */
async function writingBack(over: Partial<LetterThread> = {}): Promise<Array<{ method: string; url: string; body: unknown }>> {
  const calls = signIn({ 'GET /letters/threads/t1': thread(over), 'POST /letters/threads/t1': { letter: item({ id: 'l3', mine: true, body: words }) } });
  renderApp(
    <Routes>
      <Route path="/app/letters/:threadId" element={<LetterThreadPage />} />
    </Routes>,
    ['/app/letters/t1'],
  );
  await userEvent.type(await screen.findByLabelText('Write back to Baran'), words);
  return calls;
}

const sent = (calls: Array<{ method: string; url: string; body: unknown }>, path: string): { body: string; decor: LetterDecor } | undefined =>
  calls.find((c) => c.method === 'POST' && c.url.includes(path))?.body as { body: string; decor: LetterDecor } | undefined;

/** One line drawn across the paper, through these points (in jsdom the sheet is at the page's own scale). */
function drawLine(surface: HTMLElement, points: Array<[number, number]>): void {
  const [first, ...rest] = points;
  fireEvent.pointerDown(surface, { clientX: first![0], clientY: first![1], button: 0 });
  for (const [x, y] of rest) fireEvent.pointerMove(surface, { clientX: x, clientY: y });
  fireEvent.pointerUp(surface, { clientX: points[points.length - 1]![0], clientY: points[points.length - 1]![1] });
}

describe('the paper a letter is written on', () => {
  it('offers Write, Draw, Text and Paper under the sheet, starting on Write', async () => {
    await writingBack();
    const tools = screen.getByRole('group', { name: 'Tools for your letter' });
    expect(within(tools).getAllByRole('radio').map((r) => r.closest('label')?.textContent)).toEqual(['Write', 'Draw', 'Text', 'Paper']);
    expect(within(tools).getByRole('radio', { name: 'Write' })).toBeChecked();
  });

  it('sends the words with the paper it opened on and nothing drawn', async () => {
    const calls = await writingBack();
    await userEvent.click(screen.getByRole('button', { name: 'Send your bird' }));
    expect(sent(calls, '/letters/threads/t1')).toEqual({ body: words, decor: { paper: DEFAULT_PAPER, strokes: [], notes: [] } });
  });

  it('opens on the paper you last wrote to them on', async () => {
    const mine = { paper: { style: 'dotted', tone: 'sage', ink: 'plum' }, strokes: [], notes: [] } satisfies LetterDecor;
    const calls = await writingBack({ letters: [item({ id: 'l1', mine: true, decor: mine }), item({ id: 'l2' })] });
    await userEvent.click(screen.getByRole('button', { name: 'Send your bird' }));
    expect(sent(calls, '/letters/threads/t1')?.decor.paper).toEqual(mine.paper);
  });

  it('chooses the lines, the colour and the ink of the paper from live swatches', async () => {
    const calls = await writingBack();
    await userEvent.click(screen.getByRole('radio', { name: 'Paper' }));
    expect(screen.getByRole('radio', { name: 'Lined' })).toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: 'Squared' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Night blue' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Teal' }));
    expect(screen.getByRole('radio', { name: 'Night blue' })).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Send your bird' }));
    expect(sent(calls, '/letters/threads/t1')?.decor.paper).toEqual({ style: 'grid', tone: 'night', ink: 'teal' });
  });

  it('draws a line where the pointer goes, in the ink, and undoes and redoes it', async () => {
    const calls = await writingBack();
    await userEvent.click(screen.getByRole('radio', { name: 'Draw' }));
    const surface = screen.getByRole('img', { name: 'Your paper, with nothing drawn on it yet. Draw on it with a mouse, a pen or your finger.' });
    drawLine(surface, [
      [100, 100],
      [200, 150],
      [300, 220],
    ]);
    expect(surface).toHaveAccessibleName('Your paper, with your drawing on it.');
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(surface).toHaveAccessibleName('Your paper, with nothing drawn on it yet. Draw on it with a mouse, a pen or your finger.');
    await userEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(surface).toHaveAccessibleName('Your paper, with your drawing on it.');
    await userEvent.click(screen.getByRole('button', { name: 'Send your bird' }));
    expect(sent(calls, '/letters/threads/t1')?.decor.strokes).toEqual([{ tool: 'pen', color: 'navy', width: 4, points: [100, 100, 200, 150, 300, 220] }]);
  });

  it('draws with the brush in a paint of its own, at the size chosen', async () => {
    const calls = await writingBack();
    await userEvent.click(screen.getByRole('radio', { name: 'Draw' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Brush' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Sunflower yellow' }));
    fireEvent.change(screen.getByLabelText('Size'), { target: { value: '40' } });
    drawLine(screen.getByRole('img', { name: /Your paper/ }), [
      [500, 400],
      [600, 420],
    ]);
    await userEvent.click(screen.getByRole('button', { name: 'Send your bird' }));
    expect(sent(calls, '/letters/threads/t1')?.decor.strokes).toEqual([{ tool: 'brush', color: 'sun', width: 40, points: [500, 400, 600, 420] }]);
  });

  it('asks once before clearing the drawing, and keeps it when asked to', async () => {
    const calls = await writingBack();
    await userEvent.click(screen.getByRole('radio', { name: 'Draw' }));
    const surface = screen.getByRole('img', { name: /Your paper/ });
    drawLine(surface, [
      [100, 100],
      [300, 300],
    ]);
    await userEvent.click(screen.getByRole('button', { name: 'Clear the drawing' }));
    expect(screen.getByText('Clear the whole drawing from the paper?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(surface).toHaveAccessibleName('Your paper, with your drawing on it.');
    await userEvent.click(screen.getByRole('button', { name: 'Clear the drawing' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, clear it' }));
    expect(surface).toHaveAccessibleName('Your paper, with nothing drawn on it yet. Draw on it with a mouse, a pen or your finger.');
    expect(screen.getByRole('button', { name: 'Clear the drawing' })).toBeDisabled();
    // clearing is a step like any other: it can be taken back
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await userEvent.click(screen.getByRole('button', { name: 'Send your bird' }));
    expect(sent(calls, '/letters/threads/t1')?.decor.strokes).toHaveLength(1);
  });

  it('undoes and redoes from the keyboard once the paper has the focus', async () => {
    await writingBack();
    await userEvent.click(screen.getByRole('radio', { name: 'Draw' }));
    const surface = screen.getByRole('img', { name: /Your paper/ });
    drawLine(surface, [
      [100, 100],
      [300, 300],
    ]);
    expect(surface).toHaveFocus();
    await userEvent.keyboard('{Control>}z{/Control}');
    expect(surface).toHaveAccessibleName(/nothing drawn/);
    await userEvent.keyboard('{Control>}{Shift>}z{/Shift}{/Control}');
    expect(surface).toHaveAccessibleName('Your paper, with your drawing on it.');
  });

  it('puts a note on the paper, moves it with the arrow keys, and sends it where it was left', async () => {
    const calls = await writingBack();
    await userEvent.click(screen.getByRole('radio', { name: 'Text' }));
    await userEvent.type(screen.getByLabelText('Write a note to put on the paper'), 'Bijî!');
    await userEvent.click(screen.getByRole('button', { name: 'Add note' }));
    const note = screen.getByRole('button', { name: 'Note: Bijî!' });
    // the new note has the focus, ready to be moved
    await waitFor(() => expect(note).toHaveFocus());
    await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowUp}');
    await userEvent.click(screen.getByRole('radio', { name: 'Large' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Leaf green' }));
    fireEvent.change(screen.getByLabelText('Turn'), { target: { value: '-6' } });
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    await userEvent.click(screen.getByRole('button', { name: 'Send your bird' }));
    expect(sent(calls, '/letters/threads/t1')?.decor.notes).toEqual([{ text: 'Bijî!', x: 516, y: PAPER_TOP + PAPER_RULE * 3 - 8, size: 'l', color: 'leaf', turn: -6 }]);
  });

  it('drags a note across the paper with the pointer', async () => {
    const calls = await writingBack();
    await userEvent.click(screen.getByRole('radio', { name: 'Text' }));
    await userEvent.type(screen.getByLabelText('Write a note to put on the paper'), 'Bijî!{Enter}');
    const note = screen.getByRole('button', { name: 'Note: Bijî!' });
    fireEvent.pointerDown(note, { clientX: 10, clientY: 10, button: 0 });
    fireEvent.pointerMove(note, { clientX: 110, clientY: 60 });
    fireEvent.pointerUp(note, { clientX: 110, clientY: 60 });
    await userEvent.click(screen.getByRole('button', { name: 'Send your bird' }));
    expect(sent(calls, '/letters/threads/t1')?.decor.notes[0]).toMatchObject({ x: 600, y: PAPER_TOP + PAPER_RULE * 3 + 50 });
  });

  it('takes a note off with Delete, and the focus goes back to writing a new one', async () => {
    const calls = await writingBack();
    await userEvent.click(screen.getByRole('radio', { name: 'Text' }));
    await userEvent.type(screen.getByLabelText('Write a note to put on the paper'), 'Bijî!{Enter}');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Note: Bijî!' })).toHaveFocus());
    await userEvent.keyboard('{Delete}');
    expect(screen.queryByRole('button', { name: 'Note: Bijî!' })).toBeNull();
    await waitFor(() => expect(screen.getByLabelText('Write a note to put on the paper')).toHaveFocus());
    await userEvent.click(screen.getByRole('button', { name: 'Send your bird' }));
    expect(sent(calls, '/letters/threads/t1')?.decor.notes).toEqual([]);
  });

  it('says what a note may not carry as it is typed, and will not put it on', async () => {
    await writingBack();
    await userEvent.click(screen.getByRole('radio', { name: 'Text' }));
    await userEvent.type(screen.getByLabelText('Write a note to put on the paper'), 'www.example.org');
    expect(screen.getByText('Take the link out of the note: letters can’t carry links.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add note' })).toBeDisabled();
  });

  it('holds as many notes as a letter can carry, and says so', async () => {
    await writingBack();
    await userEvent.click(screen.getByRole('radio', { name: 'Text' }));
    for (let i = 1; i <= NOTES_MAX; i++) {
      await userEvent.type(screen.getByLabelText('Write a note to put on the paper'), `Not ${i}{Enter}`);
      await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    }
    expect(screen.getByText(`A letter can hold ${NOTES_MAX} notes.`)).toBeInTheDocument();
    expect(screen.getByLabelText('Write a note to put on the paper')).toBeDisabled();
    expect(screen.getAllByRole('button', { name: /^Note: / })).toHaveLength(NOTES_MAX);
  });

  it('keeps the words in the ink while the tools change, and sends them as written', async () => {
    const calls = await writingBack();
    await userEvent.click(screen.getByRole('radio', { name: 'Paper' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Write' }));
    expect(screen.getByLabelText('Write back to Baran')).toHaveValue(words);
    await userEvent.click(screen.getByRole('button', { name: 'Send your bird' }));
    expect(sent(calls, '/letters/threads/t1')?.body).toBe(words);
  });

  describe('a first letter to a stranger', () => {
    it('chooses its paper and carries notes, but Draw is closed and says why', async () => {
      const calls = signIn({ 'GET /letters': home({ paper: { style: 'margin', tone: 'rose', ink: 'crimson' } }), 'POST /letters/out': { kind: 'waiting', since: at } });
      renderApp(<LettersPage />, ['/app/letters']);
      await userEvent.click(await screen.findByRole('button', { name: 'Write a letter' }));
      await userEvent.type(screen.getByLabelText('Your letter'), words);
      const draw = screen.getByRole('radio', { name: 'Draw' });
      expect(draw).toHaveAccessibleDescription('Drawings only travel between pen pals: you can draw once someone writes back.');
      await userEvent.click(draw);
      expect(screen.getAllByText('Drawings only travel between pen pals: you can draw once someone writes back.').length).toBeGreaterThan(0);
      // there is nothing to draw on and nothing to draw with
      expect(screen.queryByRole('img', { name: /Your paper/ })).toBeNull();
      expect(screen.queryByRole('radio', { name: 'Pen' })).toBeNull();
      await userEvent.click(screen.getByRole('radio', { name: 'Text' }));
      await userEvent.type(screen.getByLabelText('Write a note to put on the paper'), 'Silav!{Enter}');
      await userEvent.click(screen.getByRole('button', { name: 'Send your bird' }));
      const out = sent(calls, '/letters/out');
      expect(out?.body).toBe(words);
      expect(out?.decor.paper).toEqual({ style: 'margin', tone: 'rose', ink: 'crimson' });
      expect(out?.decor.strokes).toEqual([]);
      expect(out?.decor.notes.map((n) => n.text)).toEqual(['Silav!']);
    });

    it('lets an answer to a visiting bird draw: answering makes you pen pals', async () => {
      const visitor = { person: { id: 'baran', name: 'Baran', bird: 4 }, letter: item({ body: 'Silav! Ez Baran im.' }), since: at, leavesAt: at };
      const answered = { threadId: 't9', person: visitor.person, letter: item({ id: 'l2', mine: true, body: 'Silav' }) };
      const calls = signIn({ 'GET /letters': home({ visitor }), 'POST /letters/visitor': answered });
      renderApp(<LettersPage />, ['/app/letters']);
      await userEvent.type(await screen.findByLabelText('Your answer to Baran'), 'Silav');
      await userEvent.click(screen.getByRole('radio', { name: 'Draw' }));
      drawLine(screen.getByRole('img', { name: /Your paper/ }), [
        [50, 60],
        [70, 90],
      ]);
      await userEvent.click(screen.getByRole('button', { name: 'Send it home with Baran’s bird' }));
      expect(sent(calls, '/letters/visitor')?.decor.strokes).toHaveLength(1);
    });
  });

  it('says what the server refused about the paper in the same words', async () => {
    signIn({ 'GET /letters/threads/t1': thread() });
    const answer = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (url, init) =>
      init?.method === 'POST' ? jsonResponse(422, { code: 'DECOR_NOTE_CONTACT', message: 'refused' }) : answer(url, init),
    );
    renderApp(
      <Routes>
        <Route path="/app/letters/:threadId" element={<LetterThreadPage />} />
      </Routes>,
      ['/app/letters/t1'],
    );
    await userEvent.type(await screen.findByLabelText('Write back to Baran'), words);
    await userEvent.click(screen.getByRole('button', { name: 'Send your bird' }));
    expect(await screen.findByText('Take the phone number, email address or username out of the note: letters stay in Hevalo.')).toBeInTheDocument();
  });
});

describe('a letter, read', () => {
  const decor: LetterDecor = {
    paper: { style: 'margin', tone: 'rose', ink: 'crimson' },
    strokes: [{ tool: 'brush', color: 'sun', width: 30, points: [100, 200, 300, 260] }],
    notes: [{ text: 'Bijî!', x: 500, y: 300, size: 'l', color: 'crimson', turn: -5 }],
  };

  it('shows every letter on its own paper, with its drawing and its notes', async () => {
    signIn({ 'GET /letters/threads/t1': thread({ letters: [item({ id: 'l1', mine: true, body: 'Silav Baran!' }), item({ id: 'l2', body: 'Silav Rojda!', decor })] }) });
    renderApp(
      <Routes>
        <Route path="/app/letters/:threadId" element={<LetterThreadPage />} />
      </Routes>,
      ['/app/letters/t1'],
    );
    const theirs = await screen.findByRole('article', { name: 'Letter from Baran' });
    expect(within(theirs).getByText('Silav Rojda!')).toBeInTheDocument();
    expect(within(theirs).getByRole('img', { name: 'There’s a drawing on this letter.' })).toBeInTheDocument();
    expect(within(within(theirs).getByRole('list', { name: 'Notes on the letter' })).getByText('Bijî!')).toBeInTheDocument();
    // the paper is drawn in its own colours, and the words in its ink
    const sheet = theirs.querySelector<HTMLElement>('.paper-sheet');
    expect(sheet?.style.getPropertyValue('--sheet')).toBe('#fbeae6');
    // a letter on the default paper, nothing drawn, is still on paper, with nothing more said about it
    const yours = screen.getByRole('article', { name: 'Letter from You' });
    expect(yours.querySelector('.paper-sheet')).not.toBeNull();
    expect(within(yours).queryByRole('img')).toBeNull();
    expect(within(yours).queryByRole('list')).toBeNull();
  });

  it('shows a letter taken down as it always has, with nothing of what was on it', async () => {
    signIn({ 'GET /letters/threads/t1': thread({ letters: [item({ id: 'l2', body: '', removed: true, decor: null })], yourTurn: false }) });
    renderApp(
      <Routes>
        <Route path="/app/letters/:threadId" element={<LetterThreadPage />} />
      </Routes>,
      ['/app/letters/t1'],
    );
    const letter = await screen.findByRole('article', { name: 'Letter from Baran' });
    expect(within(letter).getByText('Hevalo took this letter down.')).toBeInTheDocument();
    expect(letter.querySelector('.paper-sheet')).toBeNull();
    expect(within(letter).queryByRole('button', { name: 'Report letter' })).toBeNull();
  });

  it('shows a visiting bird’s letter on its paper', async () => {
    const visitor = { person: { id: 'baran', name: 'Baran', bird: 4 }, letter: item({ body: 'Silav! Ez Baran im.', decor: { ...decor, strokes: [] } }), since: at, leavesAt: at };
    signIn({ 'GET /letters': home({ visitor }) });
    renderApp(<LettersPage />, ['/app/letters']);
    const letter = await screen.findByRole('article', { name: 'Letter from Baran' });
    expect(within(letter).getByText('Bijî!')).toBeInTheDocument();
    // nothing is drawn on it, so nothing is said of a drawing
    expect(within(letter).queryByRole('img')).toBeNull();
  });
});
