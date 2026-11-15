// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('expo-notifications', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('@react-native-community/netinfo', () => import('../reports/testing/netinfo'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
vi.mock('../widget/reload', () => ({ reloadLetterWidget: vi.fn() }));
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import {
  DECOR_POINTS_MAX,
  DEFAULT_PAPER,
  NOTES_MAX,
  NOTE_TURN_MAX,
  PAPER_H,
  PAPER_W,
  paperColors,
  type LetterDecor,
  type LetterItem,
  type LetterThread,
  type PaperNote,
  type PaperStroke,
} from '@kurda/shared';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fail, fakeClient, ok, testAuth } from '../reports/testing/auth';
import { reloadLetterWidget } from '../widget/reload';
import { LetterComposer, type ComposedLetter } from './LetterComposer';
import { LetterSheet } from './LetterParts';
import { LetterThreadScreen } from './LetterThreadScreen';
import type { PaperHost } from './usePaperScroll';
import {
  EMPTY_DRAWING,
  PenLine,
  addStroke,
  clearDrawing,
  moveNote,
  pagesFor,
  pointsLeft,
  redo,
  turnNote,
  undo,
} from './paperKit';

patchReactNativeWeb({ reduceMotion: true });

const THREAD = '6f9b1c2e-1d2a-4b3c-8d4e-5f6a7b8c9d0e';
const baran = { id: 'u-baran', name: 'Baran', bird: 3 };
const line = (points: number[], over: Partial<PaperStroke> = {}): PaperStroke => ({ tool: 'pen', color: 'navy', width: 5, points, ...over });
const note = (over: Partial<PaperNote> = {}): PaperNote => ({ text: 'Silav!', x: 500, y: 600, size: 'm', color: 'crimson', turn: 0, ...over });

beforeEach(() => {
  vi.mocked(reloadLetterWidget).mockClear();
});
afterEach(() => {
  cleanup();
});

describe('the paper’s arithmetic', () => {
  it('undoes and redoes lines one at a time, and a clear comes back with one undo', () => {
    const a = line([10, 10, 50, 50]);
    const b = line([60, 60, 90, 90]);
    let d = addStroke(addStroke(EMPTY_DRAWING, a), b);
    expect(d.strokes).toEqual([a, b]);
    d = undo(d);
    expect(d.strokes).toEqual([a]);
    d = redo(d);
    expect(d.strokes).toEqual([a, b]);
    d = clearDrawing(d);
    expect(d.strokes).toEqual([]);
    d = undo(d);
    expect(d.strokes).toEqual([a, b]);
    // something new drawn after an undo is a new branch: what was undone cannot be done again
    d = addStroke(undo(d), line([1, 1, 2, 2]));
    expect(d.undone).toEqual([]);
    expect(redo(d)).toBe(d);
    // nothing to clear is not a step to undo
    expect(clearDrawing(EMPTY_DRAWING)).toBe(EMPTY_DRAWING);
  });

  it('takes a finger’s points only as far apart as a line needs, on the sheet, and no more than the letter can carry', () => {
    const pen = new PenLine('pen', 'navy', 5, 100.4, 200.6, PAPER_H, 3);
    expect(pen.points).toEqual([100, 201]);
    expect(pen.to(101, 201)).toBe(false);
    expect(pen.to(120, 201)).toBe(true);
    expect(pen.to(-40, 99999)).toBe(true);
    expect(pen.points.slice(-2)).toEqual([0, PAPER_H]);
    // the third point was the last this letter had room for
    expect(pen.to(300, 300)).toBe(false);
    // a touch that never moved is a dot
    expect(new PenLine('brush', 'sun', 28, 50, 50, PAPER_H, 100).done().points).toEqual([50, 50, 50, 50]);
  });

  it('counts what a letter can still carry, by its points and by its size', () => {
    const decor: LetterDecor = { paper: DEFAULT_PAPER, strokes: [], notes: [] };
    expect(pointsLeft(decor)).toBeGreaterThan(5000);
    expect(pointsLeft(decor)).toBeLessThanOrEqual(DECOR_POINTS_MAX);
    // three thousand points drawn: what is left is bounded by the letter's size before its count of points
    const heavy = { ...decor, strokes: [line(Array.from({ length: 2 * 3000 }, (_, i) => 100 + (i % 800)))] };
    expect(pointsLeft(heavy)).toBeGreaterThan(0);
    expect(pointsLeft(heavy)).toBeLessThan(DECOR_POINTS_MAX - 3000);
    const many = { ...decor, strokes: Array.from({ length: 300 }, () => line([1, 1, 2, 2])) };
    expect(pointsLeft(many)).toBe(0);
  });

  it('runs onto a second page for long writing or something placed down there, and no further for a drawing', () => {
    expect(pagesFor(400, [], [])).toBe(1);
    expect(pagesFor(PAPER_H, [], [])).toBe(2);
    expect(pagesFor(200, [line([10, PAPER_H + 40, 20, PAPER_H + 60])], [])).toBe(2);
    expect(pagesFor(200, [], [note({ y: PAPER_H + 100 })])).toBe(2);
    expect(pagesFor(PAPER_H * 2.5, [], [])).toBe(3);
  });

  it('turns a note a step at a time no further than it may go, and keeps it on the sheet', () => {
    let n = note();
    for (let i = 0; i < 10; i++) n = turnNote(n, 1);
    expect(n.turn).toBe(NOTE_TURN_MAX);
    n = turnNote(n, -1);
    expect(n.turn).toBe(NOTE_TURN_MAX - 5);
    expect(moveNote(n, -50, PAPER_H * 3, PAPER_H)).toMatchObject({ x: 0, y: PAPER_H });
    expect(moveNote(n, PAPER_W + 10, 33.4, PAPER_H)).toMatchObject({ x: PAPER_W, y: 33 });
  });
});

