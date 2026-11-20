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
// Whether the screen under test is in front; a screen behind another reads nothing until it returns.
const focus = vi.hoisted(() => ({ on: true }));
vi.mock('@react-navigation/native', async () => ({ ...(await import('../play/testing/navigation')), useIsFocused: () => focus.on }));
vi.mock('../widget/reload', () => ({ reloadLetterWidget: vi.fn() }));
// Letter notifications arriving while the app is open.
const pushes = vi.hoisted(() => ({ listeners: new Set<(notice: unknown) => void>() }));
vi.mock('./letterPushes', () => ({
  onLetterNotice: (listener: (notice: unknown) => void) => {
    pushes.listeners.add(listener);
    return () => pushes.listeners.delete(listener);
  },
}));
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { AppState } from 'react-native';
import { DEFAULT_PAPER, letterThreadPath, type LetterLanding, type LetterThread, type LetterVisitor, type LettersHome, type VisitorAnswer } from '@kurda/shared';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fail, fakeClient, ok, testAuth } from '../reports/testing/auth';
import { navigation, refocus } from '../play/testing/navigation';
import { RealtimeProvider } from '../realtime/RealtimeProvider';
import { FakeSocket } from '../realtime/testing/fakeSocket';
import { onHaptic, resetHaptics, type HapticEvent } from '../feedback/haptics';
import { memoryStore } from '../keyboard/deviceStore';
import { DRAFTS_KEY, setDraftStoreForTests } from './drafts';
import { LettersScreen } from './LettersScreen';
import { LetterThreadScreen } from './LetterThreadScreen';

// The birds' flights end at once, so what follows them happens at once.
patchReactNativeWeb({ reduceMotion: true });

const LETTER = 'Silav! Navê min Rojda ye. Tu çawa yî? Ez kurdî hîn dibim.';
const THREAD = '6f9b1c2e-1d2a-4b3c-8d4e-5f6a7b8c9d0e';
const baran = { id: 'u-baran', name: 'Baran', bird: 3 };

const home = (over: Partial<LettersHome> = {}): LettersHome => ({
  refusal: null,
  bird: 1,
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
/** The decor sent with a plain letter on the default paper. */
const plain = { paper: DEFAULT_PAPER, strokes: [], notes: [] };
const visitor: LetterVisitor = {
  person: baran,
  letter: { id: 'l9', mine: false, body: 'Silav! Ez Baran im.', removed: false, sentAt: '2026-11-13T19:00:00.000Z', readAt: null, decor: null },
  since: '2026-11-14T09:00:00.000Z',
  leavesAt: '2026-11-15T09:00:00.000Z',
};
const thread = (over: Partial<LetterThread> = {}): LetterThread => ({
  threadId: THREAD,
  person: baran,
  letters: [
    { id: 'l1', mine: true, body: LETTER, removed: false, sentAt: '2026-11-13T10:00:00.000Z', readAt: null, decor: null },
    { id: 'l2', mine: false, body: 'Silav Rojda! Ez Baran im, ji Hewlêrê.', removed: false, sentAt: '2026-11-13T10:00:00.000Z', readAt: null, decor: null },
  ],
  yourTurn: true,
  closed: false,
  ...over,
});

let dropDrafts: () => void = () => undefined;
beforeEach(() => {
  navigation.navigate.mockClear();
  focus.on = true;
  // Each test starts with no drafts.
  dropDrafts = setDraftStoreForTests(memoryStore());
});
afterEach(() => {
  cleanup();
  dropDrafts();
  pushes.listeners.clear();
  Reflect.deleteProperty(document.documentElement, 'clientWidth');
  window.dispatchEvent(new Event('resize'));
});

/** A phone 390 wide, so the window and its sill are drawn; without a width the screen draws none. */
function phoneWide(): void {
  Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 390 });
  window.dispatchEvent(new Event('resize'));
}

/** Opens the paper and writes a letter on it. */
async function write(body: string): Promise<void> {
  fireEvent.click(await screen.findByTestId('letters-write'));
  fireEvent.change(screen.getByTestId('letters-paper-input'), { target: { value: body } });
}

