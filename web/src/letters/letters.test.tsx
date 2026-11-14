import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import type { BirdOutResult, LetterThread, LettersHome } from '@kurda/shared';
import { renderApp, jsonResponse } from '../test/utils';
import { LettersPage } from './LettersPage';
import { LetterThreadPage } from './LetterThreadPage';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const home = (over: Partial<LettersHome> = {}): LettersHome => ({ refusal: null, bird: 2, out: null, penPals: [], roomForMore: true, ...over });
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
    expect(screen.getByText('No pen pals yet. Send your bird out, and someone will write back.')).toBeInTheDocument();
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

  it('shows the letter their bird brought, when the two birds meet', async () => {
    const met: BirdOutResult = {
      kind: 'met',
      threadId: '11111111-2222-4333-8444-555555555555',
      person: { id: 'baran', name: 'Baran', bird: 4 },
      letter: { id: 'l1', mine: false, body: 'Silav Rojda! Ez Baran im.', removed: false, sentAt: '2026-11-13T19:00:00.000Z', readAt: null },
    };
    signIn({ 'GET /letters': home(), 'POST /letters/out': met });
    renderApp(<LettersPage />, ['/app/letters']);
    await userEvent.click(await screen.findByRole('button', { name: 'Write a letter' }));
    await userEvent.type(screen.getByLabelText('Your letter'), letter);
    await userEvent.click(screen.getByRole('button', { name: 'Send your bird' }));
    expect(await screen.findByText('Silav Rojda! Ez Baran im.')).toBeInTheDocument();
    // their pigeon has landed on your sill and laid their letter down beside it (at once, in a page that cannot animate)
    await waitFor(() => expect(document.querySelector('.lw-sill-letter')).not.toBeNull());
    expect(document.querySelector('.lw-play')).not.toBeNull();
    expect(screen.getByText('Baran’s bird came to your window')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Write back to Baran' })).toHaveAttribute('href', `/app/letters/${met.threadId}`);
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
