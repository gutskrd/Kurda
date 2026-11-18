import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { whoAmITableRules, type WhoAmIDeal, type WhoAmIFactValue, type WhoAmITableMove, type WhoAmITableState } from '@kurda/shared';
import { jsonResponse, withBothDialects } from '../test/utils';
import { renderPlay, where } from '../play/testing';
import { forgetMpAvailability } from '../games/mpAvailability';
import { WhoAmI } from './WhoAmI';

/*
 * Ez kî me? on the website: the start's two ways in, and an online table from both the asker's and an answerer's side
 * through verdict, guess and end. The fake room runs `whoAmITableRules` and answers with the rules' view for the
 * reader's seat, so the tests show exactly what a real table would.
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
  const answers = withBothDialects(routes);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const body: unknown = init?.body ? JSON.parse(init.body as string) : null;
      calls.push({ url, method, body });
      const key = Object.keys(answers).find((k) => {
        const [m, path] = k.includes(' ') ? k.split(' ') : ['GET', k];
        return m === method && url.includes(path!);
      });
      if (key) {
        const route = answers[key];
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

describe('Ez kî me?, the start', () => {
  it('offers one phone first and friends online as the quieter way under it, each with its own way in, and no round alone', async () => {
    serve({ ...onePhone(true), ...online(true) });
    renderPlay(<WhoAmI />, { route: '/app/games/who-am-i' });

    const phone = await screen.findByRole('region', { name: 'On this phone' });
    expect(within(phone).getByText('Pass one phone round the room. 2 to 6 players.')).toBeInTheDocument();
    expect(within(phone).getByRole('link', { name: 'Play on this phone' })).toHaveAttribute('href', '/app/games/who-am-i?couch=1');

    const friends = screen.getByRole('region', { name: 'With friends online' });
    expect(within(friends).getByText('Everyone on their own screen. 2 to 6 players.')).toBeInTheDocument();
    // the phone's card is the main way in: first on the page and marked so, with the other the quiet one
    expect(screen.getAllByRole('region').slice(0, 2)).toEqual([phone, friends]);
    expect(phone).toHaveClass('is-main');
    expect(friends).toHaveClass('is-quiet');
    // the invite form for this game: its difficulty, and the longest it may run
    const longest = await within(friends).findByRole('radiogroup', { name: 'Longest game' });
    expect(within(longest).getAllByRole('radio').map((r) => r.parentElement?.textContent)).toEqual(['5 min', '10 min', '15 min']);
    expect(within(longest).getByRole('radio', { name: '10 min' })).toBeChecked();
    expect(within(friends).getByRole('button', { name: 'Create game' })).toBeInTheDocument();

    // the deer wears a card nobody has read yet, and the page says what the game is in two short sentences
    expect(screen.getByText('The card on your forehead')).toBeInTheDocument();
    expect(screen.getByText('There is a card on your forehead that only your friends can read. Ask yes-or-no questions in Kurdish to find out who you are.')).toBeInTheDocument();
    // nothing is played alone any more
    expect(screen.queryByText('On your own')).toBeNull();
    expect(document.querySelector('a[href*="solo"]')).toBeNull();
    // how it scores is on the page, folded away; only the one-phone screens allow one more miss, and say so there
    expect(screen.getByText('How it scores')).toBeInTheDocument();
    expect(screen.getByText(/^After 2 wrong guesses you are out/)).toBeInTheDocument();
    expect(screen.queryByText(/^After 3 wrong guesses/)).toBeNull();
    // what answering is worth, up to its cap, and how the two answers in between score
    expect(screen.getByText('Plus 1 for every right answer you give about a friend’s card, up to 6 a game.')).toBeInTheDocument();
    expect(screen.getByText(/^When the card says “could be”, yes, no and could be all count as right\./)).toBeInTheDocument();
    expect(screen.getByText('“Not sure” scores nothing and costs nothing.')).toBeInTheDocument();
  });

  it('makes a table with friends at the level and the longest time chosen, and opens its lobby', async () => {
    const calls = serve({ ...onePhone(true), ...online(true), 'POST /play/lobbies': { game: 'who-am-i', lobbyId: 'r9', invited: 0 } });
    renderPlay(<WhoAmI />, { route: '/app/games/who-am-i' });
    const friends = await screen.findByRole('region', { name: 'With friends online' });
    await userEvent.click(await within(friends).findByRole('radio', { name: '15 min' }));
    expect(within(friends).getByRole('radio', { name: 'Beginner' })).toBeChecked();
    await userEvent.click(within(friends).getByRole('button', { name: 'Create game' }));
    // a table this app makes offers the friends all four answers
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'POST' && c.url.endsWith('/play/lobbies'))?.body).toEqual({
        game: 'who-am-i',
        settings: { dialect: 'kmr', difficulty: 'beginner', minutes: 15, answers: 4, rated: false },
      }),
    );
    await waitFor(() => expect(where()).toBe('/app/games/who-am-i?id=r9'));
  });

  it('leaves out a way that cannot be played yet', async () => {
    serve({ ...onePhone(false), ...online(true) });
    const first = renderPlay(<WhoAmI />, { route: '/app/games/who-am-i' });
    // the one way there is to play is not the quiet one
    expect(await screen.findByRole('region', { name: 'With friends online' })).not.toHaveClass('is-quiet');
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
    expect(await screen.findByText('Ez kî me? needs more reviewed words and questions before it can be played in this Kurdish.')).toBeInTheDocument();
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
// A bird is at home in one family and in the sky for another: its card says "could be" to that question.
const FACTS: Record<string, Record<string, WhoAmIFactValue>> = {
  cat: { 'can-fly': false, 'at-home': true },
  bird: { 'can-fly': true, 'at-home': 'sometimes' },
  dog: { 'can-fly': false, 'at-home': true },
};

// A question whose answer follows from the kind on the card (every tile is an animal), so the rules never suggest it.
// It is dealt first, to show that the list is led by what is suggested and not by the order of the deal.
const PLACE = { id: 'q3', ku: 'Ew cihek e?', meanings: { en: 'Is it a place?' }, fact: 'place' };

/** A card for one seat: who it is, and the tiles it could be, none of them another seat's card. */
function deal(who: 'cat' | 'bird' | 'dog', dialect: 'kmr' | 'ckb' = 'kmr', questions: WhoAmIDeal['questions'] = QUESTIONS[dialect]): WhoAmIDeal {
  const card = (id: string) => ({ id: `i-${id}`, word: WORDS[dialect][id as keyof (typeof WORDS)['kmr']], meanings: { en: id }, category: 'animal' });
  return {
    identity: { ...card(who), key: who, level: 1, facts: FACTS[who]! },
    candidates: [card(who), card('fish'), card('horse')],
    questions,
  };
}

