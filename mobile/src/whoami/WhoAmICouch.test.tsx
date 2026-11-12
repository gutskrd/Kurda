// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', async () => ({ ...(await import('../reports/testing/svg')), SvgXml: () => null }));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { AccessibilityInfo } from 'react-native';
import type { WhoAmICouchOffer, WhoAmIDeal, WhoAmIIdentity } from '@kurda/shared';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fail, fakeClient, ok, testAuth } from '../reports/testing/auth';
import { backOut } from '../play/testing/navigation';
import { WhoAmICouch } from './WhoAmICouch';

/**
 * Who Am I? on one phone, in the phone app, from who is playing to the end:
 * what the setup asks the server for (never a name), each card shown to the
 * room only while the button is held, the phone from hand to hand with the
 * holder's own card never on it, a question read out and the room's answer
 * tapped in, the card's verdict, guesses right and wrong, the points, another
 * game for the same room, and the way out that asks first.
 */

patchReactNativeWeb({ reduceMotion: true });

beforeEach(() => {
  // the renderer these tests run in answers that a screen reader is always on; on a phone it usually is not
  vi.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
});
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
/** A card dealt among two others that are nobody else's card, as the server deals a room. */
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
const CARDS = ['pisîk', 'çûk', 'hesp'];
const NAMES = ['Azad', 'Berfîn', 'Ciwan'];
const OFFER: WhoAmICouchOffer = { dialect: 'kmr', difficulties: ['beginner', 'intermediate'] };
const DEAL = 'POST /games/who-am-i/couch/deal';

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

const holdOf = (name: string): HTMLElement => screen.getByRole('button', { name: `Hold to show ${name}’s card` });
/** A finger down on the button and, later, up again: the two halves of a hold. */
const fingerDown = (name: string): void => {
  fireEvent.mouseDown(holdOf(name), { button: 0, buttons: 1 });
};
const fingerUp = (name: string): void => {
  fireEvent.mouseUp(holdOf(name), { button: 0 });
};

/** Every card shown to the room in turn, held and let go, and the game begun. */
async function lookRound(names: string[] = NAMES, cards: string[] = CARDS): Promise<void> {
  for (const [i, name] of names.entries()) {
    await screen.findByRole('heading', { name: `${name}, look away!` });
    fingerDown(name);
    await screen.findByText(cards[i]!);
    fingerUp(name);
    await waitFor(() => expect(screen.queryByText(cards[i]!)).toBeNull());
    press(i === names.length - 1 ? 'Start the game' : 'Next');
  }
}

/** The phone taken by the player it was handed to. */
async function take(name: string): Promise<void> {
  expect(await screen.findByRole('heading', { name: `${name}’s turn. Hand them the phone.` })).toBeTruthy();
  // between two players the screen shows nobody's card
  for (const word of CARDS) expect(document.body.textContent).not.toContain(word);
  press(`I’m ${name}`);
}

const guess = (word: string): void => {
  fireEvent.click(screen.getByRole('radio', { name: word }));
  press('Guess');
};

describe('the setup', () => {
  it('asks the server for a card each at the difficulty chosen, and never for anything about the room', async () => {
    const client = dealing();
    testAuth.client = client;
    renderWithProviders(<WhoAmICouch offer={OFFER} onLeave={() => undefined} />);
    await screen.findByRole('button', { name: 'Deal the cards' });
    expect(screen.getByText('Sitting together? Pass one phone round the room: 2 to 6 players, and the questions and answers are said out loud.')).toBeTruthy();
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Difficulty' })).getByRole('radio', { name: 'Intermediate' }));
    await start();
    expect(await screen.findByRole('heading', { name: 'Azad, look away!' })).toBeTruthy();
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
    expect(await screen.findByRole('heading', { name: 'Azad, look away!' })).toBeTruthy();
    expect(client.calls[0]!.body).toEqual({ dialect: 'kmr', difficulty: 'beginner', players: 2 });
  });

  it('says so when the cards cannot be fetched, and starts nothing', async () => {
    testAuth.client = fakeClient({ [DEAL]: fail({ kind: 'network', status: undefined }) });
    renderWithProviders(<WhoAmICouch offer={OFFER} onLeave={() => undefined} />);
    await start();
    expect(await screen.findByText('The cards couldn’t be fetched. Check your connection and try again.')).toBeTruthy();
    expect(screen.queryByText(/look away/)).toBeNull();
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
    expect(screen.queryByText(/look away/)).toBeNull();
    // one player fewer, and the cards are dealt: the sentence goes with the problem
    press('Remove Ciwan');
    press('Deal the cards');
    expect(await screen.findByRole('heading', { name: 'Azad, look away!' })).toBeTruthy();
    expect(screen.queryByText(/^There aren’t enough reviewed cards/)).toBeNull();
  });
});

