import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeApi, refused, type Call } from '../stories/testing';
import { JoinCodeForm, JoinCodeSheet } from './JoinCode';
import { renderPlay, where } from './testing';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const field = (): HTMLInputElement => screen.getByLabelText('Join with a code');
/** What the boxes show, left to right: the field's characters, drawn one to a box. */
const boxes = (): string[] => [...document.querySelectorAll('.code-box')].map((b) => b.textContent ?? '');
const joins = (calls: Call[]): Call[] => calls.filter((c) => c.method === 'POST' && c.path === '/play/join');

/** A device that asked for less motion. */
function reduceMotion(): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
    })),
  );
}

describe('the code boxes', () => {
  it('are one labelled field, drawn as six boxes the ear never hears', async () => {
    fakeApi({});
    renderPlay(<JoinCodeForm />);
    const input = field();
    expect(input.tagName).toBe('INPUT');
    expect(document.querySelector('.code-boxes')).toHaveAttribute('aria-hidden', 'true');
    expect(boxes()).toEqual(['', '', '', '', '', '']);
    // a code reads left to right even on a page that reads right to left
    expect(input.closest('.code-entry-field')).toHaveAttribute('dir', 'ltr');
  });

  it('upper-cases what is typed, drops what cannot be in a code, and moves the caret along', async () => {
    fakeApi({});
    renderPlay(<JoinCodeForm />);
    await userEvent.type(field(), 'ab o-c');
    expect(field()).toHaveValue('ABC');
    expect(boxes()).toEqual(['A', 'B', 'C', '', '', '']);
    // the fourth box is the one being filled, and wears the caret
    const active = document.querySelectorAll('.code-box')[3]!;
    expect(active).toHaveClass('is-active');
    expect(active.querySelector('.code-box-caret')).not.toBeNull();
    // Backspace takes the last one back
    await userEvent.type(field(), '{Backspace}');
    expect(boxes()).toEqual(['A', 'B', '', '', '', '']);
    expect(document.querySelectorAll('.code-box')[2]).toHaveClass('is-active');
  });

  it('joins on the sixth character, on its own, and opens the lobby it joined', async () => {
    const { calls } = fakeApi({ 'POST /play/join': { game: 'wordle-battle', lobbyId: 'b1' } });
    renderPlay(<JoinCodeForm />);
    await userEvent.type(field(), 'abc234');
    await waitFor(() => expect(joins(calls).map((c) => c.body)).toEqual([{ code: 'ABC234' }]));
    expect(await screen.findByRole('status')).toHaveTextContent('You’re in! Opening the game…');
    // the boxes turn green, a handful of flecks is thrown, and then the lobby
    expect(document.querySelector('.code-entry')).toHaveClass('is-joined');
    expect(document.querySelectorAll('.celebrate-fleck').length).toBeGreaterThan(0);
    await waitFor(() => expect(where()).toBe('/app/games/peyvok-battle?id=b1'));
  });

  it('opens a story game it joined at the game itself', async () => {
    fakeApi({ 'POST /play/join': { game: 'stories', lobbyId: 'g7' } });
    renderPlay(<JoinCodeForm />);
    await userEvent.type(field(), 'KMN456');
    await waitFor(() => expect(where()).toBe('/app/games/stories/play/g7'));
  });

  it('takes a pasted code however it was written, lower case, spaced or dashed', async () => {
    const { calls } = fakeApi({ 'POST /play/join': { game: 'rhyme-match', lobbyId: 'rm1' } });
    renderPlay(<JoinCodeForm />);
    await userEvent.click(field());
    await userEvent.paste('abc-234');
    expect(boxes()).toEqual(['A', 'B', 'C', '2', '3', '4']);
    await waitFor(() => expect(joins(calls).map((c) => c.body)).toEqual([{ code: 'ABC234' }]));
  });

  it('takes a code with spaces, and the whole message it came in', async () => {
    const { calls } = fakeApi({ 'POST /play/join': refused(404, 'GAME_NOT_FOUND') });
    renderPlay(<JoinCodeForm />);
    await userEvent.click(field());
    await userEvent.paste(' xyz 789 ');
    await waitFor(() => expect(joins(calls)).toHaveLength(1));
    await screen.findByRole('alert');
    await userEvent.clear(field());
    await userEvent.paste('Play Peyvok Battle with me on Hevalo! Open Games → Join with a code and type ABC 234.');
    await waitFor(() => expect(joins(calls).map((c) => c.body)).toEqual([{ code: 'XYZ789' }, { code: 'ABC234' }]));
  });

  it('reads the digits an Arabic or a Soranî keyboard types', async () => {
    const { calls } = fakeApi({ 'POST /play/join': { game: 'wordle-battle', lobbyId: 'b1' } });
    renderPlay(<JoinCodeForm />);
    await userEvent.type(field(), 'abc٢٣۴');
    expect(boxes()).toEqual(['A', 'B', 'C', '2', '3', '4']);
    await waitFor(() => expect(joins(calls).map((c) => c.body)).toEqual([{ code: 'ABC234' }]));
  });

  it('opens the lobby of an old invite link pasted in, without asking the server for a code', async () => {
    const { calls } = fakeApi({});
    renderPlay(<JoinCodeForm />);
    await userEvent.click(field());
    await userEvent.paste('Come and play! https://hevalo.app/app/games/rhyme-match?id=b7f2c1a4-9e3d-4a11');
    await waitFor(() => expect(where()).toBe('/app/games/rhyme-match?id=b7f2c1a4-9e3d-4a11'));
    expect(joins(calls)).toEqual([]);
  });

  it('can be sent with Join too, and says when a code is not finished', async () => {
    const { calls } = fakeApi({});
    renderPlay(<JoinCodeForm />);
    await userEvent.type(field(), 'abc');
    await userEvent.click(screen.getByRole('button', { name: 'Join' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('A code has six letters and numbers.');
    expect(joins(calls)).toEqual([]);
  });
});

describe('a code that does not get you in', () => {
  const cases: Array<[string, () => Response | Promise<never>, string]> = [
    ['nobody is using', () => refused(404, 'GAME_NOT_FOUND'), 'No open game has this code. Check it, or ask your friend for a new one.'],
    ['is for a full game', () => refused(409, 'GAME_FULL'), 'This game is full.'],
    ['is for a game that has started', () => refused(409, 'GAME_STARTED'), 'This game has already started.'],
    ['was tried too often', () => refused(429, 'RATE_LIMITED'), 'Too many tries. Wait a minute and try again.'],
    ['cannot reach the server', () => Promise.reject(new TypeError('Failed to fetch')), 'Can’t reach Hevalo right now. Check your connection and try again.'],
  ];

  for (const [what, answer, said] of cases) {
    it(`is said plainly when it ${what}, shaken in red, and cleared by typing again`, async () => {
      fakeApi({ 'POST /play/join': answer });
      renderPlay(<JoinCodeForm />);
      await userEvent.type(field(), 'abc234');
      expect(await screen.findByRole('alert')).toHaveTextContent(said);
      expect(document.querySelector('.code-entry')).toHaveClass('is-error');
      expect(field()).toHaveAttribute('aria-invalid', 'true');
      expect(field()).toHaveAccessibleDescription(expect.stringContaining(said));
      await userEvent.type(field(), '{Backspace}');
      expect(screen.queryByRole('alert')).toBeNull();
      expect(document.querySelector('.code-entry')).not.toHaveClass('is-error');
    });
  }

  it('asks for the birth month the way every game does, when the account has none yet', async () => {
    const { calls } = fakeApi({ 'POST /play/join': refused(428, 'BIRTH_DATE_REQUIRED') });
    renderPlay(<JoinCodeForm />);
    await waitFor(() => expect(calls.some((c) => c.path === '/me')).toBe(true));
    const before = calls.filter((c) => c.path === '/me').length;
    await userEvent.type(field(), 'abc234');
    // the account is read again, and the app's own gate asks the question
    await waitFor(() => expect(calls.filter((c) => c.path === '/me').length).toBeGreaterThan(before));
  });
});

describe('under Reduce Motion', () => {
  it('changes only the colours: no flecks, and the lobby opens sooner', async () => {
    reduceMotion();
    fakeApi({ 'POST /play/join': { game: 'wordle-battle', lobbyId: 'b1' } });
    renderPlay(<JoinCodeForm />);
    expect(document.querySelector('.code-entry')).toHaveClass('is-still');
    await userEvent.type(field(), 'abc234');
    await waitFor(() => expect(document.querySelector('.code-entry')).toHaveClass('is-joined'));
    expect(document.querySelectorAll('.celebrate-fleck')).toHaveLength(0);
    await waitFor(() => expect(where()).toBe('/app/games/peyvok-battle?id=b1'), { timeout: 1000 });
  });
});

describe('the sheet', () => {
  it('opens on the boxes, ready to type in', async () => {
    fakeApi({});
    renderPlay(<JoinCodeSheet open onClose={() => undefined} />);
    const sheet = await screen.findByRole('dialog', { name: 'Join with a code' });
    await waitFor(() => expect(within(sheet).getByLabelText('Join with a code')).toHaveFocus());
  });

  it('asks a visitor to make an account first, and brings them back to it', async () => {
    fakeApi({}, { signedIn: false });
    renderPlay(<JoinCodeSheet open onClose={() => undefined} />);
    const sheet = await screen.findByRole('dialog', { name: 'Join with a code' });
    expect(within(sheet).queryByLabelText('Join with a code')).toBeNull();
    expect(within(sheet).getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/register');
    expect(within(sheet).getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
  });
});
