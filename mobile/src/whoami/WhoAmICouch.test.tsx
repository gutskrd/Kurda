// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', async () => ({ ...(await import('../reports/testing/svg')), SvgXml: () => null }));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { WhoAmICouchOffer, WhoAmIDeal, WhoAmIIdentity } from '@kurda/shared';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fail, fakeClient, ok, testAuth } from '../reports/testing/auth';
import { backOut } from '../play/testing/navigation';
import { WhoAmICouch } from './WhoAmICouch';

/**
 * Ez kî me? on one phone, in the phone app, from who is playing to the end:
 * what the setup asks the server for (never a name), the phone from hand to
 * hand with nothing to memorise first and no list of words to pick from, the
 * questions suggested with what they mean and asked by one tap, the question
 * read out, the friends' screen that alone shows the holder's card and takes
 * the answer, the card hidden again, the card's verdict and how the friends
 * did, a question of the holder's own, who they are said out loud and judged
 * by the friends, right and not yet, the points, another game for the same
 * room, and the way out that asks first.
 */

patchReactNativeWeb({ reduceMotion: true });

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
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
/** A card dealt among two others that are nobody else's card, as the server deals a room. */
const deal = (identity: WhoAmIIdentity, others: WhoAmIIdentity[], questions = QUESTIONS): WhoAmIDeal => ({
  identity,
  candidates: [others[0]!, identity, others[1]!].map(({ id, word, meanings, category }) => ({ id, word, meanings, category })),
  questions,
});
const CAT_AMONG = [animal('dog', 'kûçik', {}), animal('cow', 'çêlek', {})];
const BIRD_AMONG = [animal('fish', 'masî', {}), animal('duck', 'werdek', {})];
const DEALS = [deal(CAT, CAT_AMONG), deal(BIRD, BIRD_AMONG), deal(HORSE, [animal('donkey', 'ker', {}), animal('camel', 'hêştir', {})])];
const CARDS = ['pisîk', 'çûk', 'hesp'];
const NAMES = ['Azad', 'Berfîn', 'Ciwan'];
const OFFER: WhoAmICouchOffer = { dialect: 'kmr', difficulties: ['beginner', 'intermediate'] };
const DEAL = 'POST /games/who-am-i/couch/deal';
const ASK_FLY = 'Ask: Ew dikare bifire? (Can it fly?)';

/** A server that deals the room its cards: as many as it was asked for, in the order the room sits. */
const dealing = (deals: WhoAmIDeal[] = DEALS) =>
  fakeClient({
    [DEAL]: (body) => {
      const asked = body as { difficulty: string; players: number };
      return ok({ dialect: 'kmr', difficulty: asked.difficulty, deals: deals.slice(0, asked.players) });
    },
  });

const press = (name: string | RegExp): void => {
  fireEvent.click(screen.getByRole('button', { name }));
};
const table = (): HTMLElement => screen.getByLabelText('The table');

/** The setup filled in with the room's names, and the cards dealt. */
async function start(names: string[] = NAMES): Promise<void> {
  await screen.findByRole('button', { name: 'Deal the cards' });
  for (let n = 2; n < names.length; n++) press('Add a player');
  for (const [i, name] of names.entries()) fireEvent.change(screen.getByLabelText(`Player ${i + 1}`), { target: { value: name } });
  press('Deal the cards');
}

/** The phone taken by the player it was handed to. */
async function take(name: string): Promise<void> {
  expect(await screen.findByRole('heading', { name: `${name}’s turn. Hand them the phone.` })).toBeTruthy();
  // between two players the screen shows nobody's card
  for (const word of CARDS) expect(document.body.textContent).not.toContain(word);
  press(`I’m ${name}`);
  await screen.findByRole('heading', { name: `${name}, who are you?` });
}

/**
 * The phone turned to the friends. The way there takes no tap in its first moment on the screen (a double tap on the
 * board must not run on into the card), so the tap is made until it is taken.
 */
async function turnToFriends(name: string): Promise<void> {
  await screen.findByRole('button', { name: 'Friends: tap here' });
  await waitFor(() => {
    press('Friends: tap here');
    expect(screen.queryByRole('button', { name: 'Friends: tap here' })).toBeNull();
  });
  await screen.findByRole('heading', { name: `${name} is…` });
}

/** A suggested question tapped, read out, and the phone turned to the friends. */
async function toFriends(name: string, ask: string = ASK_FLY): Promise<void> {
  press(ask);
  await screen.findByRole('heading', { name: 'Read it out loud' });
  await turnToFriends(name);
}

