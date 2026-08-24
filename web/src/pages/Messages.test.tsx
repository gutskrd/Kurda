import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Messages } from './Messages';
import { renderApp, routedFetch, jsonResponse } from '../test/utils';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

describe('Messages', () => {
  it('renders the conversation list with unread counts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        routedFetch({
          '/chat/conversations': {
            conversations: [
              { userId: 'u2', username: 'zana', lastMessage: 'Silav!', lastAt: '2026-08-24T10:00:00Z', lastFromMe: false, unread: 2 },
            ],
          },
        }),
      ),
    );
    renderApp(<Messages />, ['/app/messages']);

    expect(await screen.findByText('zana')).toBeInTheDocument();
    expect(screen.getByText('Silav!')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // unread badge
  });

  it('opens a thread and sends a message', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/chat/u2/messages') && init?.method === 'POST') {
        return jsonResponse(200, { id: 'm2', senderId: 'me', body: 'Hey there', createdAt: '2026-08-24T10:05:00Z', deliveredAt: null, readAt: null });
      }
      if (url.includes('/chat/u2/messages')) {
        return jsonResponse(200, { messages: [{ id: 'm1', senderId: 'u2', body: 'Silav!', createdAt: '2026-08-24T10:00:00Z', deliveredAt: null, readAt: null }] });
      }
      if (url.includes('/chat/conversations')) return jsonResponse(200, { conversations: [] });
      return jsonResponse(200, {});
    });
    vi.stubGlobal('fetch', fetchMock);

    renderApp(<Messages />, ['/app/messages?to=u2&name=zana']);

    expect(await screen.findByText('Silav!')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Message'), 'Hey there');
    await userEvent.click(screen.getByRole('button', { name: /^send$/i }));

    expect(await screen.findByText('Hey there')).toBeInTheDocument();
    // a POST to the messages endpoint was made
    expect(fetchMock.mock.calls.some(([u, i]) => String(u).includes('/chat/u2/messages') && (i as RequestInit)?.method === 'POST')).toBe(true);
  });
});
