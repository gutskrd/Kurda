import { useRef, useState } from 'react';
import { GROUP_DESCRIPTION_MAX, GROUP_NAME_MAX, GROUP_NAME_MIN, type PendingPicture, type PictureRejection, type PictureReviewState } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { ApiError, GroupDetail } from '../lib/types';
import { Button } from '../components/Button';
import { composerErrorText } from '../composer/errors';
import { SendError } from '../reports/SendError';
import { PendingPhoto, PictureRefusal } from '../pictures/PictureCheck';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { GroupAvatar } from './GroupAvatar';

/** What `POST /groups/:id/photo` answers: a held picture keeps the old one showing to members until a person checks it. */
interface PhotoSaved {
  photoUrl: string | null;
  review?: PictureReviewState;
  photoPending?: PendingPicture | null;
}

/** What the server says about a change it refused, in the reader's words. */
const REFUSED: Record<string, MessageKey> = {
  GROUP_TEXT_REJECTED: 'groups.textRejected',
  NOT_GROUP_ADMIN: 'groups.notAdmin',
};

/**
 * A picture's type for the upload: `file.type` is empty for many real photos, so the name's extension is the
 * fallback; the server sniffs the bytes either way.
 */
export function pictureBlob(file: File): Blob {
  if (file.type.startsWith('image/')) return file;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const type = ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic', heif: 'image/heif', avif: 'image/avif' } as Record<string, string>)[ext];
  return type ? new Blob([file], { type }) : file;
}

/**
 * Editing a group's picture, name and description as its owner or an admin. The picture uploads or is removed at
 * once, with the server's profile-photo checks: one held for a person shows small while members still see the old
 * one, and a refused one says why. The name and description wait for Save, which sends only what changed and is
 * enabled only once something has and the name is 2–60 characters. The limits are the shared ones.
 */
export function GroupEdit({
  detail,
  onDone,
  onChanged,
}: {
  detail: GroupDetail;
  /** Back to the group's page. */
  onDone: () => void;
  /** Something was saved, so the group reloads where it is shown. */
  onChanged: () => Promise<void>;
}): React.JSX.Element {
  const t = useT();
  const { client } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<string | null>(detail.photoUrl ?? null);
  const [name, setName] = useState(detail.name);
  const [about, setAbout] = useState(detail.description ?? '');
  const [busy, setBusy] = useState<null | 'photo' | 'save'>(null);
  const [photoErr, setPhotoErr] = useState<ApiError | string | null>(null);
  const [refusal, setRefusal] = useState<PictureRejection | null>(null);
  /** A picture just held, shown until the group read again says so itself. */
  const [justHeld, setJustHeld] = useState<PendingPicture | null>(null);
  const pending = detail.photoPending ?? justHeld;
  const [saveErr, setSaveErr] = useState<ApiError | null>(null);

  const trimmed = name.trim();
  const changedName = trimmed !== detail.name;
  const changedAbout = about.trim() !== (detail.description ?? '');
  const tooShort = trimmed.length < GROUP_NAME_MIN;
  const tooLong = trimmed.length > GROUP_NAME_MAX || about.length > GROUP_DESCRIPTION_MAX;
  const canSave = (changedName || changedAbout) && !tooShort && !tooLong && busy === null;

  async function upload(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy('photo');
    setPhotoErr(null);
    setRefusal(null);
    const res = await client.uploadBytes<PhotoSaved>(`/groups/${detail.id}/photo`, pictureBlob(file));
    setBusy(null);
    if (res.ok) {
      setPhoto(res.data.photoUrl);
      setJustHeld(res.data.review === 'held' ? (res.data.photoPending ?? null) : null);
      await onChanged();
    } else if (res.error.rejection) setRefusal(res.error.rejection);
    else setPhotoErr(res.error);
  }

  async function removePhoto(): Promise<void> {
    setBusy('photo');
    setPhotoErr(null);
    setRefusal(null);
    const res = await client.delete(`/groups/${detail.id}/photo`);
    setBusy(null);
    if (res.ok) {
      setPhoto(null);
      setJustHeld(null);
      await onChanged();
    } else setPhotoErr(res.error);
  }

  async function save(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!canSave) return;
    setBusy('save');
    setSaveErr(null);
    const body: { name?: string; description?: string } = {};
    if (changedName) body.name = trimmed;
    if (changedAbout) body.description = about.trim();
    const res = await client.request('PATCH', `/groups/${detail.id}`, { body });
    setBusy(null);
    if (res.ok) {
      await onChanged();
      onDone();
    } else setSaveErr(res.error);
  }

  const refused = (error: ApiError): string => (error.code && REFUSED[error.code] ? t(REFUSED[error.code]!) : describeError(error, t));
  // A picture's refusal in the composer's words; a lost connection in this page's own.
  const pictureRefused = (error: ApiError): string => (error.kind === 'network' ? t('groups.photo.failed') : composerErrorText(error, t));

  return (
    <form className="gedit" onSubmit={(e) => void save(e)}>
      <h2 className="gedit-title">{t('groups.edit')}</h2>

      <div className="gedit-photo">
        <span className={`gedit-photo-pic${busy === 'photo' ? ' is-busy' : ''}`}>
          <GroupAvatar name={trimmed || detail.name} photoUrl={photo} size={96} />
          {busy === 'photo' && <span className="gedit-spinner" role="status" aria-label={t('common.loading')} />}
        </span>
        <span className="gedit-photo-actions">
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void upload(e)} />
          <Button type="button" variant="secondary" size="sm" disabled={busy !== null} onClick={() => fileRef.current?.click()}>
            {photo ? t('groups.photo.change') : t('groups.photo.add')}
          </Button>
          {photo && (
            <Button type="button" variant="ghost" size="sm" disabled={busy !== null} onClick={() => void removePhoto()}>
              {t('groups.photo.remove')}
            </Button>
          )}
        </span>
      </div>
      {pending && <PendingPhoto pending={pending} words="pictureCheck.held.group" />}
      {refusal && <PictureRefusal rejection={refusal} className="gedit-refused" />}
      <SendError error={photoErr} describe={pictureRefused} />

      <div className="field">
        <span className="gedit-label-row">
          <label className="field-label" htmlFor="gedit-name">
            {t('groups.name')}
          </label>
          <span className="gedit-count" id="gedit-name-count">
            {trimmed.length}/{GROUP_NAME_MAX}
          </span>
        </span>
        <input
          id="gedit-name"
          className="input"
          value={name}
          maxLength={GROUP_NAME_MAX}
          dir="auto"
          aria-describedby="gedit-name-count"
          aria-invalid={tooShort ? true : undefined}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="field">
        <span className="gedit-label-row">
          <label className="field-label" htmlFor="gedit-about">
            {t('groups.description')}
          </label>
          <span className="gedit-count" id="gedit-about-count">
            {about.length}/{GROUP_DESCRIPTION_MAX}
          </span>
        </span>
        <textarea
          id="gedit-about"
          className="input gedit-about"
          rows={3}
          value={about}
          maxLength={GROUP_DESCRIPTION_MAX}
          dir="auto"
          placeholder={t('groups.descriptionPlaceholder')}
          aria-describedby="gedit-about-count"
          onChange={(e) => setAbout(e.target.value)}
        />
      </div>

      <SendError error={saveErr} describe={refused} />

      <div className="gedit-actions">
        <Button type="button" variant="secondary" onClick={onDone} disabled={busy === 'save'}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={!canSave}>
          {busy === 'save' ? t('edit.saving') : t('groups.save')}
        </Button>
      </div>
    </form>
  );
}
