import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthProvider';
import { ProfileModalProvider } from '../profile/ProfileModal';
import { RealtimeProvider } from '../realtime/RealtimeProvider';
import type { RealtimeClient } from '../realtime/RealtimeClient';
import type { RealtimeEventEnvelope } from '../realtime/events';
import { Quiz } from './Quiz';
import { jsonResponse } from '../test/utils';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

function makeFakeClient(): {
  client: RealtimeClient;
  emit: (env: RealtimeEventEnvelope) => void;
  sent: Record<string, unknown>[];
  isConnected: () => boolean;
} {
  const listeners = new Set<(env: RealtimeEventEnvelope) => void>();
  const sent: Record<string, unknown>[] = [];
  let connected = false;
  const fake = {
    on(type: string, handler: (arg: unknown) => void) {
      if (type === 'event') listeners.add(handler as (env: RealtimeEventEnvelope) => void);
      return () => listeners.delete(handler as (env: RealtimeEventEnvelope) => void);
    },
    connect() {
      connected = true;
    },
    destroy() {},
    join() {},
    leave() {},
    send(msg: Record<string, unknown>) {
      sent.push(msg);
    },
  };
  return { client: fake as unknown as RealtimeClient, emit: (env) => listeners.forEach((h) => h(env)), sent, isConnected: () => connected };
}

const question = {
  type: 'question',
  index: 0,
  total: 3,
  prompt: 'What does “roj” mean?',
  options: ['Day', 'Night', 'Water', 'Fire'],
  endsAt: Date.now() + 10000,
};

describe('Quiz (ranked 1v1)', () => {
  it('matches, plays a question, and shows results', async () => {
    localStorage.setItem('mykurda_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/matchmaking/queue') && init?.method === 'POST') {
          return jsonResponse(200, { status: 'matched', roomId: 'match:1', opponent: { id: 'u2', username: 'zana' } });
        }
        if (url.includes('/games/match:1/state')) {
          return jsonResponse(200, {
            phase: 'lobby',
            players: [
              { id: 'me', username: 'ada' },
              { id: 'u2', username: 'zana' },
            ],
          });
        }
        if (url.includes('/me')) return jsonResponse(200, { user: { id: 'me', username: 'ada', displayName: 'Ada', email: 'a@b.com', emailVerified: true } });
        return jsonResponse(200, {});
      }),
    );

    const { client, emit, sent, isConnected } = makeFakeClient();
    render(
      <AuthProvider>
        <RealtimeProvider client={client}>
          <MemoryRouter initialEntries={['/app/games/quiz']}>
            <ProfileModalProvider>
              <Quiz />
            </ProfileModalProvider>
          </MemoryRouter>
        </RealtimeProvider>
      </AuthProvider>,
    );

    await waitFor(() => expect(isConnected()).toBe(true));
    await userEvent.click(await screen.findByRole('button', { name: /find a match/i }));

    // lobby snapshot loads, then a question arrives over the room
    await waitFor(() => expect(sent).toContainEqual({ type: 'ready', room: 'match:1' }));
    emit({ room: 'match:1', event: question });

    const dayBtn = await screen.findByRole('button', { name: 'Day' });
    await userEvent.click(dayBtn);
    expect(sent).toContainEqual({ type: 'answer', room: 'match:1', index: 0, choice: 0 });

    // reveal marks the correct option, then results end the match
    emit({ room: 'match:1', event: { type: 'reveal', index: 0, correctIndex: 0, answers: {} } });
    emit({
      room: 'match:1',
      event: {
        type: 'results',
        provisional: false,
        mode: '1v1',
        scores: [
          { userId: 'me', username: 'ada', points: 120, correct: 3, rank: 1, xp: 30, ratingDelta: 12 },
          { userId: 'u2', username: 'zana', points: 80, correct: 2, rank: 2, xp: 10, ratingDelta: -12 },
        ],
      },
    });

    expect(await screen.findByText(/you won/i)).toBeInTheDocument();
    expect(screen.getByText('+12')).toBeInTheDocument();
  });
});
