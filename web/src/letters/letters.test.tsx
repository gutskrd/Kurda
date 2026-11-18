import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import {
  DEFAULT_PAPER,
  type BirdOutResult,
  type LetterLanding,
  type LetterThread,
  type LetterVisitor,
  type LettersHome,
  type PenPal,
  type VisitorAnswer,
} from '@kurda/shared';
import { renderApp, jsonResponse } from '../test/utils';
import { AuthProvider } from '../auth/AuthProvider';
import { I18nProvider } from '../i18n/I18nProvider';
import { ProfileModalProvider } from '../profile/ProfileModal';
import { RealtimeProvider } from '../realtime/RealtimeProvider';
import type { RealtimeClient } from '../realtime/RealtimeClient';
import { LettersPage } from './LettersPage';
import { LetterThreadPage } from './LetterThreadPage';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
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
const baran = { id: 'baran', name: 'Baran', bird: 4 };
const rojin = { id: 'rojin', name: 'Rojîn', bird: 5 };
const visitor: LetterVisitor = {
  person: baran,
  letter: { id: 'l1', mine: false, body: 'Silav! Ez Baran im.', decor: null, removed: false, sentAt: '2026-11-13T19:00:00.000Z', readAt: null },
  since: '2026-11-14T09:00:00.000Z',
  leavesAt: '2026-11-15T09:00:00.000Z',
};
const letter = 'Silav! Navê min Rojda ye. Tu çawa yî?';
/** A letter sent as it was written: on the paper the composer opened on, nothing drawn, no notes. */
const plain = { paper: DEFAULT_PAPER, strokes: [], notes: [] };

// correspondences and letters as the server names them
const T = '11111111-2222-4333-8444-555555555555';
const T2 = '22222222-3333-4444-8555-666666666666';
const L1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const L2 = 'aaaaaaaa-0000-4000-8000-000000000002';
const L3 = 'aaaaaaaa-0000-4000-8000-000000000003';
/** A letter still to land at the window: Baran's bird with their next letter, unless said otherwise. */
const landing = (over: Partial<LetterLanding> = {}): LetterLanding => ({
  letterId: L1,
  threadId: T,
  person: baran,
  how: 'window',
  landed: false,
  read: false,
  deliveredAt: '2026-11-14T10:00:00.000Z',
  ...over,
});
const pal = (person = baran, threadId = T): PenPal => ({ threadId, person, lastLetterAt: '2026-11-14T10:00:00.000Z', yourTurn: true, unread: 1 });

interface Call {
  method: string;
  url: string;
  body: unknown;
}
/**
 * Signs in with the letters API answering from `answers` (method and path to body), which tests change as the server
 * would, and `fails` answered once each; every request is recorded.
 */
function signIn(answers: Record<string, unknown>, fails: Record<string, { status: number; code: string; details?: unknown }> = {}): Call[] {
  const calls: Call[] = [];
  localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
  const match = (table: Record<string, unknown>, method: string, url: string): string | undefined =>
    Object.keys(table).find((k) => {
      const [m, path] = k.split(' ');
      return m === method && new URL(url, 'http://x').pathname.endsWith(path!);
    });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : null });
      if (url.includes('/me')) return jsonResponse(200, { user: { id: 'me', username: 'ada', displayName: 'Ada', email: 'a@b.com', emailVerified: true } });
      const failed = match(fails, method, url);
      if (failed) {
        const f = fails[failed]!;
        delete fails[failed];
        return jsonResponse(f.status, { code: f.code, message: f.code, details: f.details });
      }
      const key = match(answers, method, url);
      return key ? jsonResponse(200, answers[key]) : jsonResponse(200, {});
    }),
  );
  return calls;
}
const sent = (calls: Call[], method: string, path: string): Call[] => calls.filter((c) => c.method === method && new URL(c.url, 'http://x').pathname.endsWith(path));
const reads = (calls: Call[]): Call[] => calls.filter((c) => c.method === 'GET' && new URL(c.url, 'http://x').pathname.endsWith('/letters'));

/** A stand-in for the realtime connection: the test says when the server pings. */
function fakeRealtime(): { client: RealtimeClient; ping: (type?: string) => void } {
  const listeners: Record<string, Set<(arg: unknown) => void>> = {};
  const client = {
    on(type: string, handler: (arg: unknown) => void) {
      (listeners[type] ??= new Set()).add(handler);
      return () => listeners[type]?.delete(handler);
    },
    connect() {},
    destroy() {},
    join() {},
    leave() {},
    send() {
      return true;
    },
  };
  return {
    client: client as unknown as RealtimeClient,
    ping: (type = 'letters_changed') => listeners['event']?.forEach((h) => h({ room: 'user:me', event: { type } })),
  };
}

/** Where the page is: the address, with its query. */
function Where(): React.JSX.Element {
  const at = useLocation();
  return <output data-testid="where">{`${at.pathname}${at.search}`}</output>;
}

/** The letters page at `path`, a correspondence standing in for the thread page, and the realtime connection. */
function atWindow(path = '/app/letters'): { ping: (type?: string) => void } {
  const live = fakeRealtime();
  render(
    <AuthProvider>
      <I18nProvider>
        <MemoryRouter initialEntries={[path]}>
          <RealtimeProvider client={live.client}>
            <ProfileModalProvider>
              <Routes>
                <Route
                  path="/app/letters"
                  element={
                    <>
                      <LettersPage />
                      <Where />
                    </>
                  }
                />
                <Route path="/app/letters/:threadId" element={<Where />} />
              </Routes>
            </ProfileModalProvider>
          </RealtimeProvider>
        </MemoryRouter>
      </I18nProvider>
    </AuthProvider>,
  );
  return live;
}

