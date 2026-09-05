import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { MessageList } from './MessageList';

/** Local-time ISO, so the test does not depend on the runner's timezone. */
const at = (h: number, m: number): string => {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

const msg = (id: string, senderId: string, body: string, iso: string, extra = {}) => ({
  id,
  senderId,
  body,
  createdAt: iso,
  ...extra,
});

/** MessageBody renders game-invite links, which are react-router Links. */
const show = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('MessageList', () => {
  it('names a group sender once per burst, not once per message', () => {
    show(
      <MessageList
        messages={[
          msg('1', 'u2', 'first', at(10, 0), { username: 'zana' }),
          msg('2', 'u2', 'second', at(10, 1), { username: 'zana' }),
          msg('3', 'u2', 'third', at(10, 2), { username: 'zana' }),
        ]}
        myId="me"
      />,
    );
    expect(screen.getAllByText('zana')).toHaveLength(1);
    expect(screen.getByText('first')).toBeInTheDocument();
    expect(screen.getByText('third')).toBeInTheDocument();
  });

  it('names the sender in a one-to-one thread too', () => {
    // Snapchat-style: every burst says who wrote it, in both kinds of thread
    show(<MessageList messages={[msg('1', 'u2', 'hello', at(10, 0), { username: 'zana' })]} myId="me" />);
    expect(screen.getByText('zana')).toBeInTheDocument();
    expect(screen.getByText('hello')).toBeInTheDocument();
  });

  it('labels your own run as You', () => {
    show(<MessageList messages={[msg('1', 'me', 'mine', at(10, 0), { username: 'hamude' })]} myId="me" />);
    expect(screen.getByText('You')).toBeInTheDocument();
  });

  it('shows one avatar per burst, at its start, and none on your own', () => {
    const { container } = show(
      <MessageList
        messages={[
          msg('1', 'u2', 'a', at(10, 0), { username: 'zana', avatarUrl: 'https://img/z.png' }),
          msg('2', 'u2', 'b', at(10, 1), { username: 'zana', avatarUrl: 'https://img/z.png' }),
          msg('3', 'me', 'mine', at(10, 30), { username: 'hamude' }),
        ]}
        myId="me"
      />,
    );
    // two bubbles from zana, one avatar — a face beside every line is noise
    expect(container.querySelectorAll('.chat-run-avatar')).toHaveLength(1);
    expect(container.querySelector('.chat-run-avatar img')?.getAttribute('src')).toBe('https://img/z.png');
  });

  it('opens a profile from the avatar', async () => {
    const onOpenProfile = vi.fn();
    show(
      <MessageList
        messages={[msg('1', 'u2', 'hi', at(10, 0), { username: 'zana' })]}
        myId="me"
        onOpenProfile={onOpenProfile}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /zana.s profile/i }));
    expect(onOpenProfile).toHaveBeenCalledWith('u2', 'zana');
  });

  it('marks your own run so it can be aligned and coloured differently', () => {
    const { container } = show(
      <MessageList messages={[msg('1', 'me', 'mine', at(10, 0)), msg('2', 'u2', 'theirs', at(10, 30))]} myId="me" />,
    );
    const runs = [...container.querySelectorAll('.chat-run')];
    expect(runs).toHaveLength(2);
    expect(runs[0]!.className).toContain('mine');
    expect(runs[1]!.className).not.toContain('mine');
  });

  it('gives only the last bubble of a burst a tail', () => {
    const { container } = show(
      <MessageList messages={[msg('1', 'u2', 'a', at(10, 0)), msg('2', 'u2', 'b', at(10, 1))]} myId="me" />,
    );
    const bubbles = [...container.querySelectorAll('.bubble')];
    expect(bubbles).toHaveLength(2);
    expect(bubbles[0]!.className).not.toContain('bubble-tail');
    expect(bubbles[1]!.className).toContain('bubble-tail');
  });

  it('shows one timestamp per burst rather than one per message', () => {
    const { container } = show(
      <MessageList
        messages={[msg('1', 'u2', 'a', at(10, 0)), msg('2', 'u2', 'b', at(10, 1)), msg('3', 'u2', 'c', at(10, 2))]}
        myId="me"
      />,
    );
    expect(container.querySelectorAll('.chat-run-meta')).toHaveLength(1);
    expect(container.querySelectorAll('time')).toHaveLength(1);
  });

  it('separates days', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(22, 0, 0, 0);
    show(
      <MessageList messages={[msg('1', 'u2', 'old', yesterday.toISOString()), msg('2', 'u2', 'new', at(9, 0))]} myId="me" />,
    );
    expect(screen.getByText('Yesterday')).toBeInTheDocument();
    expect(screen.getByText('Today')).toBeInTheDocument();
  });

  it('renders a deleted group message as a tombstone, not its body', () => {
    show(
      <MessageList
        messages={[msg('1', 'u2', 'the original text', at(10, 0), { username: 'zana', deleted: true })]}
        myId="me"
      />,
    );
    expect(screen.getByText('message deleted')).toBeInTheDocument();
    expect(screen.queryByText('the original text')).not.toBeInTheDocument();
  });

  it('renders a status only against your own run', () => {
    show(
      <MessageList
        messages={[msg('1', 'me', 'mine', at(10, 0)), msg('2', 'u2', 'theirs', at(10, 30))]}
        myId="me"
        renderStatus={() => <span data-testid="receipt">Read</span>}
      />,
    );
    expect(screen.getAllByTestId('receipt')).toHaveLength(1);
  });

  it('renders nothing for an empty thread', () => {
    const { container } = show(<MessageList messages={[]} myId="me" />);
    expect(container.querySelectorAll('.chat-run')).toHaveLength(0);
    expect(container.querySelectorAll('.chat-day')).toHaveLength(0);
  });
});
