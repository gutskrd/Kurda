import { HELPLINE_URL } from '@kurda/shared';

/**
 * Where a notification about a gift or moderation opens, from its `data.kind` (shared `ModerationNotificationData`, and
 * the gift notice the API records). Pure, like the rest of the inbox helpers.
 * - `gift`: the chat it is in, unwrapping it there (`data.chat` is `dm:<senderId>` or `group:<groupId>`).
 * - `post_gift`: the post it was given onto, where its gifts show.
 * - `report_outcome`: My reports.
 * - `sanction`, `sanction_lifted`, `appeal_decided`: Account standing.
 * - `caring_message`: not a screen; the list opens it in full with its helpline (`CaringMessageDialog`). Only an https
 *   link is taken from the data; anything else becomes the shared helpline page.
 */
export type SocialDeepLink =
  | { screen: 'MyReports' }
  | { screen: 'AccountStanding' }
  | { screen: 'CaringMessage'; helplineUrl: string }
  | { screen: 'Chat'; params: { userId: string; username: string; openGift?: string } }
  | { screen: 'GroupThread'; params: { groupId: string; name: string; openGift?: string } }
  | { screen: 'LibraryPost'; params: { postId: string } };

const UUIDISH = /^[0-9a-f-]{8,64}$/i;

/** A notification data field as a non-empty string, or null. */
export function str(v: unknown): string | null {
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
    case 'caring_message': {
      const url = str(data.helplineUrl);
      return { screen: 'CaringMessage', helplineUrl: url && url.startsWith('https://') ? url : HELPLINE_URL };
    }
    case 'gift': {
      const chat = str(data.chat);
      const giftId = str(data.giftId) ?? undefined;
      const [where, id] = chat ? (chat.split(':', 2) as [string, string | undefined]) : ['', undefined];
      if (id && UUIDISH.test(id)) {
        if (where === 'dm') return { screen: 'Chat', params: { userId: id, username: '', openGift: giftId } };
        if (where === 'group') return { screen: 'GroupThread', params: { groupId: id, name: '', openGift: giftId } };
      }
      // An older shop gift notice names only its sender.
      const from = str(data.fromUserId);
      return from && UUIDISH.test(from) ? { screen: 'Chat', params: { userId: from, username: '', openGift: giftId } } : null;
    }
    case 'post_gift': {
      const post = str(data.postId);
      return post && UUIDISH.test(post) && data.postType === 'library' ? { screen: 'LibraryPost', params: { postId: post } } : null;
    }
    default:
      return null;
  }
}
