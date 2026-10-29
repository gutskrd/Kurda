import { describe, expect, it } from 'vitest';
import { en } from '../i18n/en';
import { translator } from '../i18n/I18nProvider';
import { groupNotification } from './notifications';

const t = translator(en);
const note = (data: Record<string, unknown>, title = 'Server title', body: string | null = 'Server body') => ({ title, body, data });
const say = (data: Record<string, unknown>) => groupNotification(note({ groupId: 'g1', groupName: 'Hevalên Amedê', ...data }), t, 'en');

describe('news about a group', () => {
  it('tells someone removed that they can come back, the way the group allows', () => {
    expect(say({ kind: 'group_removed', privacy: 'open' })).toEqual({
      title: 'You were removed from Hevalên Amedê',
      body: 'You can join again.',
      to: '/app/messages?group=g1',
    });
    expect(say({ kind: 'group_removed', privacy: 'invite' })?.body).toBe('An admin can add you again.');
  });

  it('tells someone banned for how long, why, and that they can ask', () => {
    expect(say({ kind: 'group_banned', duration: '1d', reason: null })).toEqual({
      title: 'You were banned from Hevalên Amedê for a day',
      body: 'You can ask to come back.',
      to: '/app/messages?group=g1',
    });
    expect(say({ kind: 'group_banned', duration: '7d' })?.title).toBe('You were banned from Hevalên Amedê for a week');
    expect(say({ kind: 'group_banned', duration: 'perm', reason: 'Reklam' })).toMatchObject({
      title: 'You were banned from Hevalên Amedê for good',
      body: 'You can ask to come back. Reason: Reklam',
    });
    expect(say({ kind: 'group_banned' })?.title).toBe('You were banned from Hevalên Amedê');
  });

  it('tells the admins how many ask to come back, and opens the group on its requests', () => {
    expect(say({ kind: 'group_request' })).toEqual({ title: 'Someone asked to rejoin Hevalên Amedê', body: null, to: '/app/messages?group=g1&info=requests' });
    expect(say({ kind: 'group_request', count: 3 })?.title).toBe('3 people asked to rejoin Hevalên Amedê');
  });

  it('tells a requester they are back in, or free to join again', () => {
    expect(say({ kind: 'group_request_approved', rejoined: true })?.title).toBe('You’re back in Hevalên Amedê');
    expect(say({ kind: 'group_request_approved', rejoined: false })?.title).toBe('You can join Hevalên Amedê again');
  });

  it('tells a requester turned down when they may ask again, or that they may not', () => {
    const declined = say({ kind: 'group_request_declined', requestAfter: '2026-11-05T10:00:00.000Z', closed: false });
    expect(declined?.title).toBe('Your request to rejoin Hevalên Amedê wasn’t accepted');
    expect(declined?.body).toMatch(/^You can ask again on .+\.$/);
    expect(say({ kind: 'group_request_declined', closed: true })?.body).toBe('The admins aren’t taking requests from you for this group.');
  });

  it('shows the server words, still opening the group, when the group is not named', () => {
    expect(groupNotification(note({ kind: 'group_banned', groupId: 'g1' }), t, 'en')).toEqual({ title: 'Server title', body: 'Server body', to: '/app/messages?group=g1' });
  });

  it('leaves anything not about a group to the others', () => {
    expect(groupNotification(note({ kind: 'gift', groupId: 'g1' }), t, 'en')).toBeNull();
    expect(groupNotification(note({ kind: 'group_banned' }), t, 'en')).toBeNull();
    expect(groupNotification({ title: 'x', body: null, data: null }, t, 'en')).toBeNull();
  });
});
