import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { whoAmITableRules, type WhoAmIDeal, type WhoAmITableMove, type WhoAmITableState } from '@kurda/shared';
import { jsonResponse } from '../test/utils';
import { renderPlay, where } from '../play/testing';
import { forgetMpAvailability } from '../games/mpAvailability';
import { WhoAmI } from './WhoAmI';

/**
 * Who Am I? on the website: the start and its two ways in, and the table
 * with friends online from both sides of a question, the asker's and an
 * answerer's, through the card's verdict to a guess and the end.
 *
 * The room's server here is the game's own rules: a table is begun from three
 * dealt cards, every move the page sends is judged by `whoAmITableRules`, and
 * the page is answered with the rules' own view for the reader's seat. So what
 * these tests show a reader is what a real table would send them, and no more.
 */

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  forgetMpAvailability();
});

const me = { user: { id: 'me', username: 'ada', displayName: 'Ada', email: 'a@example.com', emailVerified: true } };
type Call = { url: string; method: string; body: unknown };
type Route = unknown | ((body: unknown) => unknown);

/** A signed-in reader, and a server that answers by method and a piece of the address; `{ status, body }` answers with that status. */
function serve(routes: Record<string, Route>, calls: Call[] = []): Call[] {
  localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const body: unknown = init?.body ? JSON.parse(init.body as string) : null;
      calls.push({ url, method, body });
      const key = Object.keys(routes).find((k) => {
        const [m, path] = k.includes(' ') ? k.split(' ') : ['GET', k];
        return m === method && url.includes(path!);
      });
      if (key) {
        const route = routes[key];
        const answer: unknown = typeof route === 'function' ? (route as (b: unknown) => unknown)(body) : route;
        if (answer && typeof answer === 'object' && 'status' in answer && 'body' in answer) return jsonResponse((answer as { status: number }).status, (answer as { body: unknown }).body);
        return jsonResponse(200, answer);
      }
      if (url.includes('/me')) return jsonResponse(200, me);
      return jsonResponse(200, {});
    }),
  );
  return calls;
}

// ---------- the start ----------

const onePhone = (offered: boolean) => ({
  '/games/who-am-i/couch?dialect=kmr': { dialect: 'kmr', difficulties: offered ? ['beginner'] : [] },
  '/games/who-am-i/couch?dialect=ckb': { dialect: 'ckb', difficulties: [] },
});
const online = (offered: boolean) => ({
  '/mp/who-am-i/availability': { dialects: [{ dialect: 'kmr', group: offered, solo: false, difficulties: offered ? ['beginner'] : [] }] },
});

