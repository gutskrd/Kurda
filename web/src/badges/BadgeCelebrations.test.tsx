import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { UnseenBadge } from '@kurda/shared';
import { AuthProvider } from '../auth/AuthProvider';
import { I18nProvider } from '../i18n/I18nProvider';
import { RealtimeProvider } from '../realtime/RealtimeProvider';
import type { RealtimeClient } from '../realtime/RealtimeClient';
import type { RealtimeEventEnvelope } from '../realtime/events';
import { jsonResponse } from '../test/utils';
import { en } from '../i18n/en';
import { useQuietInvites } from '../play/quietInvites';
import { useCelebrationHold } from '../ranks/Celebration';
import { BadgeCelebrations } from './BadgeCelebrations';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

function fakeRealtime(): { client: RealtimeClient; emit: (env: RealtimeEventEnvelope) => void } {
  const listeners = new Set<(env: RealtimeEventEnvelope) => void>();
  const fake = {
    on(type: string, handler: (arg: unknown) => void) {
      if (type === 'event') listeners.add(handler as (env: RealtimeEventEnvelope) => void);
      return () => listeners.delete(handler as (env: RealtimeEventEnvelope) => void);
    },
    connect() {},
    destroy() {},
    join() {},
    leave() {},
  };
  return { client: fake as unknown as RealtimeClient, emit: (env) => listeners.forEach((h) => h(env)) };
}

const unseen = (key: string, tier: number, over: Partial<UnseenBadge> = {}): UnseenBadge => ({
  key,
  family: 'habit',
  tier,
  tierKey: tier > 0 ? (['sifir', 'ziv', 'zer', 'firuze'] as const)[tier - 1]! : null,
  secret: false,
  earnedAt: '2026-10-14T00:00:00.000Z',
  ...over,
});

function mount(list: UnseenBadge[], extra: React.ReactNode = null) {
  localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
    if (url.includes('/me/badges/unseen')) return jsonResponse(200, { unseen: list });
    if (url.includes('/me/badges/seen')) return jsonResponse(200, { seen: true });
    return jsonResponse(200, { user: { id: 'me', username: 'rojda', emailVerified: true } });
  });
  vi.stubGlobal('fetch', fetchMock);
  const rt = fakeRealtime();
  render(
    <I18nProvider>
      <AuthProvider>
        <MemoryRouter>
          <RealtimeProvider client={rt.client}>
            {extra}
            <BadgeCelebrations />
          </RealtimeProvider>
        </MemoryRouter>
      </AuthProvider>
    </I18nProvider>,
  );
  return { rt, fetchMock };
}

function Playing(): null {
  useQuietInvites(true);
  return null;
}

function Holding(): null {
  useCelebrationHold(true);
  return null;
}

describe('BadgeCelebrations', () => {
  it('celebrates what was earned while the app was closed, one at a time, and marks each seen', async () => {
    const { fetchMock } = mount([unseen('agir', 2), unseen('hefte', 1)]);

    const first = await screen.findByRole('dialog', { name: 'Agir (Fire)' });
    expect(first).toHaveTextContent(en['badges.unlockedTier']);
    expect(first).toHaveTextContent('Fire · Zîv');
    expect(screen.getByRole('img', { name: 'Agir (Fire), Zîv' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: en['badges.next'] }));

    expect(await screen.findByRole('dialog', { name: 'Hefte (Week)' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: en['rankResult.continue'] }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    const seen = fetchMock.mock.calls.filter(([url]) => url.includes('/me/badges/seen')).map(([, init]) => JSON.parse(String(init!.body)));
    expect(seen).toEqual([{ keys: ['agir'] }, { keys: ['hefte'] }]);
  });

  it('celebrates an unlock that arrives live', async () => {
    const { rt } = mount([]);
    const env = { room: 'user:me', event: { type: 'badge_unlocked', key: 'cihgirti', family: 'ranked', tier: 1, tierKey: 'zer', secret: false } };
    await waitFor(() => {
      rt.emit(env);
      expect(screen.getByRole('dialog', { name: 'Cihgirtî (Placed)' })).toBeInTheDocument();
    });
    // a badge with one tier is not "Zêr", though it is drawn in gold
    expect(screen.getByRole('dialog')).not.toHaveTextContent('Zêr');
    expect(screen.getByRole('dialog')).toHaveTextContent(en['badges.unlocked']);
  });

  it('says a secret was found', async () => {
    mount([unseen('kewe-ciye', 1, { family: 'secret', secret: true, tierKey: 'zer' })]);
    const dialog = await screen.findByRole('dialog', { name: 'Kewê çiyê (Mountain partridge)' });
    expect(dialog).toHaveTextContent(en['badges.unlockedSecret']);
    expect(dialog).toHaveTextContent(en['badges.kewe-ciye.desc']);
  });

  it('waits while a game is being played', async () => {
    const { fetchMock } = mount([unseen('agir', 1)], <Playing />);
    // the unlock is in hand, and still nothing is drawn over the game
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.includes('/me/badges/unseen'))).toBe(true));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('waits behind a game’s own result', async () => {
    const { fetchMock } = mount([unseen('agir', 1)], <Holding />);
    // the unlock is in hand, and still nothing is drawn over the game
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.includes('/me/badges/unseen'))).toBe(true));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