/** The composer on its own, as a screen holds it, with what it sends kept. */
function compose({ canDraw = true, paper = DEFAULT_PAPER, host }: { canDraw?: boolean; paper?: LetterDecor['paper']; host?: PaperHost } = {}) {
  const sent: ComposedLetter[] = [];
  renderWithProviders(<LetterComposer label="Your letter" busy={false} onSend={(l) => sent.push(l)} canDraw={canDraw} paper={paper} host={host} testID="c" />);
  return sent;
}

/** The page under the sheet, as a screen gives it, with what the sheet asks of it kept. */
const pageHost = () => ({
  lock: vi.fn<PaperHost['lock']>(),
  by: vi.fn<PaperHost['by']>(),
  reveal: vi.fn<PaperHost['reveal']>(),
});

/** Fingers on the glass: each touch by its name and where it is, the ones that changed this moment, and all that are down. */
async function touch(target: HTMLElement, type: 'touchstart' | 'touchmove' | 'touchend', changed: number[], down: Record<number, [number, number]>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 3));
  const of = (id: number) => {
    const [x, y] = down[id]!;
    return { identifier: id, clientX: x, clientY: y, pageX: x, pageY: y, target, force: 1 };
  };
  const event = new Event(type, { bubbles: true, cancelable: true });
  const ended = type === 'touchend';
  Object.assign(event, {
    changedTouches: changed.map(of),
    touches: Object.keys(down)
      .map(Number)
      .filter((id) => !(ended && changed.includes(id)))
      .map(of),
  });
  fireEvent(target, event);
}

/**
 * A finger drawn across the sheet, from point to point, in points on the
 * screen. A phone reports each movement at its own moment, and the gesture
 * system passes over a movement stamped with the same moment as the last; the
 * page here stamps to the millisecond, so the finger takes a little time
 * between points as a real one does.
 */
