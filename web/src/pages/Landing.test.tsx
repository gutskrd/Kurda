import { afterEach, describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Landing } from './Landing';

const show = () =>
  render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>,
  );

afterEach(() => {
  vi.useRealTimers();
});

describe('Landing', () => {
  it('says what Hevalo is in its heading, and offers both ways in', () => {
    show();
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toHaveTextContent(/learn kurdish/i);
    expect(h1).toHaveTextContent(/play together/i);
    expect(screen.getByRole('link', { name: /start learning kurdish/i })).toHaveAttribute('href', '/register');
    // the games are a look around, not a promise to play without signing up:
    // every game needs an account (deliberately changed from "Play a game first")
    expect(screen.getByRole('link', { name: /see the games/i })).toHaveAttribute('href', '/app/games');
    expect(screen.getByText(/the games need a free account/i)).toBeInTheDocument();
  });

  it('links every game to the place it is played', () => {
    show();
    for (const [name, href] of [
      ['Peyvok', '/app/games/peyvok'],
      ['Rhyming Words', '/app/games/rhyme'],
      ['Typing Race', '/app/games/race'],
      ['Stories', '/app/learn/stories'],
    ]) {
      expect(screen.getByRole('link', { name }), name).toHaveAttribute('href', href);
    }
  });

  /**
   * Lessons live in the phone app, which is not in the stores yet. The section
   * that shows a lesson has to say so, rather than let the picture imply that
   * the lesson is a click away.
   */
  it('says where the lessons are, where it shows one: in the browser now, the apps still to come', () => {
    show();
    const learn = document.getElementById('learn')!;
    expect(within(learn).getByText(/in your browser now · ios and android apps coming soon/i)).toBeInTheDocument();
  });

  it('claims no store availability it does not have', () => {
    const { container } = show();
    const text = container.textContent ?? '';
    expect(text).toMatch(/apps coming soon/i);
    expect(text).not.toMatch(/download on the app store|get it on google play|available on ios/i);
  });

  /** The pictures are pictures: one described image each, nothing to press inside. */
  it('describes each picture of the product once, and puts no controls in them', () => {
    show();
    const pictures = screen.getAllByRole('img').filter((el) => el.classList.contains('lp-mock'));
    expect(pictures.length).toBeGreaterThanOrEqual(6);
    for (const picture of pictures) {
      expect(picture).toHaveAccessibleName();
      expect(picture.querySelector('a, button, input')).toBeNull();
    }
  });

  /** The phone in the hero shows the app's own screens; one is there for a reader at a time, and the tabs under it pick one. */
  it('shows one screen of the app at a time on the hero phone, and lets the tabs under it pick another', () => {
    show();
    const tabs = screen.getByRole('group', { name: 'Screens from the Hevalo app' });
    expect(within(tabs).getByRole('button', { name: 'Lessons' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('img', { name: /the learning path in the hevalo app/i })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /a peyvok battle in hevalo/i })).toBeNull();

    fireEvent.click(within(tabs).getByRole('button', { name: 'Peyvok Battle' }));
    expect(within(tabs).getByRole('button', { name: 'Peyvok Battle' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('img', { name: /a peyvok battle in hevalo/i })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /the learning path in the hevalo app/i })).toBeNull();
  });

  it('moves the hero phone on to the next screen by itself, and stays on the one someone picks', () => {
    vi.useFakeTimers();
    show();
    const tabs = screen.getByRole('group', { name: 'Screens from the Hevalo app' });
    act(() => {
      vi.advanceTimersByTime(5300);
    });
    expect(within(tabs).getByRole('button', { name: 'Peyvok Battle' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(within(tabs).getByRole('button', { name: 'Stories' }));
    act(() => {
      vi.advanceTimersByTime(20000);
    });
    expect(within(tabs).getByRole('button', { name: 'Stories' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('img', { name: /the story library in the hevalo app/i })).toBeInTheDocument();
  });

  it('shows a lesson on the phone in the learn section', () => {
    show();
    const learn = document.getElementById('learn')!;
    expect(within(learn).getByRole('img', { name: /a lesson exercise/i })).toBeInTheDocument();
  });
});
