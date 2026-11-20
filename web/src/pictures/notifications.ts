import { PICTURE_SURFACES, type PictureSurface } from '@kurda/shared';
import type { MessageKey } from '../i18n/en';
import type { Translate } from '../i18n/I18nProvider';
import type { NoteView } from '../reports/notifications';

/** An id the app follows; anything else is never put in an address. */
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const APPROVED: Record<PictureSurface, MessageKey> = {
  post: 'pictureCheck.notify.approvedPost',
  profile_photo: 'pictureCheck.notify.approvedProfile',
  group_photo: 'pictureCheck.notify.approvedGroup',
  letter: 'pictureCheck.notify.approvedLetter',
};

/** Where tapping goes for a picture on each surface; a letter's own id does not name its correspondence, so the letters open. */
function placeOf(surface: PictureSurface, target: string | null): string | null {
  switch (surface) {
    case 'post':
      return target ? `/app/library/${target}` : null;
    case 'profile_photo':
      return '/app/profile';
    case 'group_photo':
      return target ? `/app/messages?group=${target}` : null;
    case 'letter':
      return '/app/letters';
  }
}

/**
 * A person has checked a picture (`kind: 'picture_review'`), said from `data` in the reader's language. Approved, it
 * says where the picture now shows and opens it; a refused post picture that was asked about has no post yet, so it
 * says it can be shared now. Upheld, it says the picture still cannot be shared. Removals come as sanction notices.
 */
export function pictureReviewNotification(data: Record<string, unknown>, t: Translate): NoteView | null {
  if (data.kind !== 'picture_review') return null;
  const surface = (PICTURE_SURFACES as readonly unknown[]).includes(data.surface) ? (data.surface as PictureSurface) : null;
  const target = typeof data.target === 'string' && ID.test(data.target) ? data.target : null;
  if (data.outcome === 'upheld') {
    const to = surface && target ? placeOf(surface, target) : null;
    return { title: t('pictureCheck.notify.upheld'), body: null, ...(to ? { to } : {}) };
  }
  if (data.outcome !== 'approved') return null;
  if (surface === null || (surface === 'post' && !target)) return { title: t('pictureCheck.notify.approved'), body: t('pictureCheck.notify.approvedAsked') };
  const to = placeOf(surface, target);
  return { title: t('pictureCheck.notify.approved'), body: t(APPROVED[surface]), ...(to ? { to } : {}) };
}
