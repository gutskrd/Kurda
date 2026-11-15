import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { storySections, type StoryDetail, type StoryMe } from '@kurda/shared';
import { renderApp } from '../test/utils';
import { StoryReader } from './StoryReader';
import { clearStoryCategories } from './catalogue';
import { questionHelp } from './GameParts';
import { detail, fakeApi } from './testing';

class NoObserver {
  observe(): void {}
  disconnect(): void {}
  unobserve(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', NoObserver);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  clearStoryCategories();
});

const reader = () =>
  renderApp(
    <Routes>
      <Route path="/app/learn/stories/:slug" element={<StoryReader />} />
    </Routes>,
    ['/app/learn/stories/kawa'],
  );

const me = (over: Partial<StoryMe> = {}): StoryMe => ({ bookmarked: false, paragraph: 0, share: 0, finishedAt: null, bestCorrect: null, total: null, attemptsToday: 0, ...over });

const paragraphs = [
  'Berî gelek salan, li çiyayan, mirov di bin zilma Dehaq de dijiyan.',
  '## Hesinkarê bajêr',
  'Kawa hesinkarek bû. Wî çakûçê xwe hilda.',
  '## Agirê Newrozê',
  'Li ser çiyê agir pêket. Gel azad bû.',
];
const english = ['Many years ago, in the mountains, people lived under the tyranny of Dehaq.', '## The town’s blacksmith', 'Kawa was a blacksmith.', '## The fire of Newroz', 'A fire was lit on the mountain.'];

function legend(over: Partial<StoryDetail> = {}): StoryDetail {
  return detail({
    slug: 'kawa',
    title: 'Kawayê Hesinkar',
    summary: 'Çîroka Kawa û Newrozê.',
    length: 'saga',
    paragraphs,
    sections: storySections(paragraphs),
    // a glossary word in a heading is never marked there
    glossary: [{ term: 'hesinkar', meanings: { en: 'blacksmith' } }],
    translations: { en: english },
    metaTranslations: { en: { title: 'Kawa the Blacksmith', summary: 'The story of Kawa and Newroz.' }, de: { title: 'Kawa der Schmied' } },
    reflections: [{ text: 'Çima agir nîşana azadiyê ye?', translations: { en: 'Why is fire a sign of freedom?' } }],
    notes: [{ kind: 'legend', title: 'Efsane û dîrok', body: 'Kawa kesayetiyeke efsanewî ye.\n\nNewroz cejneke kevn e.', translations: { en: { title: 'Legend and history', body: 'Kawa is a figure of legend.\n\nNewroz is an old festival.' } } }],
    sources: [
      { title: 'Şahname', author: 'Firdewsî', type: 'literary', url: 'https://example.org/shahname' },
      { title: 'Told in Botan', type: 'oral', note: 'as told by elders' },
    ],
    me: me({ paragraph: 2, share: 0.6 }),
    ...over,
  });
}

