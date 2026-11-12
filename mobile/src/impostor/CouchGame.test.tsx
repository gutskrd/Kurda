// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccessibilityInfo } from 'react-native';
import { fakeClient, fail, ok, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { forgetPartyOffers } from '../party/offer';
import { forgetImpostorCategories } from './categories';
import { CouchGame } from './CouchGame';
import { ImpostorScreen } from './ImpostorScreen';

/**
 * Kurdish Impostor on one phone, in the phone app, from the way in to the
 * score: the setup and what it asks the server for (never a name), the phone
 * going round with each card shown only while it is pressed, the clues in turn
 * with their clock, the two kinds of vote, the caught impostor's guess, the
 * reveal, and the next game from the same cards.
 */

vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
vi.mock('../realtime/useUserEvents', () => ({ useUserEvents: () => undefined }));
vi.mock('../realtime/RealtimeProvider', () => ({
  useRealtimeState: () => 'open',
  useRealtimeReconnect: () => undefined,
  useRealtime: () => null,
  useRealtimeListener: () => undefined,
}));

beforeEach(() => {
  // the renderer these tests run in answers that a screen reader is always on; on a phone it usually is not
  vi.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  localStorage.clear();
  forgetPartyOffers();
  forgetImpostorCategories();
});

// stand-in Kurdish for the fixtures, never shown to a learner
const card = (word: string, twin: string | null = 'kûçik') => ({
  word,
  meanings: { en: `the ${word}` },
  hint: { ku: 'heywan', meanings: { en: 'animal' } },
  decoys: ['hesp', 'mişk', 'ker'],
  twin: twin ? { word: twin, meanings: { en: 'dog' } } : null,
});
const offer = {
  dialect: 'kmr',
  difficulties: [
    {
      difficulty: 'beginner',
      cards: 20,
      categories: [
        { slug: 'animals', ku: 'heywan', meanings: { en: 'animal' }, cards: 12 },
        { slug: 'food', ku: 'xwarin', meanings: { en: 'food' }, cards: 6 },
      ],
    },
  ],
};
const none = { dialect: 'ckb', difficulties: [] };
const DECK = 'POST /games/impostor/couch/deck';

const offered = (deck: unknown = ok({ dialect: 'kmr', cards: [card('pisîk'), card('hirç')] })) => ({
  'GET /games/impostor/couch?dialect=kmr': ok(offer),
  'GET /games/impostor/couch?dialect=ckb': ok(none),
  [DECK]: deck as never,
});

const NAMES = ['Azad', 'Berfîn', 'Ciwan', 'Dîlan'];
const press = (name: string | RegExp): void => {
  fireEvent.click(screen.getByRole('button', { name }));
};
const choose = (group: string, chip: string | RegExp): void => {
  fireEvent.click(within(screen.getByRole('radiogroup', { name: group })).getByRole('radio', { name: chip }));
};

/** The rules wait folded under the three steps: this unfolds them, once. */
const openRules = (): void => {
  if (screen.getByRole('button', { name: 'Rules' }).getAttribute('aria-expanded') !== 'true') press('Rules');
};

/** The setup filled in with four names and whatever choices a test asks for (the rules unfolded for them), and the cards dealt. */
async function start(chips: Array<[group: string, chip: string | RegExp]> = []): Promise<void> {
  await screen.findByRole('button', { name: 'Deal the cards' });
  for (const [i, name] of NAMES.entries()) fireEvent.change(screen.getByLabelText(`Player ${i + 1}`), { target: { value: name } });
  if (chips.length > 0) openRules();
  for (const [group, chip] of chips) choose(group, chip);
  press('Deal the cards');
}

/** A finger down on the card's button and, later, up again: the two halves of a hold. */
const fingerDown = (): void => {
  fireEvent.mouseDown(screen.getByRole('button', { name: 'Hold to see your card' }), { button: 0, buttons: 1 });
};
const fingerUp = (): void => {
  fireEvent.mouseUp(screen.getByRole('button', { name: 'Hold to see your card' }), { button: 0 });
};
const cardOf = (name: string): HTMLElement => screen.getByLabelText(`${name}’s card`);

/** The phone taken by the player it was passed to, their card read while pressed, and hidden again. Answers what the card said. */
async function readCard(name: string): Promise<string> {
  press(await screen.findByText(`I’m ${name}`).then(() => `I’m ${name}`));
  fingerDown();
  await waitFor(() => expect(cardOf(name).textContent).not.toBe(''));
  const text = cardOf(name).textContent ?? '';
  fingerUp();
  await waitFor(() => expect(cardOf(name).textContent).toBe(''));
  press('Hide it and pass on');
  return text;
}

/** Every card read, in seat order: what each said. */
async function dealRound(): Promise<string[]> {
  const cards: string[] = [];
  for (const name of NAMES) cards.push(await readCard(name));
  return cards;
}

const NO_CLOCKS: Array<[string, string]> = [
  ['Time per clue', 'No clock'],
  ['Time to talk', 'No clock'],
];

describe('the way in', () => {
  it('is the first thing to press on the start, opens the game for one phone, and the back arrow returns', async () => {
    testAuth.client = fakeClient({
      ...offered(),
      'GET /play/invites': ok({ incoming: [], outgoing: [] }),
      'GET /games/availability?dialect=kmr': ok({ dialect: 'kmr', games: [{ id: 'impostor', available: true, difficulties: ['beginner'], levels: {}, levelled: true, minimum: 12 }] }),
      'GET /games/availability?dialect=ckb': ok({ dialect: 'ckb', games: [] }),
    });
    renderWithProviders(<ImpostorScreen onExit={() => undefined} />);
    expect(await screen.findByRole('heading', { name: 'One word. One impostor. Who’s bluffing?' })).toBeTruthy();
    // the game with friends is on the table too, but it is not the first thing asked
    expect(screen.getByRole('button', { name: 'With friends' })).toBeTruthy();
    press('Play on this phone');
    expect(await screen.findByRole('button', { name: 'Deal the cards' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'On one phone' })).toBeTruthy();
    expect(screen.getByText('Sitting together? Pass one phone round the room: 3 to 10 players, and the clues are said out loud.')).toBeTruthy();
    press('Back');
    expect(await screen.findByRole('button', { name: 'Play on this phone' })).toBeTruthy();
  });

  it('opens the setup with the way to play or the category that was pressed on the start', async () => {
    testAuth.client = fakeClient({
      ...offered(),
      'GET /play/invites': ok({ incoming: [], outgoing: [] }),
      'GET /games/availability?dialect=kmr': ok({ dialect: 'kmr', games: [{ id: 'impostor', available: true, difficulties: ['beginner'], levels: {}, levelled: true, minimum: 12 }] }),
      'GET /games/availability?dialect=ckb': ok({ dialect: 'ckb', games: [] }),
    });
    renderWithProviders(<ImpostorScreen onExit={() => undefined} />);
    // each way to play is a card that says what the impostor is told
    press(await screen.findByText('Odd word out').then(() => /^Odd word out\. Nobody is told who the impostor is/));
    await screen.findByRole('button', { name: 'Deal the cards' });
    expect(screen.getByRole('radio', { name: /^Odd word out/ }).getAttribute('aria-checked')).toBe('true');
    press('Back');
    // and each category a picture with its Kurdish name and what it means
    press(await screen.findByRole('button', { name: 'xwarin · food' }).then(() => 'xwarin · food'));
    await screen.findByRole('button', { name: 'Deal the cards' });
    expect(within(screen.getByRole('radiogroup', { name: 'Category' })).getByRole('radio', { name: 'xwarin · food' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: /^Classic/ }).getAttribute('aria-checked')).toBe('true');
  });

  it('says plainly where no variety has the cards for it', async () => {
    testAuth.client = fakeClient({ 'GET /games/impostor/couch?dialect=kmr': ok(none), 'GET /games/impostor/couch?dialect=ckb': fail({}) });
    renderWithProviders(<CouchGame onLeave={() => undefined} />);
    expect(await screen.findByText('Kurdish Impostor isn’t offered in this Kurdish yet.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Deal the cards' })).toBeNull();
  });
});

