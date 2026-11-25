import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { GiftCard } from '@kurda/shared';
import { renderApp, jsonResponse } from '../test/utils';
import { GiftBubble } from './GiftBubble';
import type { GiftActions } from './GiftReveal';
import { GiftLimitSetting } from './GiftLimitSetting';
import { BagNews } from './BagNews';
import { isKnownAdult, plusPitchAllowed } from './nudges';
import { PostGiftsRow } from '../feed/PostGifts';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const moon = (over: Partial<GiftCard> = {}): GiftCard => ({
  batchId: 'b1',
  sku: 'gift-heyv',
  name: 'Heyv',
  category: 'gift',
  assetUrl: '/cosmetics/gifts/made-07-heyv.png',
  tier: 'grand',
  recipients: [{ name: 'baran', avatarUrl: null, isMe: true, opened: false }],
  from: { userId: 'u-rojda', username: 'rojda', displayName: null, avatarUrl: null },
  myGiftId: 'g1',
  myOpened: false,
  equippable: null,
  ...over,
});

function actions(sendBack?: (c: GiftCard) => void): GiftActions {
  return {
    open: vi.fn(async () => moon({ myOpened: true, recipients: [{ name: 'baran', avatarUrl: null, isMe: true, opened: true }] })),
    thank: vi.fn(async () => null),
    wear: vi.fn(async () => null),
    ...(sendBack ? { sendBack } : {}),
  };
}

describe('a grand gift', () => {
  it('opens on the whole screen as night, then shows the gift with its meaning and Send one back', async () => {
    const sendBack = vi.fn();
    renderApp(<GiftBubble card={moon()} mine={false} senderName="rojda" actions={actions(sendBack)} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open the gift from rojda' }));
    const stage = screen.getByRole('dialog', { name: 'A gift from rojda' });
    expect(stage).toHaveClass('gift-stage-grand');
    expect(stage.querySelector('.night-sky')).not.toBeNull();
    await userEvent.click(within(stage).getByRole('button', { name: 'Skip' }));

    expect(await screen.findByRole('heading', { name: 'Heyv' })).toHaveAttribute('lang', 'ku');
    expect(screen.getByText('The full moon')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Send one back' }));
    expect(sendBack).toHaveBeenCalledWith(expect.objectContaining({ sku: 'gift-heyv' }));
    // the moment closes so the sheet opens on top of the chat, not under it
    expect(screen.queryByRole('dialog', { name: 'A gift from rojda' })).toBeNull();
  });

  it('stays on show in the chat once opened, large, for everyone in it', () => {
    const opened = moon({ myGiftId: null, recipients: [{ name: 'baran', avatarUrl: null, isMe: false, opened: true }] });
    renderApp(<GiftBubble card={opened} mine={false} senderName="rojda" actions={actions()} inGroup />);
    const bubble = screen.getByText('Heyv').closest('.gift-bubble')!;
    expect(bubble).toHaveClass('gift-showpiece');
    expect(bubble.querySelector('.gift-item-art')).toHaveStyle({ width: '132px' });
  });

  it('keeps its quiet fade under Reduce Motion, with no stars to come out', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, onchange: null, dispatchEvent: () => false }));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderApp(<GiftBubble card={moon()} mine={false} senderName="rojda" actions={actions()} />);
      await userEvent.click(screen.getByRole('button', { name: 'Open the gift from rojda' }));
      // the reduced-motion fade, not the 3.2 second night
      await act(async () => {
        vi.advanceTimersByTime(250);
      });
      expect(await screen.findByRole('heading', { name: 'Heyv' })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows large on a post, ahead of the small gifts', () => {
    renderApp(
      <PostGiftsRow
        item={{
          targetType: 'library',
          id: 'p1',
          gifts: {
            count: 3,
            senders: 2,
            from: null,
            items: [
              { sku: 'gift-kadiz', name: 'Rêya Kadizê', assetUrl: '/cosmetics/gifts/made-08-kadiz.png', count: 1, tier: 'grand' },
              { sku: 'gift-cay', name: 'Çay', assetUrl: '/cosmetics/gifts/made-01-cay.png', count: 2, tier: 'common' },
            ],
          },
        }}
      />,
    );
    const grand = document.querySelector('.fcard-gifts-grand')!;
    expect(grand.querySelectorAll('.gift-item-art')).toHaveLength(1);
    expect(document.querySelector('.fcard-gifts-art')!.querySelectorAll('.gift-item-art')).toHaveLength(1);
  });
});

