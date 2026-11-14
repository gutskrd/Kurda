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
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { LetterThread, LetterVisitor, LettersHome, VisitorAnswer } from '@kurda/shared';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fail, fakeClient, ok, testAuth } from '../reports/testing/auth';
import { navigation, refocus } from '../play/testing/navigation';
import { LettersScreen } from './LettersScreen';
import { LetterThreadScreen } from './LetterThreadScreen';

// the birds' flights end at once, so what follows them follows at once
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
  penPals: [],
  roomForMore: true,
  ...over,
});
const visitor: LetterVisitor = {
  person: baran,
  letter: { id: 'l9', mine: false, body: 'Silav! Ez Baran im.', removed: false, sentAt: '2026-11-13T19:00:00.000Z', readAt: null },
  since: '2026-11-14T09:00:00.000Z',
  leavesAt: '2026-11-15T09:00:00.000Z',
};
const thread = (over: Partial<LetterThread> = {}): LetterThread => ({
  threadId: THREAD,
  person: baran,
  letters: [
    { id: 'l1', mine: true, body: LETTER, removed: false, sentAt: '2026-11-13T10:00:00.000Z', readAt: null },
    { id: 'l2', mine: false, body: 'Silav Rojda! Ez Baran im, ji Hewlêrê.', removed: false, sentAt: '2026-11-13T10:00:00.000Z', readAt: null },
  ],
  yourTurn: true,
  closed: false,
  ...over,
});

beforeEach(() => {
  navigation.navigate.mockClear();
});
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(document.documentElement, 'clientWidth');
  window.dispatchEvent(new Event('resize'));
});

/** A phone 390 wide, so the window is drawn and what the birds do on its sill can be looked at; otherwise the screen has no width and draws none. */
function phoneWide(): void {
  Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 390 });
  window.dispatchEvent(new Event('resize'));
}

/** Open the paper and write a letter on it. */
async function write(body: string): Promise<void> {
  fireEvent.click(await screen.findByTestId('letters-write'));
  fireEvent.change(screen.getByTestId('letters-paper-input'), { target: { value: body } });
}

