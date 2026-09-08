import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { ImagePost } from '../lib/types';
import { Button } from '../components/Button';
import { PhotoIcon } from '../components/icons';
import { canvasToFile } from './photoText';
import { decodePicture, shouldHaveDecoded, sniffPictureFormat, type DecodedPicture } from './decode';
import { PhotoEditor } from './PhotoEditor';
import { UNTOUCHED, compose, forgetGraded, type Composition } from './composition';
import { useHistory } from './useHistory';
import { ensureStickersFor } from './stickers';
import { DIMEN_KINDS } from '../feed/postKinds';

const MAX_CAPTION = 2_000;

/**
 * Post a picture to Dîmen.
 *
 * Two steps, because the server insists on it: the bytes go to
 * `POST /images/upload`, which validates, resizes, compresses, signs and scans
 * them before handing back a media id, and only then does `POST /images` accept
 * a post referencing it. A client cannot attach an arbitrary key.
 *
 * The framing and everything added is burned into a canvas here and the canvas
 * is what is uploaded, so the preview and the stored file are the same pixels.
 * The MyKurda mark is the exception: the server adds that afterwards, because a
 * mark the client applies is a mark the client can leave off — which is also
 * why nothing here can end up over the top of it.
 *
 * The export canvas is made at the moment of posting rather than being the one
 * on screen. The editor's canvas is not mounted while you are framing, and a
 * post that failed because you happened to be on the wrong tab would be a
 * baffling thing to debug.
 */
