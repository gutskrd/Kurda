import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ACCOUNT_HELD, DEFAULT_PAPER, type LettersHome } from '@kurda/shared';
import { ApiClient, describeError } from '../lib/api';
import type { ApiError, ApiResult } from '../lib/types';
import { en } from '../i18n/en';
import { jsonResponse, renderApp } from '../test/utils';
import { DmThread } from '../chat/DmThread';
import { Composer } from '../composer/Composer';
import { Comments } from '../library/Comments';
import { LettersPage } from '../letters/LettersPage';
import { Messages } from '../pages/Messages';
import { HeldBanner } from './HeldNotice';
import { restrictionOf } from './restriction';
import { SendError } from './SendError';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const HELD_SENTENCE = en['hold.title'];
const HOLD = { reason: 'possible_return', since: '2026-11-19T10:00:00.000Z' };
const heldRefusal = { code: ACCOUNT_HELD, message: 'this account is held' };
const asError = (over: Partial<ApiError> = {}): ApiError => ({ kind: 'client', status: 403, ...heldRefusal, ...over });

interface Call {
  method: string;
  path: string;
  body: unknown;
}

/**
 * Signs in as Baran, held or not, with `answers` keyed by method and path prefix; anything else answers an empty 200.
 * Every request is recorded.
 */
function signIn(held: boolean, answers: Record<string, () => Response> = {}): Call[] {
  const calls: Call[] = [];
  localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const path = new URL(url, 'http://x').pathname;
      calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : null });
      if (path === '/me') {
        return jsonResponse(200, { user: { id: 'me', username: 'baran', email: 'b@x.test', displayName: null, emailVerified: true, accountHold: held ? HOLD : null } });
      }
      const key = Object.keys(answers).find((k) => `${method} ${path}`.startsWith(k));
      return key ? answers[key]!() : jsonResponse(200, {});
    }),
  );
  return calls;
}

const posted = (calls: Call[], method: string, path: string): Call[] => calls.filter((c) => c.method === method && c.path === path);

/** The sentence must be said in full and never the server's own words. */
function expectHeldSentence(): void {
  expect(screen.getAllByText(HELD_SENTENCE).length).toBeGreaterThan(0);
  expect(screen.queryByText(heldRefusal.message)).not.toBeInTheDocument();
}

describe('the held notice', () => {
  it('says what waits and that learning does not, with why and the way to Account standing', async () => {
    signIn(true);
    renderApp(<HeldBanner />);
    expect(await screen.findByText(HELD_SENTENCE)).toBeInTheDocument();
    const why = screen.getByRole('button', { name: 'Why?' });
    expect(why).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText(en['hold.whyBody'])).not.toBeVisible();
    await userEvent.click(why);
    expect(why).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(en['hold.whyBody'])).toBeVisible();
    expect(screen.getByRole('link', { name: 'See your account standing' })).toHaveAttribute('href', '/app/settings/standing');
  });

  it('never speaks of other people, networks or devices', () => {
    for (const key of ['hold.title', 'hold.why', 'hold.whyBody'] as const) {
      expect(en[key]).not.toMatch(/network|device|internet|address|\bIP\b|someone else|other (people|accounts?)|banned/i);
    }
  });

  it('shows nothing for an account nobody is checking', async () => {
    const calls = signIn(false);
    renderApp(<HeldBanner />);
    await waitFor(() => expect(calls.some((c) => c.path === '/me')).toBe(true));
    expect(screen.queryByText(HELD_SENTENCE)).not.toBeInTheDocument();
  });

  it('shows from the first ACCOUNT_HELD refusal, before the account is read again', async () => {
    signIn(false, { 'POST /chat/u-rojda/messages': () => jsonResponse(403, heldRefusal) });
    renderApp(<DmThread otherId="u-rojda" otherName="Rojda" onSent={() => undefined} />);
    await userEvent.type(await screen.findByRole('textbox', { name: 'Message' }), 'Silav');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText(HELD_SENTENCE)).toBeInTheDocument();
    // Once, in place of the box, rather than again as the send error above it.
    expect(screen.getAllByText(HELD_SENTENCE)).toHaveLength(1);
    expect(screen.queryByRole('textbox', { name: 'Message' })).not.toBeInTheDocument();
  });
});

