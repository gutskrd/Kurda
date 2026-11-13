import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { WhoAmIDeal } from '@kurda/shared';
import { jsonResponse } from '../test/utils';
import { renderPlay, where } from '../play/testing';
import { forgetMpAvailability } from '../games/mpAvailability';
import { WhoAmI } from './WhoAmI';

/**
 * Ez kî me? on one phone, from the way in to the end: the setup and what it
 * asks the server for (the room's size, never a name), the phone handed
 * straight to the first player with no card to memorise and no words to
 * choose from, a suggested question picked in one tap and read out, the phone
 * turned to the friends who see the card and tap the answer themselves, the
 * card gone again and its verdict, a question of a player's own asked out
 * loud, a guess said out loud that the friends judge, one that misses and one
 * that lands, the end, and another game with the same names.
 */

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  forgetMpAvailability();
});

const me = { user: { id: 'me', username: 'ada', displayName: 'Ada', email: 'a@example.com', emailVerified: true } };
type Call = { url: string; method: string; body: unknown };

// Stand-in words for the cards and the questions, never shown to a learner. Every tile is an animal, so the rules
// suggest the two questions about animals and leave out the one whose answer follows from the kind on the card.
const QUESTIONS = [
  { id: 'q1', ku: 'Ew dikare bifire?', meanings: { en: 'Can it fly?' }, fact: 'can-fly' },
  { id: 'q2', ku: 'Ew li malê tê dîtin?', meanings: { en: 'Do you find it at home?' }, fact: 'at-home' },
  { id: 'q3', ku: 'Ew cihek e?', meanings: { en: 'Is it a place?' }, fact: 'place' },
];
const CARDS: Record<string, { word: string; en: string; facts: Record<string, boolean> }> = {
  cat: { word: 'pisîk', en: 'cat', facts: { 'can-fly': false, 'at-home': true, place: false } },
  bird: { word: 'çûk', en: 'bird', facts: { 'can-fly': true, 'at-home': false, place: false } },
  dog: { word: 'kûçik', en: 'dog', facts: { 'can-fly': false, 'at-home': true, place: false } },
  fish: { word: 'masî', en: 'fish', facts: {} },
  horse: { word: 'hesp', en: 'horse', facts: {} },
};
const WORDS = ['pisîk', 'çûk', 'kûçik'];

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

const open = () => renderPlay(<WhoAmI />, { route: '/app/games/who-am-i?couch=1' });

/** What the phone last told a screen reader. */
const said = (): string => document.querySelector('.wa-couch > [aria-live="polite"]')?.textContent ?? '';

/** The headline a Kurdish word stands in ("You are pisîk!"), found by the word, which is marked as Kurdish inside it. */
async function headlineWith(word: string): Promise<HTMLElement> {
  const marked = await screen.findByText(word, { selector: 'h2 .wa-word' });
  expect(marked).toHaveAttribute('lang', 'ku');
  return marked.closest('h2')!;
}

/** The phone taken by whoever it is handed to: their board. */
async function take(name: string): Promise<void> {
  await userEvent.click(await screen.findByRole('button', { name: `I’m ${name}` }));
  expect(await screen.findByRole('heading', { name: `${name}, who are you?` })).toBeInTheDocument();
}

/**
 * The phone turned to the friends. The way there takes no tap in its first moment on the screen (a double tap on the
 * board must not run on into the card), so the tap is made until it is taken.
 */
async function turnToFriends(): Promise<void> {
  const button = await screen.findByRole('button', { name: 'Friends: tap here' });
  await waitFor(async () => {
    await userEvent.click(button);
    expect(screen.queryByRole('button', { name: 'Friends: tap here' })).toBeNull();
  });
}

/** A suggested question picked, read out, and the phone turned to the friends, who tap this answer. */
async function askSuggested(question: RegExp, answer: 'Erê yes' | 'Na no'): Promise<void> {
  await userEvent.click(within(screen.getByRole('list', { name: 'Suggested' })).getByRole('button', { name: question }));
  await turnToFriends();
  await userEvent.click(await screen.findByRole('button', { name: answer }));
}