export function PictureComposer({
  handle,
  onDone,
}: {
  handle: string;
  onDone: (post: ImagePost) => void;
}): React.JSX.Element {
  const { client } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<CanvasImageSource | null>(null);

  const [file, setFile] = useState<File | null>(null);
  /** the source picture's own pixels, before any framing */
  const [source, setSource] = useState<{ w: number; h: number } | null>(null);
  const history = useHistory<Composition>(UNTOUCHED);
  const [caption, setCaption] = useState('');
  const [postAs, setPostAs] = useState('image');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The browser could not decode it, so it goes up as-is with nothing added. */
  const [rawOnly, setRawOnly] = useState(false);
  /** what the bytes turned out to be, so a failure can be worded honestly */
  const [format, setFormat] = useState<string | null>(null);
  /** bumped to decode the same file again, for a failure that may not repeat */
  const [attempt, setAttempt] = useState(0);

  /** Decode the chosen file into something the canvas can draw from. */
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
      // React runs this effect twice in development, so a result belonging to a
      // run that has already been torn down is dropped rather than rendered
      if (cancelled) {
        result?.release();
        return;
      }
      if (!result) {
        // Not a dead end, and not a broken file. Usually this browser has no
        // decoder for these bytes — a HEIC from a phone. But read the bytes
        // before saying so: a PNG that will not decode is not a format problem,
        // and telling someone their screenshot is an unsupported kind of picture
        // when it plainly is not sends them looking in the wrong place.
        void sniffPictureFormat(file).then((f) => {
          if (!cancelled) setFormat(f);
        });
        setRawOnly(true);
        return;
      }
      imageRef.current = result.source;
      // the source picture's real size: the framing is expressed against this,
      // and the export size is worked out from the shape it is framed to
      setSource({ w: result.width, h: result.height });
    });

    return () => {
      cancelled = true;
      decoded?.release();
    };
  }, [file, attempt]);

  /**
   * Take whatever was chosen and let the browser decide if it is a picture.
   *
   * Judging by `file.type` is judging by whatever the operating system said when
   * it handed the file over, and for plenty of real photos that is an empty
   * string. If it decodes, it is a picture.
   */
  function choose(e: React.ChangeEvent<HTMLInputElement>): void {
    const picked = e.target.files?.[0];
    e.target.value = '';
    if (!picked) return;
    setError(null);
    // a new picture is a new document: undo must not walk back into the last
    // one, and the graded copy of the last one is now worth nothing
    forgetGraded();
    history.reset(UNTOUCHED);
    setFile(picked);
  }

  async function submit(): Promise<void> {
    if (!file || busy) return;
    setBusy(true);
    setError(null);

    // nothing was composed onto an unpreviewable file, so its own bytes are
    // exactly what should be sent
    let composed: File | null = file;
    if (!rawOnly && imageRef.current && source) {
      // the export draws synchronously, so every picture sticker has to be
      // decoded first — otherwise one added a moment ago exports as nothing
      await ensureStickersFor(history.present.layers.map((l) => (l.kind === 'sticker' ? l.src : undefined)));
      const canvas = document.createElement('canvas');
      // full size this time, not the preview's ceiling — this is the file
      compose(canvas, imageRef.current, source.w, source.h, history.present);
      composed = await canvasToFile(canvas, 'dimen');
    }
    if (!composed) {
      setBusy(false);
      setError('That picture could not be prepared for upload.');
      return;
    }

    const up = await client.uploadBytes<{ imageMediaId: string }>('/images/upload', composed);
    if (!up.ok) {
      setBusy(false);
      setError(
        up.error.code === 'MEDIA_UNAVAILABLE'
          ? 'Picture storage isn’t switched on yet — try again once it is.'
          : describeError(up.error),
      );
      return;
    }

    const made = await client.post<ImagePost>('/images', {
      imageMediaId: up.data.imageMediaId,
      caption: caption.trim() || undefined,
      category: postAs,
    });
    setBusy(false);
    if (made.ok) onDone(made.data);
    // the bytes are stored either way; only the post failed, so saying so beats
    // silently dropping them
    else setError(describeError(made.error));
  }

  const editable = file !== null && source !== null && imageRef.current !== null;
  // a picture to post, whether or not this browser can show it
  const ready = editable || rawOnly;

  return (
    <div className="post-picture">
      <h2 className="friend-heading" style={{ marginTop: 0 }}>Post a picture</h2>

      {!ready ? (
        <>
          <button
            type="button"
            className="picture-drop"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            aria-label="Choose a picture"
          >
            <span className="picture-drop-empty">
              <PhotoIcon size={30} />
              <span>Choose a picture</span>
            </span>
          </button>
          {error && <div className="msg msg-error" role="status">{error}</div>}
        </>
      ) : (
        <>
          {editable ? (
            <PhotoEditor
              image={imageRef.current!}
              iw={source!.w}
              ih={source!.h}
              handle={handle}
              history={history}
            />
          ) : (
            <div className="picture-raw" role="status">
              <PhotoIcon size={26} />
              <p className="picture-raw-name">{file!.name}</p>
              {shouldHaveDecoded(format) ? (
                <>
                  {/* a PNG or JPEG that will not open is not a format problem, and
                      saying it is would send someone converting a file that is
                      already fine */}
                  <p className="muted">
                    This {format!.toUpperCase()} should have opened here and didn’t. Try again — or
                    post it as it is, which still works.
                  </p>
                  <Button size="sm" variant="secondary" onClick={() => { setRawOnly(false); setAttempt((n) => n + 1); }}>
                    Try again
                  </Button>
                </>
              ) : (
                /* no promise that it will convert: HEIC needs a codec the server
                   may not carry, and it says so plainly if it cannot */
                <p className="muted">
                  Your browser can’t show {format ? `${format.toUpperCase()} pictures` : 'this kind of picture'},
                  so there’s nothing to frame or add to — you can still post it as it is.
                </p>
              )}
            </div>
          )}

          <button
            type="button"
            className="link-button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            aria-label="Choose a different picture"
          >
            Choose a different picture
          </button>

          <div className="seg" role="group" aria-label="Kind" style={{ marginTop: 14 }}>
            {DIMEN_KINDS.map((k) => (
              <button
                key={k.key}
                type="button"
                className={`seg-btn${postAs === k.postAs ? ' is-active' : ''}`}
                aria-pressed={postAs === k.postAs}
                disabled={busy}
                onClick={() => setPostAs(k.postAs)}
              >
                {k.label}
              </button>
            ))}
          </div>

          <textarea
            className="input comment-input"
            rows={2}
            value={caption}
            maxLength={MAX_CAPTION}
            placeholder="Say something about it (optional)…"
            aria-label="Caption"
            disabled={busy}
            onChange={(e) => setCaption(e.target.value)}
            style={{ marginTop: 12 }}
          />

          {error && <div className="msg msg-error" role="status">{error}</div>}

          <div className="comment-form-actions">
            <Button size="sm" onClick={() => void submit()} disabled={busy}>
              {busy ? 'Posting…' : 'Post'}
            </Button>
          </div>
        </>
      )}

      <input ref={fileRef} type="file" accept="image/*" hidden onChange={choose} aria-label="Picture file" />
    </div>
  );
}