describe('the setup', () => {
  it('asks the server for cards by variety, level and category, and never for anything about the room', async () => {
    const client = fakeClient(offered());
    testAuth.client = client;
    renderWithProviders(<CouchGame onLeave={() => undefined} />);
    await screen.findByRole('button', { name: 'Deal the cards' });
    choose('Category', /heywan/);
    await start();
    expect(await screen.findByText('Pass the phone to Azad')).toBeTruthy();
    const sent = client.calls.filter((c) => c.method === 'POST');
    expect(sent).toHaveLength(1);
    expect(sent[0]!.body).toEqual({ dialect: 'kmr', difficulty: 'beginner', category: 'animals' });
    expect(JSON.stringify(client.calls)).not.toContain('Azad');
  });

  it('keeps the names and the settings on the phone for next time, and nothing else', async () => {
    testAuth.client = fakeClient(offered());
    renderWithProviders(<CouchGame onLeave={() => undefined} />);
    await start([['Kind of game', /^In the dark/], ...NO_CLOCKS]);
    await screen.findByText('Pass the phone to Azad');
    const kept = JSON.parse(localStorage.getItem('hevalo_couch_v1')!);
    expect(kept).toEqual({ names: NAMES, settings: { way: 'blind', impostors: 1, rounds: 2, clueSeconds: 0, talkSeconds: 0, vote: 'secret' } });
    expect(localStorage.getItem('hevalo_couch_v1')).not.toContain('pisîk');

    cleanup();
    renderWithProviders(<CouchGame onLeave={() => undefined} />);
    await waitFor(() => expect((screen.getByLabelText('Player 1') as HTMLInputElement).value).toBe('Azad'));
    // the kind of game chosen last time is chosen again
    await waitFor(() => expect(screen.getByRole('radio', { name: /^In the dark/ }).getAttribute('aria-checked')).toBe('true'));
  });

  it('wants a name for everyone and no two alike, takes three to ten players, and a second impostor from six', async () => {
    testAuth.client = fakeClient(offered());
    renderWithProviders(<CouchGame onLeave={() => undefined} />);
    await screen.findByRole('button', { name: 'Deal the cards' });
    for (const i of [0, 1]) fireEvent.change(screen.getByLabelText(`Player ${i + 1}`), { target: { value: 'Azad' } });
    press('Deal the cards');
    expect(await screen.findByText('Two players have the same name.')).toBeTruthy();

    expect(screen.queryByRole('radiogroup', { name: 'Impostors' })).toBeNull();
    press('Add a player');
    press('Add a player');
    expect(screen.getByRole('radiogroup', { name: 'Impostors' })).toBeTruthy();
    for (let n = 6; n < 10; n++) press('Add a player');
    expect(screen.queryByRole('button', { name: 'Add a player' })).toBeNull();
    for (let n = 10; n > 3; n--) press(`Remove Player ${n}`);
    expect(screen.queryByRole('button', { name: /^Remove/ })).toBeNull();
  });

  it('says so when the cards cannot be fetched, and deals nothing', async () => {
    testAuth.client = fakeClient(offered(fail({ status: 409, code: 'GAME_UNAVAILABLE' })));
    renderWithProviders(<CouchGame onLeave={() => undefined} />);
    await start();
    expect(await screen.findByText('The cards couldn’t be fetched. Check your connection and try again.')).toBeTruthy();
    expect(screen.queryByText(/Pass the phone/)).toBeNull();
  });
});

