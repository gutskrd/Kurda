import { useEffect, useRef, useState } from 'react';
import type { PendingPicture, PictureRejection, PictureReviewState } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { ApiError, MeProfile } from '../lib/types';
import { Button } from '../components/Button';
import { PersonGlyph } from '../components/icons';
import { canvasToFile } from '../images/photoText';
import { decodePicture, type DecodedPicture } from '../images/decode';
import { ImageFramer } from '../images/ImageFramer';
import { WHOLE_PICTURE, type Frame } from '../images/frame';
import { UNTOUCHED, compose, forgetGraded } from '../images/composition';
import { useT } from '../i18n/I18nProvider';
import { SendError } from '../reports/SendError';
import { useAccountHeld } from '../reports/HeldNotice';
import { PendingPhoto, PictureRefusal } from '../pictures/PictureCheck';
import { useAvatarSrc } from '../art/overrides';

/** An avatar never shows larger than a hero portrait, so it is exported smaller than feed pictures. */
const AVATAR_MAX_EDGE = 768;

/** What `POST /me/profile-picture` answers: a held photo keeps the old one showing, with the new one only for you. */
interface PhotoSaved {
  profilePhotoUrl: string | null;
  review?: PictureReviewState;
  profilePhotoPending?: PendingPicture | null;
}

/**
 * The profile picture and its framing: the composer's cropper locked to a square and shown through a circle, so the
 * stored crop matches the screen. A file the browser cannot decode, such as HEIC, uploads unframed for the server to
 * read. Every photo is checked before others see it: one held for a person shows small beside the old one, and a
 * refused one says why, with the way to ask a person to look (pictures/PictureCheck).
 */