describe('an ACCOUNT_HELD refusal', () => {
  it('is a limit on the account, said in the same sentence everywhere', () => {
    expect(restrictionOf(asError())).toEqual({ kind: 'held' });
    expect(describeError(asError(), (k) => en[k])).toBe(HELD_SENTENCE);
    // a rate limit that happens to carry the code is still a rate limit
    expect(restrictionOf(asError({ kind: 'rate_limited', status: 429 }))).toBeNull();
  });

  it('shows the sentence and the way to Account standing wherever a send error is shown', () => {
    renderApp(<SendError error={asError()} describe={() => 'Could not send it.'} />);
    expect(screen.getByRole('alert')).toHaveTextContent(HELD_SENTENCE);
    expect(screen.getByRole('link', { name: 'See your account standing' })).toBeInTheDocument();
    expect(screen.queryByText('Could not send it.')).not.toBeInTheDocument();
  });
});

describe('each place a held account would post, message, upload, write or join', () => {
  it('a message: the notice stands where the box was', async () => {
    signIn(true);
    renderApp(<DmThread otherId="u-rojda" otherName="Rojda" onSent={() => undefined} />);
    expect(await screen.findByText(HELD_SENTENCE)).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Message' })).not.toBeInTheDocument();
  });

  it('a post: the composer says so before anything is written, with Post off', async () => {
    signIn(true, { 'GET /me/library/drafts': () => jsonResponse(200, { posts: [] }) });
    renderApp(<Composer onClose={() => undefined} onPosted={() => undefined} />);
    // Held as soon as the account is read, which comes after the first paint.
    expect(await screen.findByText(HELD_SENTENCE)).toBeInTheDocument();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Post' })).toBeDisabled();
    expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('a post refused as held turns into the notice, not an error', async () => {
    const calls = signIn(false, {
      'GET /me/library/drafts': () => jsonResponse(200, { posts: [] }),
      'POST /library/posts': () => jsonResponse(403, heldRefusal),
    });
    renderApp(<Composer onClose={() => undefined} onPosted={() => undefined} />);
    await userEvent.type(await screen.findByRole('textbox', { name: 'What you want to say' }), 'Silav hevalno');
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Post' }));
    await waitFor(() => expect(posted(calls, 'POST', '/library/posts')).toHaveLength(1));
    expect(await screen.findByText(HELD_SENTENCE)).toBeInTheDocument();
    expectHeldSentence();
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Post' })).toBeDisabled();
  });

  it('a picture refused as held says the sentence on its tile', async () => {
    signIn(false, { 'GET /me/library/drafts': () => jsonResponse(200, { posts: [] }) });
    vi.spyOn(ApiClient.prototype, 'uploadWithProgress').mockResolvedValue({ ok: false, error: asError() } as ApiResult<never>);
    renderApp(<Composer onClose={() => undefined} onPosted={() => undefined} />);
    await screen.findByRole('textbox', { name: 'What you want to say' });
    await userEvent.upload(screen.getByLabelText('Picture file'), new File([new Uint8Array([1, 2, 3])], 'cira.png', { type: 'image/png' }));
    expect(await screen.findByText(HELD_SENTENCE)).toBeInTheDocument();
    expectHeldSentence();
  });

  it('a comment: the notice stands where the box was, and no Reply opens another', async () => {
    signIn(true, {
      'GET /library/posts/p1/comments': () =>
        jsonResponse(200, {
          comments: [
            {
              id: 'c1',
              body: 'Pir xweş e',
              createdAt: '2026-11-18T10:00:00.000Z',
              author: { id: 'u-rojda', username: 'rojda', displayName: null, avatarUrl: null },
              replyCount: 0,
              removed: false,
            },
          ],
          nextCursor: null,
        }),
    });
    renderApp(<Comments postId="p1" commentCount={1} />);
    expect(await screen.findByText(HELD_SENTENCE)).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Add a comment…' })).not.toBeInTheDocument();
    await screen.findByText('Pir xweş e');
    expect(screen.queryByRole('button', { name: 'Reply' })).not.toBeInTheDocument();
  });

  it('a comment refused as held says the sentence, not the server’s words', async () => {
    const calls = signIn(false, {
      'GET /library/posts/p1/comments': () => jsonResponse(200, { comments: [], nextCursor: null }),
      'POST /library/posts/p1/comments': () => jsonResponse(403, heldRefusal),
    });
    renderApp(<Comments postId="p1" commentCount={0} />);
    await userEvent.type(await screen.findByRole('textbox', { name: 'Add a comment…' }), 'Silav');
    await userEvent.click(screen.getByRole('button', { name: 'Comment' }));
    await waitFor(() => expect(posted(calls, 'POST', '/library/posts/p1/comments')).toHaveLength(1));
    expect(await screen.findByText(HELD_SENTENCE)).toBeInTheDocument();
    expectHeldSentence();
  });

  const lettersHome = (over: Partial<LettersHome> = {}): LettersHome => ({
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

  it('a letter: the notice stands where Write a letter would be', async () => {
    signIn(true, { 'GET /letters': () => jsonResponse(200, lettersHome()) });
    renderApp(<LettersPage />, ['/app/letters']);
    expect(await screen.findByText(HELD_SENTENCE)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Write a letter' })).not.toBeInTheDocument();
  });

  it('a letter refused as held puts the paper away and says the sentence', async () => {
    const calls = signIn(false, {
      'GET /letters': () => jsonResponse(200, lettersHome()),
      'POST /letters/out': () => jsonResponse(403, heldRefusal),
    });
    renderApp(<LettersPage />, ['/app/letters']);
    await userEvent.click(await screen.findByRole('button', { name: 'Write a letter' }));
    await userEvent.type(screen.getByLabelText('Your letter'), 'Silav! Navê min Baran e. Tu çawa yî?');
    await userEvent.click(screen.getByRole('button', { name: 'Send your bird' }));
    await waitFor(() => expect(posted(calls, 'POST', '/letters/out')).toHaveLength(1));
    expect(await screen.findByText(HELD_SENTENCE)).toBeInTheDocument();
    expectHeldSentence();
    expect(screen.queryByLabelText('Your letter')).not.toBeInTheDocument();
  });

  const groupAnswers = (extra: Record<string, () => Response> = {}): Record<string, () => Response> => ({
    'GET /me/groups': () => jsonResponse(200, { groups: [] }),
    'GET /chat/conversations': () => jsonResponse(200, { conversations: [] }),
    ...extra,
  });

  it('a group: starting one says the sentence, with Create off', async () => {
    signIn(true, groupAnswers());
    renderApp(<Messages />, ['/app/messages']);
    await userEvent.click((await screen.findAllByRole('button', { name: 'New group' }))[0]!);
    const form = within(screen.getByRole('dialog', { name: 'New group' }));
    expect(await form.findByText(HELD_SENTENCE)).toBeInTheDocument();
    await userEvent.type(form.getByLabelText('Name'), 'Hevalên Kurmancî');
    expect(form.getByRole('button', { name: 'Create group' })).toBeDisabled();
  });

  it('a group refused as held says the sentence, not the server’s words', async () => {
    const calls = signIn(false, groupAnswers({ 'POST /groups': () => jsonResponse(403, heldRefusal) }));
    renderApp(<Messages />, ['/app/messages']);
    await userEvent.click((await screen.findAllByRole('button', { name: 'New group' }))[0]!);
    const form = within(screen.getByRole('dialog', { name: 'New group' }));
    await userEvent.type(form.getByLabelText('Name'), 'Hevalên Kurmancî');
    await userEvent.click(form.getByRole('button', { name: 'Create group' }));
    await waitFor(() => expect(posted(calls, 'POST', '/groups')).toHaveLength(1));
    expect(await form.findAllByText(HELD_SENTENCE)).not.toHaveLength(0);
    expectHeldSentence();
    expect(form.getByRole('button', { name: 'Create group' })).toBeDisabled();
  });
});
