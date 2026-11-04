// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StoryGlossEntry } from '@kurda/shared';
import { renderWithProviders } from '../reports/testing/harness';
import { STORY_BODY_SIZE, StoryText, storyLineHeight } from './StoryText';

vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));

const nan: StoryGlossEntry = { term: 'nan', meanings: { en: 'bread' } };

const story = {
  dialect: 'kurmanci' as const,
  paragraphs: ['Dayika min nan dipêje. Nan germ e.', 'Em nan dixwin.'],
  glossary: [nan],
};

describe('storyLineHeight', () => {
  it('spaces lines for the reader’s size alone — React Native adds the system text size to it', () => {
    expect(storyLineHeight(STORY_BODY_SIZE)).toBe(30);
    expect(storyLineHeight(Math.round(STORY_BODY_SIZE * 1.5))).toBe(45);
  });
});

describe('StoryText', () => {
  afterEach(cleanup);

  it('marks a glossary word the first time in each paragraph, and opens its meaning', () => {
    const onGloss = vi.fn();
    renderWithProviders(<StoryText story={story} onGloss={onGloss} />);
    // "nan" twice in the first paragraph (the second as "Nan"), once in the second: one mark each
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
