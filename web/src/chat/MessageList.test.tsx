import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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
        showAuthors
      />,
    );
    expect(screen.getAllByText('zana')).toHaveLength(1);
    expect(screen.getByText('first')).toBeInTheDocument();
    expect(screen.getByText('third')).toBeInTheDocument();
  });

  it('does not name the sender in a one-to-one thread', () => {
    show(<MessageList messages={[msg('1', 'u2', 'hello', at(10, 0), { username: 'zana' })]} myId="me" />);
    expect(screen.queryByText('zana')).not.toBeInTheDocument();
    expect(screen.getByText('hello')).toBeInTheDocument();
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
        showAuthors
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