describe('letters by bird', () => {
  it('offers one thing to do with your bird at home: write a letter', async () => {
    signIn({ 'GET /letters': home() });
    renderApp(<LettersPage />, ['/app/letters']);
    expect(await screen.findByRole('button', { name: 'Write a letter' })).toBeInTheDocument();
    expect(screen.getByText('No pen pals yet. Call a bird to your window, or send yours out, and someone will write back.')).toBeInTheDocument();
  });

  it('asks for the page with every letter still to land', async () => {
    const calls = signIn({ 'GET /letters': home() });
    renderApp(<LettersPage />, ['/app/letters']);
    await screen.findByRole('button', { name: 'Write a letter' });
    expect(reads(calls)[0]!.url).toContain('/letters?landings=1');
  });

  it('says in plain words that nobody else has a bird out, when yours flies off to wait', async () => {
    const waiting: BirdOutResult = { kind: 'waiting', since: '2026-11-13T20:00:00.000Z' };
    const answers: Record<string, unknown> = { 'GET /letters': home(), 'POST /letters/out': waiting };
    const calls = signIn(answers);
    renderApp(<LettersPage />, ['/app/letters']);
    await userEvent.click(await screen.findByRole('button', { name: 'Write a letter' }));
    await userEvent.type(screen.getByLabelText('Your letter'), letter);
    answers['GET /letters'] = home({ out: { since: waiting.since, visiting: false }, flight: 'sky' });
    await userEvent.click(screen.getByRole('button', { name: 'Send your bird' }));
    expect(sent(calls, 'POST', '/letters/out')[0]?.body).toEqual({ body: letter, decor: plain });
    // the flight ends at once in a page that cannot animate, and the sill is empty
    expect(await screen.findByText('Your bird is out')).toBeInTheDocument();
    expect(document.querySelector('.lw-bird')).toBeNull();
  });

  it('shows how many birds are out, calls one down with its letter, and answers it with the same bird', async () => {
    // by day: at night the learner's own bird sleeps on the sill instead of playing beside the visitor
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 5, 15, 12, 0));
    const answered: VisitorAnswer = { threadId: T, person: baran, letter: { ...visitor.letter, id: 'l2', mine: true, body: 'Silav' } };
    const answers: Record<string, unknown> = { 'GET /letters': home({ birdsOut: 2, sky: [4, 6] }), 'POST /letters/call': { visitor }, 'POST /letters/visitor': answered };
    const calls = signIn(answers);
    renderApp(<LettersPage />, ['/app/letters']);
    expect(await screen.findByText('2 birds are out there, each carrying a letter from someone your age.')).toBeInTheDocument();
    answers['GET /letters'] = home({ birdsOut: 1, sky: [6], visitor });
    await userEvent.click(screen.getByRole('button', { name: 'Call a bird' }));
    // their bird has come down to the window with its letter, beside yours
    expect(await screen.findByText('Silav! Ez Baran im.')).toBeInTheDocument();
    expect(await screen.findByText('Baran’s bird is at your window')).toBeInTheDocument();
    await waitFor(() => expect(document.querySelectorAll('.lw-play').length).toBe(2));
    // your own bird stays home while it is here
    expect(screen.queryByRole('button', { name: 'Write a letter' })).toBeNull();
    // a single word is a letter
    await userEvent.type(screen.getByLabelText('Your answer to Baran'), 'Silav');
    answers['GET /letters'] = home({ birdsOut: 1, sky: [6], penPals: [{ ...pal(), yourTurn: false, unread: 0 }] });
    await userEvent.click(screen.getByRole('button', { name: 'Send it home with Baran’s bird' }));
    expect(sent(calls, 'POST', '/letters/visitor')[0]?.body).toEqual({ body: 'Silav', decor: plain });
    expect(await screen.findByText('You and Baran are pen pals now')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open your letters with Baran' })).toHaveAttribute('href', `/app/letters/${T}`);
  });

  it('asks once before sending a visiting bird on its way', async () => {
    const calls = signIn({ 'GET /letters': home({ visitor }) });
    renderApp(<LettersPage />, ['/app/letters']);
    await userEvent.click(await screen.findByRole('button', { name: 'Send it on its way' }));
    expect(screen.getByText('Send Baran’s bird on? It flies back out for someone else and won’t come to your window again.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Keep it here' }));
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Send it on its way' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, send it on' }));
    expect(calls.some((c) => c.method === 'DELETE' && c.url.includes('/letters/visitor'))).toBe(true);
  });

  it('says when every call of the day is made, and when no bird is out', async () => {
    signIn({ 'GET /letters': home({ birdsOut: 3, sky: [1, 2, 3], callsLeft: 0 }) });
    renderApp(<LettersPage />, ['/app/letters']);
    expect(await screen.findByText('That’s all the birds you can call today. Call again tomorrow.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Call a bird' })).toBeNull();
  });

  it('shows your bird home with an answer, and the way to read it', async () => {
    signIn({ 'GET /letters': home({ homecoming: { threadId: 't9', person: baran } }) });
    renderApp(<LettersPage />, ['/app/letters']);
    expect(await screen.findByText('Your bird came home with a letter from Baran')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Read it' })).toHaveAttribute('href', '/app/letters/t9');
    // it has landed and laid the letter on the sill (at once, in a page that cannot animate)
    await waitFor(() => expect(document.querySelector('.lw-sill-letter')).not.toBeNull());
  });

  it('brings a pen pal’s next letter to the window by their own bird, and the way to read it', async () => {
    signIn({ 'GET /letters': home({ arrival: { threadId: 't9', person: baran } }) });
    renderApp(<LettersPage />, ['/app/letters']);
    expect(await screen.findByText('Baran’s bird brought you a letter')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Read it' })).toHaveAttribute('href', '/app/letters/t9');
    // their bird has landed beside yours and laid the letter on the sill
    await waitFor(() => expect(document.querySelector('.lw-sill-letter')).not.toBeNull());
    expect(screen.queryByText('Your bird came home with a letter from Baran')).toBeNull();
  });

  it('lets your own bird home with an answer come before a pen pal’s bird', async () => {
    signIn({ 'GET /letters': home({ homecoming: { threadId: 't9', person: baran }, arrival: { threadId: 't8', person: rojin } }) });
    renderApp(<LettersPage />, ['/app/letters']);
    expect(await screen.findByText('Your bird came home with a letter from Baran')).toBeInTheDocument();
    expect(screen.queryByText('Rojîn’s bird brought you a letter')).toBeNull();
  });

  it('refuses a letter with a link before the bird leaves, and says what to take out', async () => {
    const calls = signIn({ 'GET /letters': home() });
    renderApp(<LettersPage />, ['/app/letters']);
    await userEvent.click(await screen.findByRole('button', { name: 'Write a letter' }));
    await userEvent.type(screen.getByLabelText('Your letter'), `${letter} www.example.org`);
    expect(screen.getByText('Take out the link: letters can’t carry links.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Send your bird' }));
    expect(calls.some((c) => c.method === 'POST' && c.url.includes('/letters'))).toBe(false);
  });

  it('asks for a bird to be chosen first, for free, and shows the one picked on the sill', async () => {
    const answers: Record<string, unknown> = { 'GET /letters': home({ birdChosen: false, bird: 2 }), 'POST /letters/bird': home({ bird: 5 }) };
    const calls = signIn(answers);
    renderApp(<LettersPage />, ['/app/letters']);
    expect(await screen.findByText('Choose your bird')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Write a letter' })).toBeNull();
    expect(screen.getByRole('radio', { name: 'Pink bird' })).toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: 'Teal bird' }));
    answers['GET /letters'] = home({ bird: 5 });
    await userEvent.click(screen.getByRole('button', { name: 'This is my bird' }));
    expect(calls.find((c) => c.method === 'POST' && c.url.includes('/letters/bird'))?.body).toEqual({ bird: 5 });
    expect(await screen.findByRole('button', { name: 'Write a letter' })).toBeInTheDocument();
  });

  it('asks Zêr for a new bird, says how many are missing, and lets the bird stay as it is', async () => {
    const calls = signIn({ 'GET /letters': home({ bird: 2, zer: 120 }) });
    renderApp(<LettersPage />, ['/app/letters']);
    await userEvent.click(await screen.findByRole('button', { name: 'Change bird' }));
    expect(screen.getByText('A new bird costs 500 Zêr. You have 120 Zêr.')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Pink bird, your bird now' })).toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: 'Green bird' }));
    expect(screen.getByText('You need 380 more Zêr.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Get this bird · 500 Zêr' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Keep my bird' }));
    expect(await screen.findByRole('button', { name: 'Write a letter' })).toBeInTheDocument();
    expect(calls.some((c) => c.url.includes('/letters/bird'))).toBe(false);
  });

  it('opens the bird picker from the paper too, closing the paper', async () => {
    signIn({ 'GET /letters': home({ bird: 2, zer: 900 }) });
    renderApp(<LettersPage />, ['/app/letters']);
    await userEvent.click(await screen.findByRole('button', { name: 'Write a letter' }));
    expect(screen.getByLabelText('Your letter')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Change bird' }));
    expect(screen.getByText('Choose a new bird')).toBeInTheDocument();
    expect(screen.queryByLabelText('Your letter')).toBeNull();
  });

  it('pays for a new bird only once another is picked', async () => {
    const calls = signIn({ 'GET /letters': home({ bird: 2, zer: 900 }), 'POST /letters/bird': home({ bird: 3, zer: 400 }) });
    renderApp(<LettersPage />, ['/app/letters']);
    await userEvent.click(await screen.findByRole('button', { name: 'Change bird' }));
    const buy = screen.getByRole('button', { name: 'Get this bird · 500 Zêr' });
    expect(buy).toBeDisabled();
    await userEvent.click(screen.getByRole('radio', { name: 'Green bird' }));
    await userEvent.click(buy);
    expect(calls.find((c) => c.method === 'POST' && c.url.includes('/letters/bird'))?.body).toEqual({ bird: 3 });
  });

  it('says in plain words why a new bird cannot be had while yours is out, and reads the page again', async () => {
    const answers: Record<string, unknown> = { 'GET /letters': home({ bird: 2, zer: 900 }) };
    const calls = signIn(answers, { 'POST /letters/bird': { status: 409, code: 'BIRD_OUT' } });
    renderApp(<LettersPage />, ['/app/letters']);
    await userEvent.click(await screen.findByRole('button', { name: 'Change bird' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Green bird' }));
    const before = reads(calls).length;
    await userEvent.click(screen.getByRole('button', { name: 'Get this bird · 500 Zêr' }));
    expect(await screen.findByText('Your bird is already out with a letter.')).toBeInTheDocument();
    await waitFor(() => expect(reads(calls).length).toBeGreaterThan(before));
  });

  it('asks for a birth month before anybody can write', async () => {
    signIn({ 'GET /letters': home({ refusal: 'birth_month' }) });
    renderApp(<LettersPage />, ['/app/letters']);
    expect(await screen.findByRole('link', { name: 'Add your birth month' })).toHaveAttribute('href', '/app/settings');
    expect(screen.queryByRole('button', { name: 'Write a letter' })).toBeNull();
  });

  describe('every letter lands at the window once', () => {
    it('lands the bird a notification names, says so to the server once, and then offers the letter', async () => {
      const calls = signIn({ 'GET /letters': home({ landings: [landing()], penPals: [pal()] }) });
      atWindow(`/app/letters?bird=${T}`);
      expect(await screen.findByText('Baran’s bird brought you a letter')).toBeInTheDocument();
      await waitFor(() => expect(sent(calls, 'POST', '/letters/landed').map((c) => c.body)).toEqual([{ letterIds: [L1] }]));
      // the address loses the bird once it has landed, so a reload does not ask again
      await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/app\/letters$/));
      expect(screen.getByRole('link', { name: 'Read it' })).toHaveAttribute('href', `/app/letters/${T}`);
      expect(sent(calls, 'POST', '/letters/landed')).toHaveLength(1);
    });

    it('opens the correspondence instead when a notification’s bird has nothing left to land', async () => {
      signIn({ 'GET /letters': home({ landings: [], penPals: [pal()] }) });
      atWindow(`/app/letters?bird=${T}`);
      await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(`/app/letters/${T}`));
    });

    it('opens the correspondence when the sill is taken by a bird you called, and keeps that letter to land later', async () => {
      const calls = signIn({ 'GET /letters': home({ visitor: { ...visitor, person: rojin }, landings: [landing()], penPals: [pal()] }) });
      atWindow(`/app/letters?bird=${T}`);
      await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(`/app/letters/${T}`));
      expect(sent(calls, 'POST', '/letters/landed')).toHaveLength(0);
    });

    it('never follows a notification’s bird that is not a correspondence’s id', async () => {
      signIn({ 'GET /letters': home() });
      atWindow('/app/letters?bird=../../me');
      expect(await screen.findByRole('button', { name: 'Write a letter' })).toBeInTheDocument();
      await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/app\/letters$/));
    });

    it('lands a bird that comes while the window is open, when the server says something changed', async () => {
      const answers: Record<string, unknown> = { 'GET /letters': home() };
      const calls = signIn(answers);
      const live = atWindow();
      await screen.findByRole('button', { name: 'Write a letter' });
      await waitFor(() => expect(reads(calls).length).toBeGreaterThanOrEqual(1));
      const before = reads(calls).length;
      answers['GET /letters'] = home({ landings: [landing()], penPals: [pal()] });
      act(() => live.ping());
      expect(await screen.findByText('Baran’s bird brought you a letter')).toBeInTheDocument();
      expect(reads(calls)).toHaveLength(before + 1);
      await waitFor(() => expect(sent(calls, 'POST', '/letters/landed')).toHaveLength(1));
    });

    it('reads the page again when the tab is shown, and lands what came meanwhile', async () => {
      const answers: Record<string, unknown> = { 'GET /letters': home() };
      signIn(answers);
      renderApp(<LettersPage />, ['/app/letters']);
      await screen.findByRole('button', { name: 'Write a letter' });
      answers['GET /letters'] = home({ landings: [landing()], penPals: [pal()] });
      const later = Date.now() + 10_000;
      vi.spyOn(Date, 'now').mockReturnValue(later);
      act(() => void document.dispatchEvent(new Event('visibilitychange')));
      expect(await screen.findByText('Baran’s bird brought you a letter')).toBeInTheDocument();
    });

    it('keeps the letter being written when a bird comes, and lands the bird once the paper is put away', async () => {
      const answers: Record<string, unknown> = { 'GET /letters': home() };
      signIn(answers);
      const live = atWindow();
      await userEvent.click(await screen.findByRole('button', { name: 'Write a letter' }));
      await userEvent.type(screen.getByLabelText('Your letter'), letter);
      answers['GET /letters'] = home({ landings: [landing()], penPals: [pal()] });
      act(() => live.ping());
      // the paper stays as it is while the bird waits
      await waitFor(() => expect(screen.getByLabelText('Your letter')).toHaveValue(letter));
      expect(screen.queryByText('Baran’s bird brought you a letter')).toBeNull();
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(await screen.findByText('Baran’s bird brought you a letter')).toBeInTheDocument();
    });

    it('lands a pen pal’s bird that waited behind a bird you called, once that bird is sent on', async () => {
      const answers: Record<string, unknown> = { 'GET /letters': home({ visitor: { ...visitor, person: rojin }, landings: [landing()], penPals: [pal()] }) };
      signIn(answers);
      renderApp(<LettersPage />, ['/app/letters']);
      expect(await screen.findByText('Rojîn’s bird is at your window')).toBeInTheDocument();
      // the quiet line says another bird is waiting its turn
      expect(screen.getByText('Another bird is waiting to come in.')).toBeInTheDocument();
      answers['GET /letters'] = home({ landings: [landing()], penPals: [pal()] });
      await userEvent.click(screen.getByRole('button', { name: 'Send it on its way' }));
      await userEvent.click(screen.getByRole('button', { name: 'Yes, send it on' }));
      expect(await screen.findByText('Baran’s bird brought you a letter')).toBeInTheDocument();
    });

    it('shows the bird already at the window when a call is refused for it, and calls no second time', async () => {
      const answers: Record<string, unknown> = { 'GET /letters': home({ birdsOut: 2, sky: [4, 6] }) };
      const calls = signIn(answers, { 'POST /letters/call': { status: 409, code: 'VISITOR_HERE' } });
      renderApp(<LettersPage />, ['/app/letters']);
      answers['GET /letters'] = home({ birdsOut: 1, sky: [6], visitor });
      await userEvent.click(await screen.findByRole('button', { name: 'Call a bird' }));
      expect(await screen.findByText('Silav! Ez Baran im.')).toBeInTheDocument();
      expect(screen.getByLabelText('Your answer to Baran')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Call a bird' })).toBeNull();
      expect(sent(calls, 'POST', '/letters/call')).toHaveLength(1);
    });

    it('shows your bird out when sending is refused because it already is, with the way to call it back', async () => {
      const answers: Record<string, unknown> = { 'GET /letters': home() };
      signIn(answers, { 'POST /letters/out': { status: 409, code: 'BIRD_OUT' } });
      renderApp(<LettersPage />, ['/app/letters']);
      await userEvent.click(await screen.findByRole('button', { name: 'Write a letter' }));
      await userEvent.type(screen.getByLabelText('Your letter'), letter);
      answers['GET /letters'] = home({ out: { since: '2026-11-14T08:00:00.000Z', visiting: false }, flight: 'sky' });
      await userEvent.click(screen.getByRole('button', { name: 'Send your bird' }));
      expect(await screen.findByText('Your bird is out')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Call your bird back' })).toBeInTheDocument();
    });

    it('lands the answer your bird brought when calling it back finds it answered', async () => {
      const answers: Record<string, unknown> = { 'GET /letters': home({ out: { since: '2026-11-14T08:00:00.000Z', visiting: true }, flight: 'window' }) };
      signIn(answers, { 'DELETE /letters/out': { status: 404, code: 'BIRD_ANSWERED', details: { threadId: T } } });
      renderApp(<LettersPage />, ['/app/letters']);
      expect(await screen.findByText('Someone has called your bird to their window and is reading your letter right now.')).toBeInTheDocument();
      answers['GET /letters'] = home({ landings: [landing({ how: 'home' })], penPals: [pal()], flight: 'homeward' });
      await userEvent.click(screen.getByRole('button', { name: 'Call your bird back' }));
      expect(await screen.findByText('Your bird came home with a letter from Baran')).toBeInTheDocument();
    });

    it('brings your bird home with its answer while the window is open, and says it landed', async () => {
      const answers: Record<string, unknown> = { 'GET /letters': home({ out: { since: '2026-11-14T08:00:00.000Z', visiting: true }, flight: 'window' }) };
      const calls = signIn(answers);
      const live = atWindow();
      expect(await screen.findByText('Your bird is out')).toBeInTheDocument();
      answers['GET /letters'] = home({ landings: [landing({ how: 'home', letterId: L2 })], penPals: [pal()], flight: 'homeward' });
      act(() => live.ping());
      expect(await screen.findByText('Your bird came home with a letter from Baran')).toBeInTheDocument();
      await waitFor(() => expect(sent(calls, 'POST', '/letters/landed').map((c) => c.body)).toEqual([{ letterIds: [L2] }]));
    });

    it('shows a letter that landed before already on the sill, and says nothing more of it', async () => {
      const calls = signIn({ 'GET /letters': home({ landings: [landing({ landed: true })], penPals: [pal()] }) });
      renderApp(<LettersPage />, ['/app/letters']);
      expect(await screen.findByText('Baran’s bird brought you a letter')).toBeInTheDocument();
      await waitFor(() => expect(document.querySelector('.lw-sill-letter')).not.toBeNull());
      expect(sent(calls, 'POST', '/letters/landed')).toHaveLength(0);
    });

    it('says the answer your bird brought home beside a bird you called, and again once that bird has taken your answer', async () => {
      const home1 = landing({ how: 'home', person: rojin, threadId: T2, letterId: L2 });
      const answered: VisitorAnswer = { threadId: T, person: baran, letter: { ...visitor.letter, id: L3, mine: true, body: 'Silav' } };
      const answers: Record<string, unknown> = { 'GET /letters': home({ visitor, landings: [home1], penPals: [pal(rojin, T2)] }), 'POST /letters/visitor': answered };
      const calls = signIn(answers);
      renderApp(<LettersPage />, ['/app/letters']);
      expect(await screen.findByText('Baran’s bird is at your window')).toBeInTheDocument();
      // under the visitor's words: your own bird home with Rojîn's answer, and the way to read it
      expect(await screen.findByText('Your bird came home with a letter from Rojîn')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Read it' })).toHaveAttribute('href', `/app/letters/${T2}`);
      await waitFor(() => expect(sent(calls, 'POST', '/letters/landed').map((c) => c.body)).toEqual([{ letterIds: [L2] }]));
      await userEvent.type(screen.getByLabelText('Your answer to Baran'), 'Silav');
      answers['GET /letters'] = home({ landings: [{ ...home1, landed: true }], penPals: [pal(rojin, T2), { ...pal(), yourTurn: false, unread: 0 }] });
      await userEvent.click(screen.getByRole('button', { name: 'Send it home with Baran’s bird' }));
      // once Baran's bird has flown off with the answer, the window says what is on its sill: the letter still to read
      await waitFor(() => expect(screen.queryByLabelText('Your answer to Baran')).toBeNull());
      await waitFor(() => expect(screen.queryByText('Baran’s bird is taking your letter home.')).toBeNull());
      expect(screen.getByText('Your bird came home with a letter from Rojîn')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Read it' })).toHaveAttribute('href', `/app/letters/${T2}`);
      expect(sent(calls, 'POST', '/letters/landed')).toHaveLength(1);
    });

    it('keeps an answer being written when its bird flies on by itself, and says where it is', async () => {
      const answers: Record<string, unknown> = { 'GET /letters': home({ visitor }) };
      signIn(answers);
      const live = atWindow();
      await userEvent.type(await screen.findByLabelText('Your answer to Baran'), 'Silav Baran, ez Rojda me.');
      // its day is up: the server has it at the window no more
      answers['GET /letters'] = home();
      act(() => live.ping());
      expect(await screen.findByText('Your answer is kept. You can send it with your own bird.')).toBeInTheDocument();
      expect(screen.queryByLabelText('Your answer to Baran')).toBeNull();
      await userEvent.click(screen.getByRole('button', { name: 'Write a letter' }));
      expect(screen.getByLabelText('Your letter')).toHaveValue('Silav Baran, ez Rojda me.');
    });

    it('acts out one letter at a time, says another is waiting, and lands it once the first is read', async () => {
      const answers: Record<string, unknown> = {
        'GET /letters': home({ landings: [landing(), landing({ letterId: L2, threadId: T2, person: rojin, deliveredAt: '2026-11-14T11:00:00.000Z' })], penPals: [pal(), pal(rojin, T2)] }),
      };
      const calls = signIn(answers);
      const live = atWindow();
      expect(await screen.findByText('Baran’s bird brought you a letter')).toBeInTheDocument();
      expect(screen.getByText('Another bird is waiting to come in.')).toBeInTheDocument();
      // Baran's letter read in its correspondence (on another device, say): it leaves the sill and Rojîn's bird comes in
      answers['GET /letters'] = home({ landings: [landing({ letterId: L2, threadId: T2, person: rojin })], penPals: [pal(), pal(rojin, T2)] });
      act(() => live.ping());
      expect(await screen.findByText('Rojîn’s bird brought you a letter')).toBeInTheDocument();
      expect(screen.queryByText('Another bird is waiting to come in.')).toBeNull();
      await waitFor(() => expect(sent(calls, 'POST', '/letters/landed').map((c) => c.body)).toEqual([{ letterIds: [L1] }, { letterIds: [L2] }]));
    });

    it('says the letter landed when it is read before its bird is down', async () => {
      const calls = signIn({ 'GET /letters': home({ landings: [landing()], penPals: [pal()] }) });
      renderApp(<LettersPage />, ['/app/letters']);
      await userEvent.click(await screen.findByRole('link', { name: 'Read it' }));
      await waitFor(() => expect(sent(calls, 'POST', '/letters/landed').length).toBeGreaterThanOrEqual(1));
      for (const c of sent(calls, 'POST', '/letters/landed')) expect(c.body).toEqual({ letterIds: [L1] });
    });
  });

  describe('where your bird is', () => {
    it('says your bird is out waiting to be called, or at somebody’s window', async () => {
      signIn({ 'GET /letters': home({ out: { since: '2026-11-14T08:00:00.000Z', visiting: false }, flight: 'sky' }) });
      renderApp(<LettersPage />, ['/app/letters']);
      expect(await screen.findByText('It’s waiting out there with your letter until someone calls it to their window. If nobody does in 14 days, it flies home.')).toBeInTheDocument();
    });

    it('brings your bird home when nobody called it, says why, and says it landed', async () => {
      const calls = signIn({ 'GET /letters': home({ returned: { letterId: L3, since: '2026-11-14T08:00:00.000Z', why: 'unanswered' }, flight: 'homeward', landings: [] }) });
      renderApp(<LettersPage />, ['/app/letters']);
      expect(await screen.findByText('Your bird came back with your letter')).toBeInTheDocument();
      expect(screen.getByText('Nobody called it in 14 days. Send it out again whenever you like.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Write a letter' })).toBeInTheDocument();
      await waitFor(() => expect(sent(calls, 'POST', '/letters/landed').map((c) => c.body)).toEqual([{ letterIds: [L3] }]));
    });

    it('says why your bird came home when your pen pal places filled', async () => {
      signIn({ 'GET /letters': home({ returned: { letterId: L3, since: '2026-11-14T08:00:00.000Z', why: 'full' }, landings: [], roomForMore: false }) });
      renderApp(<LettersPage />, ['/app/letters']);
      expect(await screen.findByText('It came home because you’re now writing to 5 pen pals.')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Write a letter' })).toBeNull();
    });
  });

  describe('a letter being written is never lost', () => {
    it('opens the paper again on what was written, and lets it go once the bird has flown', async () => {
      const answers: Record<string, unknown> = { 'GET /letters': home(), 'POST /letters/out': { kind: 'waiting', since: '2026-11-14T08:00:00.000Z' } };
      signIn(answers);
      renderApp(<LettersPage />, ['/app/letters']);
      await userEvent.click(await screen.findByRole('button', { name: 'Write a letter' }));
      await userEvent.type(screen.getByLabelText('Your letter'), letter);
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      await userEvent.click(screen.getByRole('button', { name: 'Write a letter' }));
      expect(screen.getByLabelText('Your letter')).toHaveValue(letter);
      answers['GET /letters'] = home({ out: { since: '2026-11-14T08:00:00.000Z', visiting: false }, flight: 'sky' });
      await userEvent.click(screen.getByRole('button', { name: 'Send your bird' }));
      expect(await screen.findByText('Your bird is out')).toBeInTheDocument();
      expect(localStorage.getItem('hevalo_letter_drafts')).toBeNull();
    });

    it('keeps an answer whose bird flew on before it reached it, to send with your own bird', async () => {
      const answers: Record<string, unknown> = { 'GET /letters': home({ visitor }) };
      signIn(answers, { 'POST /letters/visitor': { status: 409, code: 'NO_VISITOR' } });
      renderApp(<LettersPage />, ['/app/letters']);
      await userEvent.type(await screen.findByLabelText('Your answer to Baran'), 'Silav Baran, ez Rojda me.');
      answers['GET /letters'] = home();
      await userEvent.click(screen.getByRole('button', { name: 'Send it home with Baran’s bird' }));
      expect(await screen.findByText('This bird has already flown on. Call another, or send yours out.')).toBeInTheDocument();
      expect(screen.getByText('Your answer is kept. You can send it with your own bird.')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Write a letter' }));
      expect(screen.getByLabelText('Your letter')).toHaveValue('Silav Baran, ez Rojda me.');
    });

    it('keeps an answer begun to a bird whose day ran out while the page was closed, for your own bird', async () => {
      localStorage.setItem('hevalo_letter_drafts', JSON.stringify({ who: 'me', drafts: { 'visitor:old1': { body: 'Silav, ez Rojda me.', paper: DEFAULT_PAPER, strokes: [], notes: [], at: Date.now() } } }));
      signIn({ 'GET /letters': home() });
      renderApp(<LettersPage />, ['/app/letters']);
      expect(await screen.findByText('Your answer is kept. You can send it with your own bird.')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Write a letter' }));
      expect(screen.getByLabelText('Your letter')).toHaveValue('Silav, ez Rojda me.');
    });

    it('keeps nothing of one account for another', async () => {
      localStorage.setItem('hevalo_letter_drafts', JSON.stringify({ who: 'somebody-else', drafts: { new: { body: 'Not yours', paper: DEFAULT_PAPER, strokes: [], notes: [], at: Date.now() } } }));
      signIn({ 'GET /letters': home() });
      renderApp(<LettersPage />, ['/app/letters']);
      await userEvent.click(await screen.findByRole('button', { name: 'Write a letter' }));
      expect(screen.getByLabelText('Your letter')).toHaveValue('');
    });
  });

  describe('a correspondence', () => {
    const thread = (over: Partial<LetterThread> = {}): LetterThread => ({
      threadId: 't1',
      person: { id: 'baran', name: 'Baran', bird: 4 },
      letters: [
        { id: 'l1', mine: true, body: letter, decor: null, removed: false, sentAt: '2026-11-13T19:00:00.000Z', readAt: null },
        { id: 'l2', mine: false, body: 'Silav Rojda! Ez Baran im.', decor: null, removed: false, sentAt: '2026-11-13T19:00:00.000Z', readAt: null },
      ],
      yourTurn: true,
      closed: false,
      ...over,
    });
    const at = (body: LetterThread): { answers: Record<string, unknown>; calls: Call[]; ping: () => void } => {
      const answers: Record<string, unknown> = { 'GET /letters/threads/t1': body };
      const calls = signIn(answers);
      const live = fakeRealtime();
      renderApp(
        <RealtimeProvider client={live.client}>
          <Routes>
            <Route path="/app/letters/:threadId" element={<LetterThreadPage />} />
          </Routes>
        </RealtimeProvider>,
        ['/app/letters/t1'],
      );
      return { answers, calls, ping: () => live.ping() };
    };

    it('gives the paper to write back on when it is your turn, and a way to report their letter', async () => {
      at(thread());
      expect(await screen.findByLabelText('Write back to Baran')).toBeInTheDocument();
      // their letter can be reported; yours cannot
      expect(screen.getAllByRole('button', { name: 'Report letter' })).toHaveLength(1);
    });

    it('says your bird is with them while it is theirs to answer', async () => {
      at(thread({ yourTurn: false }));
      expect(await screen.findByText('Your letter is with Baran. When they write back, their bird will bring it to your window.')).toBeInTheDocument();
      expect(screen.queryByLabelText('Write back to Baran')).toBeNull();
    });

    it('is read only once it has ended', async () => {
      at(thread({ yourTurn: false, closed: true }));
      expect(await screen.findByText('These letters have ended. Neither of you can write here again.')).toBeInTheDocument();
      await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
    });

    it('keeps the letters and the paper when a read after a ping fails', async () => {
      const open = at(thread());
      await userEvent.type(await screen.findByLabelText('Write back to Baran'), 'Ez baş im');
      vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(503, { code: 'UNAVAILABLE', message: 'down' })));
      act(() => open.ping());
      await new Promise((r) => setTimeout(r, 50));
      expect(screen.getByText('Silav Rojda! Ez Baran im.')).toBeInTheDocument();
      expect(screen.getByLabelText('Write back to Baran')).toHaveValue('Ez baş im');
    });

    it('opens on the newest letters, shows the earlier ones when asked, and keeps them when the letters are read again', async () => {
      const page = (from: number, to: number) =>
        Array.from({ length: to - from + 1 }, (_, i) => ({ id: `n${from + i}`, mine: (from + i) % 2 === 0, body: `Name ${from + i}`, decor: null, removed: false, sentAt: '2026-11-13T19:00:00.000Z', readAt: null }));
      const open = at(thread({ letters: page(11, 20), earlier: true, yourTurn: false }));
      expect(await screen.findByText('Name 20')).toBeInTheDocument();
      expect(screen.queryByText('Name 10')).toBeNull();
      const newest = sent(open.calls, 'GET', '/letters/threads/t1').at(-1)!;
      expect(new URL(newest.url, 'http://x').search).toBe('?limit=10');

      open.answers['GET /letters/threads/t1'] = thread({ letters: page(1, 10), earlier: false, yourTurn: false });
      await userEvent.click(screen.getByRole('button', { name: 'Show earlier letters' }));
      expect(await screen.findByText('Name 1')).toBeInTheDocument();
      expect(new URL(sent(open.calls, 'GET', '/letters/threads/t1').at(-1)!.url, 'http://x').search).toBe('?before=n11&limit=10');
      expect(screen.queryByRole('button', { name: 'Show earlier letters' })).toBeNull();

      // their answer comes: the newest page moves on by one, and the earlier letters stay above it
      open.answers['GET /letters/threads/t1'] = thread({ letters: page(12, 21), earlier: true, yourTurn: true });
      act(() => open.ping());
      expect(await screen.findByText('Name 21')).toBeInTheDocument();
      expect(screen.getAllByText(/^Name \d+$/).map((el) => el.textContent)).toEqual(page(1, 21).map((l) => l.body));
      expect(screen.queryByRole('button', { name: 'Show earlier letters' })).toBeNull();
    });

    it('reads the correspondence again when a reply is refused because it is not your turn any more', async () => {
      const open = at(thread());
      open.answers['POST /letters/threads/t1'] = {};
      await userEvent.type(await screen.findByLabelText('Write back to Baran'), 'Ez baş im');
      const before = sent(open.calls, 'GET', '/letters/threads/t1').length;
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string, init?: RequestInit) =>
          init?.method === 'POST' ? jsonResponse(409, { code: 'NOT_YOUR_TURN', message: 'not your turn' }) : (open.calls.push({ method: 'GET', url, body: null }), jsonResponse(200, thread({ yourTurn: false }))),
        ),
      );
      await userEvent.click(screen.getByRole('button', { name: /Send/ }));
      expect(await screen.findByText('Your letter is with Baran. When they write back, their bird will bring it to your window.')).toBeInTheDocument();
      expect(sent(open.calls, 'GET', '/letters/threads/t1').length).toBeGreaterThan(before);
    });

    it('starts each correspondence on its own page, so nothing written to one goes to another', async () => {
      const answers: Record<string, unknown> = {
        'GET /letters/threads/t1': thread(),
        'GET /letters/threads/t2': thread({ threadId: 't2', person: { id: 'rojin', name: 'Rojîn', bird: 5 } }),
      };
      signIn(answers);
      function Go(): React.JSX.Element {
        const navigate = useNavigate();
        return (
          <button type="button" onClick={() => navigate('/app/letters/t2')}>
            to t2
          </button>
        );
      }
      renderApp(
        <RealtimeProvider client={fakeRealtime().client}>
          <Routes>
            <Route
              path="/app/letters/:threadId"
              element={
                <>
                  <LetterThreadPage />
                  <Go />
                </>
              }
            />
          </Routes>
        </RealtimeProvider>,
        ['/app/letters/t1'],
      );
      await userEvent.type(await screen.findByLabelText('Write back to Baran'), 'Taybet ji bo Baran');
      await userEvent.click(screen.getByRole('button', { name: 'to t2' }));
      expect(await screen.findByLabelText('Write back to Rojîn')).toHaveValue('');
    });

    it('shows their next letter while it is open, and gives the paper back', async () => {
      const open = at(thread({ yourTurn: false }));
      expect(await screen.findByText('Your letter is with Baran. When they write back, their bird will bring it to your window.')).toBeInTheDocument();
      const base = thread();
      open.answers['GET /letters/threads/t1'] = thread({
        letters: [...base.letters, { id: 'l3', mine: false, body: 'Ez jî baş im!', decor: null, removed: false, sentAt: '2026-11-14T10:00:00.000Z', readAt: null }],
      });
      act(() => open.ping());
      expect(await screen.findByText('Ez jî baş im!')).toBeInTheDocument();
      expect(screen.getByLabelText('Write back to Baran')).toBeInTheDocument();
    });
  });
});
