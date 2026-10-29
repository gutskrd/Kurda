// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
// the fire as its props: how big it burns and whether it stands still, whoever draws it
vi.mock('../theme/Fire', () => import('../theme/testing/fireProbe'));
import { cleanup, screen, within } from '@testing-library/react';
import { fireLevel } from '@kurda/shared';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import type { Streak } from './format';
import { StreakSheet } from './StreakSheet';

/*
 * The streak's sheet, opened from Learn's fire and the profile's streak: the
 * numbers a missed day never takes away, and the ladder of the fire's stages —
 * reached, burning now, and ahead, each said in full to a screen reader.
 */

patchReactNativeWeb({ reduceMotion: true });
afterEach(() => {
  cleanup();
  localStorage.removeItem('kurda_locale_v1');
});

Object.defineProperty(window, 'visualViewport', { value: { height: 800, width: 320, scale: 1 }, configurable: true });
window.dispatchEvent(new Event('resize'));

const streak = (current: number): Streak => ({ current, longest: 30, freezes: 1, lastActiveOn: '2026-10-29', daysLearned: 41, sessionsPerFreeze: 5 });

const open = (current: number) => renderWithProviders(<StreakSheet streak={streak(current)} onClose={() => undefined} />);

const ladder = (): HTMLElement => screen.getByTestId('fire-ladder');
/** Each stage as a screen reader hears it, smallest first. */
const rungs = (): string[] => within(ladder()).getAllByTestId(/^rung-/).map((r) => r.getAttribute('aria-label') ?? '');
const rungFires = (): HTMLElement[] => within(ladder()).getAllByTestId('fire');

describe('the streak sheet', () => {
  it('says the streak by a fire as big as it, and the numbers a missed day never takes', () => {
    open(9);
    expect(screen.getByRole('heading', { name: 'Streak' })).toBeTruthy();
    expect(screen.getByText('9 days')).toBeTruthy();
    const head = screen.getAllByTestId('fire')[0]!;
    expect(head.dataset.stage).toBe('campfire');
    expect(head.dataset.growth).toBe(String(fireLevel(9).growth));
    expect(screen.getByLabelText('30 Longest streak')).toBeTruthy();
    expect(screen.getByLabelText('41 Days learned')).toBeTruthy();
  });

  it('climbs the ladder: the stages reached, the one burning now, and the ones ahead', () => {
    open(9);
    expect(within(ladder()).getByRole('heading', { name: 'How your fire grows' })).toBeTruthy();
    expect(rungs()).toEqual([
      'Spark, from day 1, reached',
      'Little flame, from day 3, reached',
      'Campfire, from day 7, your fire now',
      'Big fire, from day 14, ahead',
      'Bonfire, from day 30, ahead',
      'Blaze, from day 100, ahead',
      'Newroz fire, from day 365, ahead',
    ]);
    expect(within(ladder()).getAllByTestId(/^rung-/).map((r) => r.dataset.testid)).toEqual([
      'rung-reached',
      'rung-reached',
      'rung-now',
      'rung-ahead',
      'rung-ahead',
      'rung-ahead',
      'rung-ahead',
    ]);
    // each stage drawn as it is, the one now as today has grown it; those ahead stand still
    expect(rungFires().map((f) => f.dataset.stage)).toEqual(['spark', 'kindling', 'campfire', 'bigfire', 'bonfire', 'blaze', 'newroz']);
    expect(rungFires().map((f) => f.dataset.still === 'true')).toEqual([false, false, false, true, true, true, true]);
    expect(rungFires()[2]!.dataset.growth).toBe(String(fireLevel(9).growth));
    // the one now said in words on the screen too, and only it
    expect(within(ladder()).getAllByText('Now')).toHaveLength(1);
    expect(within(ladder()).getByText('Day 365')).toBeTruthy();
  });

  it('has every stage ahead while the logs are cold', () => {
    open(0);
    expect(screen.getByText('A lesson today starts a streak')).toBeTruthy();
    expect(screen.getAllByTestId('fire')[0]!.dataset.stage).toBe('cold');
    expect(rungs().every((r) => r.endsWith(', ahead'))).toBe(true);
    expect(within(ladder()).queryByText('Now')).toBeNull();
  });

  it('burns the blaze at 120 days, with the Newroz fire still to come', () => {
    open(120);
    expect(rungs()[5]).toBe('Blaze, from day 100, your fire now');
    expect(rungs()[6]).toBe('Newroz fire, from day 365, ahead');
  });

  it('mirrors right to left in Sorani, every stage named', async () => {
    localStorage.setItem('kurda_locale_v1', 'ckb');
    open(9);
    const now = await within(ladder()).findByLabelText(/ئاگری کەمپ، لە ڕۆژی .+ەوە، ئاگری ئێستات/);
    expect(getComputedStyle(now).flexDirection).toBe('row-reverse');
  });
});
