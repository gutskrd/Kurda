import { describe, expect, it } from 'vitest';
import { HELPLINE_URL } from '@kurda/shared';
import { resolveDeepLink } from '../notifications/inbox';
import { socialDeepLink } from './deepLinks';

const U = '6f1c2d3e-4a5b-4c6d-8e7f-001122334455';
const G = '7a1c2d3e-4a5b-4c6d-8e7f-001122334455';

describe('socialDeepLink', () => {
  it('opens My reports for a report’s outcome', () => {
    expect(resolveDeepLink({ kind: 'report_outcome', reportIds: ['r1'], outcome: 'actioned' })).toEqual({ screen: 'MyReports' });
  });

  it('opens Account standing for a decision, a lifted one, and an answered review', () => {
    for (const kind of ['sanction', 'sanction_lifted', 'appeal_decided']) {
      expect(resolveDeepLink({ kind, sanctionId: 's1' })).toEqual({ screen: 'AccountStanding' });
    }
  });

  it('opens the chat a gift is in, to unwrap it there', () => {
    expect(resolveDeepLink({ kind: 'gift', giftId: 'g1', chat: `dm:${U}` })).toEqual({
      screen: 'Chat',
      params: { userId: U, username: '', openGift: 'g1' },
    });
    expect(resolveDeepLink({ kind: 'gift', giftId: 'g2', chat: `group:${G}` })).toEqual({
      screen: 'GroupThread',
      params: { groupId: G, name: '', openGift: 'g2' },
    });
  });

  it('falls back to the sender for a shop gift from before, and to nothing for nonsense', () => {
    expect(socialDeepLink({ kind: 'gift', giftId: 'g3', fromUserId: U })).toMatchObject({ screen: 'Chat', params: { userId: U } });
    expect(socialDeepLink({ kind: 'gift', chat: 'dm:../../etc' })).toBeNull();
    expect(socialDeepLink({ screen: 'EventQuests' })).toBeNull();
  });

  it('opens a caring message in full, with an https helpline and never another kind of link', () => {
    expect(resolveDeepLink({ kind: 'caring_message', helplineUrl: 'https://findahelpline.com' })).toEqual({
      screen: 'CaringMessage',
      helplineUrl: 'https://findahelpline.com',
    });
    expect(socialDeepLink({ kind: 'caring_message' })).toEqual({ screen: 'CaringMessage', helplineUrl: HELPLINE_URL });
    expect(socialDeepLink({ kind: 'caring_message', helplineUrl: 'javascript:alert(1)' })).toEqual({
      screen: 'CaringMessage',
      helplineUrl: HELPLINE_URL,
    });
  });
});