/** A guess said out loud: the holder says they know, turns the phone round, and the friends tap whether that is it. */
async function sayWho(verdict: 'Yes, that’s it!' | 'Not yet'): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: 'I know who I am!' }));
  await turnToFriends();
  await userEvent.click(await screen.findByRole('button', { name: verdict }));
}

/** No card is on the screen, and nothing that names one: no player's word is anywhere on the page. */
function expectNoCard(): void {
  expect(screen.queryByRole('figure', { name: /’s card$/ })).toBeNull();
  for (const word of WORDS) expect(document.body).not.toHaveTextContent(word);
}

/** Nothing lists who the holder could be: no tiles to pick from and no Guess to press, only the way to say they know. */
function expectNoChoices(): void {
  expect(screen.queryByRole('radiogroup')).toBeNull();
  expect(screen.queryByRole('radio')).toBeNull();
  expect(screen.queryByText('You are one of these')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Guess' })).toBeNull();
  for (const word of ['masî', 'hesp']) expect(document.body).not.toHaveTextContent(word);
  expect(screen.getByRole('button', { name: 'I know who I am!' })).toBeInTheDocument();
}

describe('Ez kî me? on one phone, the setup', () => {
  it('says how a turn goes in three steps, takes two to six names and a level, and asks for a card for each by the room’s size alone', async () => {
    const calls = serve();
    open();
    // two players to begin with, each a box with its number for a name
    const boxes = await screen.findAllByRole('textbox');
    expect(boxes.map((b) => b.getAttribute('aria-label'))).toEqual(['Player 1', 'Player 2']);
    expect(boxes[0]).toHaveAttribute('maxlength', '14');
    // how a turn goes, as three short lines above the form
    expect(within(screen.getAllByRole('list')[0]!).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Pick a question and read it out loud.',
      'Turn the phone to your friends: they see your card and answer.',
      'Say who you are when you know. Fewer questions, more points.',
    ]);
    // in one room, with nothing to pick from, one more miss is allowed than at a table online
    expect(screen.getByText(/^After 3 wrong guesses you are out/)).toBeInTheDocument();
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
    expect(await screen.findByRole('heading', { name: 'Azad’s turn. Hand them the phone.' })).toBeInTheDocument();
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
    expect(await screen.findByText('Ez kî me? needs more reviewed words and questions before it can be played in this Kurdish.')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});

describe('Ez kî me? on one phone, a turn', () => {
  it('goes straight to the first player, with no card to look at or remember first', async () => {
    serve();
    open();
    await start(['Azad', 'Berfîn', 'Ciwan']);

    // the phone goes to whoever is on turn, with nothing on it but their name
    expect(await screen.findByRole('heading', { name: 'Azad’s turn. Hand them the phone.' })).toBeInTheDocument();
    expect(said()).toBe('Azad’s turn. Hand them the phone.');
    expect(screen.queryByText(/^Card \d+ of \d+$/)).toBeNull();
    expect(screen.queryByRole('button', { name: /^Hold to show/ })).toBeNull();
    expect(screen.queryByRole('figure')).toBeNull();
    for (const word of WORDS) expect(document.body).not.toHaveTextContent(word);
  });

  it('suggests questions with what they mean, asked in one tap, and keeps the whole list folded away', async () => {
    serve();
    open();
    await start(['Azad', 'Berfîn']);
    await take('Azad');

    // the banner: who it is for, what the card may say of itself, and what a guess is worth now
    expect(said()).toBe('Azad, who are you?');
    expect(screen.getByText('An animal')).toBeInTheDocument();
    expect(screen.getByText('Points if you guess now: 10 · Guesses left: 3')).toBeInTheDocument();
    // his own card is a question mark, and nobody else's is on his screen for a neighbour to glance at
    expect(screen.getByText('The card on your forehead')).toBeInTheDocument();
    expectNoCard();
    // no clock anywhere: the phone waits for the room
    expect(screen.queryByRole('timer')).toBeNull();

    // nothing says who he could be: he finds out by asking, and says so when he knows, on a button that is not the gold one
    expectNoChoices();
    expect(screen.getByRole('button', { name: 'I know who I am!' })).toHaveClass('btn-secondary');

    // the questions worth asking: Kurdish, with the meaning under each without a tap
    const ask = screen.getByRole('region', { name: 'Ask a question' });
    const suggested = within(within(ask).getByRole('list', { name: 'Suggested' })).getAllByRole('button');
    expect(suggested.map((b) => b.textContent)).toEqual(['Ew dikare bifire? Can it fly?', 'Ew li malê tê dîtin? Do you find it at home?']);
    expect(within(suggested[0]!).getByText('Ew dikare bifire?')).toHaveAttribute('lang', 'ku');
    // the whole list is folded away until it is asked for
    const all = within(ask).getByRole('button', { name: 'All questions (3)' });
    expect(all).toHaveAttribute('aria-expanded', 'false');
    expect(within(ask).queryByRole('button', { name: 'Ask' })).toBeNull();
    expect(within(ask).queryByText('Ew cihek e?')).toBeNull();
    // nothing known yet, so nothing is listed as known
    expect(screen.queryByRole('region', { name: 'What you know so far' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Skip my turn' })).toBeInTheDocument();

    // one tap on a suggested question: it is there to read out, large, with what it means
    await userEvent.click(suggested[0]!);
    expect(await screen.findByRole('heading', { name: 'Read it out loud' })).toBeInTheDocument();
    expect(screen.getByText('Ew dikare bifire?')).toHaveAttribute('lang', 'ku');
    expect(screen.getByText('Can it fly?')).toBeInTheDocument();
    expect(screen.getByText('Now turn the phone to your friends.')).toBeInTheDocument();
    expect(said()).toBe('Read it out loud. Now turn the phone to your friends.');
    expectNoCard();

    // the way back spends nothing
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('Points if you guess now: 10 · Guesses left: 3')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'What you know so far' })).toBeNull();

    // the whole list, unfolded: every question, each with what it means at this level, and Ask
    await userEvent.click(screen.getByRole('button', { name: 'All questions (3)' }));
    const list = within(screen.getByRole('region', { name: 'Ask a question' }));
    expect(list.getByRole('button', { name: 'All questions (3)' })).toHaveAttribute('aria-expanded', 'true');
    expect(list.getByText('Ew cihek e?')).toHaveAttribute('lang', 'ku');
    expect(list.getByText('Is it a place?')).toBeInTheDocument();
    expect(list.queryByText('Tap a question to see what it means.')).toBeNull();
    expect(list.getAllByRole('button', { name: 'Ask' })).toHaveLength(3);
    // a question from the list goes the same way: read out first
    await userEvent.click(list.getAllByRole('button', { name: 'Ask' })[2]!);
    expect(await screen.findByRole('heading', { name: 'Read it out loud' })).toBeInTheDocument();
    expect(screen.getByText('Is it a place?')).toBeInTheDocument();
  });

  it('shows the friends the card beside the question, takes their answer, and hides the card again', async () => {
    serve();
    open();
    await start(['Azad', 'Berfîn']);
    await take('Azad');
    await userEvent.click(screen.getByRole('button', { name: /^Ew dikare bifire\?/ }));
    await turnToFriends();

    // the friends' screen: who Azad is, the question again, and the dialect's yes and no to tap
    expect(await screen.findByRole('heading', { name: 'Azad is…' })).toBeInTheDocument();
    const card = screen.getByRole('figure', { name: 'Azad’s card' });
    expect(within(card).getByText('pisîk')).toHaveAttribute('lang', 'ku');
    expect(card).toHaveTextContent('cat');
    expect(screen.getByText('Ew dikare bifire?')).toHaveAttribute('lang', 'ku');
    expect(screen.getByText('Can it fly?')).toBeInTheDocument();
    expect(said()).toBe('Azad is… Is it true? Tap your answer.');
    const answers = screen.getByRole('group', { name: 'Is it true? Tap your answer.' });
    expect(within(within(answers).getByRole('button', { name: 'Erê yes' })).getByText('Erê')).toHaveAttribute('lang', 'ku');
    expect(within(answers).getByRole('button', { name: 'Na no' })).toBeInTheDocument();

    // the page hidden, or another window in front: the card is gone, and the phone is back a step
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(await screen.findByRole('heading', { name: 'Read it out loud' })).toBeInTheDocument();
    expectNoCard();
    await turnToFriends();
    expect(await screen.findByRole('figure', { name: 'Azad’s card' })).toHaveTextContent('pisîk');
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    expect(await screen.findByRole('heading', { name: 'Read it out loud' })).toBeInTheDocument();
    expectNoCard();
    // nothing was asked of the rules by any of that
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('Points if you guess now: 10 · Guesses left: 3')).toBeInTheDocument();

    // the friends tap their answer: the card is off the screen at once, and the card's own verdict is on Azad's board
    await askSuggested(/^Ew dikare bifire\?/, 'Na no');
    const verdict = await screen.findByRole('region', { name: /^The card says:/ });
    expectNoCard();
    expect(within(verdict).getByText('Azad asked:')).toBeInTheDocument();
    expect(within(verdict).getByText('Can it fly?')).toBeInTheDocument();
    expect(within(verdict).getByText('Na')).toHaveAttribute('lang', 'ku');
    expect(within(verdict).getByText('Your friends got it right: +1 for each of them.')).toBeInTheDocument();
    expect(said()).toBe('The card says: Na');
    expect(screen.getByRole('heading', { name: 'Azad, who are you?' })).toBeInTheDocument();
    expect(screen.getByText('The card has answered. Guess who you are, or pass the turn on.')).toBeInTheDocument();
    expect(screen.getByText('Points if you guess now: 9 · Guesses left: 3')).toBeInTheDocument();
    // the turn is a guess or the phone passed on: nothing more to ask
    expect(screen.queryByRole('region', { name: 'Ask a question' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Skip my turn' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Next player' })).toBeInTheDocument();
    // and still no words to choose from: to say who he is, is the turn's main button now
    expectNoChoices();
    // what he knows so far: his question, what it means, and the card's answer
    const known = screen.getByRole('region', { name: 'What you know so far' });
    expect(within(known).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Ew dikare bifire? Can it fly?Na']);
  });

  it('takes no tap on the way to the friends in the screen’s first moment, so a double tap cannot turn the card up', async () => {
    serve();
    open();
    await start(['Azad', 'Berfîn']);
    await take('Azad');
    // the clock stands still from here: the second tap of a double tap comes in the same moment as the first
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    await userEvent.click(screen.getByRole('button', { name: /^Ew dikare bifire\?/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Friends: tap here' }));
    expect(screen.getByRole('heading', { name: 'Read it out loud' })).toBeInTheDocument();
    expectNoCard();
    // a moment later the same button turns the phone to the friends
    now.mockReturnValue(1_700_000_000_400);
    await userEvent.click(screen.getByRole('button', { name: 'Friends: tap here' }));
    expect(await screen.findByRole('figure', { name: 'Azad’s card' })).toHaveTextContent('pisîk');
  });

  it('says kindly when the friends answered wrong, in the dialect’s own words', async () => {
    serve();
    open();
    await start(['Azad', 'Berfîn']);
    await take('Azad');
    // a cat does not fly, whatever the friends say
    await askSuggested(/^Ew dikare bifire\?/, 'Erê yes');
    const verdict = await screen.findByRole('region', { name: /^The card says:/ });
    const line = within(verdict).getByText(/^Your friends said/);
    expect(line).toHaveTextContent('Your friends said Erê, but the card says Na.');
    for (const word of within(line).getAllByText(/^(Erê|Na)$/)) expect(word).toHaveAttribute('lang', 'ku');
    expect(within(verdict).queryByText(/right/)).toBeNull();
  });

  it('counts a question of the player’s own, asked out loud, and gives no verdict on it', async () => {
    serve();
    open();
    await start(['Azad', 'Berfîn']);
    await take('Azad');
    await userEvent.click(screen.getByRole('button', { name: 'Ask my own question' }));

    // what to do, and nothing spent yet
    expect(await screen.findByRole('heading', { name: 'Ask my own question' })).toBeInTheDocument();
    expect(screen.getByText('Ask your friends any yes-or-no question about yourself. In Kurdish if you can!')).toBeInTheDocument();
    expect(screen.getByText('Turn the phone to your friends so they can see your card.')).toBeInTheDocument();
    expect(said()).toBe('Ask your friends any yes-or-no question about yourself. In Kurdish if you can! Turn the phone to your friends so they can see your card.');
    expectNoCard();
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('Points if you guess now: 10 · Guesses left: 3')).toBeInTheDocument();

    // the friends see the card and answer out loud: nothing to tap but that they are done
    await userEvent.click(screen.getByRole('button', { name: 'Ask my own question' }));
    await turnToFriends();
    expect(await screen.findByRole('heading', { name: 'Azad is…' })).toBeInTheDocument();
    expect(screen.getByRole('figure', { name: 'Azad’s card' })).toHaveTextContent('pisîk');
    // what to say is on the screen in the dialect's own two words
    const say = screen.getByText(/^Answer Azad out loud:/);
    expect(say).toHaveTextContent('Answer Azad out loud: yes (Erê) or no (Na).');
    for (const word of within(say).getAllByText(/^(Erê|Na)$/)) expect(word).toHaveAttribute('lang', 'ku');
    expect(said()).toBe('Azad is… Answer Azad out loud: yes (Erê) or no (Na).');
    expect(screen.queryByRole('button', { name: 'Erê yes' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Done: hide the card' }));

    // back with Azad: the card is hidden, the question is counted, and the card itself said nothing
    expect(await screen.findByText('Your friends have answered. Guess who you are, or pass the phone on.', { selector: '.wa-turn-wait' })).toBeInTheDocument();
    expect(said()).toBe('Your friends have answered. Guess who you are, or pass the phone on.');
    expectNoCard();
    expect(screen.queryByRole('region', { name: /^The card says:/ })).toBeNull();
    expect(screen.getByText('Points if you guess now: 9 · Guesses left: 3')).toBeInTheDocument();
    const known = screen.getByRole('region', { name: 'What you know so far' });
    expect(within(known).getByText('Questions of your own: 1 (each takes 1 off your points)')).toBeInTheDocument();
    expect(within(known).queryByRole('listitem')).toBeNull();
    // one question to a turn, whoever wrote it
    expect(screen.queryByRole('button', { name: 'Ask my own question' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Ask a question' })).toBeNull();

    // the phone goes on, and comes back with the count still on the board
    await userEvent.click(screen.getByRole('button', { name: 'Next player' }));
    await take('Berfîn');
    await userEvent.click(screen.getByRole('button', { name: 'Skip my turn' }));
    await take('Azad');
    expect(screen.getByText('Points if you guess now: 9 · Guesses left: 3')).toBeInTheDocument();
    expect(screen.getByText('Questions of your own: 1 (each takes 1 off your points)')).toBeInTheDocument();
    // a card found after it is worth one less
    await sayWho('Yes, that’s it!');
    expect(await headlineWith('pisîk')).toHaveTextContent('You are pisîk!');
    expect(screen.getByText('Points: 9')).toBeInTheDocument();
  });

  it('opens the whole list when nothing is left to suggest, and never makes a turn a guess once every question is asked', async () => {
    serve();
    open();
    await start(['Azad', 'Berfîn']);
    // the two suggested questions, one to a turn
    for (const question of [/^Ew dikare bifire\?/, /^Ew li malê tê dîtin\?/]) {
      await take('Azad');
      await askSuggested(question, 'Na no');
      await userEvent.click(await screen.findByRole('button', { name: 'Next player' }));
      await take('Berfîn');
      await userEvent.click(screen.getByRole('button', { name: 'Skip my turn' }));
    }

    // nothing left to suggest, with a question still on the list: the board says so, and the list is open
    await take('Azad');
    expect(screen.getByText('No more suggestions. Pick from all the questions, or take a guess.')).toBeInTheDocument();
    expect(said()).toBe('Azad, who are you? No more suggestions. Pick from all the questions, or take a guess.');
    const ask = screen.getByRole('region', { name: 'Ask a question' });
    expect(within(ask).queryByRole('list', { name: 'Suggested' })).toBeNull();
    expect(within(ask).getByRole('button', { name: 'All questions (3)' })).toHaveAttribute('aria-expanded', 'true');
    // the questions asked carry the card's answer, here and under what he knows so far
    expect(within(ask).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Ew dikare bifire? Can it fly?Na', 'Ew li malê tê dîtin? Do you find it at home?Erê', 'Ew cihek e? Is it a place?Ask']);
    expect(within(screen.getByRole('region', { name: 'What you know so far' })).getAllByRole('listitem')).toHaveLength(2);

    // the last question on the list, asked: in one room the turn is still his to pass on
    await userEvent.click(within(ask).getByRole('button', { name: 'Ask' }));
    await turnToFriends();
    await userEvent.click(await screen.findByRole('button', { name: 'Na no' }));
    await screen.findByRole('region', { name: /^The card says:/ });
    expect(screen.queryByText('You have asked every question, so this turn has to be a guess.')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Next player' }));
    await take('Berfîn');
    await userEvent.click(screen.getByRole('button', { name: 'Skip my turn' }));

    // and the next one is no dead end: the board says the list is used up, and what there still is to do
    await take('Azad');
    expect(screen.getByText('You have asked every question on the list. Ask one of your own, or say who you are.')).toBeInTheDocument();
    const used = screen.getByRole('region', { name: 'Ask a question' });
    expect(within(used).getByRole('button', { name: 'All questions (3)' })).toHaveAttribute('aria-expanded', 'false');
    expect(within(used).queryByRole('button', { name: 'Ask' })).toBeNull();
    expect(within(used).getByRole('button', { name: 'Ask my own question' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Skip my turn' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'I know who I am!' })).toBeInTheDocument();
  });

  it('keeps the meanings of the list a tap away above the beginner’s level, and under the suggested questions all the same', async () => {
    serve();
    open();
    await screen.findAllByRole('textbox');
    await userEvent.click(within(screen.getByRole('radiogroup', { name: 'Difficulty' })).getByRole('radio', { name: 'Intermediate' }));
    await start(['Azad', 'Berfîn']);
    await take('Azad');

    // no words to choose from at any level
    expectNoChoices();
    // a suggested question is picked by what it means, so that is always under it
    const ask = within(screen.getByRole('region', { name: 'Ask a question' }));
    expect(ask.getByRole('button', { name: 'Ew dikare bifire? Can it fly?' })).toBeInTheDocument();
    await userEvent.click(ask.getByRole('button', { name: 'All questions (3)' }));
    expect(ask.getByText('Tap a question to see what it means.')).toBeInTheDocument();
    expect(ask.queryByText('Is it a place?')).toBeNull();
    const question = ask.getByRole('button', { name: 'Ew cihek e?' });
    await userEvent.click(question);
    expect(question).toHaveAttribute('aria-expanded', 'true');
    expect(ask.getByText('Is it a place?')).toBeInTheDocument();
  });
});

describe('Ez kî me? on one phone, a guess said out loud', () => {
  it('turns the phone to the friends, who judge it with the card in front of them, and hides the card again on a miss', async () => {
    serve();
    open();
    await start(['Azad', 'Berfîn']);
    await take('Azad');
    await userEvent.click(screen.getByRole('button', { name: 'I know who I am!' }));

    // what to do, with nothing spent and no card yet
    expect(await screen.findByRole('heading', { name: 'I know who I am!' })).toBeInTheDocument();
    expect(screen.getByText('Say out loud who you are.')).toBeInTheDocument();
    expect(screen.getByText('Now turn the phone to your friends.')).toBeInTheDocument();
    expect(said()).toBe('Say out loud who you are. Now turn the phone to your friends.');
    expectNoCard();
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('Points if you guess now: 10 · Guesses left: 3')).toBeInTheDocument();

    // the friends see the card and say whether that was it, on two keys of the answers' own colours
    await userEvent.click(screen.getByRole('button', { name: 'I know who I am!' }));
    await turnToFriends();
    expect(await screen.findByRole('heading', { name: 'Azad is…' })).toBeInTheDocument();
    const card = screen.getByRole('figure', { name: 'Azad’s card' });
    expect(within(card).getByText('pisîk')).toHaveAttribute('lang', 'ku');
    expect(card).toHaveTextContent('cat');
    expect(said()).toBe('Azad is… Did Azad get it right?');
    const judge = screen.getByRole('group', { name: 'Did Azad get it right?' });
    expect(within(judge).getByRole('button', { name: 'Yes, that’s it!' })).toHaveClass('is-yes');
    expect(within(judge).getByRole('button', { name: 'Not yet' })).toHaveClass('is-no');

    // the page hidden: the card is gone, and the phone is back a step with nothing judged
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(await screen.findByText('Say out loud who you are.')).toBeInTheDocument();
    expectNoCard();

    // not yet: the card is off the screen at once, and the miss names no word, since none was picked
    await turnToFriends();
    await userEvent.click(await screen.findByRole('button', { name: 'Not yet' }));
    expect(await screen.findByText('Not yet!')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Guesses left: 2' })).toBeInTheDocument();
    expect(said()).toBe('Not yet! Guesses left: 2');
    expectNoCard();
    expect(screen.queryByRole('figure')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));

    // the phone goes on, and back with Azad the miss has cost what a wrong guess costs
    await take('Berfîn');
    await userEvent.click(screen.getByRole('button', { name: 'Skip my turn' }));
    await take('Azad');
    expect(screen.getByText('Points if you guess now: 7 · Guesses left: 2')).toBeInTheDocument();
    expectNoCard();
  });

  it('takes the card off at a right one, in the game’s happiest moment', async () => {
    serve();
    open();
    await start(['Azad', 'Berfîn']);
    await take('Azad');
    // an answer first: to say who he is, is then the turn's main button, beside the way on
    await askSuggested(/^Ew dikare bifire\?/, 'Na no');
    await screen.findByRole('region', { name: /^The card says:/ });
    expect(screen.getByRole('button', { name: 'I know who I am!' })).toHaveClass('btn-primary');
    await sayWho('Yes, that’s it!');

    expect(await headlineWith('pisîk')).toHaveTextContent('You are pisîk!');
    expect(said()).toBe('Got it');
    // the card is his to read now, inside the celebration
    const card = screen.getByRole('figure', { name: 'Azad’s card' });
    expect(card).toHaveTextContent('cat');
    expect(card.closest('.celebrate')).not.toBeNull();
    // ten, less the one question
    expect(screen.getByText('Points: 9')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByRole('heading', { name: 'Berfîn’s turn. Hand them the phone.' })).toBeInTheDocument();
  });

  it('puts a player out at the third miss, one more than a table online allows', async () => {
    serve();
    open();
    await start(['Azad', 'Berfîn']);
    for (const left of [2, 1]) {
      await take('Azad');
      await sayWho('Not yet');
      expect(await screen.findByRole('heading', { name: `Guesses left: ${left}` })).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Next' }));
      await take('Berfîn');
      await userEvent.click(screen.getByRole('button', { name: 'Skip my turn' }));
    }
    await take('Azad');
    expect(screen.getByText('Points if you guess now: 4 · Guesses left: 1')).toBeInTheDocument();
    await sayWho('Not yet');
    // out: the card comes off, and is worth nothing
    expect(await screen.findByText('Out of guesses', { selector: '.wa-night-kicker' })).toBeInTheDocument();
    expect(said()).toBe('Out of guesses');
    expect(screen.queryByText('Not yet!')).toBeNull();
    expect(await headlineWith('pisîk')).toHaveTextContent('You were pisîk.');
    expect(screen.getByText('Points: 0')).toBeInTheDocument();
  });
});

describe('Ez kî me? on one phone, a game', () => {
  it('goes from a question to the card’s verdict, a guess that misses and one that lands, and the end', async () => {
    const calls = serve();
    open();
    await start(['Azad', 'Berfîn']);

    await take('Azad');
    await askSuggested(/^Ew dikare bifire\?/, 'Na no');
    await screen.findByRole('region', { name: /^The card says:/ });

    // a guess that misses: it says so, and how many are left
    await sayWho('Not yet');
    expect(await screen.findByRole('heading', { name: 'Guesses left: 2' })).toBeInTheDocument();
    expectNoCard();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));

    // Berfîn's turn: she passes it on without asking
    expect(await screen.findByRole('heading', { name: 'Berfîn’s turn. Hand them the phone.' })).toBeInTheDocument();
    await take('Berfîn');
    expectNoCard();
    await userEvent.click(screen.getByRole('button', { name: 'Skip my turn' }));

    // Azad again: the answer he had is on his board, and this guess lands
    await take('Azad');
    expect(within(screen.getByRole('region', { name: 'What you know so far' })).getByText('Na')).toHaveAttribute('lang', 'ku');
    expect(screen.getByText('Points if you guess now: 6 · Guesses left: 2')).toBeInTheDocument();
    await sayWho('Yes, that’s it!');
    expect(await headlineWith('pisîk')).toHaveTextContent('You are pisîk!');
    expect(screen.getByRole('figure', { name: 'Azad’s card' })).toHaveTextContent('cat');
    // ten, less one question and one wrong guess
    expect(screen.getByText('Points: 6')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));

    // Berfîn finds hers outright, with the point for the friends' right answer on top
    await take('Berfîn');
    await sayWho('Yes, that’s it!');
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

    // again: the same names, a new deal, and straight to the first player
    await userEvent.click(screen.getByRole('button', { name: 'Play again' }));
    expect(await screen.findByRole('heading', { name: 'Azad’s turn. Hand them the phone.' })).toBeInTheDocument();
    expect(deals(calls).map((c) => c.body)).toEqual([
      { dialect: 'kmr', difficulty: 'beginner', players: 2 },
      { dialect: 'kmr', difficulty: 'beginner', players: 2 },
    ]);
    expect(JSON.stringify(calls)).not.toContain('Azad');
  });

  it('asks before it lets a game go, from the way back and from Leave the game', async () => {
    serve();
    open();
    // before a game there is nothing to lose: the way back is a plain link
    await screen.findAllByRole('textbox');
    expect(screen.getByRole('link', { name: 'Back to games' })).toHaveAttribute('href', '/app/games');
    await start(['Azad', 'Berfîn']);
    await screen.findByRole('heading', { name: 'Azad’s turn. Hand them the phone.' });

    await userEvent.click(screen.getByRole('button', { name: 'Back to games' }));
    const asked = await screen.findByRole('dialog', { name: 'Leave this game?' });
    expect(within(asked).getByText('The cards and the points of this game will be lost.')).toBeInTheDocument();
    await userEvent.click(within(asked).getByRole('button', { name: 'Keep playing' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('heading', { name: 'Azad’s turn. Hand them the phone.' })).toBeInTheDocument();
    expect(where()).toBe('/app/games/who-am-i?couch=1');

    await userEvent.click(screen.getByRole('button', { name: 'Leave the game' }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Leave this game?' })).getByRole('button', { name: 'Leave the game' }));
    await waitFor(() => expect(where()).toBe('/app/games/who-am-i'));
  });

  it('remembers the names on this phone for the next game', async () => {
    serve();
    const first = open();
    await start(['Azad', 'Berfîn', 'Ciwan']);
    await screen.findByRole('heading', { name: 'Azad’s turn. Hand them the phone.' });
    first.unmount();
    open();
    await waitFor(() => expect(screen.getAllByRole('textbox').map((b) => (b as HTMLInputElement).value)).toEqual(['Azad', 'Berfîn', 'Ciwan']));
  });
});
