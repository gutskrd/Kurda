// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', async () => ({ ...(await import('../reports/testing/svg')), SvgXml: () => null }));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('expo-notifications', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('@react-native-community/netinfo', () => import('../reports/testing/netinfo'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
// the server's word that a game moved on: a test says it by calling every listener, as the connection would
const events = vi.hoisted(() => ({ listeners: [] as Array<(ev: unknown) => void> }));
vi.mock('../realtime/useUserEvents', () => ({
  useUserEvents: (listener: (ev: unknown) => void) => {
    events.listeners.push(listener);
  },
}));
vi.mock('../realtime/RealtimeProvider', () => ({
  useRealtimeState: () => 'open',
  useRealtimeReconnect: () => undefined,
  useRealtime: () => null,
  useRealtimeListener: () => undefined,
}));
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { whoAmITableRules as R, type GameDifficulty, type WhoAmIDeal, type WhoAmIIdentity, type WhoAmITableMove, type WhoAmITableState } from '@kurda/shared';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fail, fakeClient, ok, testAuth } from '../reports/testing/auth';
import { rememberCourseDialect, resetCourseDialect } from '../learn/courseDialect';
import { forgetMpAvailability } from '../games/mpAvailability';
import { WhoAmIScreen } from './WhoAmIScreen';

/**
 * Who Am I? on the phone: the start with its two ways (one phone first, with
 * friends online the quieter second) and what each is offered on, and the
 * room with friends played through the game's own rules, from the side of the
 * one asking (the suggested questions first in their list, and for a beginner
 * each with what it means) and of one answering. The table behind the fake
 * server is the real one (shared rules), so every board a test reads is a
 * board the server would send that seat, its own card left out.
 */

patchReactNativeWeb({ reduceMotion: true });

beforeEach(() => {
  localStorage.clear();
  resetCourseDialect();
  testAuth.user = { ...testAuth.user, guest: false };
});
afterEach(() => {
  cleanup();
  forgetMpAvailability();
  events.listeners.length = 0;
});

// stand-in words for the cards and the questions, never shown to a learner
const animal = (id: string, word: string, facts: Record<string, boolean>): WhoAmIIdentity => ({
  id,
  key: `w:${id}`,
  level: 1,
  word,
  meanings: { en: id },
  category: 'animal',
  facts: { alive: true, animal: true, ...facts },
});
const CAT = animal('cat', 'pisîk', { 'can-fly': false, 'four-legs': true });
const BIRD = animal('bird', 'çûk', { 'can-fly': true, 'four-legs': false });
const HORSE = animal('horse', 'hesp', { 'can-fly': false, 'four-legs': true });
const QUESTIONS: WhoAmIDeal['questions'] = [
  { id: 'fly', ku: 'Ew dikare bifire?', meanings: { en: 'Can it fly?' }, fact: 'can-fly' },
  { id: 'legs', ku: 'Çar lingên wê hene?', meanings: { en: 'Does it walk on four legs?' }, fact: 'four-legs' },
];
// a question every animal answers the same way: once the card says it is an animal there is nothing to learn from it, so it is never suggested
const ALIVE: WhoAmIDeal['questions'][number] = { id: 'alive', ku: 'Ew zindî ye?', meanings: { en: 'Is it alive?' }, fact: 'alive' };
/** A card dealt among two others that are nobody else's card, as the server deals a table. */
const deal = (identity: WhoAmIIdentity, others: WhoAmIIdentity[], questions = QUESTIONS): WhoAmIDeal => ({
  identity,
  candidates: [others[0]!, identity, others[1]!].map(({ id, word, meanings, category }) => ({ id, word, meanings, category })),
  questions,
});
const DEALS = [
  deal(CAT, [animal('dog', 'kûçik', {}), animal('cow', 'çêlek', {})]),
  deal(BIRD, [animal('fish', 'masî', {}), animal('duck', 'werdek', {})]),
  deal(HORSE, [animal('donkey', 'ker', {}), animal('camel', 'hêştir', {})]),
];
const NAMES = ['Azad', 'Rojda', 'Baran'];

/**
 * A table of three behind a fake server: seat 1 wears the cat, seat 2 the
 * bird, seat 3 the horse. The reader sits on `me`; their moves go through the
 * rules as the server would put them, and the others move by `other`.
 */
