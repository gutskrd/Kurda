import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { ImagePost } from '../lib/types';
import { Button } from '../components/Button';
import { PhotoIcon } from '../components/icons';
import { canvasToFile, fitWithin } from './photoText';
import { PhotoEditor } from './PhotoEditor';
import type { Layer } from './layers';
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
 * Everything you add is burned into a canvas here and the canvas is what is
 * uploaded, so the preview and the stored file are the same pixels. The MyKurda
 * mark is the exception: the server adds that afterwards, because a mark the
 * client applies is a mark the client can leave off — which is also why nothing
 * here can end up over the top of it.
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [layers, setLayers] = useState<Layer[]>([]);
  const [caption, setCaption] = useState('');
  const [postAs, setPostAs] = useState('image');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Load the chosen file into an image element the canvas can draw from. */
  useEffect(() => {
    if (!file) {
      imageRef.current = null;
      setSize(null);
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      // the server resizes to its own maximum anyway, so composing larger only
      // makes a bigger file for it to throw away — and a full-size export is
      // what put a phone photo over the upload cap
      setSize(fitWithin(img.naturalWidth, img.naturalHeight));
    };
    img.onerror = () => {
      setError('That file could not be opened as a picture. Try a JPEG, PNG or WebP.');
      setFile(null);
    };
    img.src = url;
    // an object URL is a live handle on the file; letting them pile up would pin
    // every picture browsed past in memory for the session
    return () => URL.revokeObjectURL(url);
  }, [file]);

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
    setLayers([]);
    setFile(picked);
  }

  async function submit(): Promise<void> {
    const canvas = canvasRef.current;
    if (!file || !canvas || busy) return;
    setBusy(true);
    setError(null);

    const composed = await canvasToFile(canvas, 'dimen');
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

  const ready = file !== null && size !== null && imageRef.current !== null;

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
          <PhotoEditor
            image={imageRef.current!}
            width={size!.width}
            height={size!.height}
            handle={handle}
            layers={layers}
            onChange={setLayers}
            canvasRef={canvasRef}
          />

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
