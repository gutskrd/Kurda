import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { WhoAmIDeal } from '@kurda/shared';
import { jsonResponse } from '../test/utils';
import { renderPlay, where } from '../play/testing';
import { forgetMpAvailability } from '../games/mpAvailability';
import { WhoAmI } from './WhoAmI';

/**
 * Who Am I? on one phone, from the way in to the end: the setup and what it
 * asks the server for (the room's size, never a name), every card shown to
 * the rest of the room only while it is held, the phone handed over, a
 * question read out, what the room said, the card's verdict, a guess that
 * misses and one that lands, the end, and another game with the same names.
 */

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  forgetMpAvailability();
});

const me = { user: { id: 'me', username: 'ada', displayName: 'Ada', email: 'a@example.com', emailVerified: true } };
type Call = { url: string; method: string; body: unknown };

// stand-in words for the cards and the questions, never shown to a learner
const QUESTIONS = [
  { id: 'q1', ku: 'Ew dikare bifire?', meanings: { en: 'Can it fly?' }, fact: 'can-fly' },
  { id: 'q2', ku: 'Ew li malê tê dîtin?', meanings: { en: 'Do you find it at home?' }, fact: 'at-home' },
];
const CARDS: Record<string, { word: string; en: string; facts: Record<string, boolean> }> = {
  cat: { word: 'pisîk', en: 'cat', facts: { 'can-fly': false, 'at-home': true } },
  bird: { word: 'çûk', en: 'bird', facts: { 'can-fly': true, 'at-home': false } },
  dog: { word: 'kûçik', en: 'dog', facts: { 'can-fly': false, 'at-home': true } },
  fish: { word: 'masî', en: 'fish', facts: {} },
  horse: { word: 'hesp', en: 'horse', facts: {} },
};

/** A card for one player: who it is, and the tiles it could be, none of them another player's card. */
function deal(who: string): WhoAmIDeal {
  const card = (id: string) => ({ id: `i-${id}`, word: CARDS[id]!.word, meanings: { en: CARDS[id]!.en }, category: 'animal' });
  return { identity: { ...card(who), key: who, level: 1, facts: CARDS[who]!.facts }, candidates: [card(who), card('fish'), card('horse')], questions: QUESTIONS };
}
const DEALS = [deal('cat'), deal('bird'), deal('dog')];

const offer = (difficulties: string[]) => ({
  '/games/who-am-i/couch?dialect=kmr': { dialect: 'kmr', difficulties },
  '/games/who-am-i/couch?dialect=ckb': { dialect: 'ckb', difficulties: [] },
});