describe('the letters screen', () => {
  it('offers one thing to do with your bird at home: write a letter', async () => {
    testAuth.client = fakeClient({ 'GET /letters': ok(home()) });
    renderWithProviders(<LettersScreen onExit={() => undefined} />);
    expect(await screen.findByTestId('letters-write')).toBeTruthy();
    expect(screen.getByText('No pen pals yet. Call a bird to your window, or send yours out, and someone will write back.')).toBeTruthy();
  });

  it('says in plain words that nobody else has a bird out when yours flies off to wait, and how to call it back', async () => {
    let out: LettersHome['out'] = null;
    const client = fakeClient({
      'GET /letters': () => Promise.resolve(ok(home({ out }))),
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
    // the flight ends at once for a reader who asked for less motion, and the bird waits out there
    expect(await screen.findByTestId('letters-out')).toBeTruthy();
    expect(screen.getByText(/waiting out there with your letter until someone calls it/)).toBeTruthy();
    expect(screen.getByText('No birds are out right now. Send yours, and someone may call it to their window.')).toBeTruthy();
    expect(screen.getByTestId('letters-recall')).toBeTruthy();
    expect(client.calls.find((c) => c.path === '/letters/out')?.body).toEqual({ body: LETTER });
  });

  it('shows how many birds are out, calls one down with its letter, and answers it with the same bird', async () => {
    const answered: VisitorAnswer = { threadId: THREAD, person: baran, letter: { ...visitor.letter, id: 'l10', mine: true, body: 'Silav' } };
    const client = fakeClient({ 'GET /letters': ok(home({ birdsOut: 2, sky: [4, 6] })), 'POST /letters/call': ok({ visitor }), 'POST /letters/visitor': ok(answered) });
    testAuth.client = client;
    phoneWide();
    renderWithProviders(<LettersScreen onExit={() => undefined} />);
    expect(await screen.findByText('2 birds are out there, each carrying a letter from someone your age.')).toBeTruthy();
    fireEvent.click(screen.getByTestId('letters-call'));
    // their bird has come down to the window with its letter, and stands beside yours
    expect(await screen.findByText('Silav! Ez Baran im.')).toBeTruthy();
    expect(await screen.findByText('Baran’s bird is at your window')).toBeTruthy();
    expect(client.calls.find((c) => c.path === '/letters/call')?.body).toEqual({});
    await waitFor(() => expect(screen.getAllByTestId(/^letter-pigeon-(home|asleep)$/)).toHaveLength(2));
    expect(screen.getByTestId('letters-visitor')).toBeTruthy();
    // your own bird stays home while it is here
    expect(screen.queryByTestId('letters-write')).toBeNull();
    expect(screen.queryByTestId('letters-call')).toBeNull();
    // a single word is a letter, and the visiting bird carries it
    fireEvent.change(screen.getByTestId('letters-visitor-answer-input'), { target: { value: 'Silav' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send it home with Baran’s bird' }));
    await waitFor(() => expect(client.calls.find((c) => c.path === '/letters/visitor')?.body).toEqual({ body: 'Silav' }));
    expect(await screen.findByText('You and Baran are pen pals now')).toBeTruthy();
    expect(screen.queryByTestId('letters-visitor')).toBeNull();
    fireEvent.click(screen.getByTestId('letters-pals-open'));
    expect(navigation.navigate).toHaveBeenCalledWith('LetterThread', { threadId: THREAD });
  });

  it('asks once before sending a visiting bird on its way', async () => {
    const client = fakeClient({ 'GET /letters': ok(home({ visitor })), 'DELETE /letters/visitor': ok(null) });
    testAuth.client = client;
    renderWithProviders(<LettersScreen onExit={() => undefined} />);
    fireEvent.click(await screen.findByTestId('letters-visitor-send-on'));
    expect(screen.getByText('Send Baran’s bird on? It flies back out for someone else and won’t come to your window again.')).toBeTruthy();
    fireEvent.click(screen.getByTestId('letters-visitor-keep'));
    expect(client.calls.some((c) => c.method === 'DELETE')).toBe(false);
    fireEvent.click(screen.getByTestId('letters-visitor-send-on'));
    fireEvent.click(screen.getByTestId('letters-visitor-send-on-yes'));
    await waitFor(() => expect(client.calls.some((c) => c.method === 'DELETE' && c.path === '/letters/visitor')).toBe(true));
    // it picks its letter up and flies on, and your own bird may go out again
    await waitFor(() => expect(screen.queryByTestId('letters-visitor')).toBeNull());
    expect(await screen.findByTestId('letters-write')).toBeTruthy();
  });

  it('says when every call of the day is made, and offers no call', async () => {
    testAuth.client = fakeClient({ 'GET /letters': ok(home({ birdsOut: 3, sky: [1, 2, 3], callsLeft: 0 })) });
    renderWithProviders(<LettersScreen onExit={() => undefined} />);
    expect(await screen.findByText('That’s all the birds you can call today. Call again tomorrow.')).toBeTruthy();
    expect(screen.queryByTestId('letters-call')).toBeNull();
  });

  it('shows your bird home with an answer, and the way to read it, and starts afresh once it is read', async () => {
    let homecoming: LettersHome['homecoming'] = { threadId: THREAD, person: baran };
    testAuth.client = fakeClient({ 'GET /letters': () => Promise.resolve(ok(home({ homecoming }))) } as never);
    phoneWide();
    renderWithProviders(<LettersScreen onExit={() => undefined} />);
    expect(await screen.findByText('Your bird came home with a letter from Baran')).toBeTruthy();
    // it has landed and laid the letter on the sill (at once, for a reader who asked for less motion)
    await waitFor(() => expect(screen.getByTestId('letter-on-sill')).toBeTruthy());
    fireEvent.click(screen.getByTestId('letters-home-read'));
    expect(navigation.navigate).toHaveBeenCalledWith('LetterThread', { threadId: THREAD });
    // read there and come back to: the screen is as the server now says, with your bird at home
    homecoming = null;
    act(() => refocus());
    expect(await screen.findByTestId('letters-write')).toBeTruthy();
    expect(screen.queryByText('Your bird came home with a letter from Baran')).toBeNull();
    expect(screen.queryByTestId('letter-on-sill')).toBeNull();
  });

  it('asks for a bird to be chosen first, for free, before the first letter', async () => {
    let chosen: number | null = null;
    const client = fakeClient({
      'GET /letters': () => Promise.resolve(ok(home(chosen === null ? { birdChosen: false, bird: 1 } : { bird: chosen }))),
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
    const client = fakeClient({ 'GET /letters': ok(home({ bird: 1, zer: 120 })) });
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

  it('pays for a new bird once another is picked, and says so when the Zêr fall short', async () => {
    let zer = 900;
    const client = fakeClient({
      'GET /letters': () => Promise.resolve(ok(home({ bird: 1, zer }))),
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
    // another phone spent them meanwhile: the screen reads them again and says what is missing
    expect(await screen.findByText('You need 380 more Zêr.')).toBeTruthy();
  });

  it('refuses a letter with a link before the bird leaves, and sends nothing', async () => {
    const client = fakeClient({ 'GET /letters': ok(home()) });
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
  it('gives the paper to write back on when it is your turn, and sends the letter', async () => {
    const client = fakeClient({
      [`GET /letters/threads/${THREAD}`]: ok(thread()),
      [`POST /letters/threads/${THREAD}`]: ok({ letter: { id: 'l3', mine: true, body: 'Spas Baran! Çi xweş e.', removed: false, sentAt: '2026-11-13T11:00:00.000Z', readAt: null } }),
    });
    testAuth.client = client;
    renderWithProviders(<LetterThreadScreen threadId={THREAD} onExit={() => undefined} />);
    expect(await screen.findByText('Silav Rojda! Ez Baran im, ji Hewlêrê.')).toBeTruthy();
    fireEvent.change(screen.getByTestId('letters-reply-input'), { target: { value: 'Spas Baran! Çi xweş e.' } });
    fireEvent.click(screen.getByTestId('letters-reply-send'));
    // the letter is on the table, and the paper is gone until their answer
    expect(await screen.findByText('Spas Baran! Çi xweş e.')).toBeTruthy();
    expect(await screen.findByTestId('letters-waiting')).toBeTruthy();
    expect(screen.queryByTestId('letters-reply-input')).toBeNull();
  });

  it('says your bird is with them, and offers no paper, when it is their turn', async () => {
    testAuth.client = fakeClient({ [`GET /letters/threads/${THREAD}`]: ok(thread({ yourTurn: false })) });
    renderWithProviders(<LetterThreadScreen threadId={THREAD} onExit={() => undefined} />);
    expect(await screen.findByTestId('letters-waiting')).toBeTruthy();
    expect(screen.getByText('Your bird is with Baran. Their letter will come to your window.')).toBeTruthy();
    expect(screen.queryByTestId('letters-reply-input')).toBeNull();
  });

  it('lets a letter written to you be reported, and not your own', async () => {
    testAuth.client = fakeClient({ [`GET /letters/threads/${THREAD}`]: ok(thread()) });
    renderWithProviders(<LetterThreadScreen threadId={THREAD} onExit={() => undefined} />);
    expect(await screen.findByTestId('letter-report-l2')).toBeTruthy();
    expect(screen.queryByTestId('letter-report-l1')).toBeNull();
  });

  it('is read only once it has ended', async () => {
    testAuth.client = fakeClient({ [`GET /letters/threads/${THREAD}`]: ok(thread({ closed: true, yourTurn: false })) });
    renderWithProviders(<LetterThreadScreen threadId={THREAD} onExit={() => undefined} />);
    expect(await screen.findByTestId('letters-closed')).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId('letters-reply-input')).toBeNull());
  });
});