describe('looking round', () => {
  it('shows each card to the room only while the button is held, and moves on only once it has been seen and hidden', async () => {
    testAuth.client = dealing();
    renderWithProviders(<WhoAmICouch offer={OFFER} onLeave={() => undefined} />);
    await start();
    expect(await screen.findByRole('heading', { name: 'Azad, look away!' })).toBeTruthy();
    expect(screen.getByText('Everyone but Azad: this is Azad’s card.')).toBeTruthy();
    // face down until somebody holds the button: the card is only named
    expect(screen.getByLabelText('Azad’s card')).toBeTruthy();
    expect(screen.queryByText('pisîk')).toBeNull();
    expect(screen.getByRole('button', { name: 'Next' })).toHaveProperty('disabled', true);

    fingerDown('Azad');
    expect(await screen.findByText('pisîk')).toBeTruthy();
    expect(screen.getByText('cat')).toBeTruthy();
    // while it is up, the phone cannot move on with the card showing
    expect(screen.getByRole('button', { name: 'Next' })).toHaveProperty('disabled', true);
    fingerUp('Azad');
    await waitFor(() => expect(screen.queryByText('pisîk')).toBeNull());
    press('Next');

    expect(await screen.findByRole('heading', { name: 'Berfîn, look away!' })).toBeTruthy();
    expect(screen.queryByText('çûk')).toBeNull();
    fingerDown('Berfîn');
    expect(await screen.findByText('çûk')).toBeTruthy();
    fingerUp('Berfîn');
    press('Next');
    // the last card, and then the first turn
    expect(await screen.findByRole('heading', { name: 'Ciwan, look away!' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start the game' })).toHaveProperty('disabled', true);
  });

  it('turns the card face down when the app is no longer the one in front', async () => {
    testAuth.client = dealing();
    renderWithProviders(<WhoAmICouch offer={OFFER} onLeave={() => undefined} />);
    await start();
    await screen.findByRole('heading', { name: 'Azad, look away!' });
    fingerDown('Azad');
    await screen.findByText('pisîk');
    const visible = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(screen.queryByText('pisîk')).toBeNull());
    visible.mockRestore();
  });

  it('turns the card by a tap for someone listening to the phone, who cannot press and hold', async () => {
    vi.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(true);
    testAuth.client = dealing();
    renderWithProviders(<WhoAmICouch offer={OFFER} onLeave={() => undefined} />);
    await start();
    await screen.findByRole('heading', { name: 'Azad, look away!' });
    await act(async () => {});
    press('Hold to show Azad’s card');
    expect(await screen.findByText('pisîk')).toBeTruthy();
    press('Hold to show Azad’s card');
    await waitFor(() => expect(screen.queryByText('pisîk')).toBeNull());
    expect(screen.getByRole('button', { name: 'Next' })).toHaveProperty('disabled', false);
  });
});

describe('a game', () => {
  it('goes from the cards to a question read out, the room’s answer, the card’s verdict, guesses right and wrong, and the points', async () => {
    const client = dealing();
    testAuth.client = client;
    const onLeave = vi.fn();
    renderWithProviders(<WhoAmICouch offer={OFFER} onLeave={onLeave} />);
    await start();
    await lookRound();

    // Azad has the phone: his own card is the hidden mark, and nobody else's is on the screen he holds up
    await take('Azad');
    expect(await screen.findByRole('heading', { name: 'Azad’s turn' })).toBeTruthy();
    expect(screen.getByText('Ask one question, guess your card, or pass.')).toBeTruthy();
    expect(screen.queryByRole('timer')).toBeNull();
    expect(screen.getAllByText('pisîk')).toHaveLength(1);
    expect(screen.getByRole('radio', { name: 'pisîk' })).toBeTruthy();
    expect(screen.queryByText('çûk')).toBeNull();
    expect(screen.queryByText('hesp')).toBeNull();
    expect(within(table()).getByLabelText('Azad, A hidden card, Points: 0, Questions: 0, On turn')).toBeTruthy();
    expect(within(table()).getByLabelText('Berfîn, A hidden card, Points: 0, Questions: 0')).toBeTruthy();

    // he picks a question and reads it out; the room says no
    press('Ew dikare bifire?');
    expect(await screen.findByText('Can it fly?')).toBeTruthy();
    press('Ask: Ew dikare bifire?');
    expect(await screen.findByText('Read it out loud')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ew dikare bifire?' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'What did the room say?' })).toBeTruthy();
    expect(screen.queryByText('pisîk')).toBeNull();
    press('Na');

    // the card itself says which it is, and whether the room was right
    expect(await screen.findByLabelText('The card says: Na')).toBeTruthy();
    expect(screen.getByText('Azad asks about their card:')).toBeTruthy();
    expect(screen.getByText('The room was right.')).toBeTruthy();
    guess('pisîk');
    expect(await screen.findByRole('heading', { name: 'You are pisîk!' })).toBeTruthy();
    expect(screen.getByText('Your points: 9')).toBeTruthy();
    press('Next');

    // Berfîn: Azad's card is off his forehead for all to see; hers and Ciwan's are not on the screen
    await take('Berfîn');
    expect(within(table()).getByLabelText('Azad, pisîk, cat, Points: 9, Questions: 1, Got it')).toBeTruthy();
    // a right answer about Azad's card was a point for each of the room
    expect(within(table()).getByLabelText('Berfîn, A hidden card, Points: 1, Questions: 0, On turn')).toBeTruthy();
    expect(within(table()).queryByText('çûk')).toBeNull();
    expect(screen.queryByText('hesp')).toBeNull();
    guess('masî');
    expect(await screen.findByRole('heading', { name: 'No, you are not masî.' })).toBeTruthy();
    expect(screen.getByText('Guesses left: 1')).toBeTruthy();
    expect(screen.queryByText('çûk')).toBeNull();
    press('Next');

    // Ciwan passes; Azad has his card, so the phone goes back to Berfîn
    await take('Ciwan');
    press('Pass the turn on');
    await take('Berfîn');
    expect(screen.getByRole('radio', { name: 'masî, Not this one' })).toBeTruthy();
    guess('werdek');
    expect(await screen.findByRole('heading', { name: 'No, you are not werdek.' })).toBeTruthy();
    expect(screen.getByText('Out of guesses. You were çûk.')).toBeTruthy();
    press('Next');

    await take('Ciwan');
    guess('hesp');
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

    // the same room again: a new deal, and the cards shown round once more
    press('Play again');
    expect(await screen.findByRole('heading', { name: 'Azad, look away!' })).toBeTruthy();
    expect(client.calls.map((c) => c.body)).toEqual([
      { dialect: 'kmr', difficulty: 'beginner', players: 3 },
      { dialect: 'kmr', difficulty: 'beginner', players: 3 },
    ]);
    expect(JSON.stringify(client.calls)).not.toContain('Azad');
    expect(onLeave).not.toHaveBeenCalled();
  });

  it('says when the room was wrong, and takes away the pass once every question has been asked', async () => {
    testAuth.client = dealing([deal(CAT, [animal('dog', 'kûçik', {}), animal('cow', 'çêlek', {})], QUESTIONS.slice(0, 1)), DEALS[1]!]);
    renderWithProviders(<WhoAmICouch offer={OFFER} onLeave={() => undefined} />);
    await start(['Azad', 'Berfîn']);
    await lookRound(['Azad', 'Berfîn']);
    await take('Azad');
    press('Ask: Ew dikare bifire?');
    await screen.findByText('Read it out loud');
    press('Erê');
    expect(await screen.findByLabelText('The card says: Na')).toBeTruthy();
    expect(screen.getByText('The room was wrong.')).toBeTruthy();
    // his one question is asked: the turn is a guess
    expect(screen.getByText('You have asked every question. Now you have to guess.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Pass the turn on' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Guess' })).toBeTruthy();
  });

  it('plays a Soranî room in Soranî, the card answering in its own yes and no', async () => {
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
    await lookRound(['Azad', 'Berfîn'], ['پشیلە', 'باڵندە']);
    press(await screen.findByRole('button', { name: 'I’m Azad' }).then(() => 'I’m Azad'));
    press('Ask: ئایا دەتوانێت بفڕێت؟');
    await screen.findByText('Read it out loud');
    expect(screen.getByRole('button', { name: 'بەڵێ' })).toBeTruthy();
    press('نەخێر');
    expect(await screen.findByLabelText('The card says: نەخێر')).toBeTruthy();
    expect(screen.getByText('The room was right.')).toBeTruthy();
  });

  it('finishes from the end, or goes back to who is playing with the names still there', async () => {
    const onLeave = vi.fn();
    testAuth.client = dealing();
    renderWithProviders(<WhoAmICouch offer={OFFER} onLeave={onLeave} />);
    await start(['Azad', 'Berfîn']);
    await lookRound(['Azad', 'Berfîn']);
    await take('Azad');
    guess('pisîk');
    press(await screen.findByRole('button', { name: 'Next' }).then(() => 'Next'));
    await take('Berfîn');
    guess('çûk');
    press(await screen.findByRole('button', { name: 'Next' }).then(() => 'Next'));
    await screen.findByRole('heading', { name: 'Who everyone was' });
    press('Change the game');
    expect(await screen.findByRole('button', { name: 'Deal the cards' })).toBeTruthy();
    expect((screen.getByLabelText('Player 1') as HTMLInputElement).value).toBe('Azad');
    press('Deal the cards');
    await lookRound(['Azad', 'Berfîn']);
    await take('Azad');
    guess('pisîk');
    press(await screen.findByRole('button', { name: 'Next' }).then(() => 'Next'));
    await take('Berfîn');
    guess('çûk');
    press(await screen.findByRole('button', { name: 'Next' }).then(() => 'Next'));
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
    await screen.findByRole('heading', { name: 'Azad, look away!' });

    // its own button, on every screen of the game
    press('End the game');
    expect(await screen.findByRole('heading', { name: 'End this game?' })).toBeTruthy();
    expect(screen.getByText('The cards and the points are not kept.')).toBeTruthy();
    press('Keep playing');
    expect(await screen.findByRole('heading', { name: 'Azad, look away!' })).toBeTruthy();

    // the header's way back, and the phone's own, ask the same thing
    press('Back');
    expect(await screen.findByRole('heading', { name: 'End this game?' })).toBeTruthy();
    press('Keep playing');
    await lookRound();
    await screen.findByRole('heading', { name: 'Azad’s turn. Hand them the phone.' });
    expect(screen.getByRole('button', { name: 'End the game' })).toBeTruthy();
    act(() => backOut());
    expect(await screen.findByRole('heading', { name: 'End this game?' })).toBeTruthy();
    expect(onLeave).not.toHaveBeenCalled();

    // ended, the room is back at who is playing, the names still there; from there back leaves at once
    press('End the game');
    expect(await screen.findByRole('button', { name: 'Deal the cards' })).toBeTruthy();
    expect((screen.getByLabelText('Player 3') as HTMLInputElement).value).toBe('Ciwan');
    press('Back');
    expect(onLeave).toHaveBeenCalledTimes(1);
  });
});
