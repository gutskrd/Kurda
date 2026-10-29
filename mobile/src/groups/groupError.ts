import { describeError, type Translate } from '../api/errors';
import type { ApiError } from '../api/types';

/** What the server's refusal means for a group, in words; anything else as the app says it everywhere. */
export function groupError(error: ApiError, t: Translate): string {
  if (error.code === 'GROUP_TEXT_REJECTED') return t('groups.textRejected');
  if (error.code === 'NOT_GROUP_ADMIN') return t('groups.notAdmin');
  if (error.code === 'MEMBER_BANNED') return t('groups.memberBanned');
  return describeError(error, t);
}