function tableServer(me: number, deals: WhoAmIDeal[] = DEALS, difficulty: GameDifficulty = 'beginner') {
  let state: WhoAmITableState = R.init(
    { dialect: 'kmr', minutes: 10, difficulty, deals: deals.map((d, i) => ({ seat: i + 1, deal: d })) },
    deals.map((_, i) => ({ seat: i + 1, team: null, bot: null })),
    { now: Date.now(), seed: 'r' },
  );
  let version = 1;
  const view = () => {
    version += 1;
    const finished = R.finished(state);
    return {
      id: 'r1',
      game: 'who-am-i',
      mode: 'group',
      status: finished ? 'finished' : 'active',
      version,
      serverNow: new Date().toISOString(),
      dialect: 'kmr',
      settings: { dialect: 'kmr', minutes: 10, difficulty },
      access: 'friends',
      code: null,
      rated: { rated: false, counts: null, friendlyReason: null, damped: false },
      minPlayers: 2,
      maxPlayers: 6,
      teams: 0,
      isHost: me === 1,
      canControl: me === 1,
      createdBy: me === 1 ? 'me' : 'seat:1',
      nextLobbyId: null,
      players: deals.map((_, i) => ({
        seat: i + 1,
        userId: i + 1 === me ? 'me' : `seat:${i + 1}`,
        name: NAMES[i]!,
        avatarUrl: null,
        isMe: i + 1 === me,
        isHost: i === 0,
        gone: false,
        away: false,
        team: null,
        bot: null,
      })),
      me: { seat: me, team: null },
      startedAt: new Date().toISOString(),
      finishedAt: finished ? new Date().toISOString() : null,
      results: finished ? R.places(state).map((p) => ({ seat: p.seat, place: p.place, score: p.score, xpAwarded: null })) : null,
      board: R.viewFor(state, me),
    };
  };
  const client = fakeClient({
    'GET /play/invites': ok({ incoming: [], outgoing: [] }),
    'GET /play/who-am-i/r1/rematch': fail({ status: 404 }),
    'GET /mp/who-am-i/r1': () => ok(view()),
    'POST /mp/who-am-i/r1/moves': (body) => {
      const applied = R.apply(state, me, body as WhoAmITableMove, Date.now());
      if (!applied.ok) return fail({ status: 409, code: 'MOVE_REFUSED', details: { reason: applied.reason } });
      state = applied.state;
      return ok({ view: view(), outcome: applied.outcome });
    },
  });
  /** The server says the game moved on, and the room reads it again. */
  const told = async (): Promise<void> => {
    await act(async () => {
      for (const listener of [...events.listeners]) listener({ type: 'play_changed', game: 'who-am-i', lobbyId: 'r1' });
    });
  };
  return {
    client,
    /** somebody else at the table moves */
    async other(seat: number, move: WhoAmITableMove): Promise<void> {
      const applied = R.apply(state, seat, move, Date.now());
      if (!applied.ok) throw new Error(applied.reason);
      state = applied.state;
      await told();
    },
    /** a seat's time to answer runs out */
    async late(seat: number): Promise<void> {
      state = R.timeout(state, [seat], Date.now());
      await told();
    },
    moves: () => client.calls.filter((c) => c.method === 'POST' && c.path.endsWith('/moves')).map((c) => c.body),
  };
}

const table = (): HTMLElement => screen.getByLabelText('The table');
const press = (name: string | RegExp): void => {
  fireEvent.click(screen.getByRole('button', { name }));
};

const offered = (difficulties: string[] = ['beginner'], group = true, dialect: 'kmr' | 'ckb' = 'kmr') => ({
  [`GET /games/who-am-i/couch?dialect=${dialect}`]: ok({ dialect, difficulties }),
  'GET /mp/who-am-i/availability': ok({ dialects: [{ dialect, group, solo: false, difficulties: group ? ['beginner'] : [] }] }),
});

