import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { MeProfile } from '../lib/types';
import { Button } from '../components/Button';
import { PersonGlyph } from '../components/icons';
import { canvasToFile } from '../images/photoText';
import { decodePicture, type DecodedPicture } from '../images/decode';
import { ImageFramer } from '../images/ImageFramer';
import { WHOLE_PICTURE, type Frame } from '../images/frame';
import { UNTOUCHED, compose, forgetGraded } from '../images/composition';

/**
 * An avatar is never shown larger than a hero portrait, and usually at 32px in
 * a nav bar. Exporting it at the feed's ceiling would be a megabyte spent on
 * detail nobody will see.
 */
const AVATAR_MAX_EDGE = 768;

/**
 * Your profile picture, and which part of it is your face.
 *
 * A profile picture is shown in a circle at every size the app uses it, so
 * uploading one used to be a gamble: whatever the middle of the file happened
 * to be was what everybody saw. This is the same framing the composer uses,
 * locked to a square and shown through a circle, so the crop on screen is the
 * crop that is stored.
 *
 * A file the browser cannot decode — a HEIC straight off a phone — still
 * uploads as it is, because the server may well be able to read what this
 * browser cannot, and refusing outright would be worse than framing it blind.
 */
export function ProfilePhotoPicker({
  me,
  onChanged,
}: {
  me: MeProfile;
  onChanged: () => void;
}): React.JSX.Element {
  const { client } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<CanvasImageSource | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState<{ w: number; h: number } | null>(null);
  const [frame, setFrame] = useState<Frame>(WHOLE_PICTURE);
  const [busy, setBusy] = useState<null | 'upload' | 'remove'>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  /** the browser could not read it, so it goes up untouched */
  const [rawOnly, setRawOnly] = useState(false);

  const avatar = me.avatarUrl ?? me.profilePhotoUrl;
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
      // the effect runs twice under StrictMode; a result from a torn-down run
      // is released rather than rendered
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

  /**
   * Whatever was chosen goes to the decoder, not to a check on `file.type`:
   * that is whatever the operating system said when it handed the file over,
   * and for plenty of real photographs it is an empty string.
   */
  function choose(e: React.ChangeEvent<HTMLInputElement>): void {
    const picked = e.target.files?.[0];
    e.target.value = '';
    if (!picked) return;
    setMsg(null);
    setFrame(WHOLE_PICTURE);
    forgetGraded();
    setFile(picked);
  }

  function cancel(): void {
    setFile(null);
    setMsg(null);
  }

  async function save(): Promise<void> {
    if (!file || busy) return;
    setBusy('upload');
    setMsg(null);

    let out: File | null = file;
    if (!rawOnly && imageRef.current && source) {
      const canvas = document.createElement('canvas');
      // square, because that is the only shape a circle can be cut from
      compose(canvas, imageRef.current, source.w, source.h, { ...UNTOUCHED, aspectKey: 'square', frame }, AVATAR_MAX_EDGE);
      out = await canvasToFile(canvas, 'avatar');
    }
    if (!out) {
      setBusy(null);
      setMsg({ kind: 'err', text: 'That picture could not be prepared for upload.' });
      return;
    }

    const res = await client.uploadBytes<{ profilePhotoUrl: string }>('/me/profile-picture', out);
    setBusy(null);
    if (res.ok) {
      setFile(null);
      onChanged();
    } else if (res.error.code === 'MEDIA_UNAVAILABLE') {
      setMsg({ kind: 'err', text: 'Photo storage isn’t configured yet — try again once it’s enabled.' });
    } else {
      setMsg({ kind: 'err', text: describeError(res.error) });
    }
  }

  async function removePhoto(): Promise<void> {
    setBusy('remove');
    setMsg(null);
    const res = await client.delete('/me/profile-picture');
    setBusy(null);
    if (res.ok) onChanged();
    else setMsg({ kind: 'err', text: describeError(res.error) });
  }

  const framing = file !== null && source !== null && imageRef.current !== null;

  return (
    <section className="card">
      <h2 className="friend-heading" style={{ marginTop: 0 }}>Profile picture</h2>

      {framing ? (
        <div className="avatar-framing">
          <p className="field-hint" style={{ marginTop: 0 }}>
            Drag your picture to choose what shows, and pinch or scroll to zoom.
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
              {busy === 'upload' ? 'Saving…' : 'Use this picture'}
            </Button>
            <Button variant="ghost" size="sm" onClick={cancel} disabled={busy !== null}>
              Cancel
            </Button>
          </div>
        </div>
      ) : file !== null && rawOnly ? (
        <div className="avatar-framing">
          <p className="field-hint" style={{ marginTop: 0 }}>
            Your browser can’t open {file.name} to show you, so it can’t be framed here — but it can
            still be uploaded as it is.
          </p>
          <div className="edit-photo-actions">
            <Button size="sm" onClick={() => void save()} disabled={busy !== null}>
              {busy === 'upload' ? 'Uploading…' : 'Upload it anyway'}
            </Button>
            <Button variant="ghost" size="sm" onClick={cancel} disabled={busy !== null}>
              Cancel
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
            <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} disabled={busy !== null}>
              Upload your own
            </Button>
            {hasPhoto && (
              <Button variant="ghost" size="sm" onClick={() => void removePhoto()} disabled={busy !== null}>
                {busy === 'remove' ? 'Removing…' : 'Remove'}
              </Button>
            )}
          </div>
        </div>
      )}

      {msg && (
        <div className={`msg ${msg.kind === 'ok' ? 'msg-success' : 'msg-error'}`} role="status" style={{ marginTop: 12 }}>
          {msg.text}
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={choose} aria-label="Upload profile photo" />
    </section>
  );
}