export function ProfilePhotoPicker({
  me,
  onChanged,
}: {
  me: MeProfile;
  onChanged: () => void;
}): React.JSX.Element {
  const t = useT();
  const { client } = useAuth();
  // The page's banner says why; a held account cannot put up a new picture until it is checked.
  const held = useAccountHeld();
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<CanvasImageSource | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState<{ w: number; h: number } | null>(null);
  const [frame, setFrame] = useState<Frame>(WHOLE_PICTURE);
  const [busy, setBusy] = useState<null | 'upload' | 'remove'>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [uploadErr, setUploadErr] = useState<ApiError | null>(null);
  const [refusal, setRefusal] = useState<PictureRejection | null>(null);
  /** A photo just held, shown until the profile read again says so itself. */
  const [justHeld, setJustHeld] = useState<PendingPicture | null>(null);
  const pending = me.profilePhotoPending ?? justHeld;
  /** the browser could not read it, so it goes up untouched */
  const [rawOnly, setRawOnly] = useState(false);

  const avatar = useAvatarSrc(me.avatarUrl ?? me.profilePhotoUrl);
  const hasPhoto = Boolean(me.profilePhotoUrl);

  useEffect(() => {
    if (!file) {
      imageRef.current = null;
      setSource(null);
      setRawOnly(false);
      return;
    }
    let cancelled = false;
    let decoded: DecodedPicture | null = null;

    void decodePicture(file).then((result) => {
      decoded = result;
      // The effect runs twice under StrictMode, so a torn-down run’s result is released rather than rendered.
      if (cancelled) {
        result?.release();
        return;
      }
      if (!result) {
        setRawOnly(true);
        return;
      }
      imageRef.current = result.source;
      setSource({ w: result.width, h: result.height });
    });

    return () => {
      cancelled = true;
      decoded?.release();
    };
  }, [file]);

  /** The choice goes to the decoder rather than a `file.type` check, which is often empty for real photographs. */
  function choose(e: React.ChangeEvent<HTMLInputElement>): void {
    const picked = e.target.files?.[0];
    e.target.value = '';
    if (!picked) return;
    setMsg(null);
    setUploadErr(null);
    setRefusal(null);
    setFrame(WHOLE_PICTURE);
    forgetGraded();
    setFile(picked);
  }

  function cancel(): void {
    setFile(null);
    setMsg(null);
    setUploadErr(null);
    setRefusal(null);
  }

  async function save(): Promise<void> {
    if (!file || busy) return;
    setBusy('upload');
    setMsg(null);
    setUploadErr(null);
    setRefusal(null);

    let out: File | null = file;
    if (!rawOnly && imageRef.current && source) {
      const canvas = document.createElement('canvas');
      // square, because that is the only shape a circle can be cut from
      compose(canvas, imageRef.current, source.w, source.h, { ...UNTOUCHED, aspectKey: 'square', frame }, AVATAR_MAX_EDGE);
      out = await canvasToFile(canvas, 'avatar');
    }
    if (!out) {
      setBusy(null);
      setMsg({ kind: 'err', text: t('picture.couldNotPrepare') });
      return;
    }

    const res = await client.uploadBytes<PhotoSaved>('/me/profile-picture', out);
    setBusy(null);
    if (res.ok) {
      setFile(null);
      setJustHeld(res.data.review === 'held' ? (res.data.profilePhotoPending ?? null) : null);
      onChanged();
    } else if (res.error.rejection) {
      // The same picture would be refused again, so it is put away with the reason.
      setFile(null);
      setRefusal(res.error.rejection);
    } else if (res.error.code === 'MEDIA_UNAVAILABLE') {
      setMsg({ kind: 'err', text: t('edit.photo.storageOff') });
    } else {
      // a feature limit on pictures covers this one too: SendError says until when
      setUploadErr(res.error);
    }
  }

  async function removePhoto(): Promise<void> {
    setBusy('remove');
    setMsg(null);
    setUploadErr(null);
    setRefusal(null);
    const res = await client.delete('/me/profile-picture');
    setBusy(null);
    if (res.ok) onChanged();
    else setMsg({ kind: 'err', text: describeError(res.error, t) });
  }

  const framing = file !== null && source !== null && imageRef.current !== null;

  return (
    <section className="card">
      <h2 className="friend-heading" style={{ marginTop: 0 }}>{t('edit.photo.title')}</h2>

      {framing ? (
        <div className="avatar-framing">
          <p className="field-hint" style={{ marginTop: 0 }}>
            {t('edit.photo.dragHint')}
          </p>
          <div className="avatar-framing-stage">
            <ImageFramer
              image={imageRef.current!}
              iw={source!.w}
              ih={source!.h}
              aspect={1}
              frame={frame}
              onChange={setFrame}
              round
              busy={busy !== null}
            />
          </div>
          <div className="edit-photo-actions">
            <Button size="sm" onClick={() => void save()} disabled={busy !== null}>
              {busy === 'upload' ? t('edit.saving') : t('edit.photo.use')}
            </Button>
            <Button variant="ghost" size="sm" onClick={cancel} disabled={busy !== null}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      ) : file !== null && rawOnly ? (
        <div className="avatar-framing">
          <p className="field-hint" style={{ marginTop: 0 }}>
            {t('edit.photo.cannotOpen', { name: file.name })}
          </p>
          <div className="edit-photo-actions">
            <Button size="sm" onClick={() => void save()} disabled={busy !== null}>
              {busy === 'upload' ? t('edit.photo.uploading') : t('edit.photo.uploadAnyway')}
            </Button>
            <Button variant="ghost" size="sm" onClick={cancel} disabled={busy !== null}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="edit-photo-row">
          <span className="hero-avatar-wrap">
            {avatar ? (
              <img src={avatar} alt="" className="pcard-avatar" />
            ) : (
              <span className="avatar-fallback" aria-hidden="true"><PersonGlyph size={48} /></span>
            )}
          </span>
          <div className="edit-photo-actions">
            <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} disabled={busy !== null || held}>
              {t('edit.photo.uploadOwn')}
            </Button>
            {hasPhoto && (
              <Button variant="ghost" size="sm" onClick={() => void removePhoto()} disabled={busy !== null}>
                {busy === 'remove' ? t('edit.photo.removing') : t('groups.remove')}
              </Button>
            )}
          </div>
        </div>
      )}

      {pending && !file && <PendingPhoto pending={pending} words="pictureCheck.held.profile" round />}
      {refusal && <PictureRefusal rejection={refusal} className="edit-photo-refused" />}
      {msg && (
        <div className={`msg ${msg.kind === 'ok' ? 'msg-success' : 'msg-error'}`} role="status" style={{ marginTop: 12 }}>
          {msg.text}
        </div>
      )}
      <SendError error={uploadErr} />
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={choose} aria-label={t('edit.photo.upload')} />
    </section>
  );
}