describe('the gift spending limit in settings', () => {
  function stubLimit(view: unknown, change?: unknown) {
    const calls: Array<{ method: string; body: unknown }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith('/me/gift-limit')) {
          calls.push({ method: init?.method ?? 'GET', body: init?.body ? JSON.parse(init.body as string) : null });
          return jsonResponse(200, init?.method === 'PUT' ? change : view);
        }
        return jsonResponse(200, {});
      }),
    );
    return calls;
  }
  const none = { limit: null, pending: null, spent: 300, left: null, minor: false };

  it('starts with nothing set, and applies a new limit at once', async () => {
    const calls = stubLimit(none, { limit: { period: 'week', zer: 2_000 }, pending: null, spent: 300, left: 1_700, minor: false, delayed: false });
    renderApp(<GiftLimitSetting />);
    expect(await screen.findByText('No limit')).toBeInTheDocument();
    expect(screen.getByText('Spent on gifts in the last 30 days: 300 Zêr.')).toBeInTheDocument();
    // nothing is chosen for them
    expect(screen.getByLabelText('Most Zêr')).toHaveValue(null);
    await userEvent.type(screen.getByLabelText('Most Zêr'), '2000');
    await userEvent.selectOptions(screen.getByLabelText('Period'), 'week');
    expect(screen.getByText('≈ €20')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save limit' }));
    expect(calls.at(-1)).toEqual({ method: 'PUT', body: { limit: { period: 'week', zer: 2_000 } } });
    expect(await screen.findByText('Saved. It applies now.')).toBeInTheDocument();
    expect(screen.getByText('2,000 Zêr a week')).toBeInTheDocument();
  });

  it('says from when a raise applies, since it waits a day', async () => {
    const from = '2030-01-02T10:00:00.000Z';
    const set = { limit: { period: 'day', zer: 500 }, pending: null, spent: 0, left: 500, minor: false };
    stubLimit(set, { ...set, pending: { limit: { period: 'day', zer: 5_000 }, from }, delayed: true });
    renderApp(<GiftLimitSetting />);
    const amount = await screen.findByLabelText('Most Zêr');
    await userEvent.clear(amount);
    await userEvent.type(amount, '5000');
    await userEvent.click(screen.getByRole('button', { name: 'Save limit' }));
    expect(await screen.findByText(/A higher limit, or none, takes 24 hours, so this applies from/)).toBeInTheDocument();
    expect(screen.getByText(/Your new limit, 5,000 Zêr a day, applies from/)).toBeInTheDocument();
  });

  it('refuses an amount outside what can be set, before asking the server', async () => {
    const calls = stubLimit(none);
    renderApp(<GiftLimitSetting />);
    await userEvent.type(await screen.findByLabelText('Most Zêr'), '50');
    await userEvent.click(screen.getByRole('button', { name: 'Save limit' }));
    expect(await screen.findByText('Choose between 100 and 1,000,000 Zêr.')).toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(0);
  });

  it('shows the fixed limits under 18, with nothing to change', async () => {
    stubLimit({ limit: null, pending: null, spent: 450, left: null, minor: true });
    renderApp(<GiftLimitSetting />);
    expect(await screen.findByText(/Under 18, a gift can be up to 500 Zêr, and up to 2,000 Zêr a month/)).toBeInTheDocument();
    expect(screen.getByText('Spent on gifts this month: 450 of 2,000 Zêr.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save limit' })).toBeNull();
  });
});

describe('the line when a gift lands in the bag', () => {
  it('says what landed and where, and marks it told when closed', async () => {
    const posts: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === 'POST') posts.push(url);
        if (url.endsWith('/me')) return jsonResponse(200, { user: { id: 'u1', email: 'a@b.c', username: 'baran', displayName: null, emailVerified: true, minor: false } });
        if (url.endsWith('/gifts/bag')) {
          return jsonResponse(200, {
            items: [{ sku: 'gift-qehwe', name: 'Qehwe', assetUrl: null, count: 1 }],
            arrivals: [{ id: 'a1', sku: 'gift-qehwe', name: 'Qehwe', assetUrl: null, source: 'streak', at: '2030-01-01T00:00:00Z' }],
            earnsZer: false,
          });
        }
        return jsonResponse(200, {});
      }),
    );
    localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
    renderApp(<BagNews />);
    expect(await screen.findByText('Qehwe (Kurdish coffee) is in your gift bag, ready to give.')).toBeInTheDocument();
    // Hevalo+ is not on sale yet, so nothing is said about it
    expect(screen.queryByText('Members also earn Zêr here.')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(posts.some((u) => u.endsWith('/gifts/bag/seen'))).toBe(true);
  });
});

describe('suggestions to buy or join', () => {
  it('go only to a known adult, and only while there is something to buy', () => {
    expect(isKnownAdult({ minor: false })).toBe(true);
    expect(isKnownAdult({ minor: true })).toBe(false);
    expect(isKnownAdult({})).toBe(false);
    expect(isKnownAdult({ minor: false, birthDateRequired: true })).toBe(false);
    expect(isKnownAdult({ minor: false, kind: 'child' })).toBe(false);
    expect(plusPitchAllowed({ minor: false }, true)).toBe(true);
    expect(plusPitchAllowed({ minor: true }, true)).toBe(false);
    expect(plusPitchAllowed({ minor: false })).toBe(false);
  });
});

describe('the day’s gift for an account that does not earn Zêr', () => {
  it('is claimed like the Zêr, and says what landed in the bag', async () => {
    const { DailyZer } = await import('../daily/DailyZer');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.endsWith('/rewards/daily/claim')
          ? jsonResponse(200, { claimed: true, cycleDay: 1, reward: 0, balance: 0, member: false, bagGift: { sku: 'gift-cay', name: 'Çay', assetUrl: null } })
          : jsonResponse(200, {}),
      ),
    );
    const daily = { canClaim: true, claimableDay: 1, reward: 5, schedule: [5, 10, 10, 15, 15, 20, 50], alreadyClaimedToday: false, cycleDay: 0, learnedToday: true, member: false };
    renderApp(<DailyZer daily={daily} onClaimed={() => undefined} />);
    expect(screen.getByRole('heading', { name: 'Today’s gift' })).toBeInTheDocument();
    expect(screen.getByText('A small gift for your gift bag, to give a friend.')).toBeInTheDocument();
    // no Zêr is promised to someone who does not earn it
    expect(screen.queryByText(/Zêr/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Claim/ }));
    expect(await screen.findByText('Çay (A glass of tea) is in your gift bag.')).toBeInTheDocument();
  });
});