describe('Who Am I?, the start', () => {
  it('offers the two ways to play, each with its own way in, and no round alone', async () => {
    serve({ ...onePhone(true), ...online(true) });
    renderPlay(<WhoAmI />, { route: '/app/games/who-am-i' });

    const phone = await screen.findByRole('region', { name: 'On this phone' });
    expect(within(phone).getByText('Pass one phone round the room. 2 to 6 players.')).toBeInTheDocument();
    expect(within(phone).getByRole('link', { name: 'Play on this phone' })).toHaveAttribute('href', '/app/games/who-am-i?couch=1');

    const friends = screen.getByRole('region', { name: 'With friends online' });
    expect(within(friends).getByText('Everyone on their own screen. 2 to 6 players.')).toBeInTheDocument();
    // the invite form for this game: its difficulty, and the longest it may run
    const longest = await within(friends).findByRole('radiogroup', { name: 'Longest game' });
    expect(within(longest).getAllByRole('radio').map((r) => r.parentElement?.textContent)).toEqual(['5 min', '10 min', '15 min']);
    expect(within(longest).getByRole('radio', { name: '10 min' })).toBeChecked();
    expect(within(friends).getByRole('button', { name: 'Create game' })).toBeInTheDocument();

    // the deer wears a card nobody has read yet, and the page says what the game is
    expect(screen.getByText('The card on your forehead')).toBeInTheDocument();
    expect(screen.getByText(/^Everyone wears a card on their forehead that they cannot read\./)).toBeInTheDocument();
    // nothing is played alone any more
    expect(screen.queryByText('On your own')).toBeNull();
    expect(document.querySelector('a[href*="solo"]')).toBeNull();
    // how it scores is on the page, folded away
    expect(screen.getByText('How it scores')).toBeInTheDocument();
  });

  it('makes a table with friends at the level and the longest time chosen, and opens its lobby', async () => {
    const calls = serve({ ...onePhone(true), ...online(true), 'POST /play/lobbies': { game: 'who-am-i', lobbyId: 'r9', invited: 0 } });
    renderPlay(<WhoAmI />, { route: '/app/games/who-am-i' });
    const friends = await screen.findByRole('region', { name: 'With friends online' });
    await userEvent.click(await within(friends).findByRole('radio', { name: '15 min' }));
    expect(within(friends).getByRole('radio', { name: 'Beginner' })).toBeChecked();
    await userEvent.click(within(friends).getByRole('button', { name: 'Create game' }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'POST' && c.url.endsWith('/play/lobbies'))?.body).toEqual({
        game: 'who-am-i',
        settings: { dialect: 'kmr', difficulty: 'beginner', minutes: 15, rated: false },
      }),
    );
    await waitFor(() => expect(where()).toBe('/app/games/who-am-i?id=r9'));
  });

  it('leaves out a way that cannot be played yet', async () => {
    serve({ ...onePhone(false), ...online(true) });
    const first = renderPlay(<WhoAmI />, { route: '/app/games/who-am-i' });
    expect(await screen.findByRole('region', { name: 'With friends online' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'On this phone' })).toBeNull();
    first.unmount();

    forgetMpAvailability();
    serve({ ...onePhone(true), ...online(false) });
    renderPlay(<WhoAmI />, { route: '/app/games/who-am-i' });
    expect(await screen.findByRole('region', { name: 'On this phone' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'With friends online' })).toBeNull();
  });

  it('is not offered without enough reviewed words and questions, and makes no promise', async () => {
    serve({ ...onePhone(false), ...online(false) });
    renderPlay(<WhoAmI />, { route: '/app/games/who-am-i' });
    expect(await screen.findByText('Who Am I? needs more reviewed words and questions before it can be played in this Kurdish.')).toBeInTheDocument();
    expect(screen.queryByText(/soon/i)).toBeNull();
    expect(screen.queryByRole('region', { name: 'On this phone' })).toBeNull();
  });

  it('lands an old link to the round alone on the start', async () => {
    const calls = serve({ ...onePhone(true), ...online(true) });
    renderPlay(<WhoAmI />, { route: '/app/games/who-am-i?solo=1' });
    expect(await screen.findByRole('region', { name: 'On this phone' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'With friends online' })).toBeInTheDocument();
    expect(calls.some((c) => c.url.includes('/games/solo'))).toBe(false);
  });
});

// ---------- the table with friends online ----------

// stand-in words for the cards and the questions, never shown to a learner
const QUESTIONS = {
  kmr: [
    { id: 'q1', ku: 'Ew dikare bifire?', meanings: { en: 'Can it fly?' }, fact: 'can-fly' },
    { id: 'q2', ku: 'Ew li malê tê dîtin?', meanings: { en: 'Do you find it at home?' }, fact: 'at-home' },
  ],
  ckb: [
    { id: 'q1', ku: 'ئایا دەتوانێت بفڕێت؟', meanings: { en: 'Can it fly?' }, fact: 'can-fly' },
    { id: 'q2', ku: 'ئایا لە ماڵەوە دەبینرێت؟', meanings: { en: 'Do you find it at home?' }, fact: 'at-home' },
  ],
};
const WORDS = {
  kmr: { cat: 'pisîk', bird: 'çûk', dog: 'kûçik', fish: 'masî', horse: 'hesp' },
  ckb: { cat: 'پشیلە', bird: 'باڵندە', dog: 'سەگ', fish: 'ماسی', horse: 'ئەسپ' },
};
const FACTS: Record<string, Record<string, boolean>> = {
  cat: { 'can-fly': false, 'at-home': true },
  bird: { 'can-fly': true, 'at-home': false },
  dog: { 'can-fly': false, 'at-home': true },
};