async function drag(target: HTMLElement, path: [number, number][]): Promise<void> {
  const [first, ...rest] = path;
  fireEvent.mouseDown(target, { clientX: first![0], clientY: first![1], button: 0, buttons: 1 });
  for (const [x, y] of rest) {
    await new Promise((resolve) => setTimeout(resolve, 3));
    fireEvent.mouseMove(target, { clientX: x, clientY: y, buttons: 1 });
  }
  fireEvent.mouseUp(target, { clientX: path[path.length - 1]![0], clientY: path[path.length - 1]![1], button: 0 });
}
const draw = (path: [number, number][]): Promise<void> => drag(screen.getByTestId('c-canvas'), path);

const linesDrawn = (): number => screen.getByTestId('letter-paper-strokes').querySelectorAll('path').length;

async function writeAndSend(body = 'Silav Baran!'): Promise<void> {
  fireEvent.click(screen.getByRole('tab', { name: 'Write' }));
  fireEvent.change(screen.getByTestId('c-input'), { target: { value: body } });
  fireEvent.click(screen.getByTestId('c-send'));
}

describe('the composer', () => {
  it('offers four tools over the sheet, and sends the words with the paper they are on', async () => {
    const sent = compose();
    for (const name of ['Write', 'Draw', 'Text', 'Paper']) expect(screen.getByRole('tab', { name })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Write' }).getAttribute('aria-selected')).toBe('true');
    // the sheet is the paper itself, drawn under the writing
    expect(screen.getByTestId('c-sheet').querySelector('[data-markup]')?.getAttribute('data-markup')).toContain(paperColors(DEFAULT_PAPER).sheet);
    await writeAndSend();
    expect(sent).toEqual([{ body: 'Silav Baran!', decor: { paper: DEFAULT_PAPER, strokes: [], notes: [] } }]);
  });

  it('keeps Draw in its place but locked on a first letter to a stranger, says why in one line, and sends no drawing', async () => {
    const sent = compose({ canDraw: false });
    // Draw is in its place, and nothing is said of it until it is touched
    expect(screen.queryByTestId('c-draw-locked')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Draw' }));
    expect(screen.getByTestId('c-draw-locked').textContent).toBe('Drawings only travel between pen pals: you can draw once someone writes back.');
    // there is nothing to draw on, and no pen to draw with
    expect(screen.queryByTestId('c-canvas')).toBeNull();
    expect(screen.queryByRole('radio', { name: 'Brush' })).toBeNull();
    // notes still travel on a first letter
    fireEvent.click(screen.getByRole('tab', { name: 'Text' }));
    fireEvent.click(screen.getByTestId('c-add-note'));
    fireEvent.change(screen.getByTestId('c-note-input'), { target: { value: 'Rojbaş' } });
    await writeAndSend();
    expect(sent[0]!.decor.strokes).toEqual([]);
    expect(sent[0]!.decor.notes).toHaveLength(1);
  });

  it('draws a line where a finger goes, in the pen, paint and size chosen', async () => {
    const sent = compose();
    fireEvent.click(screen.getByRole('tab', { name: 'Draw' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Brush' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Large' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Sunflower yellow' }));
    await draw([
      [34, 68],
      [68, 68],
      [102, 102],
      [136, 102],
    ]);
    // the brush lays its paint with a soft edge: two paths for the one line
    await waitFor(() => expect(linesDrawn()).toBe(2));
    // the sheet says it has a drawing on it
    expect(screen.getByTestId('c-canvas').getAttribute('aria-label')).toBe('Your letter. Paper: Cream, Lined. There’s a drawing on it.');
    await writeAndSend();
    const [stroke] = sent[0]!.decor.strokes;
    expect(stroke).toMatchObject({ tool: 'brush', color: 'sun', width: 44 });
    // the sheet is 340 points across here, so a point on the screen is 1000 / 340 of the page
    expect(stroke!.points.slice(0, 2)).toEqual([100, 200]);
    expect(stroke!.points.slice(-2)).toEqual([400, 300]);
  });

  it('holds the page still while the pen is in hand, and lets it go when the pen is put down', () => {
    const host = pageHost();
    compose({ host });
    expect(host.lock).toHaveBeenLastCalledWith(false);
    fireEvent.click(screen.getByRole('tab', { name: 'Draw' }));
    expect(host.lock).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole('tab', { name: 'Paper' }));
    expect(host.lock).toHaveBeenLastCalledWith(false);
  });

  it('moves the page for two fingers, and draws nothing with them', async () => {
    const host = pageHost();
    compose({ host });
    fireEvent.click(screen.getByRole('tab', { name: 'Draw' }));
    const canvas = screen.getByTestId('c-canvas');
    const down: Record<number, [number, number]> = { 1: [100, 300], 2: [180, 300] };
    await touch(canvas, 'touchstart', [1, 2], down);
    Object.assign(down, { 1: [100, 260], 2: [180, 260] });
    await touch(canvas, 'touchmove', [1, 2], down);
    Object.assign(down, { 1: [100, 200], 2: [180, 200] });
    await touch(canvas, 'touchmove', [1, 2], down);
    await touch(canvas, 'touchend', [1, 2], down);
    // the fingers went up the glass, so the page goes on down under them
    expect(host.by).toHaveBeenCalledWith(60);
    expect(linesDrawn()).toBe(0);
  });

  it('leaves a hand resting on the glass alone, and draws with the finger that moves', async () => {
    const sent = compose();
    fireEvent.click(screen.getByRole('tab', { name: 'Draw' }));
    const canvas = screen.getByTestId('c-canvas');
    // the side of a hand lands first and stays where it is
    const down: Record<number, [number, number]> = { 1: [300, 450] };
    await touch(canvas, 'touchstart', [1], down);
    down[2] = [34, 68];
    await touch(canvas, 'touchstart', [2], down);
    for (const [x, y] of [
      [68, 68],
      [102, 102],
      [136, 102],
    ] as const) {
      down[2] = [x, y];
      await touch(canvas, 'touchmove', [2], down);
    }
    await touch(canvas, 'touchend', [1, 2], down);
    await waitFor(() => expect(linesDrawn()).toBe(1));
    await writeAndSend();
    // the line is the finger's alone: nothing of it is where the hand rested
    const points = sent[0]!.decor.strokes[0]!.points;
    expect(points.slice(-2)).toEqual([400, 300]);
    expect(points.some((v, i) => i % 2 === 0 && v > 800)).toBe(false);
  });

  it('undoes, redoes and clears the drawing, and asks once before clearing', async () => {
    compose();
    fireEvent.click(screen.getByRole('tab', { name: 'Draw' }));
    expect(screen.getByRole('button', { name: 'Undo' }).getAttribute('aria-disabled')).toBe('true');
    await draw([
      [20, 20],
      [80, 80],
    ]);
    await draw([
      [100, 20],
      [160, 80],
    ]);
    await waitFor(() => expect(linesDrawn()).toBe(2));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(linesDrawn()).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(linesDrawn()).toBe(2);
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByText('Clear the whole drawing? Your words and notes stay.')).toBeTruthy();
    fireEvent.click(screen.getByTestId('c-clear-keep'));
    expect(linesDrawn()).toBe(2);
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    fireEvent.click(screen.getByTestId('c-clear-yes'));
    expect(linesDrawn()).toBe(0);
    // a clear is undone like anything else
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(linesDrawn()).toBe(2);
  });

  it('chooses the paper’s lines, colour and ink, each a small picture of itself, and a pen in the ink follows it', async () => {
    const sent = compose();
    fireEvent.click(screen.getByRole('tab', { name: 'Paper' }));
    expect(screen.getByRole('radio', { name: 'Lined' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: 'Squared' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Night blue' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Gold' }));
    const night = { style: 'grid', tone: 'night', ink: 'gold' } as const;
    expect(screen.getByTestId('c-sheet').querySelector('[data-markup]')?.getAttribute('data-markup')).toContain(paperColors(night).sheet);
    fireEvent.click(screen.getByRole('tab', { name: 'Draw' }));
    expect(screen.getByRole('radio', { name: 'Gold' }).getAttribute('aria-checked')).toBe('true');
    await writeAndSend();
    expect(sent[0]!.decor.paper).toEqual(night);
  });

  it('puts a note on the paper, takes its words, size, colour and tilt, and moves it with a finger', async () => {
    const sent = compose();
    fireEvent.click(screen.getByRole('tab', { name: 'Text' }));
    expect(screen.getByText('Tap the paper to put a note there, then drag it wherever you like.')).toBeTruthy();
    fireEvent.click(screen.getByTestId('c-add-note'));
    fireEvent.change(screen.getByTestId('c-note-input'), { target: { value: 'Ji te hez dikim' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Large' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Sea blue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tilt right' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tilt right' }));
    await drag(screen.getByLabelText('Note: Ji te hez dikim'), [
      [100, 100],
      [117, 125],
      [134, 151],
    ]);
    fireEvent.click(screen.getByTestId('c-note-done'));
    await writeAndSend();
    const [stuck] = sent[0]!.decor.notes;
    expect(stuck).toMatchObject({ text: 'Ji te hez dikim', size: 'l', color: 'sea', turn: 10 });
    // it went where the finger took it: 34 points across and 51 down is 100 and 150 page units
    expect(stuck!.x).toBe(600 + 100);
    expect(stuck!.y).toBeGreaterThan(150);
  });

  it('says a note can’t carry a phone number, and the letter waits until it is taken out', async () => {
    const sent = compose();
    fireEvent.click(screen.getByRole('tab', { name: 'Text' }));
    fireEvent.click(screen.getByTestId('c-add-note'));
    fireEvent.change(screen.getByTestId('c-note-input'), { target: { value: 'Telefon 0750 123 45 67' } });
    expect(screen.getByTestId('c-note-problem').textContent).toBe(
      'Take the phone number, email address or username out of the note: letters stay in Hevalo.',
    );
    await writeAndSend();
    expect(sent).toEqual([]);
    expect(screen.getByTestId('c-problem').textContent).toBe('Take the phone number, email address or username out of the note: letters stay in Hevalo.');
  });

  it('reads the letter and its notes together, so a number cannot be split between them', async () => {
    const sent = compose();
    fireEvent.click(screen.getByRole('tab', { name: 'Text' }));
    fireEvent.click(screen.getByTestId('c-add-note'));
    fireEvent.change(screen.getByTestId('c-note-input'), { target: { value: '45 67' } });
    // the note alone is no way to be reached
    expect(screen.queryByTestId('c-note-problem')).toBeNull();
    fireEvent.click(screen.getByTestId('c-note-done'));
    await writeAndSend('Hejmara min 0750 123');
    expect(sent).toEqual([]);
    expect(screen.getByTestId('c-problem').textContent).toBe('Take out the phone number, email address or username: letters stay in Hevalo.');
  });

  it('lets a note left without words go, and holds no more notes than a letter carries', async () => {
    const sent = compose();
    fireEvent.click(screen.getByRole('tab', { name: 'Text' }));
    fireEvent.click(screen.getByTestId('c-add-note'));
    fireEvent.click(screen.getByTestId('c-note-done'));
    for (let i = 0; i < NOTES_MAX; i++) {
      fireEvent.click(screen.getByTestId('c-add-note'));
      fireEvent.change(screen.getByTestId('c-note-input'), { target: { value: `Not ${i + 1}` } });
      fireEvent.click(screen.getByTestId('c-note-done'));
    }
    expect(screen.getByTestId('c-add-note').getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByTestId('c-note-hint').textContent).toBe(`A letter can hold ${NOTES_MAX} notes.`);
    await writeAndSend();
    expect(sent[0]!.decor.notes.map((n) => n.text)).toEqual(Array.from({ length: NOTES_MAX }, (_, i) => `Not ${i + 1}`));
  });
});

const letter = (over: Partial<LetterItem> = {}): LetterItem => ({
  id: 'l2',
  mine: false,
  body: 'Silav Rojda! Ez Baran im, ji Hewlêrê.',
  removed: false,
  sentAt: '2026-11-13T10:00:00.000Z',
  readAt: null,
  decor: null,
  ...over,
});

describe('a letter as it is read', () => {
  it('is on its own paper, with its drawing and its notes, and says so to a screen reader', () => {
    const decor: LetterDecor = { paper: { style: 'dotted', tone: 'sky', ink: 'teal' }, strokes: [line([100, 300, 200, 320, 300, 300])], notes: [note({ text: 'Bihar xweş e' })] };
    renderWithProviders(<LetterSheet letter={letter({ decor })} from="Baran" />);
    const sheet = screen.getByTestId('letter-l2');
    const markup = sheet.querySelector('[data-markup]')?.getAttribute('data-markup') ?? '';
    expect(markup).toContain(paperColors(decor.paper).sheet);
    // the drawing is on the paper, under the writing
    expect(markup).toContain('M100 300');
    expect(screen.getByText('Silav Rojda! Ez Baran im, ji Hewlêrê.')).toBeTruthy();
    expect(screen.getByText('Bihar xweş e')).toBeTruthy();
    expect(screen.getByLabelText(/^Letter from Baran, .+\. Paper: Sky blue, Dotted\. There’s a drawing on it\. There’s a note on it\.$/)).toBeTruthy();
  });

  it('is on the plain paper when it has none of its own', () => {
    renderWithProviders(<LetterSheet letter={letter()} from="Baran" />);
    expect(screen.getByTestId('letter-l2').querySelector('[data-markup]')?.getAttribute('data-markup')).toContain(paperColors(DEFAULT_PAPER).sheet);
    expect(screen.getByLabelText(/Paper: Cream, Lined\.$/)).toBeTruthy();
  });

  it('is a plain card once it has been taken down, with nothing of its paper, drawing or notes', () => {
    renderWithProviders(<LetterSheet letter={letter({ removed: true, body: '', decor: null })} from="Baran" onReport={() => undefined} />);
    expect(screen.getByText('Hevalo took this letter down.')).toBeTruthy();
    expect(screen.getByTestId('letter-l2').querySelector('[data-markup]')).toBeNull();
    expect(screen.queryByTestId('letter-report-l2')).toBeNull();
  });
});

describe('a letter on your widget', () => {
  const thread = (): LetterThread => ({
    threadId: THREAD,
    person: baran,
    letters: [letter({ id: 'l1', mine: true, body: 'Silav!' }), letter()],
    yourTurn: true,
    closed: false,
  });

  it('is put on your widget from under it, and taken off again, the widget asked each time to show it', async () => {
    let pinned: string | null = null;
    const client = fakeClient({
      [`GET /letters/threads/${THREAD}`]: ok(thread()),
      'GET /letters/widget/prefs': () => Promise.resolve(ok({ pinnedLetterId: pinned, showWords: false })),
      'PUT /letters/widget/prefs': (body: unknown) => {
        pinned = (body as { pinnedLetterId: string | null }).pinnedLetterId;
        return Promise.resolve(ok({ pinnedLetterId: pinned, showWords: false }));
      },
    } as never);
    testAuth.client = client;
    renderWithProviders(<LetterThreadScreen threadId={THREAD} onExit={() => undefined} />);
    // only a letter you were sent can go on your widget
    fireEvent.click(await screen.findByRole('button', { name: 'Show on my widget, Letter from Baran' }));
    expect(screen.queryByTestId('letter-widget-l1')).toBeNull();
    await waitFor(() => expect(client.calls.find((c) => c.method === 'PUT')?.body).toEqual({ pinnedLetterId: 'l2', showWords: false }));
    expect(await screen.findByRole('button', { name: 'Take off my widget, Letter from Baran' })).toBeTruthy();
    expect(reloadLetterWidget).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText(/On your widget\.$/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Take off my widget, Letter from Baran' }));
    await waitFor(() => expect(client.calls.filter((c) => c.method === 'PUT').map((c) => c.body)).toEqual([
      { pinnedLetterId: 'l2', showWords: false },
      { pinnedLetterId: null, showWords: false },
    ]));
    expect(await screen.findByRole('button', { name: 'Show on my widget, Letter from Baran' })).toBeTruthy();
    expect(reloadLetterWidget).toHaveBeenCalledTimes(2);
  });

  it('says so when the letter was taken down meanwhile, and reads the letters again', async () => {
    let removed = false;
    const client = fakeClient({
      [`GET /letters/threads/${THREAD}`]: () => {
        const now = thread();
        return Promise.resolve(ok(removed ? { ...now, letters: [now.letters[0]!, letter({ removed: true, body: '' })] } : now));
      },
      'GET /letters/widget/prefs': ok({ pinnedLetterId: null, showWords: true }),
      'PUT /letters/widget/prefs': () => {
        removed = true;
        return Promise.resolve(fail({ code: 'LETTER_REMOVED', status: 409 }));
      },
    } as never);
    testAuth.client = client;
    renderWithProviders(<LetterThreadScreen threadId={THREAD} onExit={() => undefined} />);
    fireEvent.click(await screen.findByTestId('letter-widget-l2'));
    expect((await screen.findByTestId('letters-widget-error')).textContent).toBe('Hevalo took this letter down.');
    // read again, it is a letter taken down, with nothing left to pin
    await waitFor(() => expect(screen.queryByTestId('letter-widget-l2')).toBeNull());
    expect(reloadLetterWidget).not.toHaveBeenCalled();
  });

  it('offers nothing to pin until the server has said what is pinned', async () => {
    testAuth.client = fakeClient({ [`GET /letters/threads/${THREAD}`]: ok(thread()) });
    renderWithProviders(<LetterThreadScreen threadId={THREAD} onExit={() => undefined} />);
    expect(await screen.findByTestId('letter-report-l2')).toBeTruthy();
    expect(screen.queryByTestId('letter-widget-l2')).toBeNull();
  });

  it('answers on paper of your own, and a pen pal’s answer may carry a drawing', async () => {
    const client = fakeClient({
      [`GET /letters/threads/${THREAD}`]: ok(thread()),
      [`POST /letters/threads/${THREAD}`]: (body: unknown) => Promise.resolve(ok({ letter: letter({ id: 'l3', mine: true, body: 'Spas!', decor: (body as ComposedLetter).decor }) })),
    } as never);
    testAuth.client = client;
    renderWithProviders(<LetterThreadScreen threadId={THREAD} onExit={() => undefined} />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Draw' }));
    await drag(screen.getByTestId('letters-reply-canvas'), [
      [20, 20],
      [55, 40],
      [90, 60],
    ]);
    fireEvent.click(screen.getByRole('tab', { name: 'Write' }));
    fireEvent.change(screen.getByTestId('letters-reply-input'), { target: { value: 'Spas!' } });
    fireEvent.click(screen.getByTestId('letters-reply-send'));
    await waitFor(() => expect((client.calls.find((c) => c.method === 'POST')?.body as ComposedLetter | undefined)?.decor.strokes).toHaveLength(1));
    // the letter sent is on the table on its paper, with its drawing
    expect(await screen.findByTestId('letter-l3')).toBeTruthy();
    await act(async () => undefined);
  });
});
