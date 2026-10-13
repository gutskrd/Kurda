/**
 * Where a notification about a gift or about moderation opens, from its
 * `data.kind` (shared `ModerationNotificationData`, and the gift notice the
 * API records). Pure, like the rest of the inbox helpers.
 *
 * - `gift` → the chat it is in, unwrapping it there (`data.chat` is
 *   `dm:<senderId>` or `group:<groupId>`); the name is looked up on arrival.
 * - `report_outcome` → My reports.
 * - `sanction`, `sanction_lifted`, `appeal_decided` → Account standing, where
 *   the decision and its review are.
 */
export type SocialDeepLink =
  | { screen: 'MyReports' }
  | { screen: 'AccountStanding' }
  | { screen: 'Chat'; params: { userId: string; username: string; openGift?: string } }
  | { screen: 'GroupThread'; params: { groupId: string; name: string; openGift?: string } };

const UUIDISH = /^[0-9a-f-]{8,64}$/i;

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

export function socialDeepLink(data: Record<string, unknown>): SocialDeepLink | null {
  switch (data.kind) {
    case 'report_outcome':
      return { screen: 'MyReports' };
    case 'sanction':
    case 'sanction_lifted':
    case 'appeal_decided':
      return { screen: 'AccountStanding' };
    case 'gift': {
      const chat = str(data.chat);
      const giftId = str(data.giftId) ?? undefined;
      const [where, id] = chat ? (chat.split(':', 2) as [string, string | undefined]) : ['', undefined];
      if (id && UUIDISH.test(id)) {
        if (where === 'dm') return { screen: 'Chat', params: { userId: id, username: '', openGift: giftId } };
        if (where === 'group') return { screen: 'GroupThread', params: { groupId: id, name: '', openGift: giftId } };
      }
      // a gift from the shop before gifts were in the chat names only its sender
      const from = str(data.fromUserId);
      return from && UUIDISH.test(from) ? { screen: 'Chat', params: { userId: from, username: '', openGift: giftId } } : null;
    }
    default:
      return null;
  }
}