describe('the letters screen', () => {
  it('offers one thing to do with your bird at home: write a letter', async () => {
    testAuth.client = fakeClient({ 'GET /letters?landings=1': ok(home()) });
    renderWithProviders(<LettersScreen onExit={() => undefined} />);
    expect(await screen.findByTestId('letters-write')).toBeTruthy();
    expect(screen.getByText('No pen pals yet. Call a bird to your window, or send yours out, and someone will write back.')).toBeTruthy();
  });

  it('asks for a birth month before anybody can write, and opens it in Settings', async () => {
    testAuth.client = fakeClient({ 'GET /letters?landings=1': ok(home({ refusal: 'birth_month' })) });
    renderWithProviders(<LettersScreen onExit={() => undefined} />);
    fireEvent.click(await screen.findByTestId('letters-birth-month'));
    expect(navigation.navigate).toHaveBeenCalledWith('SettingsPage', { page: 'birthMonth' });
    expect(screen.queryByTestId('letters-write')).toBeNull();
  });

  it('says in plain words that nobody else has a bird out when yours flies off to wait, and how to call it back', async () => {
    let out: LettersHome['out'] = null;
    const client = fakeClient({
      'GET /letters?landings=1': () => Promise.resolve(ok(home({ out }))),
      'POST /letters/out': () => {
        const since = '2026-11-13T10:00:00.000Z';
        out = { since, visiting: false };
        return Promise.resolve(ok({ kind: 'waiting', since }));
      },
    } as never);
    testAuth.client = client;
    renderWithProviders(<LettersScreen onExit={() => undefined} />);
    await write(LETTER);
    fireEvent.click(screen.getByTestId('letters-paper-send'));
    // Under Reduce Motion the flight ends at once, and the bird waits outside.
    expect(await screen.findByTestId('letters-out')).toBeTruthy();
    expect(screen.getByText(/waiting out there with your letter until someone calls it/)).toBeTruthy();
    expect(screen.getByText('No birds are out right now. Send yours, and someone may call it to their window.')).toBeTruthy();
    expect(screen.getByTestId('letters-recall')).toBeTruthy();
    expect(client.calls.find((c) => c.path === '/letters/out')?.body).toEqual({ body: LETTER, decor: plain });
  });

  it('shows how many birds are out, calls one down with its letter, and answers it with the same bird', async () => {
    const answered: VisitorAnswer = { threadId: THREAD, person: baran, letter: { ...visitor.letter, id: 'l10', mine: true, body: 'Silav' } };
    const client = fakeClient({ 'GET /letters?landings=1': ok(home({ birdsOut: 2, sky: [4, 6] })), 'POST /letters/call': ok({ visitor }), 'POST /letters/visitor': ok(answered) });
    testAuth.client = client;
    phoneWide();
    renderWithProviders(<LettersScreen onExit={() => undefined} />);
    expect(await screen.findByText('2 birds are out there, each carrying a letter from someone your age.')).toBeTruthy();
    fireEvent.click(screen.getByTestId('letters-call'));
    // Their bird has landed with its letter beside yours.
    expect(await screen.findByText('Silav! Ez Baran im.')).toBeTruthy();
    expect(await screen.findByText('Baran’s bird is at your window')).toBeTruthy();
    expect(client.calls.find((c) => c.path === '/letters/call')?.body).toEqual({});
    await waitFor(() => expect(screen.getAllByTestId(/^letter-pigeon-(home|asleep)$/)).toHaveLength(2));
    expect(screen.getByTestId('letters-visitor')).toBeTruthy();
    // Your bird stays home while it is here.
    expect(screen.queryByTestId('letters-write')).toBeNull();
    expect(screen.queryByTestId('letters-call')).toBeNull();
    // A single word is a letter, and the visiting bird carries it.
    fireEvent.change(screen.getByTestId('letters-visitor-answer-input'), { target: { value: 'Silav' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send it home with Baran’s bird' }));
    await waitFor(() => expect(client.calls.find((c) => c.path === '/letters/visitor')?.body).toEqual({ body: 'Silav', decor: plain }));
    expect(await screen.findByText('You and Baran are pen pals now')).toBeTruthy();
    expect(screen.queryByTestId('letters-visitor')).toBeNull();
    fireEvent.click(screen.getByTestId('letters-pals-open'));
    expect(navigation.navigate).toHaveBeenCalledWith('LetterThread', { threadId: THREAD });
  });

  it('says an answer’s drawing is being checked rather than that their bird is taking it home', async () => {
    const answered = { threadId: THREAD, person: baran, letter: { ...visitor.letter, id: 'l10', mine: true, body: 'Silav', review: 'held' } };
    testAuth.client = fakeClient({ 'GET /letters?landings=1': ok(home({ visitor })), 'POST /letters/visitor': ok(answered) });
    renderWithProviders(<LettersScreen onExit={() => undefined} />);
    fireEvent.change(await screen.findByTestId('letters-visitor-answer-input'), { target: { value: 'Silav' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send it home with Baran’s bird' }));
    expect(await screen.findByText('Your drawing is being checked before the bird can fly.')).toBeTruthy();
    expect(screen.queryByText('Baran’s bird is taking your letter home.')).toBeNull();
  });

  it('asks once before sending a visiting bird on its way', async () => {
    const client = fakeClient({ 'GET /letters?landings=1': ok(home({ visitor })), 'DELETE /letters/visitor': ok(null) });
    testAuth.client = client;
    renderWithProviders(<LettersScreen onExit={() => undefined} />);
    fireEvent.click(await screen.findByTestId('letters-visitor-send-on'));
    expect(screen.getByText('Send Baran’s bird on? It flies back out for someone else and won’t come to your window again.')).toBeTruthy();
    fireEvent.click(screen.getByTestId('letters-visitor-keep'));
    expect(client.calls.some((c) => c.method === 'DELETE')).toBe(false);
    fireEvent.click(screen.getByTestId('letters-visitor-send-on'));
    fireEvent.click(screen.getByTestId('letters-visitor-send-on-yes'));
    await waitFor(() => expect(client.calls.some((c) => c.method === 'DELETE' && c.path === '/letters/visitor')).toBe(true));
    // It takes its letter and flies on, and your bird may go out again.
    await waitFor(() => expect(screen.queryByTestId('letters-visitor')).toBeNull());
    expect(await screen.findByTestId('letters-write')).toBeTruthy();
  });

  it('stands in the page’s shape while it is read, never a blank under the header', async () => {
    let answer: (r: unknown) => void = () => undefined;
    testAuth.client = fakeClient({ 'GET /letters?landings=1': () => new Promise((resolve) => (answer = resolve)) } as never);
    renderWithProviders(<LettersScreen onExit={() => undefined} />);
    expect(screen.getByTestId('letters-loading')).toBeTruthy();
    await act(async () => answer(ok(home())));
    expect(await screen.findByTestId('letters-write')).toBeTruthy();
    expect(screen.queryByTestId('letters-loading')).toBeNull();
  });

  it('says why when calling your bird back did not get through, and keeps it out there', async () => {
    const out = { since: '2026-11-13T10:00:00.000Z', visiting: false };
    testAuth.client = fakeClient({ 'GET /letters?landings=1': ok(home({ out })), 'DELETE /letters/out': fail({ kind: 'network', message: 'offline' }) });
    renderWithProviders(<LettersScreen onExit={() => undefined} />);
    fireEvent.click(await screen.findByTestId('letters-recall'));
    expect(await screen.findByTestId('letters-error')).toBeTruthy();
    expect(screen.getByTestId('letters-out')).toBeTruthy();
  });

  it('says why when a visiting bird could not be sent on, and keeps it at the window', async () => {
    testAuth.client = fakeClient({ 'GET /letters?landings=1': ok(home({ visitor })), 'DELETE /letters/visitor': fail({ kind: 'network', message: 'offline' }) });
    renderWithProviders(<LettersScreen onExit={() => undefined} />);
    fireEvent.click(await screen.findByTestId('letters-visitor-send-on'));
    fireEvent.click(screen.getByTestId('letters-visitor-send-on-yes'));
    expect(await screen.findByTestId('letters-visitor')).toBeTruthy();
    // Shown under the answer being written.
    expect(await screen.findByTestId('letters-visitor-answer-problem')).toBeTruthy();
  });

  it('says when every call of the day is made, and offers no call', async () => {
    testAuth.client = fakeClient({ 'GET /letters?landings=1': ok(home({ birdsOut: 3, sky: [1, 2, 3], callsLeft: 0 })) });
    renderWithProviders(<LettersScreen onExit={() => undefined} />);
    expect(await screen.findByText('That’s all the birds you can call today. Call again tomorrow.')).toBeTruthy();
    expect(screen.queryByTestId('letters-call')).toBeNull();
  });

  it('shows your bird home with an answer, and the way to read it, and starts afresh once it is read', async () => {
    let homecoming: LettersHome['homecoming'] = { threadId: THREAD, person: baran };
    testAuth.client = fakeClient({ 'GET /letters?landings=1': () => Promise.resolve(ok(home({ homecoming }))) } as never);
    phoneWide();
    renderWithProviders(<LettersScreen onExit={() => undefined} />);
    expect(await screen.findByText('Your bird came home with a letter from Baran')).toBeTruthy();
    // It has landed and laid the letter on the sill.
    await waitFor(() => expect(screen.getByTestId('letter-on-sill')).toBeTruthy());
    fireEvent.click(screen.getByTestId('letters-home-read'));
    expect(navigation.navigate).toHaveBeenCalledWith('LetterThread', { threadId: THREAD });
    // Read and returned to: the screen follows the server, with your bird home.
    homecoming = null;
    act(() => refocus());
    expect(await screen.findByTestId('letters-write')).toBeTruthy();
    expect(screen.queryByText('Your bird came home with a letter from Baran')).toBeNull();
    expect(screen.queryByTestId('letter-on-sill')).toBeNull();
  });

  it('brings a pen pal’s next letter to the window by their own bird, and the way to read it', async () => {
    let arrival: LettersHome['arrival'] = { threadId: THREAD, person: baran };
    testAuth.client = fakeClient({ 'GET /letters?landings=1': () => Promise.resolve(ok(home({ arrival }))) } as never);
    phoneWide();
    renderWithProviders(<LettersScreen onExit={() => undefined} />);
    expect(await screen.findByText('Baran’s bird brought you a letter')).toBeTruthy();
    // Their bird has landed beside yours and laid the letter on the sill.
    await waitFor(() => expect(screen.getByTestId('letter-on-sill')).toBeTruthy());
    fireEvent.click(screen.getByTestId('letters-home-read'));
    expect(navigation.navigate).toHaveBeenCalledWith('LetterThread', { threadId: THREAD });
    // Read and returned to: their bird has gone.
    arrival = null;
    act(() => refocus());
    expect(await screen.findByTestId('letters-write')).toBeTruthy();
    expect(screen.queryByText('Baran’s bird brought you a letter')).toBeNull();
  });

  it('asks for a bird to be chosen first, for free, before the first letter', async () => {
    let chosen: number | null = null;
    const client = fakeClient({
      'GET /letters?landings=1': () => Promise.resolve(ok(home(chosen === null ? { birdChosen: false, bird: 1 } : { bird: chosen }))),
      'POST /letters/bird': (body: unknown) => {
        chosen = (body as { bird: number }).bird;
        return Promise.resolve(ok(home({ bird: chosen })));
      },
    } as never);
    testAuth.client = client;
    renderWithProviders(<LettersScreen onExit={() => undefined} />);
    expect(await screen.findByTestId('letters-bird-picker')).toBeTruthy();
    expect(screen.getByText('Choose your bird')).toBeTruthy();
    expect(screen.queryByTestId('letters-write')).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'Teal bird' }));
    fireEvent.click(screen.getByTestId('letters-bird-confirm'));
    expect(await screen.findByTestId('letters-write')).toBeTruthy();
    expect(client.calls.find((c) => c.path === '/letters/bird')?.body).toEqual({ bird: 5 });
  });

  it('asks Zêr for a new bird, says how many are missing, and lets the bird stay as it is', async () => {
    const client = fakeClient({ 'GET /letters?landings=1': ok(home({ bird: 1, zer: 120 })) });
    testAuth.client = client;
    renderWithProviders(<LettersScreen onExit={() => undefined} />);
    fireEvent.click(await screen.findByTestId('letters-bird-change'));
    expect(screen.getByText('A new bird costs 500 Zêr. You have 120 Zêr.')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Sky-blue bird, your bird now' })).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'Green bird' }));
    expect(screen.getByText('You need 380 more Zêr.')).toBeTruthy();
    fireEvent.click(screen.getByTestId('letters-bird-confirm'));
    fireEvent.click(screen.getByTestId('letters-bird-keep'));
    expect(await screen.findByTestId('letters-write')).toBeTruthy();
    expect(client.calls.some((c) => c.path === '/letters/bird')).toBe(false);
  });

  it('opens the bird picker from the paper too, closing the paper', async () => {
    testAuth.client = fakeClient({ 'GET /letters?landings=1': ok(home({ bird: 1, zer: 900 })) });
    renderWithProviders(<LettersScreen onExit={() => undefined} />);
    fireEvent.click(await screen.findByTestId('letters-write'));
    expect(screen.getByTestId('letters-paper-input')).toBeTruthy();
    fireEvent.click(screen.getByTestId('letters-bird-change'));
    expect(screen.getByText('Choose a new bird')).toBeTruthy();
    expect(screen.queryByTestId('letters-paper-input')).toBeNull();
  });

  it('pays for a new bird once another is picked, and says so when the Zêr fall short', async () => {
    let zer = 900;
    const client = fakeClient({
      'GET /letters?landings=1': () => Promise.resolve(ok(home({ bird: 1, zer }))),
      'POST /letters/bird': () => {
        zer = 120;
        return Promise.resolve(fail({ code: 'INSUFFICIENT_FUNDS', status: 402 }));
      },
    } as never);
    testAuth.client = client;
    renderWithProviders(<LettersScreen onExit={() => undefined} />);
    fireEvent.click(await screen.findByTestId('letters-bird-change'));
    fireEvent.click(screen.getByRole('radio', { name: 'Green bird' }));
    fireEvent.click(screen.getByTestId('letters-bird-confirm'));
    await waitFor(() => expect(client.calls.find((c) => c.path === '/letters/bird')?.body).toEqual({ bird: 3 }));
    // Spent on another phone meanwhile: the screen re-reads and says what is missing.
    expect(await screen.findByText('You need 380 more Zêr.')).toBeTruthy();
  });

  it('opens a first letter on the paper you last wrote on, sends it on that paper, and keeps drawing for pen pals', async () => {
    const sage = { style: 'grid', tone: 'sage', ink: 'forest' } as const;
    const client = fakeClient({ 'GET /letters?landings=1': ok(home({ paper: sage })), 'POST /letters/out': ok({ kind: 'waiting', since: '2026-11-13T10:00:00.000Z' }) });
    testAuth.client = client;
    renderWithProviders(<LettersScreen onExit={() => undefined} />);
    await write(LETTER);
    fireEvent.click(screen.getByRole('tab', { name: 'Draw' }));
    expect(screen.getByText('Drawings only travel between pen pals: you can draw once someone writes back.')).toBeTruthy();
    expect(screen.queryByTestId('letters-paper-canvas')).toBeNull();
    fireEvent.click(screen.getByTestId('letters-paper-send'));
    await waitFor(() => expect(client.calls.find((c) => c.path === '/letters/out')?.body).toEqual({ body: LETTER, decor: { paper: sage, strokes: [], notes: [] } }));
  });

  it('lets an answer to a bird at your window be drawn on: the two of you are pen pals once it goes', async () => {
    testAuth.client = fakeClient({ 'GET /letters?landings=1': ok(home({ visitor })) });
    renderWithProviders(<LettersScreen onExit={() => undefined} />);
    await screen.findByTestId('letters-visitor');
    fireEvent.click(screen.getByRole('tab', { name: 'Draw' }));
    expect(screen.getByTestId('letters-visitor-answer-canvas')).toBeTruthy();
    expect(screen.queryByTestId('letters-visitor-answer-draw-locked')).toBeNull();
  });

  it('refuses a letter with a link before the bird leaves, and sends nothing', async () => {
    const client = fakeClient({ 'GET /letters?landings=1': ok(home()) });
    testAuth.client = client;
    renderWithProviders(<LettersScreen onExit={() => undefined} />);
    await write(`${LETTER} www.example.org`);
    expect(screen.getByText('Take out the link: letters can’t carry links.')).toBeTruthy();
    fireEvent.click(screen.getByTestId('letters-paper-send'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(client.calls.some((c) => c.path === '/letters/out')).toBe(false);
  });
});

describe('a correspondence', () => {
  it('stands in its own shape while it is read, never a blank under the header', async () => {
    let answer: (r: unknown) => void = () => undefined;
    testAuth.client = fakeClient({ [`GET ${letterThreadPath(THREAD)}`]: () => new Promise((resolve) => (answer = resolve)) } as never);
    renderWithProviders(<LetterThreadScreen threadId={THREAD} onExit={() => undefined} />);
    expect(screen.getByTestId('letters-thread-loading')).toBeTruthy();
    await act(async () => answer(ok(thread())));
    expect(await screen.findByText(LETTER)).toBeTruthy();
    expect(screen.queryByTestId('letters-thread-loading')).toBeNull();
  });

  it('gives the paper to write back on when it is your turn, and sends the letter', async () => {
    const client = fakeClient({
      [`GET ${letterThreadPath(THREAD)}`]: ok(thread()),
      [`POST /letters/threads/${THREAD}`]: ok({ letter: { id: 'l3', mine: true, body: 'Spas Baran! Çi xweş e.', removed: false, sentAt: '2026-11-13T11:00:00.000Z', readAt: null, decor: null } }),
    });
    testAuth.client = client;
    renderWithProviders(<LetterThreadScreen threadId={THREAD} onExit={() => undefined} />);
    expect(await screen.findByText('Silav Rojda! Ez Baran im, ji Hewlêrê.')).toBeTruthy();
    fireEvent.change(screen.getByTestId('letters-reply-input'), { target: { value: 'Spas Baran! Çi xweş e.' } });
    fireEvent.click(screen.getByTestId('letters-reply-send'));
    // The letter is in the correspondence, and the paper is gone until their answer.
    expect(await screen.findByText('Spas Baran! Çi xweş e.')).toBeTruthy();
    expect(await screen.findByTestId('letters-waiting')).toBeTruthy();
    expect(screen.queryByTestId('letters-reply-input')).toBeNull();
  });

  it('says your bird is with them, and offers no paper, when it is their turn', async () => {
    testAuth.client = fakeClient({ [`GET ${letterThreadPath(THREAD)}`]: ok(thread({ yourTurn: false })) });
    renderWithProviders(<LetterThreadScreen threadId={THREAD} onExit={() => undefined} />);
    expect(await screen.findByTestId('letters-waiting')).toBeTruthy();
    expect(screen.getByText('Your letter is with Baran. When they write back, their bird will bring it to your window.')).toBeTruthy();
    expect(screen.queryByTestId('letters-reply-input')).toBeNull();
  });

  it('says your drawing is being checked, in place of your bird being with them, until a person has looked', async () => {
    const held = { id: 'l3', mine: true, body: 'Spas Baran!', removed: false, sentAt: '2026-11-13T11:00:00.000Z', readAt: null, decor: null, review: 'held' };
    testAuth.client = fakeClient({ [`GET ${letterThreadPath(THREAD)}`]: ok(thread({ yourTurn: false, letters: [...thread().letters, held] as LetterThread['letters'] })) });
    renderWithProviders(<LetterThreadScreen threadId={THREAD} onExit={() => undefined} />);
    expect(await screen.findByText('Your drawing is being checked before the bird can fly.')).toBeTruthy();
    expect(screen.getByText('Being checked')).toBeTruthy();
    expect(screen.queryByTestId('letters-waiting')).toBeNull();
  });

  it('says why a drawing was refused under the paper, keeping the letter to send another way', async () => {
    testAuth.client = fakeClient({
      [`GET ${letterThreadPath(THREAD)}`]: ok(thread()),
      [`POST /letters/threads/${THREAD}`]: fail({ status: 422, code: 'IMAGE_REJECTED', rejection: { code: 'IMAGE_REJECTED', message: 'rejected', reason: 'other', reviewId: null } }),
    });
    renderWithProviders(<LetterThreadScreen threadId={THREAD} onExit={() => undefined} />);
    fireEvent.change(await screen.findByTestId('letters-reply-input'), { target: { value: 'Spas Baran!' } });
    fireEvent.click(screen.getByTestId('letters-reply-send'));
    expect(await screen.findByText('This picture can’t be shared on Hevalo.')).toBeTruthy();
    // A person looks at it anyway, so there is nobody to ask.
    expect(screen.queryByRole('button', { name: 'Ask a person to check' })).toBeNull();
    expect((screen.getByTestId('letters-reply-input') as HTMLTextAreaElement).value).toBe('Spas Baran!');
  });

  it('lets a letter written to you be reported, and not your own', async () => {
    testAuth.client = fakeClient({ [`GET ${letterThreadPath(THREAD)}`]: ok(thread()) });
    renderWithProviders(<LetterThreadScreen threadId={THREAD} onExit={() => undefined} />);
    expect(await screen.findByTestId('letter-report-l2')).toBeTruthy();
    expect(screen.queryByTestId('letter-report-l1')).toBeNull();
  });

  it('opens on the newest letters and shows the earlier ones when asked, keeping them when read again', async () => {
    const page = (from: number, to: number) =>
      Array.from({ length: to - from + 1 }, (_, i) => ({ id: `n${from + i}`, mine: (from + i) % 2 === 0, body: `Name ${from + i}`, decor: null, removed: false, sentAt: '2026-11-13T10:00:00.000Z', readAt: null }));
    let newest = thread({ letters: page(11, 20), earlier: true, yourTurn: false });
    const client = fakeClient({
      [`GET ${letterThreadPath(THREAD)}`]: () => Promise.resolve(ok(newest)),
      [`GET ${letterThreadPath(THREAD, 'n11')}`]: ok(thread({ letters: page(1, 10), earlier: false, yourTurn: false })),
    } as never);
    testAuth.client = client;
    renderWithProviders(<LetterThreadScreen threadId={THREAD} onExit={() => undefined} />);
    expect(await screen.findByText('Name 20')).toBeTruthy();
    expect(screen.queryByText('Name 10')).toBeNull();
    fireEvent.click(screen.getByTestId('letters-earlier'));
    expect(await screen.findByText('Name 1')).toBeTruthy();
    expect(screen.queryByTestId('letters-earlier')).toBeNull();
    // their answer: the newest page moves on by one, and the earlier letters stay above it
    newest = thread({ letters: page(12, 21), earlier: true, yourTurn: true });
    act(() => pushes.listeners.forEach((hear) => hear({ threadId: THREAD, how: 'window', letterId: 'n21', fromUserId: null })));
    expect(await screen.findByText('Name 21')).toBeTruthy();
    expect(screen.getAllByText(/^Name \d+$/).map((el) => el.textContent)).toEqual(page(1, 21).map((l) => l.body));
    expect(screen.queryByTestId('letters-earlier')).toBeNull();
  });

  it('is read only once it has ended', async () => {
    testAuth.client = fakeClient({ [`GET ${letterThreadPath(THREAD)}`]: ok(thread({ closed: true, yourTurn: false })) });
    renderWithProviders(<LetterThreadScreen threadId={THREAD} onExit={() => undefined} />);
    expect(await screen.findByTestId('letters-closed')).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId('letters-reply-input')).toBeNull());
  });
});

const HOME = 'GET /letters?landings=1';
const L1 = 'a1b2c3d4-0000-4000-8000-000000000001';
const L2 = 'a1b2c3d4-0000-4000-8000-000000000002';
const T2 = '7a0c2d3f-2e3b-4c4d-9e5f-6a7b8c9d0e1f';
const azad = { id: 'u-azad', name: 'Azad', bird: 5 };
/** A letter still to land: by default a pen pal's bird with Baran's next letter. */
const landing = (over: Partial<LetterLanding> = {}): LetterLanding => ({
  letterId: L1,
  threadId: THREAD,
  person: baran,
  how: 'window',
  landed: false,
  read: false,
  deliveredAt: '2026-11-14T10:00:00.000Z',
  ...over,
});
/** Azad's bird at the window, called and waiting for an answer. */
const azadsBird: LetterVisitor = { ...visitor, person: azad, letter: { ...visitor.letter, id: 'l77', body: 'Silav, ez Azad im.' } };
const gets = (client: { calls: Array<{ method: string; path: string }> }): number => client.calls.filter((c) => c.method === 'GET' && c.path === '/letters?landings=1').length;
const landedPosts = (client: { calls: Array<{ path: string; body?: unknown }> }): unknown[] => client.calls.filter((c) => c.path === '/letters/landed').map((c) => c.body);
const flush = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

describe('every bird lands at the window', () => {
  it('lands the bird a notification named, says so once, lets the name go, and opens its letter from the window', async () => {
    const used = vi.fn();
    const client = fakeClient({ [HOME]: ok(home({ landings: [landing()] })), 'POST /letters/landed': ok(null) });
    testAuth.client = client;
    phoneWide();
    renderWithProviders(<LettersScreen onExit={() => undefined} bird={THREAD} onBirdUsed={used} />);
    expect(await screen.findByText('Baran’s bird brought you a letter')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('letter-on-sill')).toBeTruthy());
    await waitFor(() => expect(landedPosts(client)).toEqual([{ letterIds: [L1] }]));
    expect(used).toHaveBeenCalled();
    expect(navigation.navigate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('letters-home-read'));
    expect(navigation.navigate).toHaveBeenCalledWith('LetterThread', { threadId: THREAD });
    // Reported once, however many times it is shown.
    expect(landedPosts(client)).toHaveLength(1);
  });

  it('opens the correspondence instead when a notification’s bird has nothing to land', async () => {
    const used = vi.fn();
    testAuth.client = fakeClient({ [HOME]: ok(home({ landings: [] })) });
    renderWithProviders(<LettersScreen onExit={() => undefined} bird={THREAD} onBirdUsed={used} />);
    await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith('LetterThread', { threadId: THREAD }));
    expect(used).toHaveBeenCalled();
  });

  it('never follows a named bird that is not a correspondence’s id, and lets it go', async () => {
    const used = vi.fn();
    testAuth.client = fakeClient({ [HOME]: ok(home()) });
    renderWithProviders(<LettersScreen onExit={() => undefined} bird="../settings" onBirdUsed={used} />);
    expect(await screen.findByTestId('letters-write')).toBeTruthy();
    expect(used).toHaveBeenCalled();
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('opens the correspondence when a called bird holds the sill, and lands its letter once that bird is sent on', async () => {
    let at: LetterVisitor | null = azadsBird;
    const client = fakeClient({
      [HOME]: () => Promise.resolve(ok(home({ visitor: at, landings: [landing()] }))),
      'DELETE /letters/visitor': () => {
        at = null;
        return Promise.resolve(ok(null));
      },
      'POST /letters/landed': ok(null),
    } as never);
    testAuth.client = client;
    renderWithProviders(<LettersScreen onExit={() => undefined} bird={THREAD} onBirdUsed={() => undefined} />);
    await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith('LetterThread', { threadId: THREAD }));
    // Azad's bird still waits for its answer, and Baran's letter has not landed.
    expect(await screen.findByText('Silav, ez Azad im.')).toBeTruthy();
    expect(landedPosts(client)).toEqual([]);
    fireEvent.click(screen.getByTestId('letters-visitor-send-on'));
    fireEvent.click(screen.getByTestId('letters-visitor-send-on-yes'));
    expect(await screen.findByText('Baran’s bird brought you a letter')).toBeTruthy();
    await waitFor(() => expect(landedPosts(client)).toEqual([{ letterIds: [L1] }]));
  });

  it('lands a bird named while the window is already open', async () => {
    let landings: LetterLanding[] = [];
    const client = fakeClient({ [HOME]: () => Promise.resolve(ok(home({ landings }))), 'POST /letters/landed': ok(null) } as never);
    testAuth.client = client;
    const shown = renderWithProviders(<LettersScreen onExit={() => undefined} />);
    expect(await screen.findByTestId('letters-write')).toBeTruthy();
    landings = [landing()];
    shown.rerender(<LettersScreen onExit={() => undefined} bird={THREAD} onBirdUsed={() => undefined} />);
    expect(await screen.findByText('Baran’s bird brought you a letter')).toBeTruthy();
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('reads the letters again when a letter’s notification arrives while the window is in view, and lands its bird', async () => {
    let landings: LetterLanding[] = [];
    const client = fakeClient({ [HOME]: () => Promise.resolve(ok(home({ landings }))), 'POST /letters/landed': ok(null) } as never);
    testAuth.client = client;
    renderWithProviders(<LettersScreen onExit={() => undefined} />);
    expect(await screen.findByTestId('letters-write')).toBeTruthy();
    landings = [landing()];
    act(() => pushes.listeners.forEach((hear) => hear({ threadId: THREAD, how: 'window', letterId: L1, fromUserId: null })));
    expect(await screen.findByText('Baran’s bird brought you a letter')).toBeTruthy();
    await waitFor(() => expect(landedPosts(client)).toEqual([{ letterIds: [L1] }]));
  });

  it('reads the letters again when the app comes back to the front, but not twice in a few seconds', async () => {
    const fronts: Array<(state: string) => void> = [];
    const listen = vi.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, fn: (state: string) => void) => {
      fronts.push(fn);
      return { remove: () => undefined };
    }) as never);
    try {
      let landings: LetterLanding[] = [];
      const client = fakeClient({ [HOME]: () => Promise.resolve(ok(home({ landings }))), 'POST /letters/landed': ok(null) } as never);
      testAuth.client = client;
      renderWithProviders(<LettersScreen onExit={() => undefined} />);
      expect(await screen.findByTestId('letters-write')).toBeTruthy();
      const before = gets(client);
      // Just read, so coming straight back asks nothing.
      act(() => fronts.forEach((fn) => fn('active')));
      expect(gets(client)).toBe(before);
      landings = [landing()];
      const later = Date.now() + 6000;
      const clock = vi.spyOn(Date, 'now').mockReturnValue(later);
      try {
        act(() => fronts.forEach((fn) => fn('active')));
      } finally {
        clock.mockRestore();
      }
      expect(await screen.findByText('Baran’s bird brought you a letter')).toBeTruthy();
      expect(gets(client)).toBe(before + 1);
    } finally {
      listen.mockRestore();
    }
  });

  it('reads nothing while another screen is in front of it', async () => {
    const client = fakeClient({ [HOME]: ok(home()) });
    testAuth.client = client;
    renderWithProviders(<LettersScreen onExit={() => undefined} />);
    expect(await screen.findByTestId('letters-write')).toBeTruthy();
    const before = gets(client);
    focus.on = false;
    act(() => refocus());
    const read = gets(client);
    act(() => pushes.listeners.forEach((hear) => hear({ threadId: THREAD, how: 'window', letterId: L1, fromUserId: null })));
    await flush();
    // The focus read is the screen coming back; a notification while it is behind another asks nothing.
    expect(read).toBe(before + 1);
    expect(gets(client)).toBe(read);
  });

  it('lands a bird that comes while the window is open, said by the server, and reads again when the connection comes back', async () => {
    const realWebSocket = (globalThis as { WebSocket?: unknown }).WebSocket;
    FakeSocket.all = [];
    (globalThis as { WebSocket?: unknown }).WebSocket = FakeSocket;
    try {
      let landings: LetterLanding[] = [];
      const client = fakeClient({
        'POST /realtime/ticket': ok({ ticket: 'tk' }),
        [HOME]: () => Promise.resolve(ok(home({ landings }))),
        'POST /letters/landed': ok(null),
      } as never);
      testAuth.client = client;
      renderWithProviders(
        <RealtimeProvider>
          <LettersScreen onExit={() => undefined} />
        </RealtimeProvider>,
      );
      expect(await screen.findByTestId('letters-write')).toBeTruthy();
      await flush();
      const before = gets(client);
      act(() => FakeSocket.all[0]!.hello());
      await waitFor(() => expect(gets(client)).toBe(before + 1));
      landings = [landing({ how: 'home' })];
      act(() => FakeSocket.all[0]!.push('user:me', { type: 'letters_changed' }));
      expect(await screen.findByText('Your bird came home with a letter from Baran')).toBeTruthy();
      await waitFor(() => expect(landedPosts(client)).toEqual([{ letterIds: [L1] }]));
    } finally {
      (globalThis as { WebSocket?: unknown }).WebSocket = realWebSocket;
    }
  });

  it('shows a letter that landed before already on the sill, without a flight, and does not say it landed again', async () => {
    const client = fakeClient({ [HOME]: ok(home({ landings: [landing({ landed: true, read: true })] })), 'POST /letters/landed': ok(null) });
    testAuth.client = client;
    phoneWide();
    renderWithProviders(<LettersScreen onExit={() => undefined} />);
    expect(await screen.findByText('Baran’s bird brought you a letter')).toBeTruthy();
    expect(screen.getByTestId('letter-on-sill')).toBeTruthy();
    await flush();
    expect(landedPosts(client)).toEqual([]);
  });

  it('lands one bird at a time, says another is waiting, and lands the next once the first is read', async () => {
    let landings = [landing(), landing({ letterId: L2, threadId: T2, person: azad, deliveredAt: '2026-11-14T11:00:00.000Z' })];
    const client = fakeClient({ [HOME]: () => Promise.resolve(ok(home({ landings }))), 'POST /letters/landed': ok(null) } as never);
    testAuth.client = client;
    renderWithProviders(<LettersScreen onExit={() => undefined} />);
    // The older letter first.
    expect(await screen.findByText('Baran’s bird brought you a letter')).toBeTruthy();
    expect(screen.getByText('Another bird is waiting to come in.')).toBeTruthy();
    fireEvent.click(screen.getByTestId('letters-home-read'));
    expect(navigation.navigate).toHaveBeenCalledWith('LetterThread', { threadId: THREAD });
    // Read and returned to: Azad's bird comes in now.
    landings = [landings[1]!];
    act(() => refocus());
    expect(await screen.findByText('Azad’s bird brought you a letter')).toBeTruthy();
    expect(screen.queryByText('Another bird is waiting to come in.')).toBeNull();
    await waitFor(() => expect(landedPosts(client)).toEqual([{ letterIds: [L1] }, { letterIds: [L2] }]));
  });

  it('lands a pen pal’s letter waiting behind a called bird once that bird is answered', async () => {
    let at: LetterVisitor | null = azadsBird;
    const answered: VisitorAnswer = { threadId: T2, person: azad, letter: { ...azadsBird.letter, id: 'l78', mine: true, body: 'Silav Azad' } };
    const client = fakeClient({
      [HOME]: () => Promise.resolve(ok(home({ visitor: at, landings: [landing()] }))),
      'POST /letters/visitor': () => {
        at = null;
        return Promise.resolve(ok(answered));
      },
      'POST /letters/landed': ok(null),
    } as never);
    testAuth.client = client;
    renderWithProviders(<LettersScreen onExit={() => undefined} />);
    expect(await screen.findByText('Silav, ez Azad im.')).toBeTruthy();
    expect(screen.getByText('Another bird is waiting to come in.')).toBeTruthy();
    fireEvent.change(screen.getByTestId('letters-visitor-answer-input'), { target: { value: 'Silav Azad' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send it home with Azad’s bird' }));
    expect(await screen.findByText('Baran’s bird brought you a letter')).toBeTruthy();
    await waitFor(() => expect(landedPosts(client)).toEqual([{ letterIds: [L1] }]));
  });

  it('says your own bird’s answer home beside a called bird, and again once that bird has taken your answer', async () => {
    let at: LetterVisitor | null = azadsBird;
    let landed = false;
    const answered: VisitorAnswer = { threadId: T2, person: azad, letter: { ...azadsBird.letter, id: 'l78', mine: true, body: 'Silav Azad' } };
    const client = fakeClient({
      [HOME]: () => Promise.resolve(ok(home({ visitor: at, landings: [landing({ how: 'home', landed })] }))),
      'POST /letters/visitor': () => {
        at = null;
        return Promise.resolve(ok(answered));
      },
      'POST /letters/landed': () => {
        landed = true;
        return Promise.resolve(ok(null));
      },
    } as never);
    testAuth.client = client;
    renderWithProviders(<LettersScreen onExit={() => undefined} />);
    expect(await screen.findByText('Silav, ez Azad im.')).toBeTruthy();
    // Under the visitor's words: your bird home with Baran's answer, and the way to read it.
    expect(await screen.findByText('Your bird came home with a letter from Baran')).toBeTruthy();
    expect(screen.getByTestId('letters-home-read')).toBeTruthy();
    await waitFor(() => expect(landedPosts(client)).toEqual([{ letterIds: [L1] }]));
    fireEvent.change(screen.getByTestId('letters-visitor-answer-input'), { target: { value: 'Silav Azad' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send it home with Azad’s bird' }));
    // Once Azad's bird has left with the answer, the window shows the letter still to read.
    await waitFor(() => expect(screen.queryByTestId('letters-visitor-answer-input')).toBeNull());
    await waitFor(() => expect(screen.queryByText('You and Azad are pen pals now')).toBeNull());
    expect(await screen.findByText('Your bird came home with a letter from Baran')).toBeTruthy();
    fireEvent.click(screen.getByTestId('letters-home-read'));
    expect(navigation.navigate).toHaveBeenCalledWith('LetterThread', { threadId: THREAD });
    expect(landedPosts(client)).toHaveLength(1);
  });

  it('keeps an answer being written when its bird flies on by itself, and says where it is', async () => {
    let at: LetterVisitor | null = visitor;
    testAuth.client = fakeClient({ [HOME]: () => Promise.resolve(ok(home({ visitor: at }))) } as never);
    renderWithProviders(<LettersScreen onExit={() => undefined} />);
    fireEvent.change(await screen.findByTestId('letters-visitor-answer-input'), { target: { value: 'Silav Baran, ez Rojda me.' } });
    // Its day is up, and the server no longer has it at the window.
    at = null;
    act(() => refocus());
    expect(await screen.findByText('Your answer is kept. You can send it with your own bird.')).toBeTruthy();
    expect(screen.queryByTestId('letters-visitor-answer-input')).toBeNull();
    fireEvent.click(screen.getByTestId('letters-write'));
    expect((screen.getByTestId('letters-paper-input') as HTMLTextAreaElement).value).toBe('Silav Baran, ez Rojda me.');
  });

  it('keeps an answer begun to a bird whose day ran out while the app was closed, for your own bird', async () => {
    dropDrafts();
    const kept = { body: 'Silav, ez Rojda me.', paper: DEFAULT_PAPER, strokes: [], notes: [], at: Date.now() };
    dropDrafts = setDraftStoreForTests(memoryStore({ [DRAFTS_KEY]: JSON.stringify({ who: 'me', drafts: { 'visitor:old1': kept } }) }));
    testAuth.client = fakeClient({ [HOME]: ok(home()) });
    renderWithProviders(<LettersScreen onExit={() => undefined} />);
    expect(await screen.findByText('Your answer is kept. You can send it with your own bird.')).toBeTruthy();
    fireEvent.click(screen.getByTestId('letters-write'));
    expect((screen.getByTestId('letters-paper-input') as HTMLTextAreaElement).value).toBe('Silav, ez Rojda me.');
  });

  it('shows the bird already at the window when a call is refused for it, and does not call again', async () => {
    let at: LetterVisitor | null = null;
    const client = fakeClient({
      [HOME]: () => Promise.resolve(ok(home({ birdsOut: 2, sky: [4, 6], visitor: at }))),
      'POST /letters/call': () => {
        // Called on another phone a moment before.
        at = visitor;
        return Promise.resolve(fail({ code: 'VISITOR_HERE', status: 409 }));
      },
    } as never);
    testAuth.client = client;
    renderWithProviders(<LettersScreen onExit={() => undefined} />);
    fireEvent.click(await screen.findByTestId('letters-call'));
    expect(await screen.findByText('Silav! Ez Baran im.')).toBeTruthy();
    expect(screen.getByTestId('letters-visitor-answer-input')).toBeTruthy();
    expect(screen.queryByTestId('letters-call')).toBeNull();
    expect(client.calls.filter((c) => c.path === '/letters/call')).toHaveLength(1);
  });

  it('shows your bird out, with the way to call it back, when a letter is refused because it already is', async () => {
    let out: LettersHome['out'] = null;
    testAuth.client = fakeClient({
      [HOME]: () => Promise.resolve(ok(home({ out }))),
      'POST /letters/out': () => {
        // Sent out from the website a moment before.
        out = { since: '2026-11-13T10:00:00.000Z', visiting: false };
        return Promise.resolve(fail({ code: 'BIRD_OUT', status: 409 }));
      },
    } as never);
    renderWithProviders(<LettersScreen onExit={() => undefined} />);
    await write(LETTER);
    fireEvent.click(screen.getByTestId('letters-paper-send'));
    expect(await screen.findByTestId('letters-out')).toBeTruthy();
    expect(screen.getByTestId('letters-recall')).toBeTruthy();
    expect(screen.queryByTestId('letters-paper-input')).toBeNull();
  });

  it('lands the answer your bird brought when it was answered just before you called it back', async () => {
    let state: Partial<LettersHome> = { out: { since: '2026-11-13T10:00:00.000Z', visiting: true }, flight: 'window' };
    const client = fakeClient({
      [HOME]: () => Promise.resolve(ok(home(state))),
      'DELETE /letters/out': () => {
        state = { out: null, flight: 'homeward', landings: [landing({ how: 'home' })] };
        return Promise.resolve(fail({ code: 'BIRD_ANSWERED', status: 404 }));
      },
      'POST /letters/landed': ok(null),
    } as never);
    testAuth.client = client;
    renderWithProviders(<LettersScreen onExit={() => undefined} />);
    fireEvent.click(await screen.findByTestId('letters-recall'));
    expect(await screen.findByText('Your bird came home with a letter from Baran')).toBeTruthy();
    expect(screen.queryByTestId('letters-error')).toBeNull();
    await waitFor(() => expect(landedPosts(client)).toEqual([{ letterIds: [L1] }]));
  });

  it('says where your bird is while it is out: waiting out there, or at somebody’s window', async () => {
    testAuth.client = fakeClient({ [HOME]: ok(home({ out: { since: '2026-11-13T10:00:00.000Z', visiting: true, leavesBy: '2026-11-14T10:00:00.000Z' }, flight: 'window' })) });
    renderWithProviders(<LettersScreen onExit={() => undefined} />);
    expect(await screen.findByText('Someone has called your bird to their window and is reading your letter right now.')).toBeTruthy();
  });

  it('brings your bird home with its letter when nobody called it, says why, and says it landed once', async () => {
    const client = fakeClient({
      [HOME]: ok(home({ returned: { letterId: L2, since: '2026-11-13T10:00:00.000Z', why: 'unanswered' }, flight: 'home' })),
      'POST /letters/landed': ok(null),
    });
    testAuth.client = client;
    renderWithProviders(<LettersScreen onExit={() => undefined} />);
    expect(await screen.findByText('Your bird came back with your letter')).toBeTruthy();
    expect(screen.getByText('Nobody called it in 14 days. Send it out again whenever you like.')).toBeTruthy();
    expect(screen.getByTestId('letters-write')).toBeTruthy();
    await waitFor(() => expect(landedPosts(client)).toEqual([{ letterIds: [L2] }]));
  });

  it('keeps a letter being written when the screen is left, and opens the paper on it again', async () => {
    testAuth.client = fakeClient({ [HOME]: ok(home()) });
    const first = renderWithProviders(<LettersScreen onExit={() => undefined} />);
    await write('Silav hevalo, tu çawa yî?');
    first.unmount();
    renderWithProviders(<LettersScreen onExit={() => undefined} />);
    fireEvent.click(await screen.findByTestId('letters-write'));
    expect((screen.getByTestId('letters-paper-input') as HTMLTextAreaElement).value).toBe('Silav hevalo, tu çawa yî?');
  });

  it('keeps an answer whose bird flew on before it was sent, for your own bird', async () => {
    let at: LetterVisitor | null = visitor;
    testAuth.client = fakeClient({
      [HOME]: () => Promise.resolve(ok(home({ visitor: at }))),
      'POST /letters/visitor': () => {
        at = null;
        return Promise.resolve(fail({ code: 'NO_VISITOR', status: 404 }));
      },
    } as never);
    renderWithProviders(<LettersScreen onExit={() => undefined} />);
    fireEvent.change(await screen.findByTestId('letters-visitor-answer-input'), { target: { value: 'Silav Baran, ez Rojda me.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send it home with Baran’s bird' }));
    expect(await screen.findByText('Your answer is kept. You can send it with your own bird.')).toBeTruthy();
    fireEvent.click(screen.getByTestId('letters-write'));
    expect((screen.getByTestId('letters-paper-input') as HTMLTextAreaElement).value).toBe('Silav Baran, ez Rojda me.');
  });

  it('keeps an answer whose bird flew on for the correspondence with that person, and opens it there', async () => {
    let at: LetterVisitor | null = visitor;
    const pal = { threadId: THREAD, person: baran, yourTurn: true, unread: 0, lastLetterAt: '2026-11-13T10:00:00.000Z' };
    testAuth.client = fakeClient({
      [HOME]: () => Promise.resolve(ok(home({ visitor: at, penPals: [pal] as never }))),
      'POST /letters/visitor': () => {
        at = null;
        return Promise.resolve(fail({ code: 'BIRD_GONE', status: 409 }));
      },
      [`GET ${letterThreadPath(THREAD)}`]: ok(thread()),
    } as never);
    const shown = renderWithProviders(<LettersScreen onExit={() => undefined} />);
    fireEvent.change(await screen.findByTestId('letters-visitor-answer-input'), { target: { value: 'Silav Baran, ez Rojda me.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send it home with Baran’s bird' }));
    fireEvent.click(await screen.findByText('Your answer is kept. You can send it to Baran in your letters.'));
    expect(navigation.navigate).toHaveBeenCalledWith('LetterThread', { threadId: THREAD });
    shown.unmount();
    renderWithProviders(<LetterThreadScreen threadId={THREAD} onExit={() => undefined} />);
    await waitFor(() => expect((screen.getByTestId('letters-reply-input') as HTMLTextAreaElement).value).toBe('Silav Baran, ez Rojda me.'));
  });

  it('lands a bird without a buzz for a reader who asked for less motion', async () => {
    resetHaptics();
    const felt: HapticEvent[] = [];
    const stop = onHaptic((event) => felt.push(event));
    try {
      const client = fakeClient({ [HOME]: ok(home({ landings: [landing()] })), 'POST /letters/landed': ok(null) });
      testAuth.client = client;
      phoneWide();
      renderWithProviders(<LettersScreen onExit={() => undefined} />);
      await waitFor(() => expect(landedPosts(client)).toHaveLength(1));
      expect(felt).toEqual([]);
    } finally {
      stop();
    }
  });
});

describe('a correspondence, kept up to date', () => {
  it('reads itself again when a letter for it arrives, and not for another correspondence', async () => {
    let letters = thread({ yourTurn: false }).letters;
    const client = fakeClient({ [`GET ${letterThreadPath(THREAD)}`]: () => Promise.resolve(ok(thread({ letters, yourTurn: letters.length > 2 }))) } as never);
    testAuth.client = client;
    renderWithProviders(<LetterThreadScreen threadId={THREAD} onExit={() => undefined} />);
    expect(await screen.findByTestId('letters-waiting')).toBeTruthy();
    const asked = () => client.calls.filter((c) => c.path === letterThreadPath(THREAD)).length;
    const before = asked();
    act(() => pushes.listeners.forEach((hear) => hear({ threadId: T2, how: 'window', letterId: L2, fromUserId: null })));
    await flush();
    expect(asked()).toBe(before);
    letters = [...letters, { id: 'l3', mine: false, body: 'Ez jî baş im, spas!', removed: false, sentAt: '2026-11-14T10:00:00.000Z', readAt: null, decor: null }];
    act(() => pushes.listeners.forEach((hear) => hear({ threadId: THREAD, how: 'window', letterId: L1, fromUserId: null })));
    expect(await screen.findByText('Ez jî baş im, spas!')).toBeTruthy();
    expect(screen.getByTestId('letters-reply-input')).toBeTruthy();
  });

  it('reads itself again when the server says letters changed', async () => {
    const realWebSocket = (globalThis as { WebSocket?: unknown }).WebSocket;
    FakeSocket.all = [];
    (globalThis as { WebSocket?: unknown }).WebSocket = FakeSocket;
    try {
      let closed = false;
      testAuth.client = fakeClient({
        'POST /realtime/ticket': ok({ ticket: 'tk' }),
        [`GET ${letterThreadPath(THREAD)}`]: () => Promise.resolve(ok(thread({ closed, yourTurn: !closed }))),
      } as never);
      renderWithProviders(
        <RealtimeProvider>
          <LetterThreadScreen threadId={THREAD} onExit={() => undefined} />
        </RealtimeProvider>,
      );
      expect(await screen.findByTestId('letters-reply-input')).toBeTruthy();
      await flush();
      act(() => FakeSocket.all[0]!.hello());
      // They said goodbye on their phone.
      closed = true;
      act(() => FakeSocket.all[0]!.push('user:me', { type: 'letters_changed' }));
      expect(await screen.findByTestId('letters-closed')).toBeTruthy();
    } finally {
      (globalThis as { WebSocket?: unknown }).WebSocket = realWebSocket;
    }
  });

  it('keeps a letter being written back, and lets it go once it is sent', async () => {
    const client = fakeClient({
      [`GET ${letterThreadPath(THREAD)}`]: ok(thread()),
      [`POST /letters/threads/${THREAD}`]: ok({ letter: { id: 'l3', mine: true, body: 'Spas Baran!', removed: false, sentAt: '2026-11-13T11:00:00.000Z', readAt: null, decor: null } }),
    });
    testAuth.client = client;
    const first = renderWithProviders(<LetterThreadScreen threadId={THREAD} onExit={() => undefined} />);
    fireEvent.change(await screen.findByTestId('letters-reply-input'), { target: { value: 'Spas Baran!' } });
    first.unmount();
    const second = renderWithProviders(<LetterThreadScreen threadId={THREAD} onExit={() => undefined} />);
    await waitFor(() => expect((screen.getByTestId('letters-reply-input') as HTMLTextAreaElement).value).toBe('Spas Baran!'));
    fireEvent.click(screen.getByTestId('letters-reply-send'));
    expect(await screen.findByTestId('letters-waiting')).toBeTruthy();
    second.unmount();
    // Their answer arrives, and the paper that opens for it is fresh.
    renderWithProviders(<LetterThreadScreen threadId={THREAD} onExit={() => undefined} />);
    await waitFor(() => expect((screen.getByTestId('letters-reply-input') as HTMLTextAreaElement).value).toBe(''));
  });
});
