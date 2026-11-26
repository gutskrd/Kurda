import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderApp } from '../test/utils';
import { Landing } from '../pages/Landing';
import { Faq } from '../pages/Faq';
import { en } from '../i18n/en';
import { TREE_HEALTHS } from '@kurda/shared';
import { lessonsFor } from './TreeGrowth';

/**
 * The front page's and the FAQ's promises, held to what the product does. The front page: the tree takes about sixty
 * lessons and is never lost (shared tree.ts), the phone apps are coming rather than out, and nothing claims people,
 * numbers or praise it cannot show. The FAQ: XP only from lessons, reviews, stories and online games with other people,
 * leagues optional, and the games behind a free account.
 */
describe('what the front page promises', () => {
  it('says the tree takes about sixty lessons, as the shared growth rules make it', () => {
    renderApp(<Landing />);
    expect(screen.getByText(/in about sixty lessons/)).toBeInTheDocument();
    expect(lessonsFor(6)).toBeGreaterThanOrEqual(55);
    expect(lessonsFor(6)).toBeLessThanOrEqual(65);
  });

  it('says a tree left alone wilts but is never lost, as the shared tree does', () => {
    renderApp(<Landing />);
    expect(screen.getByText(/Miss a week and it wilts, but it never dies/)).toBeInTheDocument();
    expect(TREE_HEALTHS[TREE_HEALTHS.length - 1]).toBe('withered');
  });

  it('claims no people, numbers, ratings or press it cannot show', () => {
    const { container } = renderApp(<Landing />);
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/\d[\d,.]*\s*(k|m)?\s*(users|learners|people|members|downloads|students)/i);
    expect(text).not.toMatch(/★|rated|reviews|as seen in|award|trusted by/i);
  });

  it('names no listening or speaking exercise on the front page without saying which lessons have them', () => {
    const lines = Object.entries(en).filter(([k, v]) => k.startsWith('landing.') && /(listening|speaking) exercises|listen and speak/i.test(v));
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