describe('a legend in the reader', () => {
  it('sets each "## " paragraph as a chapter title, never as text with ##, and sets the introduction apart', async () => {
    fakeApi({ 'GET /stories/kawa': legend() });
    reader();
    const chapter = await screen.findByRole('heading', { level: 2, name: 'Hesinkarê bajêr' });
    expect(chapter).toHaveAttribute('lang', 'ku');
    expect(document.body.textContent).not.toContain('##');
    // its number over it, and its title in the reader's language under it
    expect(chapter.closest('.story-chapter')).toHaveTextContent('Chapter 1');
    expect(within(chapter.closest('.story-chapter') as HTMLElement).getByText('The town’s blacksmith')).toHaveAttribute('lang', 'en');
    // a heading is not a sentence: no glossary button, no Translation toggle of its own
    expect(within(chapter.closest('.story-chapter') as HTMLElement).queryByRole('button')).toBeNull();
    // the introduction, before the first chapter, is marked as such
    const intro = screen.getByText(/Berî gelek salan/).closest('.story-para') as HTMLElement;
    expect(intro).toHaveClass('is-intro');
    expect(within(intro).getByText('Introduction')).toBeInTheDocument();
  });

  it('lists the chapters with how many are read, and jumps to one', async () => {
    const scrolled: Element[] = [];
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this);
    };
    fakeApi({ 'GET /stories/kawa': legend() });
    reader();
    const contents = await screen.findByRole('navigation', { name: 'Chapters' });
    // the saved place is the first chapter's last paragraph: one of two read
    expect(within(contents).getByText('Chapters read: 1 of 2')).toBeInTheDocument();
    const items = within(contents).getAllByRole('button');
    expect(items.map((b) => b.textContent)).toEqual(['Introduction', '1Chapter 1Hesinkarê bajêrThe town’s blacksmithRead', '2Chapter 2Agirê NewrozêThe fire of Newroz']);
    await userEvent.click(items[2]!);
    expect(scrolled.at(-1)).toHaveAttribute('data-paragraph', '3');
    // and the reader's tools carry the same way to every chapter
    const pick = screen.getByRole('combobox', { name: 'Go to a chapter' });
    expect(within(pick).getAllByRole('option').map((o) => o.textContent)).toEqual(['Introduction', 'Chapter 1: Hesinkarê bajêr', 'Chapter 2: Agirê Newrozê']);
    await userEvent.selectOptions(pick, 'Chapter 1: Hesinkarê bajêr');
    expect(scrolled.at(-1)).toHaveAttribute('data-paragraph', '1');
  });

  it('gives the title and summary in the reader’s language under the Kurdish, which stays the title', async () => {
    fakeApi({ 'GET /stories/kawa': legend() });
    reader();
    expect(await screen.findByRole('heading', { level: 1, name: 'Kawayê Hesinkar' })).toHaveAttribute('lang', 'ku');
    expect(screen.getByText('Kawa the Blacksmith')).toHaveAttribute('lang', 'en');
    expect(screen.getByText('The story of Kawa and Newroz.')).toHaveAttribute('lang', 'en');
  });

  it('after reading: questions to think about, unscored, then the notes and the sources with their kind', async () => {
    fakeApi({ 'GET /stories/kawa': legend() });
    reader();
    const think = await screen.findByRole('region', { name: 'Think about it' });
    expect(within(think).getByText('Çima agir nîşana azadiyê ye?')).toHaveAttribute('lang', 'ku');
    expect(within(think).getByText('Why is fire a sign of freedom?')).toHaveAttribute('lang', 'en');
    expect(within(think).queryByRole('textbox')).toBeNull();
    expect(think.textContent).not.toMatch(/XP/);

    const about = screen.getByRole('region', { name: 'About this story' });
    expect(within(about).getByRole('heading', { level: 3, name: 'Legend and history' })).toBeInTheDocument();
    expect(within(about).getByText('Newroz is an old festival.')).toBeInTheDocument();
    // the Kurdish a tap away
    expect(within(about).getByText('Read it in Kurdish')).toBeInTheDocument();
    expect(within(about).getByText('Efsane û dîrok')).toHaveAttribute('lang', 'ku');
    expect(within(about).getByText('Literary work')).toBeInTheDocument();
    expect(within(about).getByRole('link', { name: 'Şahname' })).toHaveAttribute('href', 'https://example.org/shahname');
    expect(within(about).getByText('Oral telling')).toBeInTheDocument();
    expect(within(about).getByText('as told by elders')).toBeInTheDocument();
  });

  it('a short story without chapters is read as it always was', async () => {
    fakeApi({ 'GET /stories/qelema-sin': detail() });
    renderApp(
      <Routes>
        <Route path="/app/learn/stories/:slug" element={<StoryReader />} />
      </Routes>,
      ['/app/learn/stories/qelema-sin'],
    );
    await screen.findByRole('heading', { level: 1, name: 'Qelema Şîn' });
    expect(screen.queryByRole('navigation', { name: 'Chapters' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Go to a chapter' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Think about it' })).toBeNull();
    expect(screen.queryByText('Introduction')).toBeNull();
  });

  it('sets a Soranî legend’s chapters right to left', async () => {
    const ckb = ['پێشەکی چیرۆکەکە.', '## ئاگری نەورۆز', 'ئاگر لە چیا هەڵکرا.'];
    fakeApi({ 'GET /stories/kawa': legend({ dialect: 'sorani', paragraphs: ckb, sections: storySections(ckb), translations: {}, glossary: [] }) });
    reader();
    const chapter = await screen.findByRole('heading', { level: 2, name: 'ئاگری نەورۆز' });
    expect(chapter).toHaveAttribute('lang', 'ckb');
    expect(chapter.closest('.story-para')).toHaveAttribute('dir', 'rtl');
    expect(screen.getByRole('navigation', { name: 'Chapters' }).querySelector('[lang="ckb"]')).toHaveAttribute('dir', 'rtl');
  });
});

describe('a question in the reader’s language', () => {
  const q = {
    promptEn: 'How old is Rojîn?',
    explanationEn: 'She is ten.',
    translations: { de: { prompt: 'Wie alt ist Rojîn?', options: ['Acht', 'Zehn'], explanation: 'Sie ist zehn.' }, en: { prompt: 'How old is Rojîn?', options: ['Eight', 'Ten'] } },
  };

  it('is the reader’s own translation where there is one, its options in the game’s order', () => {
    expect(questionHelp(q, 'de', 'kurmanci')).toEqual({ lang: 'de', prompt: 'Wie alt ist Rojîn?', options: ['Acht', 'Zehn'], explanation: 'Sie ist zehn.' });
  });

  it('is English where the reader’s language has none, and where the story is in the reader’s own', () => {
    expect(questionHelp(q, 'fr', 'kurmanci')).toEqual({ lang: 'en', prompt: 'How old is Rojîn?', options: ['Eight', 'Ten'], explanation: 'She is ten.' });
    expect(questionHelp({ ...q, translations: { ku: { prompt: 'x', options: [] } } }, 'ku', 'kurmanci')?.lang).toBe('en');
  });

  it('is the English the question always had, where nothing is translated, and nothing where there is no English', () => {
    expect(questionHelp({ promptEn: 'How old?', translations: {} }, 'de', 'kurmanci')).toEqual({ lang: 'en', prompt: 'How old?', options: null, explanation: null });
    expect(questionHelp({ promptEn: null, translations: {} }, 'de', 'kurmanci')).toBeNull();
  });
});
