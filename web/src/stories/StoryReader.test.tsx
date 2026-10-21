import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { lessonAudioKey } from '@kurda/shared';
import { renderApp } from '../test/utils';
import { soundPlayer } from '../lib/sound';
import { StoryReader } from './StoryReader';
import { detail, fakeApi, gameView, notFound } from './testing';

/** The one player the app has: a fake that remembers what it was asked to play. */
const played: string[] = [];
class FakeAudio extends EventTarget {
  src = '';
  playbackRate = 1;
  defaultPlaybackRate = 1;
  play(): Promise<void> {
    played.push(this.src);
    this.dispatchEvent(new Event('playing'));
    return Promise.resolve();
  }
  pause(): void {
    this.dispatchEvent(new Event('pause'));
  }
}

beforeEach(() => {
  played.length = 0;
  vi.stubGlobal('Audio', FakeAudio);
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const reader = (slug = 'qelema-sin') =>
  renderApp(
    <Routes>
      <Route path="/app/games/stories/:slug" element={<StoryReader />} />
      <Route path="/app/games/stories/play/:id" element={<p>the game page</p>} />
    </Routes>,
    [`/app/games/stories/${slug}`],
  );

describe('Story reader', () => {
  it('marks every string from the story with its language and direction', async () => {
    fakeApi({ 'GET /stories/qelema-sin': detail() });
    reader();
    const title = await screen.findByRole('heading', { level: 1, name: 'Qelema Şîn' });
    expect(title).toHaveAttribute('lang', 'ku');
    expect(title).toHaveAttribute('dir', 'ltr');
    const paragraph = screen.getByText(/Îro Rojîn diçe/).closest('p')!;
    expect(paragraph).toHaveAttribute('lang', 'ku');
  });

  it('sets a Soranî story right to left', async () => {
    fakeApi({
      'GET /stories/sorani-abc123': detail({
        slug: 'sorani-abc123',
        dialect: 'sorani',
        title: 'پێنووسە شینەکە',
        paragraphs: ['ئەمڕۆ ڕۆژین دەچێتە قوتابخانە.'],
        glossary: [],
      }),
    });
    reader('sorani-abc123');
    const title = await screen.findByRole('heading', { level: 1, name: 'پێنووسە شینەکە' });
    expect(title).toHaveAttribute('lang', 'ckb');
    expect(title).toHaveAttribute('dir', 'rtl');
    expect(screen.getByText(/ئەمڕۆ/).closest('p')).toHaveAttribute('lang', 'ckb');
    expect(screen.getByText(/ئەمڕۆ/).closest('.story-para')).toHaveAttribute('dir', 'rtl');
  });

  it('marks a glossary word the first time it appears, and opens its meaning', async () => {
    fakeApi({
      'GET /stories/qelema-sin': detail({
        paragraphs: ['Rojîn diçe dibistanê. Dibistanê mezin e.'],
        glossary: [{ term: 'dibistanê', meanings: { en: 'to school' } }],
      }),
    });
    reader();
    const marks = await screen.findAllByRole('button', { name: /dibistanê/i });
    // once per paragraph: the second "Dibistanê" is plain text
    expect(marks).toHaveLength(1);
    await userEvent.click(marks[0]!);
    const pop = screen.getByRole('dialog', { name: 'dibistanê' });
    expect(within(pop).getByText('to school')).toHaveAttribute('lang', 'en');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(marks[0]).toHaveFocus();
  });

  it('lists the story’s words with their meanings in the reader’s language', async () => {
    localStorage.setItem('hevalo_locale', 'de');
    fakeApi({ 'GET /stories/qelema-sin': detail() });
    reader();
    const words = await screen.findByRole('region', { name: 'Wörter in dieser Geschichte' });
    expect(within(words).getByText('dibistanê')).toHaveAttribute('lang', 'ku');
    expect(within(words).getByText('zur Schule')).toHaveAttribute('lang', 'de');
  });

  it('offers Listen only on paragraphs that have recordings, and plays them in order', async () => {
    const s1 = 'Îro Rojîn diçe dibistanê.';
    const s2 = 'Ew deh salî ye.';
    fakeApi({
      'GET /stories/qelema-sin': detail({
        audio: { [lessonAudioKey(s1)]: 'https://cdn.test/1.m4a', [lessonAudioKey(s2)]: 'https://cdn.test/2.m4a' },
      }),
    });
    reader();
    const listen = await screen.findAllByRole('button', { name: 'Listen' });
    expect(listen).toHaveLength(1);
    await userEvent.click(listen[0]!);
    expect(played).toEqual(['https://cdn.test/1.m4a']);
    // the sentence being read is marked
    expect(document.querySelector('.story-sentence.is-reading')?.textContent).toBe(s1);
    // whole-story controls only for a story recorded throughout
    expect(screen.queryByRole('group', { name: 'Listen to the story' })).toBeNull();
  });

  it('shows who says the line being read, at the top of the reader, line by line', async () => {
    const s1 = 'Îro Rojîn diçe dibistanê.';
    const s2 = 'Ew deh salî ye.';
    fakeApi({
      'GET /stories/qelema-sin': detail({
        audio: { [lessonAudioKey(s1)]: 'https://cdn.test/1.m4a', [lessonAudioKey(s2)]: 'https://cdn.test/2.m4a' },
        voices: { [lessonAudioKey(s1)]: { speaker: 'hamo' }, [lessonAudioKey(s2)]: { speaker: 'xezo' } },
      }),
    });
    reader();
    // before anything plays, the first line's speaker waits in the tools
    const tools = (await screen.findByRole('button', { name: 'Listen' })).closest('.story-page')!.querySelector('.story-tools')!;
    expect(within(tools as HTMLElement).getByRole('img', { name: 'Hamo' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Listen' }));
    expect(await within(tools as HTMLElement).findByRole('img', { name: 'Hamo speaking' })).toBeInTheDocument();
    // the first line ends and the next, Xezo's, begins
    act(() => soundPlayer()!.dispatchEvent(new Event('ended')));
    expect(played).toEqual(['https://cdn.test/1.m4a', 'https://cdn.test/2.m4a']);
    expect(await within(tools as HTMLElement).findByRole('img', { name: 'Xezo speaking' })).toBeInTheDocument();
    expect(tools.querySelectorAll('.speaking-character')).toHaveLength(1);
  });

  it('shows nobody for a story whose recordings have no character', async () => {
    const s1 = 'Îro Rojîn diçe dibistanê.';
    fakeApi({ 'GET /stories/qelema-sin': detail({ audio: { [lessonAudioKey(s1)]: 'https://cdn.test/1.m4a' } }) });
    reader();
    expect(await screen.findByRole('button', { name: 'Listen' })).toBeInTheDocument();
    expect(document.querySelector('.speaking-character')).toBeNull();
  });

  it('shows the whole-story player when every sentence is recorded', async () => {
    fakeApi({ 'GET /stories/qelema-sin': detail({ fullyNarrated: true, audio: {} }) });
    reader();
    const bar = await screen.findByRole('group', { name: 'Listen to the story' });
    expect(within(bar).getByRole('button', { name: 'Play' })).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: '0.75×' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('remembers the text size', async () => {
    fakeApi({ 'GET /stories/qelema-sin': detail() });
    reader();
    await userEvent.click(await screen.findByRole('button', { name: 'Larger text' }));
    expect(localStorage.getItem('hevalo.stories.textSize')).toBe('2');
  });

  it('starts "Quiz yourself" at once with the remembered settings', async () => {
    localStorage.setItem('hevalo.stories.quiz', JSON.stringify({ questionCount: 5, timerSeconds: 30, textDuring: 'hidden' }));
    const { calls } = fakeApi({
      'GET /stories/qelema-sin': detail(),
      'GET /story-games/active': { games: [] },
      'POST /story-games': gameView({ id: 'solo-1', mode: 'solo' }),
    });
    reader();
    await userEvent.click(await screen.findByRole('button', { name: 'Quiz yourself' }));
    expect(await screen.findByText('the game page')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST' && c.path === '/story-games')?.body).toEqual({
      mode: 'solo',
      storyId: 'st-1',
      questionCount: 5,
      timerSeconds: 30,
      textDuring: 'hidden',
      access: 'friends',
      skipReading: true,
      extraTime: false,
    });
  });

  it('offers to continue an unfinished quiz on this story rather than replacing it', async () => {
    const { calls } = fakeApi({
      'GET /stories/qelema-sin': detail(),
      'GET /story-games/active': {
        games: [{ id: 'old', mode: 'solo', status: 'question', storyId: 'st-1', storyTitle: 'Qelema Şîn', dialect: 'kurmanci', currentIndex: 0, total: 3 }],
      },
    });
    reader();
    expect(await screen.findByText('You have an unfinished quiz on this story.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('the game page')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST' && c.path.startsWith('/story-games'))).toBe(false);
  });

  it('says a story taken back for changes is being updated', async () => {
    fakeApi({ 'GET /stories/gone': notFound() });
    reader('gone');
    expect(await screen.findByText('This story is being updated. Try again later.')).toBeInTheDocument();
  });

  it('lets a guest read, and asks for an account for the quiz', async () => {
    fakeApi({ 'GET /stories/qelema-sin': detail() }, { signedIn: false });
    reader();
    await screen.findByRole('heading', { level: 1 });
    expect(screen.getByText(/Reading is open to everyone/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/register');
    expect(screen.queryByRole('button', { name: 'Quiz yourself' })).toBeNull();
  });

  it('opens the setup for a game with a friend on this story', async () => {
    fakeApi({ 'GET /stories/qelema-sin': detail(), 'GET /story-games/active': { games: [] }, 'GET /story-games/options': { canHostOpen: true } });
    reader();
    await userEvent.click(await screen.findByRole('button', { name: 'With a friend' }));
    const dialog = await screen.findByRole('dialog', { name: 'Set up a quiz' });
    // the story is chosen, so its length is shown, not offered
    expect(within(dialog).queryByRole('radiogroup', { name: 'Length' })).toBeNull();
    expect(within(dialog).getByText('Qelema Şîn')).toHaveAttribute('lang', 'ku');
    // a short story offers three or five questions, never ten
    const counts = within(dialog).getByRole('radiogroup', { name: 'Questions' });
    expect(within(counts).getAllByRole('radio').map((r) => r.closest('label')!.textContent)).toEqual(['3 questions', '5 questions']);
    // a known adult may open the game
    await waitFor(() => expect(within(dialog).getByRole('radio', { name: 'Anyone 18+ with the code' })).toBeInTheDocument());
  });
});
