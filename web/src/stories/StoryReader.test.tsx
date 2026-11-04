import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { STORY_ASSESSMENT, lessonAudioKey, type StoryMe } from '@kurda/shared';
import { renderApp } from '../test/utils';
import { soundPlayer } from '../lib/sound';
import { StoryReader } from './StoryReader';
import { clearStoryCategories } from './catalogue';
import { detail, fakeApi, gameView, notFound, refused, type Call } from './testing';

/** The one player the app has: a fake that remembers what it was asked to play. */
const played: string[] = [];
class FakeAudio extends EventTarget {
  src = '';
  playbackRate = 1;
  defaultPlaybackRate = 1;
  currentTime = 0;
  readyState = 4;
  ended = false;
  paused = true;
  play(): Promise<void> {
    played.push(this.src);
    this.paused = false;
    this.dispatchEvent(new Event('playing'));
    return Promise.resolve();
  }
  pause(): void {
    this.paused = true;
    this.dispatchEvent(new Event('pause'));
  }
}

/** A browser's observer, stood in for: the test says which paragraph came into view. */
let seen: IntersectionObserverCallback | null = null;
const observed: Element[] = [];
class FakeObserver {
  constructor(cb: IntersectionObserverCallback) {
    seen = cb;
  }
  observe(el: Element): void {
    observed.push(el);
  }
  disconnect(): void {}
  unobserve(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

beforeEach(() => {
  played.length = 0;
  seen = null;
  observed.length = 0;
  vi.stubGlobal('Audio', FakeAudio);
  vi.stubGlobal('IntersectionObserver', FakeObserver);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  clearStoryCategories();
});

const reader = (slug = 'qelema-sin') =>
  renderApp(
    <Routes>
      <Route path="/app/learn/stories/:slug" element={<StoryReader />} />
      <Route path="/app/games/stories/play/:id" element={<p>the game page</p>} />
    </Routes>,
    [`/app/learn/stories/${slug}`],
  );

const me = (over: Partial<StoryMe> = {}): StoryMe => ({ bookmarked: false, paragraph: 0, share: 0, finishedAt: null, bestCorrect: null, total: null, attemptsToday: 0, ...over });
const CATEGORIES = { categories: [{ slug: 'everyday', name: { en: 'Everyday', de: 'Alltag' }, position: 6 }] };
const S1 = 'Îro Rojîn diçe dibistanê.';
const S2 = 'Ew deh salî ye.';

/** The first sentence comes into view: the paragraph that holds it is being read. */
const show = (index: number): void =>
  act(() => {
    seen!([{ isIntersecting: true, target: observed[index]! } as unknown as IntersectionObserverEntry], {} as IntersectionObserver);
  });

describe('the story page', () => {
  it('opens on the overview: what the story is, who it comes from, and the way in', async () => {
    fakeApi({ 'GET /stories/qelema-sin': detail({ me: me() }), 'GET /stories/categories': CATEGORIES });
    reader();
    const title = await screen.findByRole('heading', { level: 1, name: 'Qelema Şîn' });
    expect(title).toHaveAttribute('lang', 'ku');
    expect(title).toHaveAttribute('dir', 'ltr');
    expect(screen.getByTitle('A1 · Beginner')).toBeInTheDocument();
    expect(screen.getByText('Beginner')).toBeInTheDocument();
    expect(await screen.findByText('Everyday')).toBeInTheDocument();
    expect(screen.getByText('~2 min')).toBeInTheDocument();
    expect(screen.getByText('90 words')).toBeInTheDocument();
    expect(screen.getByText('Written for learners')).toBeInTheDocument();
    expect(screen.getByText('Kurmancî')).toBeInTheDocument();
    expect(screen.getByText('Rojîn li dibistana nû ye.')).toHaveAttribute('lang', 'ku');
    expect(screen.getByRole('button', { name: 'Read' })).toBeInTheDocument();
    // nothing recorded: nothing to listen to, and no bar
    expect(screen.queryByRole('button', { name: 'Listen' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Listen to the story' })).toBeNull();
    expect(document.querySelector('.story-overview-cover svg')).not.toBeNull();
    // the text is under the overview, a paragraph at a time
    expect(screen.getByText(/Îro Rojîn diçe/).closest('p')).toHaveAttribute('lang', 'ku');
  });

  it('offers to continue where the reader was, with the minutes left', async () => {
    fakeApi({ 'GET /stories/qelema-sin': detail({ readingMinutes: 4, me: me({ paragraph: 1, share: 0.5 }) }) });
    reader();
    expect(await screen.findByRole('button', { name: 'Continue · 2 min left' })).toBeInTheDocument();
    const prompt = screen.getByRole('status');
    expect(within(prompt).getByRole('button', { name: 'Continue from paragraph 2' })).toBeInTheDocument();
    await userEvent.click(within(prompt).getByRole('button', { name: 'Start from the beginning' }));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('says a finished story can be read again, and shows the best check so far', async () => {
    fakeApi({ 'GET /stories/qelema-sin': detail({ me: me({ paragraph: 1, share: 1, finishedAt: '2026-10-01T00:00:00Z', bestCorrect: 4, total: 5 }) }) });
    reader();
    expect(await screen.findByRole('button', { name: 'Read again' })).toBeInTheDocument();
    expect(screen.getAllByText('Your best: 4 of 5')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Check again' })).toHaveLength(2);
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

  it('lists the key vocabulary with a pronunciation and Save word where the dictionary knows the word', async () => {
    const { calls } = fakeApi({
      'GET /stories/qelema-sin': detail({
        glossary: [
          { term: 'dibistanê', meanings: { en: 'to school' }, entryId: 'e1', pos: 'noun', audioUrl: 'https://cdn.test/dibistan.m4a' },
          { term: 'salî', meanings: { en: 'years old' } },
        ],
      }),
      'PUT /dictionary/entries/e1/save': {},
    });
    reader();
    const words = await screen.findByRole('region', { name: 'Key vocabulary' });
    expect(within(words).getByText('dibistanê')).toHaveAttribute('lang', 'ku');
    expect(within(words).getByText('to school')).toHaveAttribute('lang', 'en');
    expect(within(words).getByText('noun')).toBeInTheDocument();
    await userEvent.click(within(words).getByRole('button', { name: 'Play pronunciation' }));
    expect(played).toEqual(['https://cdn.test/dibistan.m4a']);
    // one Save: the other word is not in the dictionary
    const save = within(words).getAllByRole('button', { name: 'Save word' });
    expect(save).toHaveLength(1);
    await userEvent.click(save[0]!);
    expect(within(words).getByRole('button', { name: 'Saved' })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(calls.some((c) => c.method === 'PUT' && c.path === '/dictionary/entries/e1/save')).toBe(true));
  });

  it('says the vocabulary is full in the limit’s own words, and takes the word back', async () => {
    fakeApi({
      'GET /stories/qelema-sin': detail({ glossary: [{ term: 'dibistanê', meanings: { en: 'to school' }, entryId: 'e1' }] }),
      'PUT /dictionary/entries/e1/save': new Response(JSON.stringify({ code: 'LIMIT_REACHED', message: 'full', details: { limit: 'saved_words', max: 500 } }), { status: 409 }),
    });
    reader();
    const words = await screen.findByRole('region', { name: 'Key vocabulary' });
    await userEvent.click(within(words).getByRole('button', { name: 'Save word' }));
    expect(await within(words).findByRole('alert')).toHaveTextContent('up to 500 words');
    expect(within(words).getByRole('button', { name: 'Save word' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('opens a glossary word in the text with its part of speech, its sound and Save word', async () => {
    fakeApi({
      'GET /stories/qelema-sin': detail({
        paragraphs: ['Rojîn diçe dibistanê. Dibistanê mezin e.'],
        glossary: [{ term: 'dibistanê', meanings: { en: 'to school' }, entryId: 'e1', pos: 'noun', audioUrl: 'https://cdn.test/dibistan.m4a' }],
      }),
    });
    reader();
    const marks = await screen.findAllByRole('button', { name: /^dibistanê$/i });
    // once per paragraph in the text: the second "Dibistanê" is plain text
    expect(marks).toHaveLength(1);
    await userEvent.click(marks[0]!);
    const pop = screen.getByRole('dialog', { name: 'dibistanê' });
    expect(within(pop).getByText('to school')).toHaveAttribute('lang', 'en');
    expect(within(pop).getByText('noun')).toBeInTheDocument();
    expect(within(pop).getByRole('button', { name: 'Play pronunciation' })).toBeInTheDocument();
    expect(within(pop).getByRole('button', { name: 'Save word' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(marks[0]).toHaveFocus();
  });

  it('shows a paragraph’s translation in the reader’s language on request, English when there is no other', async () => {
    localStorage.setItem('hevalo_locale', 'de');
    fakeApi({
      'GET /stories/qelema-sin': detail({
        translations: { en: ['Today Rojîn goes to school. She is ten.', 'Şîlan is her friend. Şîlan smiles.'], de: ['Heute geht Rojîn zur Schule. Sie ist zehn.', 'Şîlan ist ihre Freundin. Şîlan lächelt.'] },
      }),
    });
    reader();
    const toggles = await screen.findAllByRole('button', { name: 'Übersetzung' });
    expect(toggles).toHaveLength(2);
    expect(screen.queryByText(/Heute geht Rojîn/)).toBeNull();
    await userEvent.click(toggles[0]!);
    expect(screen.getByText('Heute geht Rojîn zur Schule. Sie ist zehn.')).toHaveAttribute('lang', 'de');
    expect(screen.getByRole('button', { name: 'Übersetzung ausblenden' })).toHaveAttribute('aria-expanded', 'true');
    // the second paragraph keeps its own toggle, closed
    expect(screen.queryByText(/Şîlan ist ihre Freundin/)).toBeNull();
  });

  it('falls back to the English translation, and offers none when the story has none', async () => {
    localStorage.setItem('hevalo_locale', 'de');
    fakeApi({ 'GET /stories/qelema-sin': detail({ translations: { en: ['Today Rojîn goes to school. She is ten.', 'Şîlan is her friend.'] } }) });
    const withEnglish = reader();
    await userEvent.click((await screen.findAllByRole('button', { name: 'Übersetzung' }))[1]!);
    expect(screen.getByText('Şîlan is her friend.')).toHaveAttribute('lang', 'en');
    withEnglish.unmount();

    fakeApi({ 'GET /stories/qelema-sin': detail({ translations: {} }) });
    reader();
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('button', { name: 'Übersetzung' })).toBeNull();
  });

  it('keeps the reader’s place on the server as they read, and opens the check when the last paragraph is seen', async () => {
    const { calls } = fakeApi({
      'GET /stories/qelema-sin': detail({ me: me() }),
      'PUT /stories/st-1/progress': (c: Call) => {
        const body = c.body as { paragraph: number; finished?: boolean };
        return { me: me({ paragraph: body.paragraph, share: body.finished ? 1 : 0.5, finishedAt: body.finished ? '2026-11-04T10:00:00Z' : null }) };
      },
    });
    reader();
    await screen.findByRole('heading', { level: 1 });
    expect(screen.getAllByText('Finish the story first.')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Check what you understood' })[0]).toBeDisabled();
    expect(observed).toHaveLength(2);
    show(0);
    await waitFor(() => expect(calls.filter((c) => c.method === 'PUT').map((c) => c.body)).toEqual([{ paragraph: 0, share: 0.5 }]));
    show(1);
    await waitFor(() => expect(calls.filter((c) => c.method === 'PUT').at(-1)?.body).toEqual({ paragraph: 1, share: 1, finished: true }));
    // the check opens with the server's word
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Check what you understood' })[0]).toBeEnabled());
    expect(screen.queryByText('Finish the story first.')).toBeNull();
  });

  it('starts the check as the five-question solo game, and says what a repeat pays', async () => {
    const { calls } = fakeApi({
      'GET /stories/qelema-sin': detail({ me: me({ finishedAt: '2026-10-01T00:00:00Z', bestCorrect: 3, total: 5, attemptsToday: 1 }) }),
      'GET /story-games/active': { games: [] },
      'POST /story-games': gameView({ id: 'solo-1', mode: 'solo' }),
    });
    reader();
    expect(await screen.findAllByText(/another check earns a quarter of the XP/)).toHaveLength(2);
    await userEvent.click(screen.getAllByRole('button', { name: 'Check again' })[0]!);
    expect(await screen.findByText('the game page')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST' && c.path === '/story-games')?.body).toEqual({ ...STORY_ASSESSMENT, storyId: 'st-1', extraTime: false });
  });

  it('says when the day’s checks no longer pay, from the shared number', async () => {
    fakeApi({ 'GET /stories/qelema-sin': detail({ me: me({ finishedAt: '2026-10-01T00:00:00Z', bestCorrect: 5, total: 5, attemptsToday: 2 }) }), 'GET /story-games/active': { games: [] } });
    reader();
    expect(await screen.findAllByText(/checked this story 2 times today\. Another check earns no XP/)).toHaveLength(2);
  });

  it('offers to continue an unfinished check on this story rather than replacing it', async () => {
    const { calls } = fakeApi({
      'GET /stories/qelema-sin': detail({ me: me({ finishedAt: '2026-10-01T00:00:00Z' }) }),
      'GET /story-games/active': {
        games: [{ id: 'old', mode: 'solo', status: 'question', storyId: 'st-1', storyTitle: 'Qelema Şîn', dialect: 'kurmanci', currentIndex: 0, total: 5 }],
      },
    });
    reader();
    expect((await screen.findAllByText('You have an unfinished quiz on this story.')).length).toBeGreaterThan(0);
    await userEvent.click(screen.getAllByRole('button', { name: 'Continue' })[0]!);
    expect(await screen.findByText('the game page')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST' && c.path.startsWith('/story-games'))).toBe(false);
  });

  it('bookmarks the story from the overview, at once', async () => {
    const { calls } = fakeApi({ 'GET /stories/qelema-sin': detail({ me: me() }), 'PUT /stories/st-1/bookmark': { bookmarked: true } });
    reader();
    await userEvent.click(await screen.findByRole('button', { name: 'Bookmark Qelema Şîn' }));
    expect(screen.getByRole('button', { name: 'Remove the bookmark on Qelema Şîn' })).toHaveTextContent('Bookmarked');
    await waitFor(() => expect(calls.some((c) => c.method === 'PUT' && c.path === '/stories/st-1/bookmark')).toBe(true));
  });

  it('plays the story from Listen, marks the sentence being read, and says it again on request', async () => {
    fakeApi({
      'GET /stories/qelema-sin': detail({
        audio: { [lessonAudioKey(S1)]: 'https://cdn.test/1.m4a', [lessonAudioKey(S2)]: 'https://cdn.test/2.m4a' },
        voices: { [lessonAudioKey(S1)]: { speaker: 'hamo' } },
        narration: {
          sentences: [
            { paragraph: 0, sentence: 0, key: lessonAudioKey(S1), url: 'https://cdn.test/1.m4a', durationMs: 2000, startMs: 0 },
            { paragraph: 0, sentence: 1, key: lessonAudioKey(S2), url: 'https://cdn.test/2.m4a', durationMs: 3000, startMs: 2000 },
          ],
          totalMs: 5000,
          complete: false,
        },
      }),
    });
    reader();
    // the overview's Listen, first on the page; the paragraph has its own under it
    await userEvent.click((await screen.findAllByRole('button', { name: 'Listen' }))[0]!);
    expect(played).toEqual(['https://cdn.test/1.m4a']);
    expect(document.querySelector('.story-sentence.is-reading')?.textContent).toBe(S1);
    // the bar is docked under the text, with the narrator
    const bar = screen.getByRole('group', { name: 'Listen to the story' });
    expect(within(bar).getByText('Hamo')).toBeInTheDocument();
    expect(within(bar).getByText('2 of 4 sentences recorded')).toBeInTheDocument();
    // a tap on the band, or its button, says the sentence again
    await userEvent.click(screen.getByRole('button', { name: 'Say this sentence again' }));
    expect(played).toEqual(['https://cdn.test/1.m4a', 'https://cdn.test/1.m4a']);
    await userEvent.click(document.querySelector('.story-sentence.is-reading')!);
    expect(played).toHaveLength(3);
    // the first line ends and the next begins
    act(() => soundPlayer()!.dispatchEvent(new Event('ended')));
    expect(played.at(-1)).toBe('https://cdn.test/2.m4a');
    expect(document.querySelector('.story-sentence.is-reading')?.textContent).toBe(S2);
  });

  it('brings the sentence being read to the middle of the screen, and leaves the page alone while it is in sight', async () => {
    const asked: Array<{ text: string | null; options: unknown }> = [];
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value(this: Element, options: unknown) {
        asked.push({ text: this.textContent, options });
      },
    });
    // the first sentence is below the fold, the second in the middle of the screen
    const rect = (top: number) => ({ top, bottom: top + 30, height: 30, left: 0, right: 300, width: 300, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (this.textContent === S1) return rect(window.innerHeight + 200);
      if (this.textContent === S2) return rect(300);
      return rect(0);
    });
    fakeApi({
      'GET /stories/qelema-sin': detail({
        narration: {
          sentences: [
            { paragraph: 0, sentence: 0, key: lessonAudioKey(S1), url: 'https://cdn.test/1.m4a', durationMs: 2000, startMs: 0 },
            { paragraph: 0, sentence: 1, key: lessonAudioKey(S2), url: 'https://cdn.test/2.m4a', durationMs: 3000, startMs: 2000 },
          ],
          totalMs: 5000,
          complete: true,
        },
      }),
    });
    try {
      reader();
      await userEvent.click((await screen.findAllByRole('button', { name: 'Listen' }))[0]!);
      const sentences = () => asked.filter((a) => a.text === S1 || a.text === S2);
      await waitFor(() => expect(sentences()).toEqual([{ text: S1, options: { block: 'center', behavior: 'smooth' } }]));
      act(() => soundPlayer()!.dispatchEvent(new Event('ended')));
      expect(document.querySelector('.story-sentence.is-reading')?.textContent).toBe(S2);
      // already in sight, clear of the bar and the player: the page stays where it is
      expect(sentences()).toHaveLength(1);
    } finally {
      delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });

  it('offers Listen on a paragraph with recordings, and nothing on one without', async () => {
    fakeApi({ 'GET /stories/qelema-sin': detail({ audio: { [lessonAudioKey(S1)]: 'https://cdn.test/1.m4a' } }) });
    reader();
    // the paragraph's own Listen, under it, beside the overview's Listen
    const listens = await screen.findAllByRole('button', { name: 'Listen' });
    expect(listens).toHaveLength(2);
    await userEvent.click(listens[1]!);
    expect(played).toEqual(['https://cdn.test/1.m4a']);
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
  });

  it('remembers the text size', async () => {
    fakeApi({ 'GET /stories/qelema-sin': detail() });
    reader();
    await userEvent.click(await screen.findByRole('button', { name: 'Larger text' }));
    expect(localStorage.getItem('hevalo.stories.textSize')).toBe('2');
  });

  it('says a story taken back for changes is being updated', async () => {
    fakeApi({ 'GET /stories/gone': notFound() });
    reader('gone');
    expect(await screen.findByText('This story is being updated. Try again later.')).toBeInTheDocument();
  });

  it('lets a visitor read, asks for an account for the check, and keeps no place for them', async () => {
    const { calls } = fakeApi({ 'GET /stories/qelema-sin': detail() }, { signedIn: false });
    reader();
    await screen.findByRole('heading', { level: 1 });
    expect(screen.getAllByText(/Reading is open to everyone/)).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: 'Create an account' })[0]).toHaveAttribute('href', '/register');
    expect(screen.queryByRole('button', { name: /Bookmark/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Check what you understood' })).toBeNull();
    // nothing watched, nothing written
    expect(observed).toHaveLength(0);
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
  });

  it('links to the same story in its other variety', async () => {
    fakeApi({ 'GET /stories/qelema-sin': detail({ versions: [{ id: 'st-1', slug: 'qelema-sin', dialect: 'kurmanci', language: 'ku' }, { id: 'st-2', slug: 'penuse-sin', dialect: 'sorani', language: 'ku' }] }) });
    reader();
    expect(await screen.findByRole('link', { name: 'Also in Soranî' })).toHaveAttribute('href', '/app/learn/stories/penuse-sin');
  });

  it('shows a refused save of a word in the usual words', async () => {
    fakeApi({
      'GET /stories/qelema-sin': detail({ glossary: [{ term: 'dibistanê', meanings: { en: 'to school' }, entryId: 'e1' }] }),
      'PUT /dictionary/entries/e1/save': refused(500, 'DOWN'),
    });
    reader();
    const words = await screen.findByRole('region', { name: 'Key vocabulary' });
    await userEvent.click(within(words).getByRole('button', { name: 'Save word' }));
    expect(await within(words).findByRole('alert')).toBeInTheDocument();
  });
});
