import { afterEach, describe, expect, it, vi } from 'vitest';
// the fire as its props: how big it burns and whether it stands still, whoever draws it
vi.mock('../components/Fire', () => import('../test/fireProbe'));
import { render, screen, within } from '@testing-library/react';
import { fireLevel } from '@kurda/shared';
import { I18nProvider } from '../i18n/I18nProvider';
import { preloadCatalogue } from '../i18n/catalogues';
import type { StreakSummary } from '../lib/types';
import { StreakSheet } from './StreakSheet';

/*
 * The streak's sheet on the website, as on the phone: the streak in words by
 * its fire, the numbers a missed day never takes away, and the ladder of the
 * fire's stages — reached, burning now, and ahead.
 */

const streak = (current: number): StreakSummary => ({ current, longest: 30, freezes: 1, lastActiveOn: '2026-10-29', daysLearned: 41, sessionsPerFreeze: 5 });

function open(current: number): void {
  render(
    <I18nProvider>
      <StreakSheet streak={streak(current)} onClose={() => undefined} />
    </I18nProvider>,
  );
}

const ladder = (): HTMLElement => screen.getByRole('list');
/** Each stage as a screen reader hears it, smallest first. */
const rungs = (): string[] => within(ladder()).getAllByRole('listitem').map((li) => li.querySelector('.sr-only')?.textContent ?? '');
const rungFires = (): HTMLElement[] => within(ladder()).getAllByTestId('fire');

afterEach(() => localStorage.clear());

describe('the streak sheet', () => {
  it('says the streak by its fire, the numbers a missed day never takes, and what a freeze costs', () => {
    open(9);
    const sheet = screen.getByRole('dialog', { name: 'Streak' });
    expect(within(sheet).getByRole('heading', { name: '9-day streak' })).toBeInTheDocument();
    const [head] = within(sheet).getAllByTestId('fire');
    expect(head).toHaveAttribute('data-stage', 'campfire');
    expect(head).toHaveAttribute('data-growth', String(fireLevel(9).growth));
    expect(within(sheet).getByText('Longest streak').nextElementSibling).toHaveTextContent('30');
    expect(within(sheet).getByText('Days learned').nextElementSibling).toHaveTextContent('41');
    expect(within(sheet).getByText('Streak freezes').nextElementSibling).toHaveTextContent('1');
    expect(within(sheet).getByText(/^Every 5 lessons or practice sessions/)).toBeInTheDocument();
  });

  it('climbs the ladder: the stages reached, the one burning now, and the ones ahead', () => {
    open(9);
    expect(screen.getByRole('heading', { name: 'How your fire grows' })).toBeInTheDocument();
    expect(rungs()).toEqual([
      'Spark, from day 1, reached',
      'Little flame, from day 3, reached',
      'Campfire, from day 7, your fire now',
      'Big fire, from day 14, ahead',
      'Bonfire, from day 30, ahead',
      'Blaze, from day 100, ahead',
      'Newroz fire, from day 365, ahead',
    ]);
    // each stage drawn as it is, the one now as today has grown it; those ahead stand still
    expect(rungFires().map((f) => f.dataset.stage)).toEqual(['spark', 'kindling', 'campfire', 'bigfire', 'bonfire', 'blaze', 'newroz']);
    expect(rungFires().map((f) => f.dataset.still === 'true')).toEqual([false, false, false, true, true, true, true]);
    expect(rungFires()[2]).toHaveAttribute('data-growth', String(fireLevel(9).growth));
    // the one now is marked in words as well as ringed, and only it
    expect(within(ladder()).getAllByText('Now')).toHaveLength(1);
    expect(within(ladder()).getAllByRole('listitem')[2]).toHaveClass('is-now');
    expect(within(ladder()).getByText('Day 365')).toBeInTheDocument();
  });

  it('has every stage ahead while the logs are cold, inviting rather than grey', () => {
    open(0);
    expect(screen.getByRole('heading', { name: 'Finish a lesson to start a streak' })).toBeInTheDocument();
    expect(screen.getAllByTestId('fire')[0]).toHaveAttribute('data-stage', 'cold');
    expect(rungs().every((r) => r.endsWith(', ahead'))).toBe(true);
    expect(within(ladder()).queryByText('Now')).not.toBeInTheDocument();
  });

  it('burns the blaze at 120 days, with the Newroz fire still to come', () => {
    open(120);
    expect(rungs()[5]).toBe('Blaze, from day 100, your fire now');
    expect(rungs()[6]).toBe('Newroz fire, from day 365, ahead');
  });

  it('reads right to left in Sorani, every stage named', async () => {
    localStorage.setItem('hevalo_locale', 'ckb');
    await preloadCatalogue();
    open(9);
    expect(document.documentElement.dir).toBe('rtl');
    expect(rungs()[2]).toBe('ئاگری کەمپ، لە ڕۆژی ٧ەوە، ئاگری ئێستات');
    expect(rungs()[3]).toBe('ئاگری گەورە، لە ڕۆژی ١٤ەوە، لە پێشە');
  });
});