describe('the start', () => {
  it('offers the game on this phone first and with friends online after it, the hidden card on Hevalo’s forehead, and no way to play alone', async () => {
    testAuth.client = fakeClient(offered());
    renderWithProviders(<WhoAmIScreen onExit={() => undefined} />);
    const phone = await screen.findByRole('heading', { name: 'On this phone' });
    expect(screen.getByText('Pass one phone round the room. 2 to 6 players.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Play on this phone' })).toBeTruthy();
    const online = screen.getByRole('heading', { name: 'With friends online' });
    expect(screen.getByText('Everyone on their own screen. 2 to 6 players.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Invite friends' })).toBeTruthy();
    // one phone is the main way in: it comes before the way with friends
    expect(phone.compareDocumentPosition(online) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByLabelText('The card on your forehead')).toBeTruthy();
    // what the game is, in two short sentences
    expect(
      screen.getByText('There is a card on your forehead that only your friends can read. Ask yes-or-no questions in Kurdish to find out who you are.'),
    ).toBeTruthy();
    expect(screen.queryByText('On your own')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Play' })).toBeNull();

    // how it scores is there for whoever asks, folded away until they do
    expect(screen.queryByText(/^Your own card is worth/)).toBeNull();
    press('How it scores');
    expect(await screen.findByText('Your own card is worth 10 points, minus 1 for every question you ask and 3 for every wrong guess.')).toBeTruthy();
    expect(screen.getByText('Every right answer you give about a friend’s card: +1.')).toBeTruthy();
    expect(screen.getByText('After 2 wrong guesses you are out, but you keep answering for the others.')).toBeTruthy();
  });

  it('offers only the way that can be played: one phone where its cards are, friends where the room is', async () => {
    testAuth.client = fakeClient(offered([], true));
    renderWithProviders(<WhoAmIScreen onExit={() => undefined} />);
    expect(await screen.findByRole('heading', { name: 'With friends online' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'On this phone' })).toBeNull();
    cleanup();
    forgetMpAvailability();

    testAuth.client = fakeClient(offered(['beginner'], false));
    renderWithProviders(<WhoAmIScreen onExit={() => undefined} />);
    expect(await screen.findByRole('heading', { name: 'On this phone' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'With friends online' })).toBeNull();
  });

  it('says so plainly where the learner’s Kurdish has neither, asking in that Kurdish', async () => {
    rememberCourseDialect('sorani');
    const client = fakeClient(offered([], false, 'ckb'));
    testAuth.client = client;
    renderWithProviders(<WhoAmIScreen onExit={() => undefined} />);
    expect(await screen.findByText('Who Am I? needs more reviewed words and questions before it can be played in this Kurdish.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Play on this phone' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Invite friends' })).toBeNull();
    expect(client.calls.map((c) => c.path)).toContain('/games/who-am-i/couch?dialect=ckb');
  });

  it('opens the game for one phone from its card, and comes back to the start', async () => {
    testAuth.client = fakeClient(offered());
    renderWithProviders(<WhoAmIScreen onExit={() => undefined} />);
    press(await screen.findByRole('button', { name: 'Play on this phone' }).then(() => 'Play on this phone'));
    expect(await screen.findByRole('button', { name: 'Deal the cards' })).toBeTruthy();
    expect(screen.getByLabelText('Player 1')).toBeTruthy();
    press('Back');
    expect(await screen.findByRole('button', { name: 'Play on this phone' })).toBeTruthy();
  });

  it('opens straight on the way a card on the Games page asked for', async () => {
    testAuth.client = fakeClient(offered());
    renderWithProviders(<WhoAmIScreen way="phone" onExit={() => undefined} />);
    expect(await screen.findByRole('button', { name: 'Deal the cards' })).toBeTruthy();
    cleanup();
    forgetMpAvailability();

    // with friends: the invite sheet, asking only for a difficulty and the longest the game may run
    testAuth.client = fakeClient({
      ...offered(),
      'GET /friends?limit=500': ok({ total: 0, friends: [] }),
      'GET /play/invites': ok({ incoming: [], outgoing: [] }),
      'GET /story-games/options': ok({ canHostOpen: false }),
    });
    renderWithProviders(<WhoAmIScreen way="friends" onExit={() => undefined} />);
    const limit = await screen.findByRole('radiogroup', { name: 'Time limit' });
    expect(within(limit).getAllByRole('radio').map((r) => r.textContent)).toEqual(['5 min', '10 min', '15 min']);
    expect(within(limit).getByRole('radio', { name: '10 min' }).getAttribute('aria-checked')).toBe('true');
  });

  it('lets a guest play on one phone, and asks nothing about games with friends on their behalf', async () => {
    testAuth.user = { ...testAuth.user, guest: true };
    const client = fakeClient(offered());
    testAuth.client = client;
    renderWithProviders(<WhoAmIScreen onExit={() => undefined} />);
    expect(await screen.findByRole('button', { name: 'Play on this phone' })).toBeTruthy();
    // the way with friends is still on the start: pressing it offers the account it needs
    expect(screen.getByRole('button', { name: 'Invite friends' })).toBeTruthy();
    expect(client.calls.some((c) => c.path.startsWith('/mp/'))).toBe(false);
  });
});

describe('the room, for the one asking', () => {
  it('shows whose turn it is against the clock, everyone’s card but the reader’s own, and asks the question that was picked', async () => {
    const server = tableServer(1);
    testAuth.client = server.client;
    renderWithProviders(<WhoAmIScreen id="r1" onExit={() => undefined} />);
    expect(await screen.findByRole('heading', { name: 'Your turn' })).toBeTruthy();
    expect(screen.getByText('Ask one question, guess your card, or pass.')).toBeTruthy();
    expect(screen.getByRole('timer', { name: /^Time left: \d+ s$/ })).toBeTruthy();
    // and the game's own clock, the longest it may run
    expect(screen.getByText(/^Game time left: \d+:\d\d$/)).toBeTruthy();

    // the others' cards are on their foreheads, word and meaning; the reader's own is the hidden mark
    expect(within(table()).getByLabelText('Rojda, çûk, bird, Points: 0, Questions: 0')).toBeTruthy();
    expect(within(table()).getByLabelText('Baran, hesp, horse, Points: 0, Questions: 0')).toBeTruthy();
    expect(within(table()).getByLabelText('You, The card on your forehead, An animal, Points: 0, Questions: 0, On turn')).toBeTruthy();
    expect(within(table()).queryByText('pisîk')).toBeNull();
    // their word is on the screen once, as one tile among the others
    expect(screen.getAllByText('pisîk')).toHaveLength(1);
    expect(screen.getByRole('radio', { name: 'pisîk' })).toBeTruthy();

    // a beginner reads what each question means under it, with nothing to tap first; Ask asks it
    expect(screen.getByText('Can it fly?')).toBeTruthy();
    expect(screen.getByText('Does it walk on four legs?')).toBeTruthy();
    expect(screen.queryByText('Tap a question to see what it means.')).toBeNull();
    // a question of one's own is for a room that sits together: it is never offered, or sent, online
    expect(screen.queryByRole('button', { name: 'Ask my own question' })).toBeNull();
    press('Ask: Ew dikare bifire?');
    expect(await screen.findByText('Your friends are answering.')).toBeTruthy();
    expect(server.moves()).toEqual([{ kind: 'ask', question: 'fly' }]);
    expect(screen.getByText('Your question')).toBeTruthy();
    expect(screen.getByText('Nobody has answered yet.')).toBeTruthy();
    // while it is being answered nothing of the reader's can be pressed
    expect(screen.queryByRole('button', { name: 'Guess' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Pass the turn on' })).toBeNull();
  });

  it('lists the suggested questions first under their own label, then the rest, and asks as it always did', async () => {
    // the deal puts a question that is never suggested first, so the order on the screen is the suggestions' and not the deal's
    const server = tableServer(1, [deal(CAT, [animal('dog', 'kûçik', {}), animal('cow', 'çêlek', {})], [ALIVE, ...QUESTIONS]), DEALS[1]!, DEALS[2]!]);
    testAuth.client = server.client;
    renderWithProviders(<WhoAmIScreen id="r1" onExit={() => undefined} />);
    await screen.findByRole('heading', { name: 'Your turn' });
    const asks = (): Array<string | null> => screen.getAllByRole('button', { name: /^Ask:/ }).map((b) => b.getAttribute('aria-label'));
    expect(asks()).toEqual(['Ask: Ew dikare bifire?', 'Ask: Çar lingên wê hene?', 'Ask: Ew zindî ye?']);
    const suggested = screen.getByText('Suggested');
    const others = screen.getByText('Other questions');
    const [fly, legs, alive] = screen.getAllByRole('button', { name: /^Ask:/ });
    expect(suggested.compareDocumentPosition(fly!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(legs!.compareDocumentPosition(others) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(others.compareDocumentPosition(alive!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // the Ask button and the move are what they were
    press('Ask: Ew dikare bifire?');
    await screen.findByText('Nobody has answered yet.');
    expect(server.moves()).toEqual([{ kind: 'ask', question: 'fly' }]);
    await server.other(2, { kind: 'answer', yes: false });
    await server.other(3, { kind: 'answer', yes: false });
    await screen.findByLabelText('The card says: Na');
    // round the table and back: the one still worth asking is suggested, the answered one and the foregone one are the rest
    press('Pass the turn on');
    await screen.findByRole('heading', { name: 'Rojda’s turn' });
    await server.other(2, { kind: 'pass' });
    await server.other(3, { kind: 'pass' });
    await screen.findByRole('heading', { name: 'Your turn' });
    expect(asks()).toEqual(['Ask: Çar lingên wê hene?', 'Ask: Ew zindî ye?']);
    expect(screen.getByText('Suggested')).toBeTruthy();
    expect(screen.getByText('Other questions')).toBeTruthy();
  });

  it('keeps the tap that says what a question means above beginner', async () => {
    const server = tableServer(1, DEALS, 'intermediate');
    testAuth.client = server.client;
    renderWithProviders(<WhoAmIScreen id="r1" onExit={() => undefined} />);
    await screen.findByRole('heading', { name: 'Your turn' });
    expect(screen.getByText('Tap a question to see what it means.')).toBeTruthy();
    expect(screen.queryByText('Can it fly?')).toBeNull();
    press('Ew dikare bifire?');
    expect(await screen.findByText('Can it fly?')).toBeTruthy();
  });

  it('says who has answered and never what, then the card’s own verdict with each friend marked, and takes the guess', async () => {
    const server = tableServer(1);
    testAuth.client = server.client;
    renderWithProviders(<WhoAmIScreen id="r1" onExit={() => undefined} />);
    press(await screen.findByRole('button', { name: 'Ask: Ew dikare bifire?' }).then(() => 'Ask: Ew dikare bifire?'));
    await screen.findByText('Nobody has answered yet.');

    await server.other(2, { kind: 'answer', yes: false });
    expect(await screen.findByText('Answered so far: Rojda')).toBeTruthy();
    expect(within(table()).getByLabelText(/^Rojda, .*, Answered$/)).toBeTruthy();
    expect(within(table()).getByLabelText(/^Baran, .*, Answering…$/)).toBeTruthy();
    expect(screen.queryByLabelText(/^The card says/)).toBeNull();

    // the cat does not fly, whatever the table said: Rojda was right and Baran was not
    await server.other(3, { kind: 'answer', yes: true });
    expect(await screen.findByLabelText('The card says: Na')).toBeTruthy();
    expect(screen.getByLabelText('Rojda: Na, Right')).toBeTruthy();
    expect(screen.getByLabelText('Baran: Erê, Wrong')).toBeTruthy();
    expect(screen.getByText('The card has answered. Guess, or pass the turn on.')).toBeTruthy();
    expect(screen.getByText(/Points if you guess now: 9/)).toBeTruthy();
    expect(within(table()).queryByText('pisîk')).toBeNull();

    // a wrong tile is crossed out and said; the card stays on the forehead
    fireEvent.click(screen.getByRole('radio', { name: 'kûçik' }));
    press('Guess');
    expect(await screen.findByText('No, you are not kûçik.')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'kûçik, Not this one' })).toBeTruthy();
    expect(screen.getByText(/Guesses left: 1/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Rojda’s turn' })).toBeTruthy();
    expect(within(table()).queryByText('pisîk')).toBeNull();

    // round the table and back; the right tile takes the card off the forehead
    await server.other(2, { kind: 'pass' });
    await server.other(3, { kind: 'pass' });
    await screen.findByRole('heading', { name: 'Your turn' });
    fireEvent.click(screen.getByRole('radio', { name: 'pisîk' }));
    press('Guess');
    expect(await screen.findByRole('heading', { name: 'You are pisîk!' })).toBeTruthy();
    expect(screen.getByText('Keep answering for the others.')).toBeTruthy();
    expect(within(table()).getByLabelText('You, pisîk, cat, Points: 6, Questions: 1, Got it')).toBeTruthy();
    expect(server.moves()).toEqual([
      { kind: 'ask', question: 'fly' },
      { kind: 'guess', tile: 'dog' },
      { kind: 'guess', tile: 'cat' },
    ]);
  });

  it('passes the turn on, and offers no pass once every question has been asked', async () => {
    const server = tableServer(1, [deal(CAT, [animal('dog', 'kûçik', {}), animal('cow', 'çêlek', {})], QUESTIONS.slice(0, 1)), DEALS[1]!, DEALS[2]!]);
    testAuth.client = server.client;
    renderWithProviders(<WhoAmIScreen id="r1" onExit={() => undefined} />);
    press(await screen.findByRole('button', { name: 'Pass the turn on' }).then(() => 'Pass the turn on'));
    expect(await screen.findByRole('heading', { name: 'Rojda’s turn' })).toBeTruthy();
    expect(screen.getByText('Rojda is choosing a question.')).toBeTruthy();
    expect(server.moves()).toEqual([{ kind: 'pass' }]);
    // not the reader's turn: their list is there to think with, and nothing on it can be pressed
    expect(screen.getByRole('heading', { name: 'Your questions' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Ask:/ })).toBeNull();

    await server.other(2, { kind: 'pass' });
    await server.other(3, { kind: 'pass' });
    press(await screen.findByRole('button', { name: 'Ask: Ew dikare bifire?' }).then(() => 'Ask: Ew dikare bifire?'));
    await screen.findByText('Nobody has answered yet.');
    await server.other(2, { kind: 'answer', yes: false });
    await server.other(3, { kind: 'answer', yes: false });
    expect(await screen.findByText('You have asked every question. Now you have to guess.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Guess' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Pass the turn on' })).toBeNull();
  });
});

describe('the room, for one answering', () => {
  it('puts the question and the asker’s card in front, takes yes or no once, and never shows the reader their own card', async () => {
    const server = tableServer(2);
    testAuth.client = server.client;
    renderWithProviders(<WhoAmIScreen id="r1" onExit={() => undefined} />);
    expect(await screen.findByRole('heading', { name: 'Azad’s turn' })).toBeTruthy();
    expect(screen.getByText('Azad is choosing a question.')).toBeTruthy();
    // waiting, the reader has their own list and tiles, and nothing on them to press
    expect(screen.queryByRole('button', { name: /^Ask:/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Guess' })).toBeNull();

    await server.other(1, { kind: 'ask', question: 'fly' });
    expect(await screen.findByText('Answer Azad’s question.')).toBeTruthy();
    expect(screen.getByText('Azad asks about their card:')).toBeTruthy();
    expect(screen.getByLabelText('Azad’s card: pisîk, cat')).toBeTruthy();
    // the question on the table, where a tap says what it means (the reader's own list, lower down, says it already)
    const asked = screen.getByRole('button', { name: 'Ew dikare bifire?' });
    expect(within(asked).queryByText('Can it fly?')).toBeNull();
    fireEvent.click(asked);
    expect(await within(asked).findByText('Can it fly?')).toBeTruthy();
    // the reader's own card is the hidden mark; their word is only a tile among the others
    expect(within(table()).getByLabelText(/^You, The card on your forehead, An animal, /)).toBeTruthy();
    expect(within(table()).queryByText('çûk')).toBeNull();
    expect(screen.getAllByText('çûk')).toHaveLength(1);

    press('Na');
    expect(await screen.findByText('You said: Na')).toBeTruthy();
    expect(screen.getByText('Answered. Waiting for the others.')).toBeTruthy();
    expect(server.moves()).toEqual([{ kind: 'answer', yes: false }]);
    expect(screen.queryByRole('button', { name: 'Erê' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Na' })).toBeNull();
    // nothing of the card's own answer until everyone has had their say
    expect(screen.queryByLabelText(/^The card says/)).toBeNull();

    // Baran's time runs out: the card answers, and the reader's right answer is a point
    await server.late(3);
    expect(await screen.findByLabelText('The card says: Na')).toBeTruthy();
    expect(screen.getByLabelText('You: Na, Right')).toBeTruthy();
    expect(screen.getByLabelText('Baran: Did not answer')).toBeTruthy();
    expect(screen.getByText('Azad is deciding: guess or pass.')).toBeTruthy();
    expect(within(table()).getByLabelText(/^You, The card on your forehead, An animal, Points: 1, /)).toBeTruthy();

    // the turn comes round: the last question stays on the table while the reader chooses theirs
    await server.other(1, { kind: 'pass' });
    expect(await screen.findByRole('heading', { name: 'Your turn' })).toBeTruthy();
    expect(screen.getByLabelText('The card says: Na')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ask: Ew dikare bifire?' })).toBeTruthy();
    expect(within(table()).queryByText('çûk')).toBeNull();
  });

  it('says so when a move comes too late to be taken', async () => {
    const server = tableServer(2);
    testAuth.client = server.client;
    renderWithProviders(<WhoAmIScreen id="r1" onExit={() => undefined} />);
    await screen.findByRole('heading', { name: 'Azad’s turn' });
    await server.other(1, { kind: 'ask', question: 'fly' });
    await screen.findByText('Answer Azad’s question.');
    // the clock ran out on the server a moment before the thumb came down
    (testAuth.client.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fail({ status: 409, code: 'MOVE_REFUSED' }));
    press('Erê');
    expect(await screen.findByText('That isn’t open right now.')).toBeTruthy();
  });

  it('keeps a player whose card is done answering for the others, their card on their own forehead', async () => {
    const server = tableServer(2);
    testAuth.client = server.client;
    renderWithProviders(<WhoAmIScreen id="r1" onExit={() => undefined} />);
    await screen.findByRole('heading', { name: 'Azad’s turn' });
    await server.other(1, { kind: 'pass' });
    await screen.findByRole('heading', { name: 'Your turn' });
    fireEvent.click(screen.getByRole('radio', { name: 'çûk' }));
    press('Guess');
    expect(await screen.findByRole('heading', { name: 'You are çûk!' })).toBeTruthy();
    expect(within(table()).getByLabelText('You, çûk, bird, Points: 10, Questions: 0, Got it')).toBeTruthy();
    // no list and no tiles any more, and still a say in the others' questions
    expect(screen.queryByRole('radio', { name: 'çûk' })).toBeNull();
    await server.other(3, { kind: 'ask', question: 'legs' });
    expect(await screen.findByLabelText('Baran’s card: hesp, horse')).toBeTruthy();
    press('Erê');
    expect(await screen.findByText('You said: Erê')).toBeTruthy();
  });
});

describe('the end of a game with friends', () => {
  it('turns every card over, says why the game ended, and lists the points', async () => {
    const server = tableServer(1);
    testAuth.client = server.client;
    renderWithProviders(<WhoAmIScreen id="r1" onExit={() => undefined} />);
    await screen.findByRole('heading', { name: 'Your turn' });
    fireEvent.click(screen.getByRole('radio', { name: 'pisîk' }));
    press('Guess');
    await screen.findByRole('heading', { name: 'You are pisîk!' });
    await server.other(2, { kind: 'guess', tile: 'bird' });
    await server.other(3, { kind: 'guess', tile: 'horse' });
    expect(await screen.findByRole('heading', { name: 'Who everyone was' })).toBeTruthy();
    expect(within(table()).getByLabelText('You, pisîk, cat, Points: 10, Questions: 0, Got it')).toBeTruthy();
    expect(within(table()).getByLabelText('Rojda, çûk, bird, Points: 10, Questions: 0, Got it')).toBeTruthy();
    expect(within(table()).getByLabelText('Baran, hesp, horse, Points: 10, Questions: 0, Got it')).toBeTruthy();
    expect(screen.getByText('Nobody is left guessing.')).toBeTruthy();
    expect(screen.getAllByText('Points: 10')).toHaveLength(3);
    await waitFor(() => expect(screen.queryByRole('timer')).toBeNull());
  });
});
