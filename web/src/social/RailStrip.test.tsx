import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RailStrip, rungs } from './RailStrip';
import type { SocialRailData } from './useSocialRail';

const person = (id: string, extra: Record<string, unknown> = {}) => ({
  userId: id,
  username: `u${id}`,
  displayName: null,
  avatarUrl: null,
  online: false,
  lastSeenAt: null,
  activity: null,
  ...extra,
});

const playing = (id: string) =>
  person(id, { online: true, activity: { game: 'Wordle', since: new Date().toISOString() } });

const data = (over: Partial<SocialRailData> = {}): SocialRailData => ({
  friends: [],
  requests: [],
  challenges: [],
  groups: [],
  notifications: [],
  unread: { notifications: 0, groups: 0, requests: 0, challenges: 0 },
  ...over,
}) as SocialRailData;

const countFor = (d: SocialRailData, key: string): number => rungs(d).find((r) => r.key === key)!.count;

describe('rungs', () => {
  it('puts the number of online friends on the friends icon', () => {
    const d = data({
      friends: [person('1', { online: true }), person('2', { online: true }), person('3')],
    });
    // the whole point of the folded rail: two friends online, a small 2
    expect(countFor(d, 'online')).toBe(2);
  });

  it('counts someone in a game under the game icon, not under online', () => {
    const d = data({ friends: [playing('1'), person('2', { online: true })] });
    expect(countFor(d, 'playing')).toBe(1);
    // otherwise they would be counted twice and the numbers would not add up
    expect(countFor(d, 'online')).toBe(1);
  });

  it('adds invites and requests together, since both are waiting on you', () => {
    const d = data({ challenges: [person('9')], requests: [person('8'), person('7')] });
    expect(countFor(d, 'waiting')).toBe(3);
  });

  it('shows unread group messages, not the number of groups', () => {
    const d = data({
      groups: [
        { id: 'a', name: 'A', memberCount: 2, unread: 3 },
        { id: 'b', name: 'B', memberCount: 9, unread: 0 },
      ],
      unread: { notifications: 0, groups: 3, requests: 0, challenges: 0 },
    });
    // being in two groups is not news; three unread messages is
    expect(countFor(d, 'groups')).toBe(3);
  });

  it('marks only the things you have to act on as urgent', () => {
    const byKey = Object.fromEntries(rungs(data()).map((r) => [r.key, r.urgent ?? false]));
    expect(byKey.waiting).toBe(true);
    expect(byKey.online).toBe(false);
    expect(byKey.playing).toBe(false);
  });
});

describe('RailStrip', () => {
  it('shows a count only where there is something to count', () => {
    render(<RailStrip data={data({ friends: [person('1', { online: true })] })} onExpand={() => undefined} />);

    expect(screen.getByRole('button', { name: /Friends online: 1/ })).toBeInTheDocument();
    // a zero is not information; four zeroes down the side is noise
    expect(screen.getByRole('button', { name: /Waiting on you: 0/ }).textContent).toBe('');
  });

  it('caps a big number so the strip cannot widen', () => {
    const many = Array.from({ length: 120 }, (_, i) => person(String(i), { online: true }));
    render(<RailStrip data={data({ friends: many })} onExpand={() => undefined} />);
    expect(screen.getByRole('button', { name: /Friends online: 120/ }).textContent).toBe('99+');
  });

  it('opens the rail when a rung is clicked', async () => {
    const onExpand = vi.fn();
    render(<RailStrip data={data()} onExpand={onExpand} />);
    // a number you cannot act on is only half useful
    await userEvent.click(screen.getByRole('button', { name: /Groups/ }));
    expect(onExpand).toHaveBeenCalled();
  });
});
