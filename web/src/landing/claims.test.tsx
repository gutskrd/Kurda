import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderApp } from '../test/utils';
import { Landing } from '../pages/Landing';
import { Faq } from '../pages/Faq';

/**
 * What the front page and the FAQ promise, held to what the product does.
 *
 * Each of these was a line the research report found untrue (docs/research,
 * "some copy is untrue"): six kinds of exercise when the published course has
 * four, words brought back "just before you would forget them" by a schedule
 * that follows fixed rules, Zêr for coming back when it is paid for learning,
 * a streak for every day you return when it counts a finished lesson, review
 * or daily Wordle, and a league everyone is in when it is a choice.
 */
describe('what the front page promises', () => {
  it('promises listening and speaking only in the lessons that have them', () => {
    renderApp(<Landing />);
    const learn = document.getElementById('learn')!;
    expect(within(learn).queryByText(/six kinds of exercise/i)).not.toBeInTheDocument();
    expect(within(learn).getByText(/in lessons that have them, listen and speak/i)).toBeInTheDocument();
  });

  it('does not claim to know when you would forget', () => {
    const { container } = renderApp(<Landing />);
    expect(container.textContent).not.toMatch(/just before you would forget/i);
    expect(screen.getByText(/review brings back what you have answered/i)).toBeInTheDocument();
  });

  it('says what keeps a streak and what pays Zêr', () => {
    const { container } = renderApp(<Landing />);
    expect(screen.getByText(/a streak for each day you finish a lesson, a review or the daily wordle/i)).toBeInTheDocument();
    expect(screen.getByText(/finish a lesson or a review each day for zêr/i)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/come back each day for zêr|show up every day for zêr/i);
  });

  it('says recordings are slowed in listening exercises, where there is a recording', () => {
    renderApp(<Landing />);
    expect(screen.getByText(/wherever one has been made, and listening exercises can play it slower/i)).toBeInTheDocument();
  });
});

describe('what the FAQ promises', () => {
  it('says the leagues are a choice', () => {
    renderApp(<Faq />);
    const answer = screen.getByText('What are XP, leagues and Zêr?').closest('details')!;
    expect(within(answer).getByText(/leagues are optional, and you can leave them in settings/i)).toBeInTheDocument();
  });

  it('does not offer the games without an account', () => {
    renderApp(<Faq />);
    const answer = screen.getByText('Do I need an account?').closest('details')!;
    expect(answer.textContent).not.toMatch(/play the solo games/i);
    expect(within(answer).getByText(/play the games.*you need a free account/i)).toBeInTheDocument();
  });
});
