import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderApp } from '../test/utils';
import { Landing } from '../pages/Landing';
import { Faq } from '../pages/Faq';
import { en } from '../i18n/en';

/**
 * The front page's and the FAQ's promises, held to what the product does: four exercise kinds, a fixed-rule review
 * schedule, Zêr paid for learning, a streak for a finished lesson, review or solved daily Peyvok
 * (api/src/game/wordle-service.ts), an optional league, listening and speaking only "in lessons that have them", and
 * XP only from lessons, stories and online games with other people.
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

  it('says what keeps a streak, and that only Hevalo+ members earn Zêr', () => {
    const { container } = renderApp(<Landing />);
    expect(screen.getByText(/a streak for each day you finish a lesson or a review, or solve the daily peyvok/i)).toBeInTheDocument();
    // A lost daily Peyvok keeps no streak, so finishing one is not enough.
    expect(container.textContent).not.toMatch(/a review or the daily peyvok/i);
    expect(screen.getByText(/^Hevalo\+ members get Zêr for each day they finish a lesson or a review/)).toBeInTheDocument();
    expect(screen.getByText(/Hevalo\+ members also earn Zêr/)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/come back each day for zêr|show up every day for zêr/i);
  });

  it('promises XP for lessons, stories and games played online with friends, not for games as such', () => {
    const { container } = renderApp(<Landing />);
    expect(container.textContent).not.toMatch(/games and lessons earn xp/i);
    expect(screen.getByText(/^Lessons, stories and games played online with friends earn XP, and a weekly league ranks it/)).toBeInTheDocument();
    expect(screen.getByText('Lessons, stories and games with friends online earn XP.')).toBeInTheDocument();
    // An account keeps game scores; it is not said to keep XP, which not all games earn.
    expect(screen.getByText('The games need a free account, which keeps your scores.')).toBeInTheDocument();
  });

  it('says recordings are slowed in listening exercises, where there is a recording', () => {
    renderApp(<Landing />);
    expect(
      screen.getByText(/wherever one has been made, and, in lessons that have them, listening exercises can play it slower/i),
    ).toBeInTheDocument();
  });

  /** Each line that names listening or speaking carries its own hedge, rather than relying on a footnote. */
  it('promises listening and speaking only in the lessons that have them, line by line', () => {
    renderApp(<Landing />);
    const learn = document.getElementById('learn')!;
    const lines = Array.from(learn.querySelectorAll('li')).filter((li) => /listen|speak/i.test(li.textContent ?? ''));
    expect(lines.length).toBeGreaterThanOrEqual(2);
    for (const li of lines) expect(li.textContent).toMatch(/in lessons (that have them|with speaking exercises)/i);
  });

  it('names no listening or speaking exercise on the front page without saying which lessons have them', () => {
    const lines = Object.entries(en).filter(
      ([k, v]) => k.startsWith('landing.') && /(listening|speaking) exercises|listen and speak/i.test(v),
    );
    expect(lines.length).toBeGreaterThanOrEqual(3);
    for (const [k, v] of lines) expect(v, k).toMatch(/in lessons (that have them|with speaking exercises)|coming soon/i);
  });
});

describe('what the FAQ promises', () => {
  it('says the leagues are a choice', () => {
    renderApp(<Faq />);
    const answer = screen.getByText('What are XP, leagues and Zêr?').closest('details')!;
    expect(within(answer).getByText(/leagues are optional, and you can leave them in settings/i)).toBeInTheDocument();
  });

  it('says where XP comes from, and that a game played alone or on one phone earns none', () => {
    renderApp(<Faq />);
    const answer = screen.getByText('What are XP, leagues and Zêr?').closest('details')!;
    expect(answer.textContent).toMatch(/XP is what lessons, reviews, stories and games played online with other people earn you/);
    expect(answer.textContent).toMatch(/a game played alone or on one phone earns none/);
    expect(answer.textContent).not.toMatch(/stories and games earn you/);
  });

  it('does not offer the games without an account', () => {
    renderApp(<Faq />);
    const answer = screen.getByText('Do I need an account?').closest('details')!;
    expect(answer.textContent).not.toMatch(/play the solo games/i);
    expect(within(answer).getByText(/play the games.*you need a free account/i)).toBeInTheDocument();
  });
});
