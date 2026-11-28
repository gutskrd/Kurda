import { describe, it, expect } from 'vitest';
import { englishOnly as t, translator } from '../i18n/I18nProvider';
import { ku } from '../i18n/ku';
import { giftChatPath, socialNotification } from './notifications';

const note = (data: Record<string, unknown> | null) => ({ title: 'English title', body: 'English body', data });

describe('socialNotification', () => {
  it('says who gave a post a gift, as the server lets its author see them, and opens the post', () => {
    const named = socialNotification(note({ kind: 'post_gift', postType: 'library', postId: 'p1', fromUserId: 'u1', fromName: 'Hamo' }), t);
    expect(named).toEqual({ title: 'Hamo gave your post a gift', body: null, to: '/app/library/p1' });
    // a notice that names the author's own gift opens it on the post
    const gift = socialNotification(note({ kind: 'post_gift', postType: 'library', postId: 'p1', giftId: 'g1', fromName: 'Hamo' }), t);
    expect(gift?.to).toBe('/app/library/p1?gift=g1');
    // Once the giver may not be named to the author, the notice says nothing about who.
    expect(socialNotification(note({ kind: 'post_gift', postType: 'library', postId: 'p1', fromUserId: 'u1' }), t)?.title).toBe('Your post was given a gift');
    expect(socialNotification(note({ kind: 'post_gift', postType: 'library', postId: 'p1', fromName: 'Hamo' }), translator(ku))?.title).toBe(
      'Hamo diyariyek da şandiya te',
    );
  });

  it('sends a report’s outcome to My reports, in the reader’s words', () => {
    const view = socialNotification(note({ kind: 'report_outcome', reportIds: ['r1'], outcome: 'actioned' }), t);
    expect(view).toEqual({
      title: 'About your report',
      body: 'We took action. Thanks for keeping Hevalo safe.',
      to: '/app/settings/reports',
    });
    expect(socialNotification(note({ kind: 'report_outcome', outcome: 'no_violation' }), translator(ku))?.title).toBe('Derbarê rapora te de');
  });

  it('sends a decision, a lifted limit and an answered review to Account standing', () => {
    const sanction = socialNotification(note({ kind: 'sanction', sanctionId: 's1', sanction: 'chat_mute', policy: 'spam', until: null }), t);
    expect(sanction).toMatchObject({ title: 'A decision about your account', body: 'Messages paused', to: '/app/settings/standing' });
    // Until when, in the reader's date format.
    const until = socialNotification(
      note({ kind: 'sanction', sanctionId: 's1', sanction: 'chat_mute', policy: 'spam', until: '2031-03-05T10:00:00.000Z' }),
      t,
      'en-GB',
    );
    expect(until?.body).toMatch(/^Messages paused until 5 Mar 2031, \d\d:\d\d$/);
    const kuUntil = socialNotification(
      note({ kind: 'sanction', sanctionId: 's1', sanction: 'chat_mute', policy: 'spam', until: '2031-03-05T10:00:00.000Z' }),
      translator(ku),
      'ku',
    );
    expect(kuUntil?.body).toMatch(/ heta .*2031/);
    // An unreadable date is left out rather than shown as "Invalid Date".
    expect(socialNotification(note({ kind: 'sanction', sanction: 'chat_mute', until: 'soon' }), t)?.body).toBe('Messages paused');
    expect(socialNotification(note({ kind: 'sanction_lifted', sanctionId: 's1' }), t)?.to).toBe('/app/settings/standing');
    expect(socialNotification(note({ kind: 'appeal_decided', appealId: 'a1', outcome: 'overturned' }), t)?.to).toBe('/app/settings/standing');
  });

  it('points a caring message at a helpline', () => {
    expect(socialNotification(note({ kind: 'caring_message', helplineUrl: 'https://findahelpline.com' }), t)?.href).toBe(
      'https://findahelpline.com',
    );
    // Never anything but a web address.
    expect(socialNotification(note({ kind: 'caring_message', helplineUrl: 'javascript:alert(1)' }), t)?.href).toBe(
      'https://findahelpline.com',
    );
  });

  it('keeps the moderator’s own words in a caring message, before the rest in the reader’s language', () => {
    const view = socialNotification(
      note({ kind: 'caring_message', helplineUrl: 'https://findahelpline.com', message: 'Silav Baran, we read your message.' }),
      translator(ku),
    );
    expect(view?.body?.startsWith('Silav Baran, we read your message. ')).toBe(true);
    expect(view?.body).toContain(translator(ku)('notify.caring.body'));
  });

  it('counts several of one gift, keeping the item a surprise', () => {
    expect(socialNotification(note({ kind: 'gift', giftId: 'g1', chat: 'dm:u2', quantity: '3' }), t)).toMatchObject({
      title: 'You have 3 gifts',
      body: 'Open them in your chat.',
      to: '/app/messages?to=u2&gift=g1',
    });
    const post = { kind: 'post_gift', postType: 'library', postId: 'p1', quantity: '3' };
    expect(socialNotification(note({ ...post, fromName: 'Hamo' }), t)?.title).toBe('Hamo gave your post 3 gifts');
    expect(socialNotification(note(post), t)?.title).toBe('Your post was given 3 gifts');
    expect(socialNotification(note({ ...post, fromName: 'Hamo' }), translator(ku))?.title).toBe('Hamo 3 diyarî dan şandiya te');
    // one, or a number that is not one, reads as a single gift
    expect(socialNotification(note({ ...post, fromName: 'Hamo', quantity: '1' }), t)?.title).toBe('Hamo gave your post a gift');
    expect(socialNotification(note({ ...post, fromName: 'Hamo', quantity: 'lots' }), t)?.title).toBe('Hamo gave your post a gift');
  });

  it('opens a gift in the chat it is in', () => {
    expect(socialNotification(note({ kind: 'gift', giftId: 'g1', chat: 'dm:u2' }), t)).toMatchObject({
      title: 'You have a gift',
      to: '/app/messages?to=u2&gift=g1',
    });
    expect(giftChatPath('group:grp1', 'g2')).toBe('/app/messages?group=grp1&gift=g2');
    expect(giftChatPath('nonsense', 'g2')).toBeNull();
  });

  it('sends a letter to the window, naming its correspondence, so its bird lands there first', () => {
    const thread = '11111111-2222-4333-8444-555555555555';
    expect(socialNotification(note({ kind: 'letter', threadId: thread, fromUserId: 'u1' }), t)).toEqual({
      title: 'A bird came to your window',
      body: 'There’s a letter for you.',
      to: `/app/letters?bird=${thread}`,
    });
    // An invalid correspondence id is never followed; the window opens as it is.
    expect(socialNotification(note({ kind: 'letter', threadId: '../../me' }), t)?.to).toBe('/app/letters');
  });

  it('says your own bird came home with an answer, in the reader’s words', () => {
    const thread = '11111111-2222-4333-8444-555555555555';
    const view = socialNotification(note({ kind: 'letter', threadId: thread, how: 'home', letterId: 'aaaaaaaa-0000-4000-8000-000000000001' }), t);
    expect(view).toEqual({ title: 'Your bird came home', body: 'It brought an answer to your letter.', to: `/app/letters?bird=${thread}` });
    expect(socialNotification(note({ kind: 'letter', threadId: thread, how: 'home' }), translator(ku))?.title).toBe('Balindeyê te vegeriya malê');
  });

  it('leaves everything else as the server wrote it', () => {
    expect(socialNotification(note({ kind: 'play_invite' }), t)).toBeNull();
    expect(socialNotification(note(null), t)).toBeNull();
  });
});
