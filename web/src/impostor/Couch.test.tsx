import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { jsonResponse, withBothDialects } from '../test/utils';
import { renderPlay } from '../play/testing';
import { forgetPartyOffers } from '../party/offer';
import { Impostor } from './Impostor';

/**
 * Xapînok on one phone from setup to score, then undoable taps, the second vote with two impostors, the evening
 * keeping the chosen way, and the learner's own Kurdish first.
 */

// stand-in Kurdish for the fixtures, never shown to a learner
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  localStorage.clear();
  forgetPartyOffers();
});

const me = { user: { id: 'me', username: 'ada', displayName: 'Ada', email: 'a@example.com', emailVerified: true } };
const card = (word: string, twin: string | null = 'kûçik') => ({
  word,
  meanings: { en: `the ${word}` },
  hint: { ku: 'heywan', meanings: { en: 'animal' } },
  decoys: ['hesp', 'mişk', 'ker'],
  twin: twin ? { word: twin, meanings: { en: 'dog' } } : null,
});
const offer = {
  dialect: 'kmr',
  difficulties: [{ difficulty: 'beginner', cards: 20, categories: [{ slug: 'animals', ku: 'heywan', meanings: { en: 'animal' }, cards: 12 }] }],
};
const none = { dialect: 'ckb', difficulties: [] };

function serve(routes: Record<string, unknown>): Array<{ url: string; method: string; body: unknown }> {
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
  const answers = withBothDialects(routes);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      calls.push({ url, method, body: init?.body ? JSON.parse(init.body as string) : null });
      const key = Object.keys(answers).find((k) => {
        const [m, path] = k.includes(' ') ? k.split(' ') : ['GET', k];
        return m === method && url.includes(path!);
      });
      if (key) {
        const answer = answers[key] as { status?: number; body?: unknown } | undefined;
        if (answer && typeof answer === 'object' && 'status' in answer && 'body' in answer) return jsonResponse(answer.status!, answer.body);
        return jsonResponse(200, answers[key]);
      }
      if (url.includes('/me')) return jsonResponse(200, me);
      return jsonResponse(200, {});
    }),
  );
  return calls;
}

const offered = (deck: unknown = { dialect: 'kmr', cards: [card('pisîk'), card('hirç')] }) => ({
  '/games/impostor/couch?dialect=kmr': offer,
  '/games/impostor/couch?dialect=ckb': none,
  'POST /games/impostor/couch/deck': deck,
});

const NAMES = ['Azad', 'Berfîn', 'Ciwan', 'Dîlan'];

/** A chip by its own words, or by its group's name and its words where two groups have a chip that reads the same. */
type Chip = string | RegExp | [group: string, chip: string];
const NO_CLUE_CLOCK: Chip = ['Time per clue', 'No clock'];

/** The setup filled in with four names and whatever chips a test asks for, and the cards dealt. */
async function start(chips: Chip[] = []): Promise<void> {
  const boxes = await screen.findAllByRole('textbox');
  for (const [i, name] of NAMES.entries()) await userEvent.type(boxes[i]!, name);
  for (const chip of chips) {
    const within_ = Array.isArray(chip) ? within(screen.getByRole('radiogroup', { name: chip[0] })) : screen;
    await userEvent.click(within_.getByRole('radio', { name: Array.isArray(chip) ? chip[1] : chip }));
  }
  await userEvent.click(screen.getByRole('button', { name: 'Deal the cards' }));
}

/** The phone taken by the player it was passed to, their card read while pressed, and hidden again. Answers what the card said. */
async function readCard(name: string): Promise<string> {
  await userEvent.click(await screen.findByRole('button', { name: `I’m ${name}` }));
  const hold = screen.getByRole('button', { name: 'Hold to see your card' });
  const face = screen.getByRole('group', { name: `${name}’s card` });
  fireEvent.pointerDown(hold);
  const text = face.textContent ?? '';
  fireEvent.pointerUp(hold);
  await userEvent.click(screen.getByRole('button', { name: 'Hide it and pass on' }));
  return text;
}

/** Every card read, in seat order: what each said. */
async function dealRound(): Promise<string[]> {
  const cards: string[] = [];
  for (const name of NAMES) cards.push(await readCard(name));
  return cards;
}

