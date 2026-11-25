// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('../theme/Pressable', () => import('../testing/reach'));
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { testAuth } from '../reports/testing/auth';
import { forgetReach } from '../testing/reach';
import { PlusScreen } from './PlusScreen';

patchReactNativeWeb({ reduceMotion: true });
afterEach(() => {
  cleanup();
  forgetReach();
  testAuth.user.kind = undefined;
});

describe('the Hevalo+ page on the phone', () => {
  it('names only what members get in this build, the most valuable first', () => {
    renderWithProviders(<PlusScreen onClose={() => undefined} />);
    const text = document.body.textContent ?? '';
    const order = [
      '250 Zêr and 3 gifts in a box every month',
      'Earn Zêr from lessons, quests and streaks',
      'Two streak freezes and a free restore each month',
      'Icons and backgrounds only members wear',
      'One family plan for up to 6 people',
    ].map((perk) => text.indexOf(perk));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(text).not.toMatch(/offline|quiz room|no ads|ad-free/i);
  });

  it('chooses the yearly plan first, with the price it bills largest, and lets the monthly be chosen', () => {
    renderWithProviders(<PlusScreen onClose={() => undefined} />);
    const yearly = screen.getByTestId('plus-plan-yearly');
    expect(yearly.getAttribute('aria-checked')).toBe('true');
    expect(yearly.textContent).toContain('€29.99 a year');
    expect(yearly.textContent).toContain('€2.50 a month');
    expect(yearly.textContent).toContain('Best value');
    expect(yearly.textContent).toContain('Save 37%');
    fireEvent.click(screen.getByTestId('plus-plan-monthly'));
    expect(screen.getByTestId('plus-plan-monthly').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('plus-plan-monthly').textContent).toContain('First month €0.99');
    expect(screen.getByTestId('plus-plan-family').textContent).toContain('Up to 6 people');
  });

  it('keeps the renewal terms, restore and the legal links under the button, says nothing is sold yet, and closes', () => {
    const onClose = vi.fn();
    renderWithProviders(<PlusScreen onClose={onClose} />);
    expect(screen.getByText('Renews automatically. Cancel anytime in your store settings.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Restore purchases' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Terms of Use' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Get Hevalo+' }));
    expect(screen.getByText('Hevalo+ isn’t on sale yet. It will be soon, in the app.')).toBeTruthy();
    fireEvent.click(screen.getByTestId('plus-close'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('never shows itself to a child’s profile', () => {
    testAuth.user.kind = 'child';
    const onClose = vi.fn();
    renderWithProviders(<PlusScreen onClose={onClose} />);
    expect(screen.queryByText('Get Hevalo+')).toBeNull();
    expect(onClose).toHaveBeenCalled();
  });
});
