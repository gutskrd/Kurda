/**
 * Rendering the play layer in a test: the app's providers, a realtime
 * connection the test drives, and the address the screen went to. Not
 * shipped: only test files import it. The fake API is the Stories one
 * (stories/testing.ts `fakeApi`).
 */
import type { ReactNode } from 'react';
import { expect } from 'vitest';
import { render, screen, waitFor, type RenderResult } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { IncomingInvite, OutgoingInviteState } from '@kurda/shared';
import { AuthProvider } from '../auth/AuthProvider';
import { I18nProvider } from '../i18n/I18nProvider';
import { ProfileModalProvider } from '../profile/ProfileModal';
import { RealtimeProvider } from '../realtime/RealtimeProvider';
import type { RealtimeClient } from '../realtime/RealtimeClient';
import type { RealtimeEventEnvelope } from '../realtime/events';
import { PlayProvider } from './PlayProvider';

/** A RealtimeClient stand-in whose events a test sends. */
export function fakeRealtime(): { client: RealtimeClient; emit: (event: Record<string, unknown>, room?: string) => void } {
  const listeners = new Set<(env: RealtimeEventEnvelope) => void>();
  const fake = {
    on(type: string, handler: (arg: unknown) => void) {
      if (type !== 'event') return () => undefined;
      listeners.add(handler as (env: RealtimeEventEnvelope) => void);
      return () => listeners.delete(handler as (env: RealtimeEventEnvelope) => void);
    },
    connect() {},
    destroy() {},
    join() {},
    leave() {},
  };
  return {
    client: fake as unknown as RealtimeClient,
    emit: (event, room = 'user:me') => listeners.forEach((h) => h({ room, event } as unknown as RealtimeEventEnvelope)),
  };
}

/** Where the screen is now, for a test to read. */
function Where(): React.JSX.Element {
  const { pathname, search } = useLocation();
  // a span, not an <output>: that is a status region, and the banners are too
  return <span data-testid="where">{pathname + search}</span>;
}

export function where(): string {
  return screen.getByTestId('where').textContent ?? '';
}

/** The app's providers around `ui`, with the play layer's own. */
export function renderPlay(
  ui: ReactNode,
  opts: { route?: string; realtime?: ReturnType<typeof fakeRealtime> } = {},
): RenderResult & { realtime: ReturnType<typeof fakeRealtime> } {
  const realtime = opts.realtime ?? fakeRealtime();
  const result = render(
    <AuthProvider>
      <I18nProvider>
        <MemoryRouter initialEntries={[opts.route ?? '/app/games']}>
          <RealtimeProvider client={realtime.client}>
            <ProfileModalProvider>
              <PlayProvider>
                {ui}
                <Where />
              </PlayProvider>
            </ProfileModalProvider>
          </RealtimeProvider>
        </MemoryRouter>
      </I18nProvider>
    </AuthProvider>,
  );
  return { ...result, realtime };
}

/**
 * Wait until the signed-in path has run (the invites were read), so an event
 * sent next has someone listening.
 */
export async function signedInAndListening(calls: Array<{ path: string }>): Promise<void> {
  await waitFor(() => expect(calls.some((c) => c.path.startsWith('/play/invites'))).toBe(true));
}

export function incoming(over: Partial<IncomingInvite> = {}): IncomingInvite {
  return {
    id: 'i1',
    game: 'wordle-battle',
    lobbyId: 'b1',
    status: 'pending',
    from: { name: 'Rojda', avatarUrl: null },
    summary: { difficulty: 'hard' },
    rematch: false,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    ...over,
  };
}

export function asked(over: Partial<OutgoingInviteState> = {}): OutgoingInviteState {
  return {
    inviteId: 'o1',
    userId: 'u2',
    name: 'Rojda',
    avatarUrl: null,
    status: 'pending',
    declineReason: null,
    ...over,
  };
}