/** A card for one seat: who it is, and the tiles it could be, none of them another seat's card. */
function deal(who: 'cat' | 'bird' | 'dog', dialect: 'kmr' | 'ckb' = 'kmr'): WhoAmIDeal {
  const card = (id: string) => ({ id: `i-${id}`, word: WORDS[dialect][id as keyof (typeof WORDS)['kmr']], meanings: { en: id }, category: 'animal' });
  return {
    identity: { ...card(who), key: who, level: 1, facts: FACTS[who]! },
    candidates: [card(who), card('fish'), card('horse')],
    questions: QUESTIONS[dialect],
  };
}

const seat = (n: number, extra: Record<string, unknown> = {}) => ({ seat: n, userId: `seat:${n}`, name: null, avatarUrl: null, isMe: false, isHost: false, gone: false, away: false, team: null, bot: null, ...extra });

/**
 * A table of three under way, the reader in seat 1 wearing the cat, Rojda the
 * bird and Baran the dog. `play` is a move by anyone at the table, as the
 * server would take it; the page's own moves arrive through the route.
 */
function table(opts: { dialect?: 'kmr' | 'ckb'; refuse?: { status: number; body: unknown } } = {}) {
  const dialect = opts.dialect ?? 'kmr';
  let state: WhoAmITableState = whoAmITableRules.init(
    { dialect, minutes: 10, difficulty: 'beginner', deals: [1, 2, 3].map((n, i) => ({ seat: n, deal: deal((['cat', 'bird', 'dog'] as const)[i]!, dialect) })) },
    [1, 2, 3].map((n) => ({ seat: n, team: null, bot: null })),
    { now: Date.now(), seed: 'a-seed' },
  );
  let version = 1;
  const view = () => {
    const done = whoAmITableRules.finished(state);
    return {
      id: 'r1',
      game: 'who-am-i',
      mode: 'group',
      status: done ? 'finished' : 'active',
      version,
      serverNow: new Date().toISOString(),
      dialect,
      settings: { dialect, minutes: 10, difficulty: 'beginner' },
      access: 'friends',
      code: null,
      rated: { rated: false, counts: null, friendlyReason: null, damped: false },
      minPlayers: 2,
      maxPlayers: 6,
      teams: 0,
      isHost: true,
      canControl: true,
      createdBy: 'me',
      nextLobbyId: null,
      players: [seat(1, { userId: 'me', isMe: true, isHost: true }), seat(2, { name: 'Rojda' }), seat(3, { name: 'Baran' })],
      me: { seat: 1, team: null },
      startedAt: new Date().toISOString(),
      finishedAt: done ? new Date().toISOString() : null,
      results: done ? whoAmITableRules.places(state).map((p) => ({ seat: p.seat, place: p.place, score: p.score, xpAwarded: 0 })) : null,
      board: whoAmITableRules.viewFor(state, 1),
    };
  };
  const play = (by: number, move: WhoAmITableMove) => {
    const res = whoAmITableRules.apply(state, by, move, Date.now());
    if (!res.ok) throw new Error(`the rules refused seat ${by}: ${res.reason}`);
    state = res.state;
    version += 1;
    return res.outcome;
  };
  const calls = serve({
    'POST /mp/who-am-i/r1/moves': (body: unknown) => {
      if (opts.refuse) return opts.refuse;
      const res = whoAmITableRules.apply(state, 1, body as WhoAmITableMove, Date.now());
      if (!res.ok) return { status: 409, body: { code: 'MOVE_REFUSED', message: 'that move is not open now', details: { reason: res.reason } } };
      state = res.state;
      version += 1;
      return { view: view(), outcome: res.outcome };
    },
    '/mp/who-am-i/r1': () => view(),
  });
  const moves = () => calls.filter((c) => c.method === 'POST' && c.url.endsWith('/moves')).map((c) => c.body);
  return {
    play,
    moves,
    /** time running out, as the server settles it: for these seats' wait, or at `at` for the whole game */
    expire: (seats: number[], at = Date.now()) => {
      state = whoAmITableRules.timeout(state, seats, at);
      version += 1;
    },
    /** the game called off, as when everyone has gone */
    end: () => {
      state = whoAmITableRules.end(state, Date.now());
      version += 1;
    },
  };
}

/** The room on the page, and a way to tell it the table has moved. */
function open() {
  const { realtime } = renderPlay(<WhoAmI />, { route: '/app/games/who-am-i?id=r1' });
  return () => act(() => realtime.emit({ type: 'play_changed', game: 'who-am-i', lobbyId: 'r1' }));
}

