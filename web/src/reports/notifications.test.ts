import { describe, it, expect } from 'vitest';
import { englishOnly as t, translator } from '../i18n/I18nProvider';
import { ku } from '../i18n/ku';
import { giftChatPath, socialNotification } from './notifications';

const note = (data: Record<string, unknown> | null) => ({ title: 'English title', body: 'English body', data });

describe('socialNotification', () => {
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
    // and until when, when it ends, in the reader's way of writing a date
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
    // a date it cannot read is left out rather than shown as "Invalid Date"
    expect(socialNotification(note({ kind: 'sanction', sanction: 'chat_mute', until: 'soon' }), t)?.body).toBe('Messages paused');
    expect(socialNotification(note({ kind: 'sanction_lifted', sanctionId: 's1' }), t)?.to).toBe('/app/settings/standing');
    expect(socialNotification(note({ kind: 'appeal_decided', appealId: 'a1', outcome: 'overturned' }), t)?.to).toBe('/app/settings/standing');
  });

  it('points a caring message at a helpline', () => {
    expect(socialNotification(note({ kind: 'caring_message', helplineUrl: 'https://findahelpline.com' }), t)?.href).toBe(
      'https://findahelpline.com',
    );
    // never anywhere but a web address
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

  it('opens a gift in the chat it is in', () => {
    expect(socialNotification(note({ kind: 'gift', giftId: 'g1', chat: 'dm:u2' }), t)).toMatchObject({
      title: 'You have a gift',
      to: '/app/messages?to=u2&gift=g1',
    });
    expect(giftChatPath('group:grp1', 'g2')).toBe('/app/messages?group=grp1&gift=g2');
    expect(giftChatPath('nonsense', 'g2')).toBeNull();
  });

  it('leaves everything else as the server wrote it', () => {
    expect(socialNotification(note({ kind: 'play_invite' }), t)).toBeNull();
    expect(socialNotification(note(null), t)).toBeNull();
  });
});