/** A signed-in reader, and a server that offers the game in Kurmancî and deals a card for every player asked for. */
function serve(routes: Record<string, unknown> = {}): Call[] {
  const calls: Call[] = [];
  const all: Record<string, unknown> = {
    ...offer(['beginner', 'intermediate']),
    'POST /games/who-am-i/couch/deal': (body: { difficulty: string; players: number }) => ({ dialect: 'kmr', difficulty: body.difficulty, deals: DEALS.slice(0, body.players) }),
    ...routes,
  };
  localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const body: unknown = init?.body ? JSON.parse(init.body as string) : null;
      calls.push({ url, method, body });
      const key = Object.keys(all).find((k) => {
        const [m, path] = k.includes(' ') ? k.split(' ') : ['GET', k];
        return m === method && url.includes(path!);
      });
      if (key) {
        const route = all[key];
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

const deals = (calls: Call[]): Call[] => calls.filter((c) => c.url.includes('/games/who-am-i/couch/deal'));

/** The setup filled in with these names, and the cards dealt. */
async function start(names: string[]): Promise<void> {
  const boxes = await screen.findAllByRole('textbox');
  for (let i = boxes.length; i < names.length; i++) await userEvent.click(screen.getByRole('button', { name: 'Add a player' }));
  const all = screen.getAllByRole('textbox');
  for (const [i, name] of names.entries()) await userEvent.type(all[i]!, name);
  await userEvent.click(screen.getByRole('button', { name: 'Deal the cards' }));
}

/** One player's card held up for the rest of the room, read while the button is held, and hidden again. Answers what it said. */
async function lookAt(name: string): Promise<string> {
  const hold = await screen.findByRole('button', { name: `Hold to show ${name}’s card` });
  const card = screen.getByRole('figure', { name: `${name}’s card` });
  fireEvent.pointerDown(hold);
  const text = card.textContent ?? '';
  fireEvent.pointerUp(hold);
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  return text;
}

const open = () => renderPlay(<WhoAmI />, { route: '/app/games/who-am-i?couch=1' });

/** What the phone last told a screen reader. */
const said = (): string => document.querySelector('.wa-couch > [aria-live="polite"]')?.textContent ?? '';

/** The headline a Kurdish word stands in ("You are pisîk!"), found by the word, which is marked as Kurdish inside it. */
async function headlineWith(word: string): Promise<HTMLElement> {
  const marked = await screen.findByText(word, { selector: 'h2 .wa-word' });
  expect(marked).toHaveAttribute('lang', 'ku');
  return marked.closest('h2')!;
}

describe('Who Am I? on one phone, the setup', () => {
  it('takes two to six names and a level from the offer, and asks for a card for each by the room’s size alone', async () => {
    const calls = serve();
    open();
    // two players to begin with, each a box with its number for a name
    const boxes = await screen.findAllByRole('textbox');
    expect(boxes.map((b) => b.getAttribute('aria-label'))).toEqual(['Player 1', 'Player 2']);
    expect(boxes[0]).toHaveAttribute('maxlength', '14');
    expect(screen.queryByRole('button', { name: /^Remove/ })).toBeNull();
    for (let i = 0; i < 4; i++) await userEvent.click(screen.getByRole('button', { name: 'Add a player' }));
    expect(screen.getAllByRole('textbox')).toHaveLength(6);
    expect(screen.queryByRole('button', { name: 'Add a player' })).toBeNull();
    for (const n of [6, 5, 4]) await userEvent.click(screen.getByRole('button', { name: `Remove Player ${n}` }));
    expect(screen.getAllByRole('textbox')).toHaveLength(3);

    // the levels the reviewed cards fill, and no clock to set: the phone waits for the room
    const level = screen.getByRole('radiogroup', { name: 'Difficulty' });
    expect(within(level).getByRole('radio', { name: 'Beginner' })).toBeChecked();
    await userEvent.click(within(level).getByRole('radio', { name: 'Intermediate' }));
    expect(screen.queryByRole('radiogroup', { name: 'Longest game' })).toBeNull();
    expect(screen.getByText('A game for the room: it earns no XP.')).toBeInTheDocument();

    // two players of one name could not be told apart
    const all = screen.getAllByRole('textbox');
    await userEvent.type(all[0]!, 'Azad');
    await userEvent.type(all[1]!, 'azad');
    await userEvent.click(screen.getByRole('button', { name: 'Deal the cards' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Two players have the same name.');
    expect(deals(calls)).toHaveLength(0);

    await userEvent.clear(all[1]!);
    await userEvent.type(all[1]!, 'Berfîn');
    await userEvent.click(screen.getByRole('button', { name: 'Deal the cards' }));
    // the third box was left empty: it plays under the name on it
    expect(await screen.findByText('Card 1 of 3')).toBeInTheDocument();
    expect(deals(calls)).toHaveLength(1);
    expect(deals(calls)[0]!.method).toBe('POST');
    expect(deals(calls)[0]!.body).toEqual({ dialect: 'kmr', difficulty: 'intermediate', players: 3 });
    expect(JSON.stringify(calls)).not.toContain('Azad');
    expect(JSON.stringify(calls)).not.toContain('Berfîn');
  });

  it('says so when the room cannot be dealt, and keeps what was typed', async () => {
    serve({ 'POST /games/who-am-i/couch/deal': { status: 409, body: { code: 'GAME_UNAVAILABLE', message: 'not enough identities' } } });
    open();
    await start(['Azad', 'Berfîn']);
    expect(await screen.findByRole('alert')).toHaveTextContent('There aren’t enough reviewed cards for this room at this level yet. Try another level or fewer players.');
    expect(screen.getAllByRole('textbox').map((b) => (b as HTMLInputElement).value)).toEqual(['Azad', 'Berfîn']);
  });

  it('says plainly when there are no cards to play with', async () => {
    serve(offer([]));
    open();
    expect(await screen.findByText('Who Am I? needs more reviewed words and questions before it can be played in this Kurdish.')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});

describe('Who Am I? on one phone, looking round', () => {
  it('shows each card to the rest of the room only while it is held, then holds nothing but a name', async () => {
    serve();
    open();
    await start(['Azad', 'Berfîn', 'Ciwan']);

    expect(await screen.findByText('Card 1 of 3')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Everyone but Azad: this is Azad’s card.' })).toBeInTheDocument();
    expect(screen.getByText('Azad, look away!')).toBeInTheDocument();
    expect(said()).toBe('Everyone but Azad: this is Azad’s card. Azad, look away!');
    const card = screen.getByRole('figure', { name: 'Azad’s card' });
    const hold = screen.getByRole('button', { name: 'Hold to show Azad’s card' });
    const next = screen.getByRole('button', { name: 'Next' });
    // nothing to read, and no going on, before the room has looked
    expect(card).toHaveTextContent('Hidden card');
    expect(document.body).not.toHaveTextContent('pisîk');
    expect(next).toBeDisabled();
    fireEvent.pointerDown(hold);
    expect(within(card).getByText('pisîk')).toHaveAttribute('lang', 'ku');
    expect(card).toHaveTextContent('cat');
    expect(next).toBeDisabled();
    fireEvent.pointerUp(hold);
    expect(document.body).not.toHaveTextContent('pisîk');
    expect(next).toBeEnabled();
    // looking away from the page hides it as well
    fireEvent.pointerDown(hold);
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    expect(document.body).not.toHaveTextContent('pisîk');
    await userEvent.click(next);

    expect(await screen.findByText('Card 2 of 3')).toBeInTheDocument();
    expect(await lookAt('Berfîn')).toContain('çûk');
    expect(await lookAt('Ciwan')).toContain('kûçik');

    // the phone goes to whoever is on turn, with no card on it
    expect(await screen.findByRole('heading', { name: 'Azad’s turn. Hand them the phone.' })).toBeInTheDocument();
    expect(said()).toBe('Azad’s turn. Hand them the phone.');
    for (const word of ['pisîk', 'çûk', 'kûçik']) expect(document.body).not.toHaveTextContent(word);
  });
});

describe('Who Am I? on one phone, a game', () => {
  it('goes from a question read out to the room’s answer, the card’s verdict, a guess, and the end', async () => {
    const calls = serve();
    open();
    await start(['Azad', 'Berfîn']);
    expect(await lookAt('Azad')).toContain('pisîk');
    expect(await lookAt('Berfîn')).toContain('çûk');

    // Azad takes the phone: his board, his own card a question mark
    await userEvent.click(await screen.findByRole('button', { name: 'I’m Azad' }));
    expect(screen.getByText('Azad’s turn', { selector: '.wa-turn-whose' })).toBeInTheDocument();
    expect(screen.getByText('Ask one question about your card, or guess if you know who you are.')).toBeInTheDocument();
    expect(screen.getAllByText('The card on your forehead').length).toBeGreaterThan(0);
    for (const el of screen.queryAllByText('pisîk')) expect(el.closest('[role="radio"]')).not.toBeNull();
    // Berfîn sits beside him: her card is not on his screen for her to glance at
    expect(document.body).not.toHaveTextContent('çûk');
    const seats = within(screen.getByRole('list', { name: 'The table' })).getAllByRole('listitem');
    expect(seats.map((li) => li.textContent)).toEqual([expect.stringContaining('Azad'), expect.stringContaining('Berfîn')]);
    expect(seats[1]).toHaveTextContent('Hidden card');
    // no clock anywhere: the phone waits for the room
    expect(screen.queryByRole('timer')).toBeNull();

    // a question picked: large, to read out, and what the room said
    await userEvent.click(screen.getAllByRole('button', { name: 'Ask' })[0]!);
    expect(await screen.findByText('Read it out loud')).toBeInTheDocument();
    const question = screen.getByRole('button', { name: 'Ew dikare bifire?' });
    expect(within(question).getByText('Ew dikare bifire?')).toHaveAttribute('lang', 'ku');
    await userEvent.click(question);
    expect(screen.getByText('Can it fly?')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'What did the room say?' })).toBeInTheDocument();
    const room = screen.getByRole('group', { name: 'What did the room say?' });
    expect(within(room).getByRole('button', { name: 'Erê yes' })).toBeInTheDocument();
    await userEvent.click(within(room).getByRole('button', { name: 'Na no' }));

    // the card says which it is, and whether the room was right
    const verdict = await screen.findByRole('region', { name: /^The card says:/ });
    expect(within(verdict).getByText('Na')).toHaveAttribute('lang', 'ku');
    expect(within(verdict).getByText('The room was right: +1 for everyone who answered.')).toBeInTheDocument();
    expect(said()).toBe('The card says: Na');
    expect(screen.getByText(/Points if you guess now: 9/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ask' })).toBeNull();

    // a guess that misses: it says so, and how many are left
    await userEvent.click(screen.getByRole('radio', { name: /masî/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Guess' }));
    expect(await screen.findByText('masî', { selector: '.wa-word' })).toHaveAttribute('lang', 'ku');
    expect(screen.getByText('masî', { selector: '.wa-word' }).parentElement).toHaveTextContent('Not masî.');
    expect(screen.getByRole('heading', { name: 'Guesses left: 1' })).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('pisîk');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));

    // Berfîn's turn: she passes it on without asking
    expect(await screen.findByRole('heading', { name: 'Berfîn’s turn. Hand them the phone.' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'I’m Berfîn' }));
    expect(screen.getByText('Berfîn’s turn', { selector: '.wa-turn-whose' })).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('pisîk');
    await userEvent.click(screen.getByRole('button', { name: 'Pass the turn on' }));

    // Azad again: the answer is on his question, the wrong tile crossed out, and this guess lands
    await userEvent.click(await screen.findByRole('button', { name: 'I’m Azad' }));
    expect(within(screen.getByRole('region', { name: 'Ask a question' })).getByText('Na')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'masî, Not this one' })).toBeDisabled();
    await userEvent.click(screen.getByRole('radio', { name: /pisîk/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Guess' }));
    expect(await headlineWith('pisîk')).toHaveTextContent('You are pisîk!');
    expect(screen.getByRole('figure', { name: 'Azad’s card' })).toHaveTextContent('cat');
    // ten, less one question and one wrong guess
    expect(screen.getByText('Points: 6')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));

    // Berfîn finds hers outright, with the point for the room's right answer on top
    await userEvent.click(await screen.findByRole('button', { name: 'I’m Berfîn' }));
    // Azad's card is off now, so it is on the table for all to read
    expect(within(screen.getByRole('list', { name: 'The table' })).getAllByRole('listitem')[0]).toHaveTextContent('pisîk');
    await userEvent.click(screen.getByRole('radio', { name: /çûk/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Guess' }));
    expect(await headlineWith('çûk')).toHaveTextContent('You are çûk!');
    expect(screen.getByText('Points: 11')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));

    // the end: who everyone was, the points, and the ways on
    expect(await screen.findByRole('heading', { name: 'Game over' })).toBeInTheDocument();
    expect(screen.getByText('Every card is off: the game is over.')).toBeInTheDocument();
    const reveal = screen.getByRole('region', { name: 'Who everyone was' });
    expect(within(reveal).getByText('pisîk')).toHaveAttribute('lang', 'ku');
    expect(within(reveal).getByText('çûk')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Results' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringMatching(/^1.*Berfîn.*Points: 11/),
      expect.stringMatching(/^2.*Azad.*Points: 6/),
    ]);
    expect(screen.getByRole('link', { name: 'Finish' })).toHaveAttribute('href', '/app/games/who-am-i');
    // the game is over: leaving it loses nothing, so nothing is asked
    expect(screen.queryByRole('button', { name: 'Leave the game' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Back to games' })).toHaveAttribute('href', '/app/games');

    // again: the same names, a new deal
    await userEvent.click(screen.getByRole('button', { name: 'Play again' }));
    expect(await screen.findByRole('heading', { name: 'Everyone but Azad: this is Azad’s card.' })).toBeInTheDocument();
    expect(screen.getByText('Card 1 of 2')).toBeInTheDocument();
    expect(deals(calls).map((c) => c.body)).toEqual([
      { dialect: 'kmr', difficulty: 'beginner', players: 2 },
      { dialect: 'kmr', difficulty: 'beginner', players: 2 },
    ]);
    expect(JSON.stringify(calls)).not.toContain('Azad');
  });

  it('says when the room answered wrong, and puts a player out at the second wrong guess', async () => {
    serve();
    open();
    await start(['Azad', 'Berfîn']);
    await lookAt('Azad');
    await lookAt('Berfîn');
    await userEvent.click(await screen.findByRole('button', { name: 'I’m Azad' }));
    await userEvent.click(screen.getAllByRole('button', { name: 'Ask' })[0]!);
    // a cat does not fly, whatever the room says
    await userEvent.click(await screen.findByRole('button', { name: 'Erê yes' }));
    const verdict = await screen.findByRole('region', { name: /^The card says:/ });
    expect(within(verdict).getByText('Na')).toBeInTheDocument();
    expect(within(verdict).getByText('The room was wrong: no points for this answer.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: /masî/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Guess' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Next' }));
    await userEvent.click(await screen.findByRole('button', { name: 'I’m Berfîn' }));
    await userEvent.click(screen.getByRole('button', { name: 'Pass the turn on' }));
    await userEvent.click(await screen.findByRole('button', { name: 'I’m Azad' }));
    await userEvent.click(screen.getByRole('radio', { name: /hesp/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Guess' }));
    // out: the card comes off, and is worth nothing
    expect(await screen.findByText('Out of guesses')).toBeInTheDocument();
    expect(await headlineWith('pisîk')).toHaveTextContent('You were pisîk.');
    expect(screen.getByText('Points: 0')).toBeInTheDocument();
  });

  it('asks before it lets a game go, from the way back and from Leave the game', async () => {
    serve();
    open();
    // before a game there is nothing to lose: the way back is a plain link
    await screen.findAllByRole('textbox');
    expect(screen.getByRole('link', { name: 'Back to games' })).toHaveAttribute('href', '/app/games');
    await start(['Azad', 'Berfîn']);
    await screen.findByText('Card 1 of 2');

    await userEvent.click(screen.getByRole('button', { name: 'Back to games' }));
    const asked = await screen.findByRole('dialog', { name: 'Leave this game?' });
    expect(within(asked).getByText('The cards and the points of this game will be lost.')).toBeInTheDocument();
    await userEvent.click(within(asked).getByRole('button', { name: 'Keep playing' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByText('Card 1 of 2')).toBeInTheDocument();
    expect(where()).toBe('/app/games/who-am-i?couch=1');

    await userEvent.click(screen.getByRole('button', { name: 'Leave the game' }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Leave this game?' })).getByRole('button', { name: 'Leave the game' }));
    await waitFor(() => expect(where()).toBe('/app/games/who-am-i'));
  });

  it('remembers the names on this phone for the next game', async () => {
    serve();
    const first = open();
    await start(['Azad', 'Berfîn', 'Ciwan']);
    await screen.findByText('Card 1 of 3');
    first.unmount();
    open();
    await waitFor(() => expect(screen.getAllByRole('textbox').map((b) => (b as HTMLInputElement).value)).toEqual(['Azad', 'Berfîn', 'Ciwan']));
  });
});
