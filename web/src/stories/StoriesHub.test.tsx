import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderApp } from '../test/utils';
import { StoriesHub } from './StoriesHub';
import { clearStoryLists } from './catalogue';
import { resetSessionVariety } from './prefs';
import { fakeApi, gameView, listItem } from './testing';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  clearStoryLists();
  resetSessionVariety();
});

const hub = (entry = '/app/games/stories') =>
  renderApp(
    <Routes>
      <Route path="/app/games/stories" element={<StoriesHub />} />
      <Route path="/app/games/stories/play/:id" element={<p>the game page</p>} />
      <Route path="/app/games/wordle-battle" element={<p>the battle page</p>} />
    </Routes>,
    [entry],
  );

const kurmanci = [
  listItem({ id: 'a', slug: 'a', title: 'Qelema Şîn', length: 'short', fullyNarrated: true }),
  listItem({ id: 'b', slug: 'b', title: 'Bazar', length: 'medium', level: 2, readingMinutes: 4 }),
];

describe('Stories hub', () => {
  it('lists the stories of a variety with what each one is', async () => {
    fakeApi({
      'GET /stories': { stories: kurmanci },
      'GET /story-games/history': { progress: [{ storyId: 'a', bestCorrect: 4, total: 5, lastFinishedAt: '2026-10-01T00:00:00Z' }] },
    });
    hub();
    const first = (await screen.findByText('Qelema Şîn')).closest('a')!;
    expect(first).toHaveAttribute('href', '/app/games/stories/a');
    // a story's own words are marked as Kurdish, in its own direction
    expect(within(first).getByText('Qelema Şîn')).toHaveAttribute('lang', 'ku');
    expect(within(first).getByText('Qelema Şîn')).toHaveAttribute('dir', 'ltr');
    expect(within(first).getByText('Read aloud')).toBeInTheDocument();
    expect(await within(first).findByText('Done · 4/5')).toBeInTheDocument();
    expect(within(first).getByText('~2 min')).toBeInTheDocument();
    const second = screen.getByText('Bazar').closest('a')!;
    expect(within(second).queryByText('Read aloud')).toBeNull();
    expect(within(second).getByText('Level 2')).toBeInTheDocument();
  });

  it('labels the length chips with minutes, and filters by them (remembered)', async () => {
    fakeApi({ 'GET /stories': { stories: kurmanci } });
    hub();
    await screen.findByText('Qelema Şîn');
    const lengths = screen.getByRole('radiogroup', { name: 'Length' });
    // from the shared bands: a short Kurmancî story is 1–2 minutes at a learner's pace
    expect(within(lengths).getByRole('radio', { name: /Short/ }).closest('label')!.textContent).toMatch(/1–2 min/);
    await userEvent.click(within(lengths).getByRole('radio', { name: /Medium/ }));
    expect(screen.queryByText('Qelema Şîn')).not.toBeInTheDocument();
    expect(screen.getByText('Bazar')).toBeInTheDocument();
    expect(localStorage.getItem('hevalo.stories.length')).toBe('medium');
  });

  it('hides the level filter until a variety has twenty stories', async () => {
    fakeApi({ 'GET /stories': { stories: kurmanci } });
    hub();
    await screen.findByText('Qelema Şîn');
    expect(screen.queryByRole('radiogroup', { name: 'Level' })).toBeNull();
  });

  it('shows the level filter for a variety with twenty or more stories', async () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      listItem({ id: `s${i}`, slug: `s${i}`, title: `Çîrok ${i}`, level: ((i % 3) + 1) as 1 | 2 | 3 }),
    );
    fakeApi({ 'GET /stories': { stories: many } });
    hub();
    await screen.findByText('Çîrok 0');
    const levels = screen.getByRole('radiogroup', { name: 'Level' });
    await userEvent.click(within(levels).getByRole('radio', { name: 'Level 3' }));
    expect(screen.queryByText('Çîrok 0')).not.toBeInTheDocument();
    expect(screen.getByText('Çîrok 2')).toBeInTheDocument();
  });

  it('opens on Soranî for a Soranî interface, and says when a variety has nothing yet', async () => {
    localStorage.setItem('hevalo_locale', 'ckb');
    fakeApi({
      'GET /stories?dialect=sorani': { stories: [] },
      'GET /stories?dialect=kurmanci': { stories: kurmanci },
    });
    hub();
    // the Soranî catalogue answers the page; its words are checked for the
    // variety in the sentence rather than for the language around it
    expect(await screen.findByText(/Soranî/, { selector: 'h3' })).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: /Kurmancî/ }));
    expect(await screen.findByText('Qelema Şîn')).toBeInTheDocument();
  });

  it('opens on the variety of the course the learner is on', async () => {
    localStorage.setItem('hevalo.learn.courseDialect', 'sorani');
    const { calls } = fakeApi({ 'GET /stories': { stories: [] } });
    hub();
    await waitFor(() => expect(calls.some((c) => c.path === '/stories?dialect=sorani')).toBe(true));
    expect(screen.getByRole('radio', { name: 'Soranî' })).toBeChecked();
  });

  it('offers to continue an unfinished game', async () => {
    fakeApi({
      'GET /stories': { stories: kurmanci },
      'GET /story-games/active': {
        games: [{ id: 'g9', mode: 'solo', status: 'question', storyId: 'a', storyTitle: 'Qelema Şîn', dialect: 'kurmanci', currentIndex: 1, total: 5 }],
      },
    });
    hub();
    const card = (await screen.findByText(/Question 2 of 5/)).closest('a')!;
    expect(card).toHaveAttribute('href', '/app/games/stories/play/g9');
    expect(card.textContent).toMatch(/On your own/);
  });

  it('joins with a code, read the way people type it', async () => {
    const { calls } = fakeApi({ 'GET /stories': { stories: kurmanci }, 'POST /story-games/join': gameView({ id: 'g7' }) });
    hub();
    const field = await screen.findByLabelText('Join with a code');
    expect(field).toHaveAttribute('dir', 'ltr');
    expect(field).toHaveAttribute('autocapitalize', 'characters');
    expect(field).toHaveAttribute('autocomplete', 'off');
    expect(field).toHaveAttribute('spellcheck', 'false');
    await userEvent.type(field, 'abc-23٤');
    await userEvent.click(screen.getByRole('button', { name: 'Join' }));
    expect(await screen.findByText('the game page')).toBeInTheDocument();
    expect(calls.find((c) => c.path === '/story-games/join')?.body).toEqual({ code: 'ABC234', extraTime: false });
  });

  it('takes a pasted invite link before a code', async () => {
    const { calls } = fakeApi({ 'GET /stories': { stories: kurmanci }, 'POST /story-games/join': gameView({ id: 'g7' }) });
    hub();
    await userEvent.type(await screen.findByLabelText('Join with a code'), 'https://hevalo.app/app/games/stories?id=6f1b2a3c-4d5e');
    await userEvent.click(screen.getByRole('button', { name: 'Join' }));
    await screen.findByText('the game page');
    expect(calls.find((c) => c.path === '/story-games/join')?.body).toEqual({ id: '6f1b2a3c-4d5e', extraTime: false });
  });

  it('sends a link to another game to that game', async () => {
    fakeApi({ 'GET /stories': { stories: kurmanci } });
    hub();
    await userEvent.type(await screen.findByLabelText('Join with a code'), 'hevalo.app/app/games/wordle-battle?id=abcdef12');
    await userEvent.click(screen.getByRole('button', { name: 'Join' }));
    expect(await screen.findByText('the battle page')).toBeInTheDocument();
  });

  it('says what is wrong with something that is not a code', async () => {
    const { calls } = fakeApi({ 'GET /stories': { stories: kurmanci } });
    hub();
    await userEvent.type(await screen.findByLabelText('Join with a code'), 'hello');
    await userEvent.click(screen.getByRole('button', { name: 'Join' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/six letters and numbers/);
    expect(calls.some((c) => c.path === '/story-games/join')).toBe(false);
  });

  it('opens an invite link: joins, then goes to the game', async () => {
    const { calls } = fakeApi({ 'POST /story-games/join': gameView({ id: 'g5' }) });
    hub('/app/games/stories?id=g5');
    expect(await screen.findByText('the game page')).toBeInTheDocument();
    expect(calls.find((c) => c.path === '/story-games/join')?.body).toEqual({ id: 'g5', extraTime: false });
  });

  it('brings your remembered Extra time to a game joined by link or code', async () => {
    localStorage.setItem('hevalo.stories.extraTime', 'on');
    const { calls } = fakeApi({ 'POST /story-games/join': gameView({ id: 'g5' }) });
    hub('/app/games/stories?id=g5');
    await screen.findByText('the game page');
    expect(calls.find((c) => c.path === '/story-games/join')?.body).toEqual({ id: 'g5', extraTime: true });
  });

  it('says why an invite link could not be followed', async () => {
    fakeApi({ 'POST /story-games/join': new Response(JSON.stringify({ code: 'GAME_STARTED' }), { status: 409 }) });
    hub('/app/games/stories?id=g5');
    expect(await screen.findByText('This game has already started.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to stories' })).toHaveAttribute('href', '/app/games/stories');
  });

  it('lets a guest read, and says playing needs an account', async () => {
    fakeApi({ 'GET /stories': { stories: kurmanci } }, { signedIn: false });
    hub();
    expect(await screen.findByText('Qelema Şîn')).toBeInTheDocument();
    expect(screen.getByText(/Reading is free/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Join with a code')).toBeNull();
  });

  it('sets up a game with friends from the stories it has', async () => {
    fakeApi({ 'GET /stories': { stories: kurmanci }, 'GET /story-games/options': { canHostOpen: false } });
    hub();
    await screen.findByText('Qelema Şîn');
    await userEvent.click(screen.getByRole('button', { name: 'Play with friends' }));
    const dialog = await screen.findByRole('dialog', { name: 'Set up a quiz' });
    expect(within(dialog).getByRole('radio', { name: 'With a friend' })).toBeChecked();
    // only lengths with a published story are offered
    const lengths = within(dialog).getByRole('radiogroup', { name: 'Length' });
    expect(within(lengths).getAllByRole('radio')).toHaveLength(2);
  });
});
