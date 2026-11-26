import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderApp } from '../test/utils';
import { PlusPage } from './PlusPage';

afterEach(() => {
  vi.unstubAllGlobals();
});

function open(): void {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
  renderApp(<PlusPage />, ['/app/plus']);
}

describe('the Hevalo+ page', () => {
  it('names only what members get in this build, the most valuable first', () => {
    open();
    const perks = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(perks).toEqual([
      '250 Zêr and 3 gifts in a box every month',
      'Earn Zêr from lessons, quests and streaks',
      'Two streak freezes and a free restore each month',
      'Icons and backgrounds only members wear',
      'One family plan for up to 6 people',
    ]);
    expect(document.body.textContent).not.toMatch(/offline|quiz room|no ads|ad-free/i);
  });

  it('chooses the yearly plan first, best value, with the price it bills largest and the saving worked out', () => {
    open();
    const yearly = screen.getByRole('radio', { name: /Yearly/ });
    expect(yearly.getAttribute('aria-checked')).toBe('true');
    expect(yearly.querySelector('.plus-plan-price')?.textContent).toBe('€29.99 a year');
    expect(yearly.textContent).toContain('€2.50 a month');
    expect(yearly.textContent).toContain('Best value');
    expect(yearly.textContent).toContain('Save 37%');
  });

  it('says what the monthly plan bills each month and what its first month costs, and how many a family covers', () => {
    open();
    const monthly = screen.getByRole('radio', { name: /Monthly/ });
    fireEvent.click(monthly);
    expect(monthly.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: /Yearly/ }).getAttribute('aria-checked')).toBe('false');
    expect(monthly.querySelector('.plus-plan-price')?.textContent).toBe('€3.99 a month');
    expect(monthly.textContent).toContain('First month €0.99');
    expect(screen.getByRole('radio', { name: /Family/ }).textContent).toContain('Up to 6 people');
  });

  it('keeps the terms under the button: renewal, restore, the terms and the privacy policy, and a way out', () => {
    open();
    expect(screen.getByText('Renews automatically. Cancel anytime in your store settings.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Restore purchases' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Terms' }).getAttribute('href')).toBe('/terms');
    expect(screen.getByRole('link', { name: 'Privacy' }).getAttribute('href')).toBe('/privacy');
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
  });

  it('says where Hevalo+ is bought, since the website sells nothing', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Get Hevalo+' }));
    expect(screen.getByRole('status').textContent).toBe('Hevalo+ is bought in the Hevalo app on your phone.');
  });
});
