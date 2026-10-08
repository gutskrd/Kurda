import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Landing } from './Landing';

const show = () =>
  render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>,
  );

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
      ['Kurdish Wordle', '/app/games/wordle'],
      ['Rhyming Words', '/app/games/rhyme'],
      ['Typing Race', '/app/games/race'],
      ['Ranked Quiz', '/app/games/quiz'],
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
});