/** Who they are said out loud, the phone turned to the friends, and the friends' verdict tapped. */
async function sayWho(name: string, verdict: 'Yes, that’s it!' | 'Not yet'): Promise<void> {
  press('I know who I am!');
  await screen.findByRole('heading', { name: 'Say out loud who you are.' });
  await turnToFriends(name);
  expect(screen.getByText(`Did ${name} get it right?`)).toBeTruthy();
  press(verdict);
}

/** No word anybody might be is on the screen: no player's card, and no list to pick one from. */
function expectNoWords(): void {
  for (const word of [...CARDS, 'kûçik', 'çêlek', 'masî', 'werdek', 'ker', 'hêştir']) expect(screen.queryByText(word)).toBeNull();
  expect(screen.queryByRole('radio')).toBeNull();
}

describe('the setup', () => {
  it('says the game in three steps, asks the server for a card each at the difficulty chosen, and never for anything about the room', async () => {
    const client = dealing();
    testAuth.client = client;
    renderWithProviders(<WhoAmICouch offer={OFFER} onLeave={() => undefined} />);
    await screen.findByRole('button', { name: 'Deal the cards' });
    expect(screen.getByLabelText('1. Pick a question and read it out loud.')).toBeTruthy();
    expect(screen.getByLabelText('2. Turn the phone to your friends: they see your card and answer.')).toBeTruthy();
    expect(screen.getByLabelText('3. Say who you are when you know. Fewer questions, more points.')).toBeTruthy();
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Difficulty' })).getByRole('radio', { name: 'Intermediate' }));
    await start();
    expect(await screen.findByRole('heading', { name: 'Azad’s turn. Hand them the phone.' })).toBeTruthy();
    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]!.body).toEqual({ dialect: 'kmr', difficulty: 'intermediate', players: 3 });
    expect(JSON.stringify(client.calls)).not.toContain('Azad');
  });

  it('takes two to six players, names an empty box for them, and wants no two names alike', async () => {
    const client = dealing();
    testAuth.client = client;
    renderWithProviders(<WhoAmICouch offer={OFFER} onLeave={() => undefined} />);
    await screen.findByRole('button', { name: 'Deal the cards' });
    // two is the fewest: nobody can be taken out
    expect(screen.queryByRole('button', { name: /^Remove/ })).toBeNull();
    for (let n = 2; n < 6; n++) press('Add a player');
    expect(screen.queryByRole('button', { name: 'Add a player' })).toBeNull();
    for (let n = 6; n > 2; n--) press(`Remove Player ${n}`);
    expect(screen.queryByRole('button', { name: /^Remove/ })).toBeNull();

    for (const i of [0, 1]) fireEvent.change(screen.getByLabelText(`Player ${i + 1}`), { target: { value: 'Azad' } });
    press('Deal the cards');
    expect(await screen.findByText('Two players have the same name.')).toBeTruthy();
    expect(client.calls).toHaveLength(0);

    // a box left empty plays under the name on it
    fireEvent.change(screen.getByLabelText('Player 2'), { target: { value: '' } });
    press('Deal the cards');
    expect(await screen.findByRole('heading', { name: 'Azad’s turn. Hand them the phone.' })).toBeTruthy();
    expect(client.calls[0]!.body).toEqual({ dialect: 'kmr', difficulty: 'beginner', players: 2 });
  });

  it('says so when the cards cannot be fetched, and starts nothing', async () => {
    testAuth.client = fakeClient({ [DEAL]: fail({ kind: 'network', status: undefined }) });
    renderWithProviders(<WhoAmICouch offer={OFFER} onLeave={() => undefined} />);
    await start();
    expect(await screen.findByText('The cards couldn’t be fetched. Check your connection and try again.')).toBeTruthy();
    expect(screen.queryByText(/Hand them the phone/)).toBeNull();
  });

  it('says what to change when there are too few approved cards for a room this size', async () => {
    let asked = 0;
    testAuth.client = fakeClient({
      [DEAL]: (body) => {
        asked += 1;
        if (asked === 1) return fail({ status: 409, code: 'GAME_UNAVAILABLE' });
        return ok({ dialect: 'kmr', difficulty: 'beginner', deals: DEALS.slice(0, (body as { players: number }).players) });
      },
    });
    renderWithProviders(<WhoAmICouch offer={OFFER} onLeave={() => undefined} />);
    await start();
    expect(
      await screen.findByText('There aren’t enough reviewed cards for this many players at this difficulty yet. Try another difficulty or fewer players.'),
    ).toBeTruthy();
    expect(screen.queryByText(/Hand them the phone/)).toBeNull();
    // one player fewer, and the cards are dealt: the sentence goes with the problem
    press('Remove Ciwan');
    press('Deal the cards');
    expect(await screen.findByRole('heading', { name: 'Azad’s turn. Hand them the phone.' })).toBeTruthy();
    expect(screen.queryByText(/^There aren’t enough reviewed cards/)).toBeNull();
  });
});

