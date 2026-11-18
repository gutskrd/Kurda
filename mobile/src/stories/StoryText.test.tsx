// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hueSteps, type StoryGlossEntry } from '@kurda/shared';
import { renderWithProviders } from '../reports/testing/harness';
import { PALETTES } from '../theme/palette';
import { STORY_BODY_SIZE, StoryText, storyLineHeight } from './StoryText';
import { forgetReach, reachOf } from '../testing/reach';

vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
// Records each control as it is drawn, so its reach can be read.
vi.mock('../theme/Pressable', () => import('../testing/reach'));

const nan: StoryGlossEntry = { term: 'nan', meanings: { en: 'bread' } };

const story = {
  dialect: 'kurmanci' as const,
  paragraphs: ['Dayika min nan dipêje. Nan germ e.', 'Em nan dixwin.'],
  glossary: [nan],
};

/** A colour's red, green and blue, from #862be2, rgb(134, 43, 226) or rgba(134,43,226,1.00). */
const rgbOf = (colour: string): number[] =>
  colour.startsWith('#') ? [1, 3, 5].map((at) => parseInt(colour.slice(at, at + 2), 16)) : (colour.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);

describe('storyLineHeight', () => {
  it('spaces lines for the reader’s size alone — React Native adds the system text size to it', () => {
    expect(storyLineHeight(STORY_BODY_SIZE)).toBe(30);
    expect(storyLineHeight(Math.round(STORY_BODY_SIZE * 1.5))).toBe(45);
  });
});

describe('StoryText', () => {
  afterEach(() => {
    cleanup();
    forgetReach();
  });

  it('lets a paragraph’s translation toggle answer a finger past its edges, but not over the words above it', () => {
    const translation = { paragraphs: ['My mother bakes bread. The bread is warm.', 'We eat bread.'], lang: 'en' };
    const text = (shown: number[]) => (
      <StoryText story={story} onGloss={() => undefined} translation={translation} translated={new Set(shown)} onToggleTranslation={() => undefined} />
    );
    const view = renderWithProviders(text([]));
    // 32 tall and alone on its line: 8 past its sides and foot, and only the paragraph's 4 up toward a glossary word.
    expect(reachOf('Translation of paragraph 1')).toEqual({ top: 4, bottom: 8, left: 8, right: 8 });
    // The same with the translation shown above it.
    view.rerender(text([0]));
    expect(reachOf('Hide the translation of paragraph 1')).toEqual({ top: 4, bottom: 8, left: 8, right: 8 });
  });

  it('marks a glossary word the first time in each paragraph, and opens its meaning', () => {
    const onGloss = vi.fn();
    renderWithProviders(<StoryText story={story} onGloss={onGloss} />);
    // "nan" twice in the first paragraph (once as "Nan") and once in the second: one mark per paragraph.
    const marks = screen.getAllByText('nan');
    expect(marks).toHaveLength(2);
    fireEvent.click(marks[0]!);
    expect(onGloss).toHaveBeenCalledWith(nan);
  });

  it('marks nothing where there is nobody to open a meaning for', () => {
    renderWithProviders(<StoryText story={story} />);
    expect(screen.queryAllByText('nan')).toHaveLength(0);
  });

  it('shows a paragraph’s translation under it on request, marked as English when it is the fallback', () => {
    const onToggle = vi.fn();
    const translation = { paragraphs: ['My mother bakes bread. The bread is warm.', 'We eat bread.'], lang: 'en' };
    const view = renderWithProviders(<StoryText story={story} translation={translation} translated={new Set()} onToggleTranslation={onToggle} />);
    expect(screen.queryByText('We eat bread.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Translation of paragraph 2' }));
    expect(onToggle).toHaveBeenCalledWith(1);
    view.rerender(<StoryText story={story} translation={translation} translated={new Set([1])} onToggleTranslation={onToggle} />);
    expect(screen.getByText('We eat bread.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hide the translation of paragraph 2' })).toBeTruthy();
    expect(screen.queryByText('My mother bakes bread. The bread is warm.')).toBeNull();
  });

  it('says the sentence being read again when it is tapped, and nothing else when another is', () => {
    const onReplay = vi.fn();
    const view = renderWithProviders(<StoryText story={story} current={{ paragraph: 0, sentence: 1 }} onReplay={onReplay} />);
    fireEvent.click(screen.getByText('Dayika min nan dipêje.', { exact: false }));
    expect(onReplay).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Nan germ e.', { exact: false }));
    expect(onReplay).toHaveBeenCalledTimes(1);
    // Nothing being read, so a tap on the text does nothing.
    view.rerender(<StoryText story={story} current={null} onReplay={onReplay} />);
    fireEvent.click(screen.getByText('Nan germ e.', { exact: false }));
    expect(onReplay).toHaveBeenCalledTimes(1);
  });

  it('lays the violet’s wash behind the sentence being read and underlines a word that opens its meaning in violet, by day and by night', async () => {
    try {
      for (const scheme of ['light', 'dark'] as const) {
        // The reader's chosen theme, stored where the app keeps it.
        localStorage.setItem('kurda_theme_pref_v1', scheme);
        renderWithProviders(<StoryText story={story} current={{ paragraph: 0, sentence: 1 }} onGloss={vi.fn()} />);
        const reading = (): string => (screen.getByText('Nan germ e.', { exact: false }) as HTMLElement).style.backgroundColor;
        await waitFor(() => expect(rgbOf(reading())).toEqual(rgbOf(hueSteps(scheme, 'violet').wash)));
        const word = screen.getAllByText('nan')[0] as HTMLElement;
        expect(rgbOf(word.style.textDecorationColor)).toEqual(rgbOf(PALETTES[scheme].primary));
        // A sentence not being read has no band.
        expect((screen.getByText('Dayika min', { exact: false }) as HTMLElement).style.backgroundColor).toBe('');
        cleanup();
      }
    } finally {
      localStorage.removeItem('kurda_theme_pref_v1');
    }
  });

  it('gives a Listen button only to a paragraph that has recordings, and says which one plays', () => {
    const onListen = vi.fn();
    const view = renderWithProviders(<StoryText story={story} listenable={new Set([1])} onListen={onListen} />);
    expect(screen.queryByRole('button', { name: 'Listen to paragraph 1' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Listen to paragraph 2' }));
    expect(onListen).toHaveBeenCalledWith(1);
    view.rerender(<StoryText story={story} listenable={new Set([1])} onListen={onListen} listening={1} playing />);
    expect(screen.getByRole('button', { name: 'Pause paragraph 2' })).toBeTruthy();
  });
});