const seat = (n: number, extra: Record<string, unknown> = {}) => ({ seat: n, userId: `seat:${n}`, name: null, avatarUrl: null, isMe: false, isHost: false, gone: false, away: false, team: null, bot: null, ...extra });

/**
 * A table of three under way: the reader in seat 1 wearing the cat, Rojda the bird and Baran the dog. `play` makes a
 * move for anyone; the page's own moves arrive through the route. Four answers are offered unless `answers` says two.
 */
function table(
  opts: { dialect?: 'kmr' | 'ckb'; difficulty?: 'beginner' | 'intermediate'; answers?: 2 | 4; questions?: WhoAmIDeal['questions']; refuse?: { status: number; body: unknown } } = {},
) {
  const dialect = opts.dialect ?? 'kmr';
  const difficulty = opts.difficulty ?? 'beginner';
  const answers = opts.answers ?? 4;
  let state: WhoAmITableState = whoAmITableRules.init(
    { dialect, minutes: 10, difficulty, answers, deals: [1, 2, 3].map((n, i) => ({ seat: n, deal: deal((['cat', 'bird', 'dog'] as const)[i]!, dialect, opts.questions) })) },
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
      settings: { dialect, minutes: 10, difficulty, answers },
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
    'POST /games/who-am-i/report': { counted: true },
    '/mp/who-am-i/r1': () => view(),
  });
  const moves = () => calls.filter((c) => c.method === 'POST' && c.url.endsWith('/moves')).map((c) => c.body);
  return {
    play,
    moves,
    /** what the page said looks wrong about a card */
    reports: () => calls.filter((c) => c.method === 'POST' && c.url.endsWith('/games/who-am-i/report')).map((c) => c.body),
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

/** The reader's own word may be among their tiles once those are open, as any tile may: it is on the page nowhere else. */
function expectOwnCardUnread(word: string): void {
  for (const el of screen.queryAllByText(word)) expect(el.closest('[role="radio"]')).not.toBeNull();
  expect(seatOf('You')).toHaveTextContent('The card on your forehead');
  expect(seatOf('You')).not.toHaveTextContent(word);
}

/** Nothing on the board lists who I could be: no tiles and no Guess, only the way to say I know. */
function expectNoChoices(): void {
  expect(screen.queryByRole('radiogroup')).toBeNull();
  expect(screen.queryByRole('radio')).toBeNull();
  expect(screen.queryByText('You are one of these')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Guess' })).toBeNull();
  expect(screen.getByRole('button', { name: 'I know who I am!' })).toHaveAttribute('aria-expanded', 'false');
}

/** My tiles, opened by saying I know who I am. */
async function openTiles(): Promise<HTMLElement> {
  await userEvent.click(screen.getByRole('button', { name: 'I know who I am!' }));
  return screen.findByRole('radiogroup', { name: 'You are one of these' });
}

describe('Ez kî me?, the table online, on my turn', () => {
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
    // the words I could be are not listed while there are questions to ask
    expectNoChoices();
    // a table online counts the misses its own way
    expect(screen.getByText(/^After 2 wrong guesses you are out/)).toBeInTheDocument();

    // at the beginner's level every question says what it means under it, with nothing to tap
    const deck = screen.getByRole('region', { name: 'Ask a question' });
    expect(within(deck).getByText('Ew dikare bifire?')).toHaveAttribute('lang', 'ku');
    expect(within(deck).getByText('Can it fly?')).toBeInTheDocument();
    expect(within(deck).queryByText('Tap a question to see what it means.')).toBeNull();
    expect(within(deck).queryByRole('button', { name: 'Ew dikare bifire?' })).toBeNull();
    // a question of one's own is for a room that sits together: it is never offered at a table online
    expect(screen.queryByRole('button', { name: 'Ask my own question' })).toBeNull();
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

    // with the answer in hand the words are still not listed, until I say I know who I am
    expectNoChoices();
    expect(screen.getByRole('button', { name: 'I know who I am!' })).toHaveClass('btn-primary');
    const tiles = await openTiles();
    expect(within(tiles).getAllByRole('radio').map((r) => r.textContent)).toEqual(['pisîk cat', 'masî fish', 'hesp horse']);

    // a wrong guess: the page says so, the turn moves on, and the words are off the board again
    await userEvent.click(screen.getByRole('radio', { name: /masî/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Guess' }));
    await waitFor(() => expect(t.moves()[1]).toEqual({ kind: 'guess', tile: 'i-fish' }));
    expect(await screen.findByText('Rojda’s turn')).toBeInTheDocument();
    expect(screen.getByText('Rojda is choosing a question.')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Not masî. Guesses left: 1');
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.queryByRole('button', { name: 'I know who I am!' })).toBeNull();
    expect(seatOf('Rojda')).toHaveAttribute('aria-current', 'true');
    // the last verdict stays on the table while the next player chooses
    expect(screen.getByRole('region', { name: /^The card says:/ })).toBeInTheDocument();
    expectOwnCardUnread('pisîk');

    // round the table and back to me: the tile I guessed wrong is crossed out when I open them again
    for (const by of [2, 3]) t.play(by, { kind: 'pass' });
    moved();
    expect(await screen.findByText('Your turn')).toBeInTheDocument();
    expectNoChoices();
    await openTiles();
    expect(screen.getByRole('radio', { name: 'masî, Not this one' })).toBeDisabled();
  });

  it('lists the words to choose from only once I say I know who I am, and folds them away again at Not yet', async () => {
    const t = table();
    const moved = open();
    await screen.findByText('Your turn');
    expectNoChoices();
    expect(screen.getByRole('button', { name: 'I know who I am!' })).toHaveClass('btn-secondary');

    // said: the tiles and Guess are there in place of the button, and the focus has gone with them
    const tiles = await openTiles();
    expect(within(tiles).getAllByRole('radio')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Guess' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'I know who I am!' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Pass the turn on' })).toBeNull();
    expect(tiles.closest('.wa-choose')).toHaveFocus();

    // not yet: they are folded away, the focus is back on the button, and the table has heard nothing
    await userEvent.click(screen.getByRole('button', { name: 'Not yet' }));
    expectNoChoices();
    expect(screen.getByRole('button', { name: 'I know who I am!' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Pass the turn on' })).toBeInTheDocument();
    expect(t.moves()).toEqual([]);

    // opened again and left open while a question is asked: the wait after the answer starts without them
    await openTiles();
    await userEvent.click(screen.getAllByRole('button', { name: 'Ask' })[0]!);
    await waitFor(() => expect(t.moves()).toEqual([{ kind: 'ask', question: 'q1' }]));
    t.play(2, { kind: 'answer', yes: false });
    t.play(3, { kind: 'answer', yes: false });
    moved();
    await screen.findByRole('region', { name: /^The card says:/ });
    expectNoChoices();

    // a guess online is a tile the table checks, never the word of a room
    await openTiles();
    await userEvent.click(screen.getByRole('radio', { name: /pisîk/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Guess' }));
    await waitFor(() => expect(t.moves()[1]).toEqual({ kind: 'guess', tile: 'i-cat' }));
    expect(JSON.stringify(t.moves())).not.toContain('said');
  });

  it('leads my list with the suggested questions under their own label, then the rest, and asks from either as before', async () => {
    const t = table({ questions: [PLACE, ...QUESTIONS.kmr] });
    const moved = open();
    await screen.findByText('Your turn');

    const deck = screen.getByRole('region', { name: 'Ask a question' });
    const [suggested, rest] = within(deck).getAllByRole('list');
    // the questions worth asking next come first, whatever the order they were dealt in
    expect(suggested).toBe(within(deck).getByRole('list', { name: 'Suggested' }));
    expect(within(suggested!).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Ew dikare bifire? Can it fly?Ask', 'Ew li malê tê dîtin? Do you find it at home?Ask']);
    // then the rest of the list under a label of its own, as askable as ever
    expect(rest).toBe(within(deck).getByRole('list', { name: 'Other questions' }));
    expect(within(rest!).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Ew cihek e? Is it a place?Ask']);
    await userEvent.click(within(rest!).getByRole('button', { name: 'Ask' }));
    await waitFor(() => expect(t.moves()).toEqual([{ kind: 'ask', question: 'q3' }]));

    // once the turn is no longer one to ask in, the list is my notes: nothing in it is suggested
    t.play(2, { kind: 'answer', yes: false });
    t.play(3, { kind: 'answer', yes: false });
    moved();
    const notes = await screen.findByRole('region', { name: 'Your questions' });
    expect(within(notes).queryByRole('list', { name: 'Suggested' })).toBeNull();
    expect(within(notes).queryByText('Other questions')).toBeNull();
    expect(within(notes).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Ew cihek e? Is it a place?Na', 'Ew dikare bifire? Can it fly?', 'Ew li malê tê dîtin? Do you find it at home?']);

    // round the table and back to me: what is left to suggest leads the list again
    for (const by of [1, 2, 3]) t.play(by, { kind: 'pass' });
    moved();
    const again = await screen.findByRole('region', { name: 'Ask a question' });
    expect(within(within(again).getByRole('list', { name: 'Suggested' })).getAllByRole('button', { name: 'Ask' })).toHaveLength(2);
    await userEvent.click(within(again).getAllByRole('button', { name: 'Ask' })[0]!);
    await waitFor(() => expect(t.moves()[1]).toEqual({ kind: 'ask', question: 'q1' }));
  });

  it('keeps what a question means a tap away above the beginner’s level', async () => {
    table({ difficulty: 'intermediate' });
    open();
    await screen.findByText('Your turn');
    const deck = screen.getByRole('region', { name: 'Ask a question' });
    expect(within(deck).getByText('Tap a question to see what it means.')).toBeInTheDocument();
    expect(within(deck).queryByText('Can it fly?')).toBeNull();
    // suggested all the same, and first
    const question = within(within(deck).getByRole('list', { name: 'Suggested' })).getByRole('button', { name: 'Ew dikare bifire?' });
    expect(within(question).getByText('Ew dikare bifire?')).toHaveAttribute('lang', 'ku');
    await userEvent.click(question);
    expect(question).toHaveAttribute('aria-expanded', 'true');
    expect(within(deck).getByText('Can it fly?')).toBeInTheDocument();
  });

  it('takes the card off my forehead at a right guess, and I go on answering for the others', async () => {
    const t = table();
    const moved = open();
    await screen.findByText('Your turn');
    await openTiles();
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
    await waitFor(() => expect(t.moves()[1]).toEqual({ kind: 'answer', says: 'yes' }));
  });

  it('opens the words by itself once every question is asked, offers no pass and no way back, and says why', async () => {
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
    // the turn is a guess, so the words to guess from are there without being asked for, and cannot be put away
    expect(within(screen.getByRole('radiogroup', { name: 'You are one of these' })).getAllByRole('radio')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Guess' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'I know who I am!' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Not yet' })).toBeNull();
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

describe('Ez kî me?, the table online, answering a friend', () => {
  it('shows their card beside their question, takes my answer once from four keys, and says who was right', async () => {
    const t = table();
    t.play(1, { kind: 'pass' });
    t.play(2, { kind: 'ask', question: 'q1' });
    const moved = open();

    expect(await screen.findByText('Rojda’s turn')).toBeInTheDocument();
    expect(screen.getByText('Look at Rojda’s card and answer the question.')).toBeInTheDocument();
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

    // four keys in the dialect's own words: yes, could be and no in a row, and not sure under them, each with a mark
    const answer = within(asked).getByRole('group', { name: 'Rojda asks about their card:' });
    expect(within(answer).getAllByRole('button').map((b) => b.textContent)).toEqual(['Erê yes', 'Dibe could be', 'Na no', 'Nizanim not sure']);
    const yes = within(answer).getByRole('button', { name: 'Erê yes' });
    expect(yes).toHaveClass('is-yes');
    expect(within(answer).getByRole('button', { name: 'Dibe could be' })).toHaveClass('is-sometimes');
    expect(within(answer).getByRole('button', { name: 'Na no' })).toHaveClass('is-no');
    expect(within(answer).getByRole('button', { name: 'Nizanim not sure' })).toHaveClass('is-unsure');
    for (const key of within(answer).getAllByRole('button')) expect(key.querySelector('.wa-answer-mark svg')).not.toBeNull();
    expect(within(yes).getByText('Erê')).toHaveAttribute('lang', 'ku');
    // the row reads in the dialect's direction, with not sure on its own under it
    expect(yes.parentElement).toHaveAttribute('dir', 'ltr');
    expect(within(answer).getByRole('button', { name: 'Nizanim not sure' }).parentElement).toBe(answer);
    await userEvent.click(yes);
    await waitFor(() => expect(t.moves()).toEqual([{ kind: 'answer', says: 'yes' }]));
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
    await waitFor(() => expect(t.moves()).toEqual([{ kind: 'answer', says: 'no' }]));
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

  it('answers in Soranî right to left, with Soranî’s own four answers, the yes first from the right', async () => {
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
    // the row runs right to left, so the yes stands on the right as a Soranî reader begins
    expect(yes.parentElement).toHaveAttribute('dir', 'rtl');
    expect(within(asked).getByRole('button', { name: 'ڕەنگە could be' })).toBeInTheDocument();
    expect(within(asked).getByRole('button', { name: 'نەخێر no' })).toBeInTheDocument();
    await userEvent.click(within(asked).getByRole('button', { name: 'نازانم not sure' }));
    await waitFor(() => expect(t.moves()).toEqual([{ kind: 'answer', says: 'unsure' }]));
    expect(within(await within(asked).findByText('Answered. Waiting for the others.', { selector: '.wa-pending-note' })).getByText('نازانم')).toHaveAttribute('lang', 'ckb');
  });

  it('calls “could be” right on a card that says it, says what that means, and calls it close on a plain yes or no', async () => {
    const t = table();
    t.play(1, { kind: 'pass' });
    // Rojda's bird is at home in some families and not in others: her card says "could be"
    t.play(2, { kind: 'ask', question: 'q2' });
    const moved = open();
    await userEvent.click(await screen.findByRole('button', { name: 'Dibe could be' }));
    await waitFor(() => expect(t.moves()).toEqual([{ kind: 'answer', says: 'sometimes' }]));
    // what I said stands beside the wait, in the dialect's own word
    expect(within(await screen.findByText('Answered. Waiting for the others.', { selector: '.wa-pending-note' })).getByText('Dibe')).toHaveClass('is-sometimes');
    t.play(3, { kind: 'answer', yes: false });
    moved();

    // an amber verdict: the card's own "could be", what it means, and every friend who reasoned it out is right
    const verdict = await screen.findByRole('region', { name: /^The card says:/ });
    expect(verdict).toHaveClass('is-sometimes');
    expect(within(verdict).getByText('Dibe')).toHaveAttribute('lang', 'ku');
    expect(verdict).toHaveTextContent('could be');
    expect(within(verdict).getByText('Sometimes yes, sometimes no.')).toBeInTheDocument();
    expect(within(verdict).getByText('You answered right: +1')).toBeInTheDocument();
    expect(within(within(verdict).getByRole('list', { name: 'How the table answered' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['You Right', 'Baran Right']);
    expect(screen.getByText('Rojda’s turn').closest('[aria-live="polite"]')).toHaveTextContent('The card says: Dibe');
    expect(seatOf('You')).toHaveTextContent('Points: 1');
    expect(seatOf('Baran')).toHaveTextContent('Points: 1');

    // Baran's dog cannot fly, plainly: "could be" is close to that, and scores nothing, and nobody is told they were wrong
    t.play(2, { kind: 'pass' });
    t.play(3, { kind: 'ask', question: 'q1' });
    moved();
    await userEvent.click(await screen.findByRole('button', { name: 'Dibe could be' }));
    await waitFor(() => expect(t.moves()[1]).toEqual({ kind: 'answer', says: 'sometimes' }));
    t.play(2, { kind: 'answer', yes: false });
    moved();
    const plain = await screen.findByRole('region', { name: /^The card says: Na/ });
    expect(plain).toHaveClass('is-no');
    expect(within(plain).queryByText('Sometimes yes, sometimes no.')).toBeNull();
    expect(within(plain).getByText('Close, but not quite: no point this time.')).toBeInTheDocument();
    expect(within(within(plain).getByRole('list', { name: 'How the table answered' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['You Close', 'Rojda Right']);
    expect(plain).not.toHaveTextContent('Wrong');
    expect(seatOf('You')).toHaveTextContent('Points: 1');
  });

  it('takes “not sure” as an answer that scores nothing and costs nothing', async () => {
    const t = table();
    t.play(1, { kind: 'pass' });
    t.play(2, { kind: 'ask', question: 'q1' });
    const moved = open();
    await userEvent.click(await screen.findByRole('button', { name: 'Nizanim not sure' }));
    await waitFor(() => expect(t.moves()).toEqual([{ kind: 'answer', says: 'unsure' }]));
    t.play(3, { kind: 'answer', yes: true });
    moved();
    const verdict = await screen.findByRole('region', { name: /^The card says: Erê/ });
    expect(within(verdict).getByText('You weren’t sure: no point this time, and nothing lost.')).toBeInTheDocument();
    expect(within(within(verdict).getByRole('list', { name: 'How the table answered' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['You Not sure', 'Baran Right']);
    expect(verdict).not.toHaveTextContent('Wrong');
    expect(seatOf('You')).toHaveTextContent('Points: 0');
  });

  it('offers yes and no alone at a table made for two answers, as an older app made it', async () => {
    const t = table({ answers: 2 });
    t.play(1, { kind: 'pass' });
    t.play(2, { kind: 'ask', question: 'q1' });
    open();
    const answer = await screen.findByRole('group', { name: 'Rojda asks about their card:' });
    expect(within(answer).getAllByRole('button').map((b) => b.textContent)).toEqual(['Erê yes', 'Na no']);
    // the scoring note says nothing of answers the table does not offer
    expect(screen.queryByText('“Not sure” scores nothing and costs nothing.')).toBeNull();
    expect(screen.queryByText(/^When the card says “could be”/)).toBeNull();
    await userEvent.click(within(answer).getByRole('button', { name: 'Na no' }));
    await waitFor(() => expect(t.moves()).toEqual([{ kind: 'answer', says: 'no' }]));
  });

  it('lets a reader who saw the card say its answer looks wrong, once, and never asks the player who could not see it', async () => {
    const t = table();
    t.play(1, { kind: 'pass' });
    t.play(2, { kind: 'ask', question: 'q1' });
    t.play(1, { kind: 'answer', yes: false });
    t.play(3, { kind: 'answer', yes: true });
    const moved = open();
    const verdict = await screen.findByRole('region', { name: /^The card says:/ });
    await userEvent.click(within(verdict).getByRole('button', { name: 'Is this answer wrong?' }));
    // the game, whose card and which question, and nothing else
    await waitFor(() => expect(t.reports()).toEqual([{ game: 'r1', seat: 2, question: 'q1' }]));
    const thanks = await within(verdict).findByText('Thanks! We’ll take a look at this card.');
    expect(thanks).toHaveFocus();
    expect(within(verdict).queryByRole('button', { name: 'Is this answer wrong?' })).toBeNull();

    // my own question: I cannot see my card, so I am not asked whether it is wrong
    t.play(2, { kind: 'pass' });
    t.play(3, { kind: 'pass' });
    t.play(1, { kind: 'ask', question: 'q1' });
    t.play(2, { kind: 'answer', yes: false });
    t.play(3, { kind: 'answer', yes: false });
    moved();
    expect(await screen.findByText('You asked:')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Is this answer wrong?' })).toBeNull();
  });
});

describe('Ez kî me?, once the table is done', () => {
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
    expect(screen.getByRole('link', { name: 'Ez kî me?' })).toHaveAttribute('href', '/app/games/who-am-i');
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
