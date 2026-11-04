import { describe, it, expect, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderApp } from '../test/utils';
import { LearnHeader } from './LearnHeader';
import { LEARN_PATHS, learnPath, readLearnView, rememberLearnView } from './learnView';

afterEach(() => localStorage.clear());

describe('Learn’s three groups', () => {
  it('offers Lessons, Stories and Games in that order, each at its own address', () => {
    renderApp(<LearnHeader view="stories" />);
    const tabs = screen.getAllByRole('link');
    expect(tabs.map((a) => a.textContent)).toEqual(['Lessons', 'Stories', 'Games']);
    expect(tabs.map((a) => a.getAttribute('href'))).toEqual(['/app/learn', '/app/learn/stories', '/app/games']);
    expect(screen.getByRole('link', { name: 'Stories' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('navigation', { name: 'Lessons, stories or games' })).toBeInTheDocument();
  });

  it('remembers the group it is on, and the Learn tab goes back there', () => {
    renderApp(<LearnHeader view="stories" />);
    expect(readLearnView()).toBe('stories');
    expect(learnPath()).toBe(LEARN_PATHS.stories);
  });

  it('reads only a group it knows, and Lessons otherwise', () => {
    expect(readLearnView()).toBe('lessons');
    rememberLearnView('games');
    expect(readLearnView()).toBe('games');
    localStorage.setItem('hevalo_learn_view', 'poems');
    expect(readLearnView()).toBe('lessons');
    expect(learnPath()).toBe('/app/learn');
  });
});