describe('the phone going round', () => {
  it('shows a card only while it is pressed, the word to everyone but the impostor', async () => {
    testAuth.client = fakeClient(offered());
    renderWithProviders(<CouchGame onLeave={() => undefined} />);
    await start(NO_CLOCKS);
    // between two players the screen says only whose turn it is
    expect(await screen.findByText('Pass the phone to Azad')).toBeTruthy();
    expect(document.body.textContent).not.toContain('pisîk');
    press('I’m Azad');
    // taken, the card is still face down, and cannot be passed on unread
    expect(cardOf('Azad').textContent).toBe('');
    expect(screen.getByRole('button', { name: 'Hide it and pass on' })).toHaveProperty('disabled', true);
    fingerDown();
    await waitFor(() => expect(cardOf('Azad').textContent).not.toBe(''));
    // while it is up, the phone cannot be passed on with the card showing
    expect(screen.getByRole('button', { name: 'Hide it and pass on' })).toHaveProperty('disabled', true);
    fingerUp();
    await waitFor(() => expect(cardOf('Azad').textContent).toBe(''));
    press('Hide it and pass on');
    expect(await screen.findByText('Pass the phone to Berfîn')).toBeTruthy();
  });

  it('turns the card face down when the app is no longer the one in front', async () => {
    testAuth.client = fakeClient(offered());
    renderWithProviders(<CouchGame onLeave={() => undefined} />);
    await start(NO_CLOCKS);
    press(await screen.findByText('I’m Azad').then(() => 'I’m Azad'));
    fingerDown();
    await waitFor(() => expect(cardOf('Azad').textContent).not.toBe(''));
    const visible = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(cardOf('Azad').textContent).toBe(''));
    visible.mockRestore();
  });

  it('turns the card by a tap for someone listening to the phone, who cannot press and hold', async () => {
    vi.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(true);
    testAuth.client = fakeClient(offered());
    renderWithProviders(<CouchGame onLeave={() => undefined} />);
    await start(NO_CLOCKS);
    press(await screen.findByText('I’m Azad').then(() => 'I’m Azad'));
    await act(async () => {});
    press('Hold to see your card');
    await waitFor(() => expect(cardOf('Azad').textContent).not.toBe(''));
    press('Hold to see your card');
    await waitFor(() => expect(cardOf('Azad').textContent).toBe(''));
    expect(screen.getByRole('button', { name: 'Hide it and pass on' })).toHaveProperty('disabled', false);
  });
});