const seatOf = (name: string): HTMLElement => within(screen.getByRole('list', { name: 'The table' })).getByText(name).closest('li')!;

/** The reader's own word may be among their tiles, as any tile may: it is on the page nowhere else. */
function expectOwnCardUnread(word: string): void {
  for (const el of screen.queryAllByText(word)) expect(el.closest('[role="radio"]')).not.toBeNull();
  expect(seatOf('You')).toHaveTextContent('The card on your forehead');
  expect(seatOf('You')).not.toHaveTextContent(word);
}

describe('Who Am I?, the table online, on my turn', () => {
  it('asks from my own list, waits while my friends answer, reads the card’s verdict, and guesses', async () => {
    const t = table();
    const moved = open();

    // whose turn, what it waits for, and its clock
    expect(await screen.findByText('Your turn')).toBeInTheDocument();
    expect(screen.getByText('Ask one question about your card, or guess if you know who you are.')).toBeInTheDocument();
    expect(screen.getByRole('timer', { name: /^Time left: \d+ s$/ })).toBeInTheDocument();
    expect(screen.getByText(/^Game time left: \d+:\d\d$/)).toBeInTheDocument();

    // the table: my friends' cards to read, my own a question mark
    expect(within(screen.getByRole('list', { name: 'The table' })).getAllByRole('listitem')).toHaveLength(3);
    expect(seatOf('You')).toHaveAttribute('aria-current', 'true');
    expect(seatOf('You')).toHaveTextContent('On turn');
    expect(within(seatOf('Rojda')).getByText('çûk')).toHaveAttribute('lang', 'ku');
    expect(seatOf('Rojda')).toHaveTextContent('bird');
    expect(seatOf('Rojda')).toHaveTextContent('Points: 0');
    expect(seatOf('Rojda')).toHaveTextContent('Questions: 0');
    expect(seatOf('Baran')).toHaveTextContent('kûçik');
    expectOwnCardUnread('pisîk');

    // a question says what it means when it is tapped
    const question = screen.getByRole('button', { name: 'Ew dikare bifire?' });
    expect(within(question).getByText('Ew dikare bifire?')).toHaveAttribute('lang', 'ku');
    await userEvent.click(question);
    expect(question).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Can it fly?')).toBeInTheDocument();
    expect(screen.getByText(/Points if you guess now: 10/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pass the turn on' })).toBeInTheDocument();

    // asked: my friends are answering, and the page says who has, never what
    await userEvent.click(screen.getAllByRole('button', { name: 'Ask' })[0]!);
    await waitFor(() => expect(t.moves()).toEqual([{ kind: 'ask', question: 'q1' }]));
    const mine = await screen.findByRole('region', { name: 'Your question' });
    expect(within(mine).getByText('Ew dikare bifire?')).toHaveAttribute('lang', 'ku');
    expect(screen.getAllByText('Your friends are answering.').length).toBeGreaterThan(0);
    const who = within(mine).getByRole('list', { name: 'Who has answered' });
    expect(within(who).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Rojda Still thinking', 'Baran Still thinking']);
    // nothing to ask or guess while it is being answered
    expect(screen.queryByRole('button', { name: 'Ask' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Guess' })).toBeNull();

    t.play(2, { kind: 'answer', yes: false });
    moved();
    await waitFor(() => expect(within(who).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Rojda Answered', 'Baran Still thinking']));
    expect(mine).not.toHaveTextContent(/Na|Erê/);

    // everyone has answered: the card says which it is, and who was right
    t.play(3, { kind: 'answer', yes: true });
    moved();
    const verdict = await screen.findByRole('region', { name: /^The card says:/ });
    expect(within(verdict).getByText('You asked:')).toBeInTheDocument();
    expect(within(verdict).getByText('Na')).toHaveAttribute('lang', 'ku');
    expect(verdict).toHaveTextContent('no');
    expect(within(within(verdict).getByRole('list', { name: 'How the table answered' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Rojda Right', 'Baran Wrong']);
    expect(screen.getByText('The card has answered. Guess who you are, or pass the turn on.')).toBeInTheDocument();
    // a screen reader is told the turn and the verdict as they change
    const live = screen.getByText('Your turn').closest('[aria-live="polite"]')!;
    expect(live).toHaveTextContent('The card says: Na');
    // the answer is stamped on the question in my list, and the next guess is worth one less
    expect(within(screen.getByRole('region', { name: 'Your questions' })).getByText('Na')).toHaveAttribute('lang', 'ku');
    expect(screen.getByText(/Points if you guess now: 9/)).toBeInTheDocument();
    expect(screen.getByText(/Guesses left: 2/)).toBeInTheDocument();
    expect(seatOf('Rojda')).toHaveTextContent('Points: 1');
    expectOwnCardUnread('pisîk');

    // a wrong guess: the tile is crossed out, the page says so, and the turn moves on
    await userEvent.click(screen.getByRole('radio', { name: /masî/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Guess' }));
    await waitFor(() => expect(t.moves()[1]).toEqual({ kind: 'guess', tile: 'i-fish' }));
    expect(await screen.findByText('Rojda’s turn')).toBeInTheDocument();
    expect(screen.getByText('Rojda is choosing a question.')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Not masî. Guesses left: 1');
    expect(screen.getByRole('radio', { name: 'masî, Not this one' })).toBeDisabled();
    expect(seatOf('Rojda')).toHaveAttribute('aria-current', 'true');
    // the last verdict stays on the table while the next player chooses
    expect(screen.getByRole('region', { name: /^The card says:/ })).toBeInTheDocument();
    expectOwnCardUnread('pisîk');
  });

  it('takes the card off my forehead at a right guess, and I go on answering for the others', async () => {
    const t = table();
    const moved = open();
    await screen.findByText('Your turn');
    await userEvent.click(screen.getByRole('radio', { name: /pisîk/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Guess' }));
    await waitFor(() => expect(t.moves()).toEqual([{ kind: 'guess', tile: 'i-cat' }]));

    const status = await screen.findByRole('status');
    await waitFor(() => expect(status).toHaveTextContent('You are pisîk!'));
    expect(within(status).getByText('pisîk')).toHaveAttribute('lang', 'ku');
    expect(status).toHaveTextContent('Your card is off. Keep answering your friends’ questions: every right answer is +1.');
    // the card is on my forehead for me to read now, with what it earned
    expect(within(seatOf('You')).getByText('pisîk')).toHaveAttribute('lang', 'ku');
    expect(seatOf('You')).toHaveTextContent('cat');
    expect(seatOf('You')).toHaveTextContent('Got it');
    expect(seatOf('You')).toHaveTextContent('Points: 10');
    // nothing left to ask or guess
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ask' })).toBeNull();

    t.play(2, { kind: 'ask', question: 'q1' });
    moved();
    const asked = await screen.findByRole('group', { name: 'Rojda asks about their card:' });
    await userEvent.click(within(asked).getByRole('button', { name: /^Erê/ }));
    await waitFor(() => expect(t.moves()[1]).toEqual({ kind: 'answer', yes: true }));
  });

  it('offers no pass once every question is asked, and says why', async () => {
    const t = table();
    // my first question asked and answered, the turn round the table, and now my second and last
    for (const question of ['q1', 'q2']) {
      t.play(1, { kind: 'ask', question });
      t.play(2, { kind: 'answer', yes: true });
      t.play(3, { kind: 'answer', yes: true });
      if (question === 'q1') for (const by of [1, 2, 3]) t.play(by, { kind: 'pass' });
    }
    open();
    expect(await screen.findByText('Your turn')).toBeInTheDocument();
    expect(screen.getAllByText('You have asked every question, so this turn has to be a guess.').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Pass the turn on' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ask' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Guess' })).toBeInTheDocument();
    // both answers are on my list, each the card's own
    const list = screen.getByRole('region', { name: 'Your questions' });
    expect(within(list).getByText('Na')).toBeInTheDocument();
    expect(within(list).getByText('Erê')).toBeInTheDocument();
  });

  it('says so when the table refuses a move', async () => {
    table({ refuse: { status: 409, body: { code: 'NOT_YOUR_TURN', message: 'it is not your turn' } } });
    open();
    await screen.findByText('Your turn');
    await userEvent.click(screen.getByRole('button', { name: 'Pass the turn on' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('It isn’t your turn.');
  });
});

describe('Who Am I?, the table online, answering a friend', () => {
  it('shows their card beside their question, takes my yes or no once, and says who was right', async () => {
    const t = table();
    t.play(1, { kind: 'pass' });
    t.play(2, { kind: 'ask', question: 'q1' });
    const moved = open();

    expect(await screen.findByText('Rojda’s turn')).toBeInTheDocument();
    expect(screen.getByText('Look at Rojda’s card and answer: yes or no?')).toBeInTheDocument();
    const asked = screen.getByRole('region', { name: 'Rojda asks about their card:' });
    const question = within(asked).getByRole('button', { name: 'Ew dikare bifire?' });
    await userEvent.click(question);
    expect(within(asked).getByText('Can it fly?')).toBeInTheDocument();
    // the card the question is about is right there to read
    const card = within(asked).getByRole('figure', { name: 'Rojda’s card' });
    expect(within(card).getByText('çûk')).toHaveAttribute('lang', 'ku');
    expect(card).toHaveTextContent('bird');
    // and mine is still nowhere to be read
    expectOwnCardUnread('pisîk');

    // two large buttons, in the dialect's own yes and no
    const answer = within(asked).getByRole('group', { name: 'Rojda asks about their card:' });
    const yes = within(answer).getByRole('button', { name: 'Erê yes' });
    expect(within(answer).getByRole('button', { name: 'Na no' })).toBeInTheDocument();
    expect(within(yes).getByText('Erê')).toHaveAttribute('lang', 'ku');
    await userEvent.click(yes);
    await waitFor(() => expect(t.moves()).toEqual([{ kind: 'answer', yes: true }]));
    expect(await within(asked).findByText('Answered. Waiting for the others.', { selector: '.wa-pending-note' })).toBeInTheDocument();
    expect(within(asked).queryByRole('button', { name: /^Erê/ })).toBeNull();
    expect(within(within(asked).getByRole('list', { name: 'Who has answered' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['You Answered', 'Baran Still thinking']);

    // the card says yes: I was right and Baran was not
    t.play(3, { kind: 'answer', yes: false });
    moved();
    const verdict = await screen.findByRole('region', { name: /^The card says:/ });
    expect(within(verdict).getByText('Rojda asked:')).toBeInTheDocument();
    expect(within(verdict).getByText('Erê')).toHaveAttribute('lang', 'ku');
    expect(within(verdict).getByText('You answered right: +1')).toBeInTheDocument();
    expect(within(within(verdict).getByRole('list', { name: 'How the table answered' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['You Right', 'Baran Wrong']);
    expect(screen.getByText('Rojda is deciding: guess, or pass the turn on.')).toBeInTheDocument();
    expect(screen.getByText('Rojda’s turn').closest('[aria-live="polite"]')).toHaveTextContent('The card says: Erê');
    expect(seatOf('You')).toHaveTextContent('Points: 1');
    // it is not my turn: my tiles and questions are there to read, not to press
    expect(screen.queryByRole('button', { name: 'Guess' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ask' })).toBeNull();
    expectOwnCardUnread('pisîk');

    // Rojda guesses, and has it: her forehead says so, with what it earned, and the turn goes on to Baran
    t.play(2, { kind: 'guess', tile: 'i-bird' });
    moved();
    expect(await screen.findByText('Baran’s turn')).toBeInTheDocument();
    expect(seatOf('Rojda')).toHaveTextContent('Got it');
    expect(seatOf('Rojda')).toHaveTextContent('Points: 9');
    expect(seatOf('Rojda')).toHaveTextContent('Questions: 1');
    expect(seatOf('Baran')).toHaveAttribute('aria-current', 'true');
    expectOwnCardUnread('pisîk');
  });

  it('says who answered wrong, and who did not answer in time', async () => {
    const t = table();
    t.play(1, { kind: 'pass' });
    t.play(2, { kind: 'ask', question: 'q1' });
    const moved = open();
    await userEvent.click(await screen.findByRole('button', { name: 'Na no' }));
    await waitFor(() => expect(t.moves()).toEqual([{ kind: 'answer', yes: false }]));
    // Baran's twenty seconds ran out: the card does not wait for him
    t.expire([3]);
    moved();
    const verdict = await screen.findByRole('region', { name: /^The card says:/ });
    expect(within(verdict).getByText('You answered wrong: no point this time.')).toBeInTheDocument();
    expect(within(within(verdict).getByRole('list', { name: 'How the table answered' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['You Wrong', 'Baran Did not answer']);
    expect(seatOf('You')).toHaveTextContent('Points: 0');
  });

  it('brings a question for me and its verdict into view, and leaves the page alone for a turn that is not mine', async () => {
    // a page longer than the window, with the table's news below the fold
    const scrolled: string[] = [];
    Element.prototype.scrollIntoView = function (this: Element): void {
      scrolled.push(this.className);
    };
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ top: 900, bottom: 1300 } as DOMRect);
    try {
      const t = table();
      t.play(1, { kind: 'pass' });
      const moved = open();
      await screen.findByText('Rojda’s turn');
      // the page opens at its top, wherever the table stands
      expect(scrolled).toEqual([]);

      t.play(2, { kind: 'ask', question: 'q1' });
      moved();
      await userEvent.click(await screen.findByRole('button', { name: 'Erê yes' }));
      await waitFor(() => expect(scrolled).toEqual(['wa-news']));
      t.play(3, { kind: 'answer', yes: true });
      moved();
      await screen.findByRole('region', { name: /^The card says:/ });
      await waitFor(() => expect(scrolled).toEqual(['wa-news', 'wa-news']));

      // Rojda passes to Baran: not my turn, so nothing moves
      t.play(2, { kind: 'pass' });
      moved();
      await screen.findByText('Baran’s turn');
      expect(scrolled).toHaveLength(2);
      // and round to me: my turn is brought to the top
      t.play(3, { kind: 'pass' });
      moved();
      await screen.findByText('Your turn');
      await waitFor(() => expect(scrolled).toEqual(['wa-news', 'wa-news', 'wa-board']));
    } finally {
      delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });

  it('answers in Soranî right to left, with Soranî’s own yes and no', async () => {
    const t = table({ dialect: 'ckb' });
    t.play(1, { kind: 'pass' });
    t.play(2, { kind: 'ask', question: 'q1' });
    open();
    const asked = await screen.findByRole('region', { name: 'Rojda asks about their card:' });
    const question = within(asked).getByText('ئایا دەتوانێت بفڕێت؟');
    expect(question).toHaveAttribute('dir', 'rtl');
    expect(question).toHaveAttribute('lang', 'ckb');
    expect(within(asked).getByText('باڵندە')).toHaveAttribute('dir', 'rtl');
    const yes = within(asked).getByRole('button', { name: 'بەڵێ yes' });
    expect(within(yes).getByText('بەڵێ')).toHaveAttribute('lang', 'ckb');
    expect(within(asked).getByRole('button', { name: 'نەخێر no' })).toBeInTheDocument();
  });
});

describe('Who Am I?, once the table is done', () => {
  it('says why it ended, who everyone was and what each scored, with the way to another game', async () => {
    const t = table();
    t.play(1, { kind: 'guess', tile: 'i-cat' });
    t.play(2, { kind: 'guess', tile: 'i-bird' });
    t.play(3, { kind: 'guess', tile: 'i-dog' });
    open();
    const reveal = await screen.findByRole('region', { name: 'Who everyone was' });
    expect(within(reveal).getByText('Every card is off: the game is over.')).toBeInTheDocument();
    expect(within(reveal).getByText('pisîk')).toHaveAttribute('lang', 'ku');
    expect(within(reveal).getByText('çûk')).toBeInTheDocument();
    expect(within(reveal).getByText('kûçik')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Results' })).getAllByText('Points: 10')).toHaveLength(3);
    expect(screen.getByRole('link', { name: 'Who Am I?' })).toHaveAttribute('href', '/app/games/who-am-i');
    expect(where()).toBe('/app/games/who-am-i?id=r1');
  });

  it('says so when its time ran out, and when too few were left to go on', async () => {
    const timed = table();
    timed.expire([], Date.now() + 11 * 60_000);
    const first = renderPlay(<WhoAmI />, { route: '/app/games/who-am-i?id=r1' });
    expect(await screen.findByText('Time is up: the game is over.')).toBeInTheDocument();
    // nobody had their card, and everyone is still told who they were
    expect(within(screen.getByRole('region', { name: 'Who everyone was' })).getByText('pisîk')).toBeInTheDocument();
    first.unmount();

    const left = table();
    left.end();
    open();
    expect(await screen.findByText('Too few players were left at the table, so the game ended.')).toBeInTheDocument();
  });
});