describe('the first turn', () => {
  it('begins at once, with no card shown round the room to remember first', async () => {
    testAuth.client = dealing();
    renderWithProviders(<WhoAmICouch offer={OFFER} onLeave={() => undefined} />);
    await start();
    // straight from the deal to the first player's name: nobody is asked to look away, and nothing is held down to show a card
    expect(await screen.findByRole('heading', { name: 'Azad’s turn. Hand them the phone.' })).toBeTruthy();
    expect(screen.queryByText(/look away/)).toBeNull();
    expect(screen.queryByRole('button', { name: /^Hold to show/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Start the game' })).toBeNull();
    for (const word of CARDS) expect(document.body.textContent).not.toContain(word);
  });

  it('puts the suggested questions under a short banner, each with what it means, and lists no words to pick from and nobody’s card', async () => {
    testAuth.client = dealing();
    renderWithProviders(<WhoAmICouch offer={OFFER} onLeave={() => undefined} />);
    await start();
    await take('Azad');
    expect(screen.getByText('An animal')).toBeTruthy();
    // three misses are allowed in one room, where anything may be said
    expect(screen.getByText('Points if you guess now: 10 · Guesses left: 3')).toBeTruthy();
    expect(screen.queryByRole('timer')).toBeNull();

    // nothing lists who he might be: no tiles, no Guess, not his own word nor anybody else's
    expectNoWords();
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.queryByText('You are one of these')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Guess' })).toBeNull();
    expect(within(table()).getByLabelText('Azad, A hidden card, Points: 0, Questions: 0, On turn')).toBeTruthy();
    expect(within(table()).getByLabelText('Berfîn, A hidden card, Points: 0, Questions: 0')).toBeTruthy();

    // the way to say who he is comes straight after the banner, before the questions
    const knows = screen.getByRole('button', { name: 'I know who I am!' });
    const asking = screen.getByRole('heading', { name: 'Ask a question' });
    expect(knows.compareDocumentPosition(asking) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // the questions worth asking, each with its meaning in sight and asked by one tap
    expect(screen.getByText('Suggested')).toBeTruthy();
    expect(screen.getByRole('button', { name: ASK_FLY })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ask: Çar lingên wê hene? (Does it walk on four legs?)' })).toBeTruthy();
    expect(screen.getByText('Can it fly?')).toBeTruthy();
    expect(screen.getByText('Does it walk on four legs?')).toBeTruthy();
    // nothing learned yet, so no advice and no list of answers
    expect(screen.queryByText(/^No more suggestions/)).toBeNull();
    expect(screen.queryByRole('heading', { name: 'What you know so far' })).toBeNull();

    // every question is folded under them: for a beginner each with its meaning, and no tap needed to see it
    const all = screen.getByRole('button', { name: 'All questions (2)' });
    expect(all.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('button', { name: 'Ask: Ew dikare bifire?' })).toBeNull();
    fireEvent.click(all);
    expect(screen.getByRole('button', { name: 'Ask: Ew dikare bifire?' })).toBeTruthy();
    expect(screen.getAllByText('Can it fly?')).toHaveLength(2);
    expect(screen.queryByText('Tap a question to see what it means.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Ask my own question' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Skip my turn' })).toBeTruthy();
  });

  it('keeps the tap for a meaning in the full list above beginner, where the suggested questions still say theirs', async () => {
    testAuth.client = dealing();
    renderWithProviders(<WhoAmICouch offer={OFFER} onLeave={() => undefined} />);
    await screen.findByRole('button', { name: 'Deal the cards' });
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Difficulty' })).getByRole('radio', { name: 'Intermediate' }));
    await start();
    await take('Azad');
    expect(screen.getByRole('button', { name: ASK_FLY })).toBeTruthy();
    expect(screen.getAllByText('Can it fly?')).toHaveLength(1);
    press('All questions (2)');
    expect(screen.getByText('Tap a question to see what it means.')).toBeTruthy();
    expect(screen.getAllByText('Can it fly?')).toHaveLength(1);
    press('Ew dikare bifire?');
    expect(screen.getAllByText('Can it fly?')).toHaveLength(2);
  });

  it('says when the suggestions have run out, with every question already open to pick from', async () => {
    testAuth.client = dealing([deal(CAT, CAT_AMONG, [ALIVE]), DEALS[1]!]);
    renderWithProviders(<WhoAmICouch offer={OFFER} onLeave={() => undefined} />);
    await start(['Azad', 'Berfîn']);
    await take('Azad');
    expect(screen.getByText('No more suggestions. Pick from all the questions, or take a guess.')).toBeTruthy();
    expect(screen.queryByText('Suggested')).toBeNull();
    expect(screen.getByRole('button', { name: 'All questions (1)' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Is it alive?')).toBeTruthy();
    // a question from the full list is read out like any other, and still costs nothing until the friends answer
    press('Ask: Ew zindî ye?');
    expect(await screen.findByRole('heading', { name: 'Read it out loud' })).toBeTruthy();
    expect(screen.getByText('Ew zindî ye?')).toBeTruthy();
  });
});

describe('a question from the list', () => {
  it('is read out with its meaning, costs nothing until the friends answer, and only their screen shows the card', async () => {
    testAuth.client = dealing();
    renderWithProviders(<WhoAmICouch offer={OFFER} onLeave={() => undefined} />);
    await start();
    await take('Azad');

    // one tap on a suggested question: it is on the screen to read out, large, with what it means
    press(ASK_FLY);
    expect(await screen.findByRole('heading', { name: 'Read it out loud' })).toBeTruthy();
    expect(screen.getByText('Ew dikare bifire?')).toBeTruthy();
    expect(screen.getByText('Can it fly?')).toBeTruthy();
    expect(screen.getByText('Now turn the phone to your friends.')).toBeTruthy();
    expectNoWords();

    // the way back spends nothing
    press('Back to my questions');
    await screen.findByRole('heading', { name: 'Azad, who are you?' });
    expect(screen.getByText('Points if you guess now: 10 · Guesses left: 3')).toBeTruthy();
    expect(within(table()).getByLabelText('Azad, A hidden card, Points: 0, Questions: 0, On turn')).toBeTruthy();

    // turned to the friends: his card on the forehead, word and meaning, with the question and the two answers
    await toFriends('Azad');
    expect(screen.getByText('pisîk')).toBeTruthy();
    expect(screen.getByText('cat')).toBeTruthy();
    expect(screen.getByText('Ew dikare bifire?')).toBeTruthy();
    expect(screen.getByText('Can it fly?')).toBeTruthy();
    expect(screen.getByText('Is it true? Tap your answer.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Erê' })).toBeTruthy();

    // they tap their answer: the card is off the screen at once, and the card's own answer is on it
    press('Na');
    expect(await screen.findByLabelText('The card says: Na')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Azad is…' })).toBeNull();
    expectNoWords();
    expect(screen.queryByText('cat')).toBeNull();
    expect(screen.getByText('Azad asks about their card:')).toBeTruthy();
    expect(screen.getByText('Your friends got it right: +1 for each of them.')).toBeTruthy();
    expect(screen.getByText('Points if you guess now: 9 · Guesses left: 3')).toBeTruthy();
    // what he knows now: the question with its meaning and the card's answer
    const known = screen.getByRole('heading', { name: 'What you know so far' }).parentElement!;
    expect(within(known).getByText('Ew dikare bifire?')).toBeTruthy();
    expect(within(known).getByText('Can it fly?')).toBeTruthy();
    expect(within(known).getByText('Na')).toBeTruthy();
    // one question to a turn: nothing more to ask, only saying who he is or the phone passed on
    expect(screen.queryByRole('button', { name: /^Ask/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'I know who I am!' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next player' })).toBeTruthy();
  });

  it('takes no tap on the way to the friends in the screen’s first moment, so a double tap cannot turn the card up', async () => {
    testAuth.client = dealing();
    renderWithProviders(<WhoAmICouch offer={OFFER} onLeave={() => undefined} />);
    await start(['Azad', 'Berfîn']);
    await take('Azad');
    // the clock stands still from here: the second tap of a double tap comes in the same moment as the first
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    press(ASK_FLY);
    press(await screen.findByRole('button', { name: 'Friends: tap here' }).then(() => 'Friends: tap here'));
    expect(screen.getByRole('heading', { name: 'Read it out loud' })).toBeTruthy();
    expectNoWords();
    // a moment later the same button turns the phone to the friends
    now.mockReturnValue(1_700_000_000_400);
    press('Friends: tap here');
    expect(await screen.findByRole('heading', { name: 'Azad is…' })).toBeTruthy();
    expect(screen.getByText('pisîk')).toBeTruthy();
  });

  it('takes the card off the friends’ screen when the app is no longer the one in front, with nothing spent', async () => {
    testAuth.client = dealing();
    renderWithProviders(<WhoAmICouch offer={OFFER} onLeave={() => undefined} />);
    await start();
    await take('Azad');
    await toFriends('Azad');
    expect(screen.getByText('pisîk')).toBeTruthy();
    const visible = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    // back at the question to read out: the card is gone, and the question has not been asked
    expect(await screen.findByRole('heading', { name: 'Read it out loud' })).toBeTruthy();
    expectNoWords();
    visible.mockRestore();
    press('Back to my questions');
    await screen.findByRole('heading', { name: 'Azad, who are you?' });
    expect(screen.getByText('Points if you guess now: 10 · Guesses left: 3')).toBeTruthy();
  });

  it('says kindly when the friends were wrong, and never forces a guess once the list is asked', async () => {
    testAuth.client = dealing([deal(CAT, CAT_AMONG, QUESTIONS.slice(0, 1)), DEALS[1]!]);
    renderWithProviders(<WhoAmICouch offer={OFFER} onLeave={() => undefined} />);
    await start(['Azad', 'Berfîn']);
    await take('Azad');
    await toFriends('Azad');
    press('Erê');
    expect(await screen.findByLabelText('The card says: Na')).toBeTruthy();
    expect(screen.getByText('Your friends said Erê, but the card says Na.')).toBeTruthy();
    // his one question is asked, and the phone can still go on: in one room a turn is never forced to be a guess
    expect(screen.queryByText('You have asked every question. Now you have to guess.')).toBeNull();
    press('Next player');
    await take('Berfîn');
    press('Skip my turn');

    // back with him: the list has nothing left to ask, and the board says what is still open to him
    await take('Azad');
    expect(screen.getByText('You have asked every question on the list. Ask one of your own, or say who you are.')).toBeTruthy();
    expect(screen.queryByText('Suggested')).toBeNull();
    expect(screen.queryByRole('button', { name: /^All questions/ })).toBeNull();
    expect(screen.getByRole('heading', { name: 'What you know so far' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ask my own question' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'I know who I am!' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Skip my turn' })).toBeTruthy();
  });

  it('plays a Soranî room in Soranî, the friends answering and the card speaking in its own yes and no', async () => {
    const pishile = animal('cat', 'پشیلە', { 'can-fly': false });
    const balinde = animal('bird', 'باڵندە', { 'can-fly': true });
    const flies: WhoAmIDeal['questions'] = [{ id: 'fly', ku: 'ئایا دەتوانێت بفڕێت؟', meanings: { en: 'Can it fly?' }, fact: 'can-fly' }];
    const client = fakeClient({
      [DEAL]: ok({
        dialect: 'ckb',
        difficulty: 'beginner',
        deals: [
          deal(pishile, [animal('dog', 'سەگ', {}), animal('cow', 'مانگا', {})], flies),
          deal(balinde, [animal('fish', 'ماسی', {}), animal('duck', 'مراوی', {})], flies),
        ],
      }),
    });
    testAuth.client = client;
    renderWithProviders(<WhoAmICouch offer={{ dialect: 'ckb', difficulties: ['beginner'] }} onLeave={() => undefined} />);
    await start(['Azad', 'Berfîn']);
    expect(client.calls[0]!.body).toEqual({ dialect: 'ckb', difficulty: 'beginner', players: 2 });
    press(await screen.findByRole('button', { name: 'I’m Azad' }).then(() => 'I’m Azad'));
    await toFriends('Azad', 'Ask: ئایا دەتوانێت بفڕێت؟ (Can it fly?)');
    expect(screen.getByText('پشیلە')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'بەڵێ' })).toBeTruthy();
    press('نەخێر');
    expect(await screen.findByLabelText('The card says: نەخێر')).toBeTruthy();
    expect(screen.getByText('Your friends got it right: +1 for each of them.')).toBeTruthy();
  });
});

describe('a question of one’s own', () => {
  it('is asked out loud, answered out loud by friends who see the card, counted as a question, and given no verdict', async () => {
    testAuth.client = dealing();
    renderWithProviders(<WhoAmICouch offer={OFFER} onLeave={() => undefined} />);
    await start();
    await take('Azad');
    press('Ask my own question');
    expect(await screen.findByRole('heading', { name: 'Ask your friends any yes-or-no question about yourself. In Kurdish if you can!' })).toBeTruthy();
    expect(screen.getByText('Then turn the phone to your friends so they can see your card.')).toBeTruthy();
    expectNoWords();
    // changing his mind costs nothing
    press('Back to my questions');
    await screen.findByRole('heading', { name: 'Azad, who are you?' });
    expect(screen.getByText('Points if you guess now: 10 · Guesses left: 3')).toBeTruthy();

    press('Ask my own question');
    // the friends see his card, are told to answer out loud in the dialect's own words, and tap nothing but that they have
    await turnToFriends('Azad');
    expect(screen.getByText('pisîk')).toBeTruthy();
    expect(screen.getByText('cat')).toBeTruthy();
    expect(screen.getByText('Answer Azad out loud: yes (Erê) or no (Na).')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Erê' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Na' })).toBeNull();
    press('Done: hide the card');

    // back with him: the card hidden, no verdict of the card's, one question spent, and saying who he is or the phone passed on
    expect(await screen.findByRole('heading', { name: 'Your friends have answered. Guess, or pass the phone on.' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Azad is…' })).toBeNull();
    expectNoWords();
    expect(screen.queryByLabelText(/^The card says/)).toBeNull();
    expect(screen.queryByText(/^Your friends (got it right|said)/)).toBeNull();
    expect(screen.getByText('Points if you guess now: 9 · Guesses left: 3')).toBeTruthy();
    expect(screen.getByText('Questions of your own: 1 (each takes 1 off your points)')).toBeTruthy();
    expect(within(table()).getByLabelText('Azad, A hidden card, Points: 0, Questions: 1, On turn')).toBeTruthy();
    // nothing checked the answer, so nobody is paid for it
    expect(within(table()).getByLabelText('Berfîn, A hidden card, Points: 0, Questions: 0')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Ask/ })).toBeNull();

    // the phone goes on; when it comes back his count is still on his board, and his list is as it was
    press('Next player');
    await take('Berfîn');
    press('Skip my turn');
    await take('Ciwan');
    press('Skip my turn');
    await take('Azad');
    expect(screen.getByText('Questions of your own: 1 (each takes 1 off your points)')).toBeTruthy();
    expect(screen.getByRole('button', { name: ASK_FLY })).toBeTruthy();
    await sayWho('Azad', 'Yes, that’s it!');
    expect(await screen.findByRole('heading', { name: 'You are pisîk!' })).toBeTruthy();
    expect(screen.getByText('Your points: 9')).toBeTruthy();
  });
});

describe('saying who you are', () => {
  it('is said out loud and judged by the friends, who alone see the card: not yet costs a guess and names no word', async () => {
    testAuth.client = dealing();
    renderWithProviders(<WhoAmICouch offer={OFFER} onLeave={() => undefined} />);
    await start(['Azad', 'Berfîn']);
    await take('Azad');

    // nothing is spent by saying he knows: the screen only says what to do, and there is a way back
    press('I know who I am!');
    expect(await screen.findByRole('heading', { name: 'Say out loud who you are.' })).toBeTruthy();
    expect(screen.getByText('Now turn the phone to your friends.')).toBeTruthy();
    expectNoWords();
    press('I’m not sure yet');
    await screen.findByRole('heading', { name: 'Azad, who are you?' });
    expect(screen.getByText('Points if you guess now: 10 · Guesses left: 3')).toBeTruthy();

    // turned to the friends: his card, the question whether he got it, and the two verdicts in the reader's own words
    press('I know who I am!');
    await screen.findByRole('heading', { name: 'Say out loud who you are.' });
    await turnToFriends('Azad');
    expect(screen.getByText('pisîk')).toBeTruthy();
    expect(screen.getByText('cat')).toBeTruthy();
    expect(screen.getByText('Did Azad get it right?')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Yes, that’s it!' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Erê' })).toBeNull();

    // not yet: the card is off the screen at once, a guess is gone, and no word is named
    press('Not yet');
    expect(await screen.findByRole('heading', { name: 'Not yet!' })).toBeTruthy();
    expect(screen.getByText('Guesses left: 2')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Azad is…' })).toBeNull();
    expectNoWords();
    press('Next');

    // the miss is on his board when the phone comes back, and the next time he has it
    await take('Berfîn');
    expect(within(table()).getByLabelText('Azad, A hidden card, Points: 0, Questions: 0')).toBeTruthy();
    press('Skip my turn');
    await take('Azad');
    expect(screen.getByText('Points if you guess now: 7 · Guesses left: 2')).toBeTruthy();
    await sayWho('Azad', 'Yes, that’s it!');
    expect(await screen.findByRole('heading', { name: 'You are pisîk!' })).toBeTruthy();
    expect(screen.getByText('Your points: 7')).toBeTruthy();
    // the friends' screen is gone; his card is on his own forehead now, for everyone
    expect(screen.queryByText('Did Azad get it right?')).toBeNull();
    expect(screen.getByText('pisîk')).toBeTruthy();
  });

  it('takes the card off the friends’ screen when the app is no longer the one in front, and counts no guess', async () => {
    testAuth.client = dealing();
    renderWithProviders(<WhoAmICouch offer={OFFER} onLeave={() => undefined} />);
    await start(['Azad', 'Berfîn']);
    await take('Azad');
    press('I know who I am!');
    await screen.findByRole('heading', { name: 'Say out loud who you are.' });
    await turnToFriends('Azad');
    expect(screen.getByText('pisîk')).toBeTruthy();
    const visible = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(await screen.findByRole('heading', { name: 'Say out loud who you are.' })).toBeTruthy();
    expectNoWords();
    visible.mockRestore();
    press('I’m not sure yet');
    await screen.findByRole('heading', { name: 'Azad, who are you?' });
    expect(screen.getByText('Points if you guess now: 10 · Guesses left: 3')).toBeTruthy();
  });

  it('makes a card found the happiest moment, the flecks flying, and keeps them away for a phone that asks for less motion', async () => {
    testAuth.client = dealing();
    renderWithProviders(<WhoAmICouch offer={OFFER} onLeave={() => undefined} />);
    await start(['Azad', 'Berfîn']);
    // every other test here runs with Reduce Motion on: the card and the words are there, and nothing flies
    await take('Azad');
    await sayWho('Azad', 'Yes, that’s it!');
    expect(await screen.findByRole('heading', { name: 'You are pisîk!' })).toBeTruthy();
    expect(screen.queryByTestId('who-am-i-found-burst')).toBeNull();
    press('Next');

    patchReactNativeWeb({ reduceMotion: false });
    try {
      await take('Berfîn');
      await sayWho('Berfîn', 'Yes, that’s it!');
      expect(await screen.findByRole('heading', { name: 'You are çûk!' })).toBeTruthy();
      expect(await screen.findByTestId('who-am-i-found-burst')).toBeTruthy();
      expect(screen.getByText('çûk')).toBeTruthy();
      expect(screen.getByText('Your points: 10')).toBeTruthy();
    } finally {
      patchReactNativeWeb({ reduceMotion: true });
    }
  });
});

describe('a game', () => {
  it('goes round the room from the first hand-over to who everyone was, the points, and another game for the same room', async () => {
    const client = dealing();
    testAuth.client = client;
    const onLeave = vi.fn();
    renderWithProviders(<WhoAmICouch offer={OFFER} onLeave={onLeave} />);
    await start();

    // Azad asks, his friends answer rightly, and with the answer in hand he says who he is
    await take('Azad');
    await toFriends('Azad');
    press('Na');
    await screen.findByLabelText('The card says: Na');
    await sayWho('Azad', 'Yes, that’s it!');
    expect(await screen.findByRole('heading', { name: 'You are pisîk!' })).toBeTruthy();
    expect(screen.getByText('Your points: 9')).toBeTruthy();
    press('Next');

    // Berfîn: Azad's card is off his forehead for all to see; hers and Ciwan's are not on the screen
    await take('Berfîn');
    expect(within(table()).getByLabelText('Azad, pisîk, cat, Points: 9, Questions: 1, Got it')).toBeTruthy();
    // a right answer about Azad's card was a point for each of his friends
    expect(within(table()).getByLabelText('Berfîn, A hidden card, Points: 1, Questions: 0, On turn')).toBeTruthy();
    expect(screen.queryByText('çûk')).toBeNull();
    expect(screen.queryByText('hesp')).toBeNull();
    await sayWho('Berfîn', 'Not yet');
    expect(await screen.findByRole('heading', { name: 'Not yet!' })).toBeTruthy();
    expect(screen.getByText('Guesses left: 2')).toBeTruthy();
    expect(screen.queryByText('çûk')).toBeNull();
    press('Next');

    // Ciwan skips; Azad has his card, so the phone goes back to Berfîn, who misses twice more and is out
    await take('Ciwan');
    press('Skip my turn');
    await take('Berfîn');
    await sayWho('Berfîn', 'Not yet');
    expect(await screen.findByText('Guesses left: 1')).toBeTruthy();
    press('Next');
    await take('Ciwan');
    press('Skip my turn');
    await take('Berfîn');
    await sayWho('Berfîn', 'Not yet');
    // the last miss: her card comes off all the same, and says who she was
    expect(await screen.findByRole('heading', { name: 'Out of guesses. You were çûk.' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Not yet!' })).toBeNull();
    press('Next');

    await take('Ciwan');
    await sayWho('Ciwan', 'Yes, that’s it!');
    expect(await screen.findByRole('heading', { name: 'You are hesp!' })).toBeTruthy();
    press('Next');

    // nobody is left guessing: every card turned over, and the points
    expect(await screen.findByRole('heading', { name: 'Who everyone was' })).toBeTruthy();
    expect(within(table()).getByLabelText('Azad, pisîk, cat, Points: 9, Questions: 1, Got it')).toBeTruthy();
    expect(within(table()).getByLabelText('Berfîn, çûk, bird, Points: 1, Questions: 0, Out of guesses')).toBeTruthy();
    expect(within(table()).getByLabelText('Ciwan, hesp, horse, Points: 11, Questions: 0, Got it')).toBeTruthy();
    expect(screen.getByLabelText('1. Ciwan, Points: 11')).toBeTruthy();
    expect(screen.getByLabelText('2. Azad, Points: 9')).toBeTruthy();
    expect(screen.getByLabelText('3. Berfîn, Points: 1')).toBeTruthy();
    expect(screen.getByText('A game for the room: it earns no XP.')).toBeTruthy();
    // a game over is left without being asked twice
    expect(screen.queryByRole('button', { name: 'End the game' })).toBeNull();

    // the same room again: a new deal, and straight to the first hand-over
    press('Play again');
    expect(await screen.findByRole('heading', { name: 'Azad’s turn. Hand them the phone.' })).toBeTruthy();
    expect(client.calls.map((c) => c.body)).toEqual([
      { dialect: 'kmr', difficulty: 'beginner', players: 3 },
      { dialect: 'kmr', difficulty: 'beginner', players: 3 },
    ]);
    expect(JSON.stringify(client.calls)).not.toContain('Azad');
    expect(onLeave).not.toHaveBeenCalled();
  });

  it('finishes from the end, or goes back to who is playing with the names still there', async () => {
    const onLeave = vi.fn();
    testAuth.client = dealing();
    renderWithProviders(<WhoAmICouch offer={OFFER} onLeave={onLeave} />);
    await start(['Azad', 'Berfîn']);
    /** Both of the room say who they are and are right: the shortest game there is. */
    const playOut = async (): Promise<void> => {
      for (const name of ['Azad', 'Berfîn']) {
        await take(name);
        await sayWho(name, 'Yes, that’s it!');
        press(await screen.findByRole('button', { name: 'Next' }).then(() => 'Next'));
      }
    };
    await playOut();
    await screen.findByRole('heading', { name: 'Who everyone was' });
    press('Change the game');
    expect(await screen.findByRole('button', { name: 'Deal the cards' })).toBeTruthy();
    expect((screen.getByLabelText('Player 1') as HTMLInputElement).value).toBe('Azad');
    press('Deal the cards');
    await playOut();
    press(await screen.findByRole('button', { name: 'Finish' }).then(() => 'Finish'));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });
});

describe('the way out', () => {
  it('is always there, and asks before a game under way is lost', async () => {
    const onLeave = vi.fn();
    testAuth.client = dealing();
    renderWithProviders(<WhoAmICouch offer={OFFER} onLeave={onLeave} />);
    await start();
    await screen.findByRole('heading', { name: 'Azad’s turn. Hand them the phone.' });

    // its own button, on every screen of the game
    press('End the game');
    expect(await screen.findByRole('heading', { name: 'End this game?' })).toBeTruthy();
    expect(screen.getByText('The cards and the points are not kept.')).toBeTruthy();
    press('Keep playing');
    expect(await screen.findByRole('heading', { name: 'Azad’s turn. Hand them the phone.' })).toBeTruthy();

    // the header's way back, and the phone's own, ask the same thing
    press('Back');
    expect(await screen.findByRole('heading', { name: 'End this game?' })).toBeTruthy();
    press('Keep playing');
    // with the friends holding the phone too: the game they were in is still there after the question
    await take('Azad');
    await toFriends('Azad');
    expect(screen.getByRole('button', { name: 'End the game' })).toBeTruthy();
    act(() => backOut());
    expect(await screen.findByRole('heading', { name: 'End this game?' })).toBeTruthy();
    expect(document.body.textContent).not.toContain('pisîk');
    expect(onLeave).not.toHaveBeenCalled();
    press('Keep playing');
    expect(await screen.findByRole('heading', { name: 'Azad is…' })).toBeTruthy();

    // ended, the room is back at who is playing, the names still there; from there back leaves at once
    press('End the game');
    press(await screen.findByRole('button', { name: 'End the game' }).then(() => 'End the game'));
    expect(await screen.findByRole('button', { name: 'Deal the cards' })).toBeTruthy();
    expect((screen.getByLabelText('Player 3') as HTMLInputElement).value).toBe('Ciwan');
    press('Back');
    expect(onLeave).toHaveBeenCalledTimes(1);
  });
});