describe('the way in', () => {
  it('is the first thing to press on the start, and each way to play and category opens the setup with it chosen', async () => {
    serve({
      ...offered(),
      '/games/availability?dialect=kmr': { dialect: 'kmr', games: [{ id: 'impostor', available: true, difficulties: ['beginner'], levels: {}, levelled: true, minimum: 12 }] },
      '/games/availability?dialect=ckb': { dialect: 'ckb', games: [{ id: 'impostor', available: false, difficulties: [], levels: {}, levelled: true, minimum: 12 }] },
    });
    renderPlay(<Impostor />, { route: '/app/games/impostor' });
    const hero = await screen.findByRole('region', { name: 'One word. One impostor. Who’s bluffing?' });
    expect(within(hero).getByRole('link', { name: 'Play on this phone' })).toHaveAttribute('href', '/app/games/impostor?couch=1');
    // the game with friends is on the page too, one press away, but it is not the first thing asked
    expect(within(hero).getByRole('link', { name: 'With friends' })).toHaveAttribute('href', '#party-friends');
    const ways = screen.getByRole('region', { name: 'Three ways to play' });
    expect(within(ways).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual([
      '/app/games/impostor?couch=1&way=classic',
      '/app/games/impostor?couch=1&way=blind',
      '/app/games/impostor?couch=1&way=odd',
    ]);
    const categories = await screen.findByRole('region', { name: 'Categories' });
    const animals = within(categories).getByRole('link', { name: /heywan/ });
    expect(animals).toHaveAttribute('href', '/app/games/impostor?couch=1&category=animals');
    expect(within(animals).getByText('heywan')).toHaveAttribute('lang', 'ku');
  });

  it('opens the setup with the way to play and the category the start page was left with', async () => {
    serve(offered());
    renderPlay(<Impostor />, { route: '/app/games/impostor?couch=1&way=odd&category=animals' });
    expect(await screen.findByRole('radio', { name: /^Odd word out/ })).toBeChecked();
    expect(within(screen.getByRole('radiogroup', { name: 'Category' })).getByRole('radio', { name: /heywan/ })).toBeChecked();
    // a way or a category that is no such thing changes nothing
    cleanup();
    renderPlay(<Impostor />, { route: '/app/games/impostor?couch=1&way=loud&category=nowhere' });
    expect(await screen.findByRole('radio', { name: /^Classic/ })).toBeChecked();
    expect(within(screen.getByRole('radiogroup', { name: 'Category' })).getByRole('radio', { name: 'Any' })).toBeChecked();
  });

  it('says plainly when there are no cards to play with', async () => {
    serve({ '/games/impostor/couch?dialect=kmr': none, '/games/impostor/couch?dialect=ckb': none });
    renderPlay(<Impostor />, { route: '/app/games/impostor?couch=1' });
    expect(await screen.findByText('Xapînok isn’t offered in this Kurdish yet.')).toBeInTheDocument();
  });
});

describe('the setup', () => {
  it('asks the server for cards by variety, level and category, and never sends a name', async () => {
    const calls = serve(offered());
    renderPlay(<Impostor />, { route: '/app/games/impostor?couch=1' });
    await start([/heywan/]);
    await screen.findByText('Pass the phone to Azad');
    const sent = calls.filter((c) => c.url.includes('/games/impostor/couch/deck'));
    expect(sent).toHaveLength(1);
    expect(sent[0]!.method).toBe('POST');
    expect(sent[0]!.body).toEqual({ dialect: 'kmr', difficulty: 'beginner', category: 'animals' });
    expect(JSON.stringify(calls)).not.toContain('Azad');
    // where it is offered was asked once, for both varieties
    expect(calls.filter((c) => c.method === 'GET' && c.url.endsWith('/games/impostor/couch'))).toHaveLength(1);
  });

  it('gives an empty box its number for a name, and refuses two players of one name', async () => {
    serve(offered());
    renderPlay(<Impostor />, { route: '/app/games/impostor?couch=1' });
    const boxes = await screen.findAllByRole('textbox');
    await userEvent.type(boxes[0]!, 'Azad');
    await userEvent.type(boxes[1]!, 'azad');
    await userEvent.click(screen.getByRole('button', { name: 'Deal the cards' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Two players have the same name.');
    await userEvent.clear(boxes[1]!);
    await userEvent.click(screen.getByRole('button', { name: 'Deal the cards' }));
    expect(await screen.findByText('Pass the phone to Azad')).toBeInTheDocument();
    expect(screen.queryByText('Player 2')).toBeNull();
  });

  it('offers a second impostor only to a room of six', async () => {
    serve(offered());
    renderPlay(<Impostor />, { route: '/app/games/impostor?couch=1' });
    await screen.findAllByRole('textbox');
    expect(screen.queryByRole('radiogroup', { name: 'Impostors' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Add a player' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add a player' }));
    expect(screen.getByRole('radiogroup', { name: 'Impostors' })).toBeInTheDocument();
  });

  it('says so when the cards cannot be fetched, and keeps what was typed', async () => {
    serve(offered({ status: 409, body: { code: 'GAME_UNAVAILABLE', message: 'no cards' } }));
    renderPlay(<Impostor />, { route: '/app/games/impostor?couch=1' });
    await start();
    expect(await screen.findByRole('alert')).toHaveTextContent('The cards couldn’t be fetched.');
    expect(screen.getAllByRole('textbox')[0]).toHaveValue('Azad');
  });

  it('remembers the names on this phone for next time', async () => {
    serve(offered());
    const first = renderPlay(<Impostor />, { route: '/app/games/impostor?couch=1' });
    await start();
    await screen.findByText('Pass the phone to Azad');
    first.unmount();
    renderPlay(<Impostor />, { route: '/app/games/impostor?couch=1' });
    await waitFor(() => expect(screen.getAllByRole('textbox').map((b) => (b as HTMLInputElement).value)).toEqual(NAMES));
  });
});

describe('the phone going round', () => {
  it('shows a card only while it is pressed, and one impostor among the four', async () => {
    serve(offered());
    renderPlay(<Impostor />, { route: '/app/games/impostor?couch=1' });
    await start();
    await userEvent.click(await screen.findByRole('button', { name: 'I’m Azad' }));
    const face = screen.getByRole('group', { name: 'Azad’s card' });
    const hold = screen.getByRole('button', { name: 'Hold to see your card' });
    const pass = screen.getByRole('button', { name: 'Hide it and pass on' });
    // nothing to read, and nothing to pass on, before the card has been looked at
    expect(face).not.toHaveTextContent(/pisîk|impostor/i);
    expect(pass).toBeDisabled();
    fireEvent.pointerDown(hold);
    expect(face).toHaveTextContent(/pisîk|You’re the impostor/);
    expect(pass).toBeDisabled();
    fireEvent.pointerUp(hold);
    expect(face).not.toHaveTextContent(/pisîk|impostor/i);
    expect(pass).toBeEnabled();
    // looking away from the page hides it as well
    fireEvent.pointerDown(hold);
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    expect(face).not.toHaveTextContent(/pisîk|impostor/i);
    await userEvent.click(pass);

    const rest: string[] = [];
    for (const name of NAMES.slice(1)) rest.push(await readCard(name));
    expect(await screen.findByText('Round 1 of 2')).toBeInTheDocument();
    // between two players the screen held nothing but a name: the cards are gone from the page
    expect(document.body).not.toHaveTextContent('pisîk');
    expect(rest.filter((c) => c.includes('You’re the impostor')).length).toBeLessThanOrEqual(1);
  });

  it('gives the odd one out a card like anyone’s, with the other word on it', async () => {
    serve(offered());
    renderPlay(<Impostor />, { route: '/app/games/impostor?couch=1' });
    await start([/^Odd word out/]);
    const cards = await dealRound();
    expect(cards.filter((c) => c.includes('kûçik'))).toHaveLength(1);
    expect(cards.filter((c) => c.includes('pisîk'))).toHaveLength(3);
    expect(cards.some((c) => c.includes('impostor'))).toBe(false);
  });

  it('tells a blind impostor nothing, not even the category', async () => {
    serve(offered());
    renderPlay(<Impostor />, { route: '/app/games/impostor?couch=1' });
    await start([/^In the dark/]);
    const cards = await dealRound();
    const theirs = cards.find((c) => c.includes('You’re the impostor'))!;
    expect(theirs).not.toContain('heywan');
    expect(cards.filter((c) => c.includes('heywan'))).toHaveLength(3);
  });
});

describe('the clues and the talk', () => {
  it('goes round the room once per round, then talks, then votes', async () => {
    serve(offered());
    renderPlay(<Impostor />, { route: '/app/games/impostor?couch=1' });
    await start(['1', NO_CLUE_CLOCK]);
    await dealRound();
    const order = within(screen.getByRole('list')).getAllByRole('listitem').map((li) => li.textContent);
    expect([...order].sort()).toEqual([...NAMES].sort());
    for (const name of order) {
      expect(screen.getByText(`${name}, your clue`)).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    }
    expect(await screen.findByText('Talk it over')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Go to the vote' }));
    expect(await screen.findByText('Pass the phone to Azad')).toBeInTheDocument();
  });

  it('moves on by itself when a clue’s time runs out', async () => {
    serve(offered());
    renderPlay(<Impostor />, { route: '/app/games/impostor?couch=1' });
    await start(['15 s']);
    await dealRound();
    const first = screen.getByRole('listitem', { current: true }).textContent;
    // sixteen seconds on: the clock reads the time at its next tick and finds the clue's time gone
    const real = Date.now.bind(Date);
    vi.spyOn(Date, 'now').mockImplementation(() => real() + 16_000);
    await waitFor(() => expect(screen.getByRole('listitem', { current: true }).textContent).not.toBe(first));
  });
});

/** A game of four dealt and talked through to the vote, with who the impostor is read off the cards. */
async function toVote(chips: Chip[]): Promise<{ impostor: string; others: string[] }> {
  await start(['1', NO_CLUE_CLOCK, ...chips]);
  const cards = await dealRound();
  const impostor = NAMES[cards.findIndex((c) => c.includes('You’re the impostor'))]!;
  for (let i = 0; i < NAMES.length; i++) await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  return { impostor, others: NAMES.filter((n) => n !== impostor) };
}

/** Fake clocks that also advance by themselves, so the undo window or a vote clock can be skipped at once. */
function quickClock(): void {
  vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 1, toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
}

/** The moment to take a tap back over, or as much time as a test asks for. */
function momentPasses(ms = 3_000): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

/** One private vote: the phone taken by the voter, and the seat they name. */
async function castVote(voter: string, suspect: string): Promise<void> {
  await userEvent.click(await screen.findByRole('button', { name: `I’m ${voter}` }));
  await userEvent.click(screen.getByRole('button', { name: `Vote for ${suspect}` }));
}

describe('the vote and what follows', () => {
  it('takes each vote in private, catches the impostor, and lets them guess the word once they say it is their answer', async () => {
    quickClock();
    serve(offered());
    renderPlay(<Impostor />, { route: '/app/games/impostor?couch=1' });
    const { impostor, others } = await toVote([]);
    await userEvent.click(screen.getByRole('button', { name: 'Go to the vote' }));
    for (const name of NAMES) {
      await userEvent.click(await screen.findByRole('button', { name: `I’m ${name}` }));
      expect(screen.getByRole('heading', { name: `${name}, who is it?` })).toBeInTheDocument();
      // nobody is offered their own name
      expect(screen.queryByRole('button', { name: `Vote for ${name}` })).toBeNull();
      await userEvent.click(screen.getByRole('button', { name: `Vote for ${name === impostor ? others[0]! : impostor}` }));
    }
    // the last vote is counted once its moment is over, and nothing is shown before then
    expect(screen.getByText(`You voted for ${NAMES.at(-1) === impostor ? others[0] : impostor}`)).toBeInTheDocument();
    expect(screen.queryByText(/was caught/)).toBeNull();
    momentPasses();
    expect(await screen.findByText(`${impostor} was caught! Hand them the phone for one guess at the word.`)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: `I’m ${impostor}` }));
    // a word tapped is asked about once more, and can be chosen again
    await userEvent.click(screen.getByRole('button', { name: 'mişk' }));
    const asked = screen.getByRole('heading', { name: /^Your answer:/ });
    expect(asked).toHaveTextContent('Your answer: mişk?');
    expect(within(asked).getByText('mişk')).toHaveAttribute('lang', 'ku');
    await userEvent.click(screen.getByRole('button', { name: 'Choose again' }));
    await userEvent.click(screen.getByRole('button', { name: 'hesp' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, that’s my answer' }));
    expect(await screen.findByText(`The impostor was ${impostor}`)).toBeInTheDocument();
    expect(screen.getByText('Caught, and the guess was wrong: the table wins.')).toBeInTheDocument();
    // three right votes and the catch: 1 + 2 each for the table, nothing for the impostor
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    for (const row of rows) expect(row).toHaveTextContent(row.textContent!.startsWith(impostor) ? /0\s*0$/ : /\+3\s*3$/);
    expect(screen.getByText(`${others[0]} voted for ${impostor}`)).toBeInTheDocument();
  });

  it('takes the room’s one choice when the vote is made by pointing, and says the impostor slipped away from a wrong one', async () => {
    quickClock();
    serve(offered());
    renderPlay(<Impostor />, { route: '/app/games/impostor?couch=1' });
    const { impostor, others } = await toVote(['By pointing']);
    await userEvent.click(screen.getByRole('button', { name: 'Go to the vote' }));
    expect(await screen.findByRole('heading', { name: 'Count to three and point!' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: others[0]! }));
    momentPasses();
    expect(await screen.findByText('The impostor slipped away.')).toBeInTheDocument();
    expect(screen.getByText(`The players voted out ${others[0]}, but they weren’t the impostor.`)).toBeInTheDocument();
    expect(screen.getByText(`The impostor was ${impostor}`)).toBeInTheDocument();
    // the word on every card but the impostor's, and once more with its meaning
    expect(screen.getAllByText('pisîk')).toHaveLength(NAMES.length);
  });

  it('says the votes were tied when the room could not agree', async () => {
    quickClock();
    serve(offered());
    renderPlay(<Impostor />, { route: '/app/games/impostor?couch=1' });
    await toVote(['By pointing']);
    await userEvent.click(screen.getByRole('button', { name: 'Go to the vote' }));
    await userEvent.click(await screen.findByRole('button', { name: 'We couldn’t agree' }));
    momentPasses();
    expect(await screen.findByText('The votes were tied.')).toBeInTheDocument();
    expect(screen.getByText('The impostor slipped away.')).toBeInTheDocument();
  });

  it('plays the next game from the same cards, with the score carried on', async () => {
    quickClock();
    const calls = serve(offered());
    renderPlay(<Impostor />, { route: '/app/games/impostor?couch=1' });
    const { others } = await toVote(['By pointing']);
    await userEvent.click(screen.getByRole('button', { name: 'Go to the vote' }));
    await userEvent.click(await screen.findByRole('button', { name: others[0]! }));
    momentPasses();
    await userEvent.click(await screen.findByRole('button', { name: 'Next game' }));
    expect(await screen.findByText('Game 2')).toBeInTheDocument();
    expect(calls.filter((c) => c.url.includes('/games/impostor/couch/deck'))).toHaveLength(1);
    const second = await dealRound();
    expect(second.filter((c) => c.includes('hirç'))).toHaveLength(3);
  });

  it('asks for a fresh batch without the words already played tonight', async () => {
    quickClock();
    const calls = serve(offered({ dialect: 'kmr', cards: [card('pisîk')] }));
    renderPlay(<Impostor />, { route: '/app/games/impostor?couch=1' });
    const { others } = await toVote(['By pointing']);
    await userEvent.click(screen.getByRole('button', { name: 'Go to the vote' }));
    await userEvent.click(await screen.findByRole('button', { name: others[0]! }));
    momentPasses();
    await userEvent.click(await screen.findByRole('button', { name: 'Next game' }));
    expect(await screen.findByText('Game 2')).toBeInTheDocument();
    const asked = calls.filter((c) => c.url.includes('/games/impostor/couch/deck')).map((c) => c.body);
    expect(asked).toEqual([
      { dialect: 'kmr', difficulty: 'beginner', category: null },
      { dialect: 'kmr', difficulty: 'beginner', category: null, exclude: ['pisîk'] },
    ]);
  });
});

describe('taking a tap back', () => {
  it('goes back to the clues from the vote for a moment, and then the way back is gone', async () => {
    quickClock();
    serve(offered());
    renderPlay(<Impostor />, { route: '/app/games/impostor?couch=1' });
    await start(['1', NO_CLUE_CLOCK]);
    await dealRound();
    const speaker = screen.getByText(/, your clue$/).textContent;
    await userEvent.click(screen.getByRole('button', { name: 'Go to the vote' }));
    expect(await screen.findByText('Pass the phone to Azad')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByText(speaker!)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Go to the vote' }));
    momentPasses();
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
    expect(screen.getByText('Pass the phone to Azad')).toBeInTheDocument();
  });

  it('takes a private vote back to the voter’s own screen, and never says whom it named to the next one', async () => {
    quickClock();
    serve(offered());
    renderPlay(<Impostor />, { route: '/app/games/impostor?couch=1' });
    await toVote([]);
    await userEvent.click(screen.getByRole('button', { name: 'Go to the vote' }));
    await userEvent.click(await screen.findByRole('button', { name: 'I’m Azad' }));
    await userEvent.click(screen.getByRole('button', { name: 'I can’t decide' }));
    expect(await screen.findByText('Pass the phone to Berfîn')).toBeInTheDocument();
    expect(screen.queryByText(/can’t decide|voted for/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    // Azad still has the phone: their own vote, not the screen that asks for it
    expect(screen.getByRole('heading', { name: 'Azad, who is it?' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Vote for Ciwan' }));
    expect(await screen.findByText('Pass the phone to Berfîn')).toBeInTheDocument();
  });

  it('holds the last vote for its moment, and taking it back shows nothing of what it would have', async () => {
    quickClock();
    serve(offered());
    renderPlay(<Impostor />, { route: '/app/games/impostor?couch=1' });
    const { impostor } = await toVote([]);
    await userEvent.click(screen.getByRole('button', { name: 'Go to the vote' }));
    for (const name of NAMES.slice(0, -1)) await castVote(name, name === impostor ? NAMES.find((n) => n !== name)! : impostor);
    await userEvent.click(await screen.findByRole('button', { name: 'I’m Dîlan' }));
    await userEvent.click(screen.getByRole('button', { name: 'I can’t decide' }));
    expect(screen.getByText('I can’t decide')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByRole('heading', { name: 'Dîlan, who is it?' })).toBeInTheDocument();
    momentPasses();
    // nothing was counted: the vote is still Dîlan's to make
    expect(screen.queryByText(/was caught|slipped away/)).toBeNull();
    expect(screen.getByRole('heading', { name: 'Dîlan, who is it?' })).toBeInTheDocument();
  });
});

const SIX = ['Azad', 'Berfîn', 'Ciwan', 'Dîlan', 'Evîn', 'Firat'];

/** A game of six with two impostors, dealt and taken to the vote: who the impostors are, read off the cards. */
async function twoImpostors(chips: Chip[]): Promise<string[]> {
  await userEvent.click(await screen.findByRole('button', { name: 'Add a player' }));
  await userEvent.click(screen.getByRole('button', { name: 'Add a player' }));
  const boxes = screen.getAllByRole('textbox');
  for (const [i, name] of SIX.entries()) await userEvent.type(boxes[i]!, name);
  for (const chip of [['Impostors', '2'], ['Times round for clues', '1'], NO_CLUE_CLOCK, ...chips] as Chip[]) {
    const within_ = Array.isArray(chip) ? within(screen.getByRole('radiogroup', { name: chip[0] })) : screen;
    await userEvent.click(within_.getByRole('radio', { name: Array.isArray(chip) ? chip[1] : chip }));
  }
  await userEvent.click(screen.getByRole('button', { name: 'Deal the cards' }));
  const cards: string[] = [];
  for (const name of SIX) cards.push(await readCard(name));
  for (let i = 0; i < SIX.length; i++) await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  await userEvent.click(screen.getByRole('button', { name: 'Go to the vote' }));
  return SIX.filter((_, i) => cards[i]!.includes('You’re the impostor'));
}

describe('two impostors', () => {
  it('has the room vote again for the second once the first is caught, and pays for the catch', async () => {
    quickClock();
    serve(offered());
    renderPlay(<Impostor />, { route: '/app/games/impostor?couch=1' });
    const [first, other] = await twoImpostors(['By pointing']);
    await userEvent.click(await screen.findByRole('button', { name: first! }));
    momentPasses();
    await userEvent.click(await screen.findByRole('button', { name: `I’m ${first}` }));
    await userEvent.click(screen.getByRole('button', { name: 'hesp' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, that’s my answer' }));
    // what the second vote is for, and its clock, before anyone is named
    expect(await screen.findByRole('heading', { name: 'One impostor is caught. Who is the other one?' })).toBeInTheDocument();
    expect(screen.getByText('Everyone else votes once more: 30 seconds.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Go to the vote' }));
    expect(screen.getByRole('timer')).toBeInTheDocument();
    // the impostor already caught is not among those the room can name
    expect(screen.queryByRole('button', { name: first! })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: other! }));
    momentPasses();
    expect(await screen.findByText(`${other} was caught!`)).toBeInTheDocument();
    expect(screen.getByText(`The impostors were ${[first, other].sort((a, b) => SIX.indexOf(a!) - SIX.indexOf(b!)).join(' and ')}`)).toBeInTheDocument();
    expect(screen.queryByText(/stayed hidden/)).toBeNull();
  });

  it('pays the impostor nobody found in time once the second vote’s clock runs out', async () => {
    quickClock();
    serve(offered());
    renderPlay(<Impostor />, { route: '/app/games/impostor?couch=1' });
    const [first, other] = await twoImpostors([]);
    // everyone names the first impostor, who names someone else
    for (const name of SIX) await castVote(name, name === first ? SIX.find((n) => n !== first && n !== other)! : first!);
    momentPasses();
    await userEvent.click(await screen.findByRole('button', { name: `I’m ${first}` }));
    await userEvent.click(screen.getByRole('button', { name: 'hesp' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, that’s my answer' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Go to the vote' }));
    // one vote is cast, for someone who is not the other impostor, and then the time is up
    const voter = SIX.find((n) => n !== first)!;
    const wrong = SIX.find((n) => n !== first && n !== other && n !== voter)!;
    await castVote(voter, wrong);
    momentPasses(31_000);
    expect(await screen.findByText(`${other} stayed hidden to the end: +3.`)).toBeInTheDocument();
    expect(screen.getByText(`${voter} voted for ${wrong}`)).toBeInTheDocument();
    // who had not voted when the clock ran out did not vote at all
    const late = SIX.filter((n) => n !== first && n !== voter);
    for (const name of late) expect(screen.getByText(`${name} didn’t vote`)).toBeInTheDocument();
    const row = within(screen.getByRole('table')).getAllByRole('row').find((r) => r.textContent!.startsWith(other!))!;
    expect(row).toHaveTextContent(/\+3\s*3$/);
  });
});

describe('the evening', () => {
  it('plays one round the plain way when a card has no odd word, says so, and goes back to the odd word after', async () => {
    quickClock();
    serve(offered({ dialect: 'kmr', cards: [card('pisîk', null), card('hirç', 'rovî')] }));
    renderPlay(<Impostor />, { route: '/app/games/impostor?couch=1' });
    await start(['1', NO_CLUE_CLOCK, /^Odd word out/, 'By pointing']);
    expect(await screen.findByText('No odd word this time, so this game is classic.')).toBeInTheDocument();
    const first = await dealRound();
    expect(first.filter((c) => c.includes('You’re the impostor'))).toHaveLength(1);
    for (let i = 0; i < NAMES.length; i++) await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.click(screen.getByRole('button', { name: 'Go to the vote' }));
    await userEvent.click(await screen.findByRole('button', { name: 'We couldn’t agree' }));
    momentPasses();
    await userEvent.click(await screen.findByRole('button', { name: 'Next game' }));
    expect(await screen.findByText('Game 2')).toBeInTheDocument();
    expect(screen.queryByText('No odd word this time, so this game is classic.')).toBeNull();
    const second = await dealRound();
    expect(second.filter((c) => c.includes('rovî'))).toHaveLength(1);
    expect(second.some((c) => c.includes('impostor'))).toBe(false);
  });

  it('opens the setup on the learner’s own Kurdish where the game is offered in it', async () => {
    localStorage.setItem('hevalo.learn.courseDialect', 'sorani');
    serve({
      ...offered(),
      '/games/impostor/couch?dialect=ckb': {
        dialect: 'ckb',
        difficulties: [{ difficulty: 'beginner', cards: 20, categories: [{ slug: 'animals', ku: 'ئاژەڵ', meanings: { en: 'animal' }, cards: 12 }] }],
      },
    });
    renderPlay(<Impostor />, { route: '/app/games/impostor?couch=1' });
    expect(await screen.findByRole('radio', { name: 'Soranî' })).toBeChecked();
    expect(within(screen.getByRole('radiogroup', { name: 'Category' })).getByRole('radio', { name: /ئاژەڵ/ })).toBeInTheDocument();
  });
});
