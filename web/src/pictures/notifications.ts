import { PICTURE_SURFACES, type PictureReviewTarget, type PictureSurface } from '@kurda/shared';
import type { MessageKey } from '../i18n/en';
import type { Translate } from '../i18n/I18nProvider';
import type { NoteView } from '../reports/notifications';

/** An id the app follows; anything else is never put in an address. */
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TARGET_TYPES: ReadonlySet<string> = new Set<PictureReviewTarget['type']>(['library_post', 'image_post', 'group', 'letter_thread']);

const APPROVED: Record<PictureSurface, MessageKey> = {
  post: 'pictureCheck.notify.approvedPost',
  profile_photo: 'pictureCheck.notify.approvedProfile',
  group_photo: 'pictureCheck.notify.approvedGroup',
  letter: 'pictureCheck.notify.approvedLetter',
};

/** The target as the server named it, or null when it is missing or not something the app can open. */
function targetOf(value: unknown): PictureReviewTarget | null {
  if (!value || typeof value !== 'object') return null;
  const { type, id } = value as Record<string, unknown>;
  return typeof type === 'string' && TARGET_TYPES.has(type) && typeof id === 'string' && ID.test(id) ? { type: type as PictureReviewTarget['type'], id } : null;
}

/** Where a checked picture is seen: its written post, its Dîmen picture, its group, or its letter's correspondence. */
function placeOf(target: PictureReviewTarget): string {
  switch (target.type) {
    case 'library_post':
      return `/app/library/${target.id}`;
    case 'image_post':
      return `/app/dimen/${target.id}`;
    case 'group':
      return `/app/messages?group=${target.id}`;
    case 'letter_thread':
      return `/app/letters/${target.id}`;
  }
}

/**
 * A person has checked a picture (`kind: 'picture_review'`), said from `data` in the reader's language. Approved, it
 * says where the picture now shows and opens it there, a profile photo on the reader's own profile; a refusal the
 * owner asked about was only cleared, not put anywhere, so it says the picture can be shared now. Upheld, it says the
 * picture still cannot be shared. Removals come as sanction notices.
 */
export function pictureReviewNotification(data: Record<string, unknown>, t: Translate): NoteView | null {
  if (data.kind !== 'picture_review') return null;
  const surface = (PICTURE_SURFACES as readonly unknown[]).includes(data.surface) ? (data.surface as PictureSurface) : null;
  const target = targetOf(data.target);
  // A push's data is all strings, so 'true' counts as true.
  const asked = data.asked === true || data.asked === 'true';
  const to = target ? placeOf(target) : !asked && data.outcome === 'approved' && surface === 'profile_photo' ? '/app/profile' : null;
  const link = to ? { to } : {};
  if (data.outcome === 'upheld') return { title: t('pictureCheck.notify.upheld'), body: null, ...link };
  if (data.outcome !== 'approved') return null;
  const body = asked ? t('pictureCheck.notify.approvedAsked') : surface ? t(APPROVED[surface]) : null;
  return { title: t('pictureCheck.notify.approved'), body, ...link };
}
