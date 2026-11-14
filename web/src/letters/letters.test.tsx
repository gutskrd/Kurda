import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import type { BirdOutResult, LetterThread, LetterVisitor, LettersHome, VisitorAnswer } from '@kurda/shared';
import { renderApp, jsonResponse } from '../test/utils';
import { LettersPage } from './LettersPage';
import { LetterThreadPage } from './LetterThreadPage';

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
  penPals: [],
  roomForMore: true,
  ...over,
});
const baran = { id: 'baran', name: 'Baran', bird: 4 };
const visitor: LetterVisitor = {
  person: baran,
  letter: { id: 'l1', mine: false, body: 'Silav! Ez Baran im.', removed: false, sentAt: '2026-11-13T19:00:00.000Z', readAt: null },
  since: '2026-11-14T09:00:00.000Z',
  leavesAt: '2026-11-15T09:00:00.000Z',
};
const letter = 'Silav! Navê min Rojda ye. Tu çawa yî?';

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

describe('letters by bird', () => {
  it('offers one thing to do with your bird at home: write a letter', async () => {
    signIn({ 'GET /letters': home() });
    renderApp(<LettersPage />, ['/app/letters']);
    expect(await screen.findByRole('button', { name: 'Write a letter' })).toBeInTheDocument();
    expect(screen.getByText('No pen pals yet. Call a bird to your window, or send yours out, and someone will write back.')).toBeInTheDocument();
  });

  it('says in plain words that nobody else has a bird out, when yours flies off to wait', async () => {
    const waiting: BirdOutResult = { kind: 'waiting', since: '2026-11-13T20:00:00.000Z' };
    const calls = signIn({ 'GET /letters': home(), 'POST /letters/out': waiting });
    renderApp(<LettersPage />, ['/app/letters']);
    await userEvent.click(await screen.findByRole('button', { name: 'Write a letter' }));
    await userEvent.type(screen.getByLabelText('Your letter'), letter);
    await userEvent.click(screen.getByRole('button', { name: 'Send your bird' }));
    expect(calls.find((c) => c.method === 'POST' && c.url.includes('/letters/out'))?.body).toEqual({ body: letter });
    // the flight ends at once in a page that cannot animate, and the sill is empty
    expect(await screen.findByText('Your bird is out')).toBeInTheDocument();
    expect(document.querySelector('.lw-bird')).toBeNull();
  });

  it('shows how many birds are out, calls one down with its letter, and answers it with the same bird', async () => {
    const answered: VisitorAnswer = { threadId: '11111111-2222-4333-8444-555555555555', person: baran, letter: { ...visitor.letter, id: 'l2', mine: true, body: 'Silav' } };
    const calls = signIn({ 'GET /letters': home({ birdsOut: 2, sky: [4, 6] }), 'POST /letters/call': { visitor }, 'POST /letters/visitor': answered });
    renderApp(<LettersPage />, ['/app/letters']);
    expect(await screen.findByText('2 birds are out there, each carrying a letter from someone your age.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Call a bird' }));
    // their bird has come down to the window with its letter, beside yours
    expect(await screen.findByText('Silav! Ez Baran im.')).toBeInTheDocument();
    expect(await screen.findByText('Baran’s bird is at your window')).toBeInTheDocument();
    await waitFor(() => expect(document.querySelectorAll('.lw-play').length).toBe(2));
    // your own bird stays home while it is here
    expect(screen.queryByRole('button', { name: 'Write a letter' })).toBeNull();
    // a single word is a letter
    await userEvent.type(screen.getByLabelText('Your answer to Baran'), 'Silav');
    await userEvent.click(screen.getByRole('button', { name: 'Send it home with Baran’s bird' }));
    expect(calls.find((c) => c.method === 'POST' && c.url.includes('/letters/visitor'))?.body).toEqual({ body: 'Silav' });
    expect(await screen.findByText('You and Baran are pen pals now')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open your letters with Baran' })).toHaveAttribute('href', `/app/letters/${answered.threadId}`);
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

  it('asks for a birth month before anybody can write', async () => {
    signIn({ 'GET /letters': home({ refusal: 'birth_month' }) });
    renderApp(<LettersPage />, ['/app/letters']);
    expect(await screen.findByRole('link', { name: 'Add your birth month' })).toHaveAttribute('href', '/app/settings');
    expect(screen.queryByRole('button', { name: 'Write a letter' })).toBeNull();
  });

  describe('a correspondence', () => {
    const thread = (over: Partial<LetterThread> = {}): LetterThread => ({
      threadId: 't1',
      person: { id: 'baran', name: 'Baran', bird: 4 },
      letters: [
        { id: 'l1', mine: true, body: letter, removed: false, sentAt: '2026-11-13T19:00:00.000Z', readAt: null },
        { id: 'l2', mine: false, body: 'Silav Rojda! Ez Baran im.', removed: false, sentAt: '2026-11-13T19:00:00.000Z', readAt: null },
      ],
      yourTurn: true,
      closed: false,
      ...over,
    });
    const at = (body: LetterThread) => {
      signIn({ 'GET /letters/threads/t1': body });
      renderApp(
        <Routes>
          <Route path="/app/letters/:threadId" element={<LetterThreadPage />} />
        </Routes>,
        ['/app/letters/t1'],
      );
    };

    it('gives the paper to write back on when it is your turn, and a way to report their letter', async () => {
      at(thread());
      expect(await screen.findByLabelText('Write back to Baran')).toBeInTheDocument();
      // their letter can be reported; yours cannot
      expect(screen.getAllByRole('button', { name: 'Report letter' })).toHaveLength(1);
    });

    it('says your bird is with them while it is theirs to answer', async () => {
      at(thread({ yourTurn: false }));
      expect(await screen.findByText('Your bird is with Baran. Their letter will come to your window.')).toBeInTheDocument();
      expect(screen.queryByLabelText('Write back to Baran')).toBeNull();
    });

    it('is read only once it has ended', async () => {
      at(thread({ yourTurn: false, closed: true }));
      expect(await screen.findByText('These letters have ended. Neither of you can write here again.')).toBeInTheDocument();
      await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
    });
  });
});