describe('a round', () => {
  it('goes from the cards to the clues, a private vote, the caught impostor’s guess and the score, then deals the next card', async () => {
    const client = fakeClient(offered());
    testAuth.client = client;
    renderWithProviders(<CouchGame onLeave={() => undefined} />);
    await start(NO_CLOCKS);
    const cards = await dealRound();
    const impostor = NAMES[cards.findIndex((c) => c.includes('impostor'))]!;
    expect(cards.filter((c) => c.includes('impostor'))).toHaveLength(1);
    expect(cards.filter((c) => c.includes('pisîk'))).toHaveLength(3);
    // the impostor is told the category, never the word
    expect(cards.find((c) => c.includes('impostor'))).toContain('heywan');

    // two rounds of clues, said out loud: the phone only says whose turn it is
    expect(await screen.findByText('Round 1 of 2')).toBeTruthy();
    expect(screen.queryByRole('timer')).toBeNull();
    for (let i = 0; i < NAMES.length; i++) press('Next');
    expect(screen.getByText('Round 2 of 2')).toBeTruthy();
    for (let i = 0; i < NAMES.length; i++) press('Next');

    // no time to talk was chosen: straight to the vote, each in private
    for (const name of NAMES) {
      press(await screen.findByText(`I’m ${name}`).then(() => `I’m ${name}`));
      expect(screen.getByText(`${name}, who is it?`)).toBeTruthy();
      expect(screen.queryByRole('button', { name: `Vote for ${name}` })).toBeNull();
      press(`Vote for ${name === impostor ? NAMES.find((n) => n !== impostor)! : impostor}`);
    }

    // caught: the phone goes to the impostor for one guess among four words
    expect(await screen.findByText(`${impostor} was caught! Hand them the phone for one guess at the word.`)).toBeTruthy();
    press(`I’m ${impostor}`);
    for (const word of ['pisîk', 'hesp', 'mişk', 'ker']) expect(screen.getByRole('button', { name: word })).toBeTruthy();
    press('hesp');

    // every card turned over, the word, who it was, the votes and the score
    expect(await screen.findByText(`The impostor was ${impostor}`)).toBeTruthy();
    expect(screen.getByText('the pisîk')).toBeTruthy();
    expect(screen.getByText('Caught, and the guess was wrong: the table wins.')).toBeTruthy();
    expect(screen.getAllByText(/voted for/)).toHaveLength(4);
    const winner = NAMES.find((n) => n !== impostor)!;
    expect(screen.getByLabelText(new RegExp(`^${winner}: This game [1-9]`))).toBeTruthy();
    expect(screen.getByLabelText(`${impostor}: This game 0, Total 0`)).toBeTruthy();

    // the next game is the next card of the same batch: nothing more is fetched
    press('Next game');
    expect(await screen.findByText('Game 2')).toBeTruthy();
    expect(client.calls.filter((c) => c.method === 'POST')).toHaveLength(1);
    const next = await dealRound();
    expect(next.filter((c) => c.includes('hirç'))).toHaveLength(3);
  });

  it('counts down a clue and moves on by itself when the time is up', async () => {
    testAuth.client = fakeClient(offered());
    renderWithProviders(<CouchGame onLeave={() => undefined} />);
    await start([
      ['Time per clue', '15 s'],
      ['Time to talk', '1 min'],
    ]);
    await dealRound();
    await screen.findByText('Round 1 of 2');
    const first = screen.getByRole('heading', { name: /, your clue$/ }).textContent;
    expect(screen.getByRole('timer', { name: /seconds left/ })).toBeTruthy();
    expect(screen.getByText('0:15')).toBeTruthy();
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now + 16_000);
    await waitFor(() => expect(screen.getByRole('heading', { name: /, your clue$/ }).textContent).not.toBe(first));
    clock.mockRestore();
    // once everyone has spoken twice, the room talks it over against a clock of its own
    for (let said = 0; said < NAMES.length * 2 && !screen.queryByText('Talk it over'); said++) press('Next');
    expect(await screen.findByText('Talk it over')).toBeTruthy();
    expect(screen.getByText('1:00')).toBeTruthy();
    press('Go to the vote');
    expect(await screen.findByText('Pass the phone to Azad')).toBeTruthy();
  });

  it('takes the room’s one choice when the vote is by pointing, and lets the impostor go when they could not agree', async () => {
    testAuth.client = fakeClient(offered());
    renderWithProviders(<CouchGame onLeave={() => undefined} />);
    await start([...NO_CLOCKS, ['The vote', 'By pointing']]);
    const cards = await dealRound();
    const impostor = NAMES[cards.findIndex((c) => c.includes('impostor'))]!;
    await screen.findByText('Round 1 of 2');
    press('Go to the vote');
    expect(await screen.findByText('Count to three and point!')).toBeTruthy();
    for (const name of NAMES) expect(screen.getByRole('button', { name })).toBeTruthy();
    press('We couldn’t agree');
    expect(await screen.findByText(`The impostor was ${impostor}`)).toBeTruthy();
    expect(screen.getByText('The impostor slipped away.')).toBeTruthy();
    expect(screen.getByLabelText(new RegExp(`^${impostor}: This game [1-9]`))).toBeTruthy();
  });

  it('gives the odd one out a card like anyone’s, with another word on it, and says both at the end', async () => {
    testAuth.client = fakeClient(offered());
    renderWithProviders(<CouchGame onLeave={() => undefined} />);
    await start([...NO_CLOCKS, ['Kind of game', /^Odd word out/], ['The vote', 'By pointing']]);
    const cards = await dealRound();
    expect(cards.filter((c) => c.includes('impostor'))).toHaveLength(0);
    expect(cards.filter((c) => c.includes('pisîk'))).toHaveLength(3);
    const odd = NAMES[cards.findIndex((c) => c.includes('kûçik'))]!;
    await screen.findByText('Round 1 of 2');
    press('Go to the vote');
    press(odd);
    // caught, the odd one out has no word to name: the cards turn at once
    expect(await screen.findByText('The odd one out was found: the table wins.')).toBeTruthy();
    expect(screen.getByText(/The other word was/).textContent).toContain('kûçik');
  });

  it('ends the evening from the score, or goes back to change the game', async () => {
    const onLeave = vi.fn();
    testAuth.client = fakeClient(offered());
    renderWithProviders(<CouchGame onLeave={onLeave} />);
    await start([...NO_CLOCKS, ['The vote', 'By pointing']]);
    await dealRound();
    await screen.findByText('Round 1 of 2');
    press('Go to the vote');
    press('We couldn’t agree');
    await screen.findByText('Next game');
    press('Change the game');
    expect(await screen.findByRole('button', { name: 'Deal the cards' })).toBeTruthy();
    expect((screen.getByLabelText('Player 1') as HTMLInputElement).value).toBe('Azad');
    press('Deal the cards');
    await dealRound();
    await screen.findByText('Round 1 of 2');
    press('Go to the vote');
    press('We couldn’t agree');
    press(await screen.findByText('Finish').then(() => 'Finish'));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });
});
