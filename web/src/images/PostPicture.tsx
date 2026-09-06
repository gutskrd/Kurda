import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { ImagePost } from '../lib/types';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { PhotoIcon, TextIcon } from '../components/icons';
import {
  DEFAULT_TEXT,
  FONTS,
  fitWithin,
  ROTATION_RANGE,
  SIZE_RANGE,
  canvasToFile,
  drawComposition,
  type FontKey,
  type TextLayer,
} from './photoText';

const MAX_CAPTION = 2_000;

/** The colours on offer — a few that read on almost any photograph. */
const COLORS = ['#ffffff', '#111111', '#f0c24a', '#ff8fa3', '#86e2a4', '#8fd3ff'];

/**
 * Post a picture to Dîmen, with words on it if you want them.
 *
 * Two steps, because the server insists on it: the bytes go to
 * `POST /images/upload`, which validates, resizes, compresses, signs and scans
 * them before handing back a media id, and only then does `POST /images` accept
 * a post referencing it. A client cannot attach an arbitrary key.
 *
 * The words are burned into a canvas here and the canvas is what is uploaded, so
 * the preview and the stored file are the same pixels. The MyKurda mark is not:
 * the server adds that, because a mark the client applies is a mark the client
 * can leave off.
 */
export function PostPicture({ onPosted }: { onPosted: (post: ImagePost) => void }): React.JSX.Element {
  const { client, status, user } = useAuth();
  const [open, setOpen] = useState(false);

  if (status !== 'signedIn') return <></>;

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>Post a picture</Button>
      <Modal open={open} onClose={() => setOpen(false)} label="Post a picture">
        <Composer
          client={client}
          handle={user?.username ?? ''}
          onDone={(post) => {
            setOpen(false);
            onPosted(post);
          }}
        />
      </Modal>
    </>
  );
}

type Client = ReturnType<typeof useAuth>['client'];

/** The picture composer on its own, for the shared post button to open. */
export function PictureComposer({
  handle,
  onDone,
}: {
  handle: string;
  onDone: (post: ImagePost) => void;
}): React.JSX.Element {
  const { client } = useAuth();
  return <Composer client={client} handle={handle} onDone={onDone} />;
}

function Composer({
  client,
  handle,
  onDone,
}: {
  client: Client;
  handle: string;
  onDone: (post: ImagePost) => void;
}): React.JSX.Element {
  const fileRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [text, setText] = useState<TextLayer>(DEFAULT_TEXT);
  const [showText, setShowText] = useState(false);
  const [caption, setCaption] = useState('');
  const [category, setCategory] = useState<'meme' | 'image'>('image');
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

  /** Redraw whenever the picture or the words change. */
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img || !size) return;
    drawComposition(canvas, img, size.width, size.height, showText ? text : null);
  }, [size, text, showText]);

  useEffect(redraw, [redraw]);

  /**
   * Take whatever was chosen and let the browser decide if it is a picture.
   *
   * The old check was `file.type.startsWith('image/')`, which is whatever the
   * operating system said when it handed the file over — and for plenty of real
   * photos that is an empty string, so they were turned away before anything
   * had tried to read them. If it decodes, it is a picture; if it does not, the
   * load handler says so.
   */
  function choose(e: React.ChangeEvent<HTMLInputElement>): void {
    const picked = e.target.files?.[0];
    e.target.value = '';
    if (!picked) return;
    setError(null);
    setFile(picked);
  }

  const set = <K extends keyof TextLayer>(key: K, value: TextLayer[K]): void =>
    setText((prev) => ({ ...prev, [key]: value }));

  async function submit(): Promise<void> {
    const canvas = canvasRef.current;
    if (!file || !canvas || busy) return;
    setBusy(true);
    setError(null);

    // the canvas is what is uploaded, so the words are part of the picture
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
      category,
    });
    setBusy(false);
    if (made.ok) onDone(made.data);
    // the bytes are stored either way; only the post failed, so saying so beats
    // silently dropping them
    else setError(describeError(made.error));
  }

  return (
    <div className="post-picture">
      <h2 className="friend-heading" style={{ marginTop: 0 }}>Post a picture</h2>

      <button
        type="button"
        className="picture-drop"
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        aria-label={file ? 'Choose a different picture' : 'Choose a picture'}
      >
        {file && size ? (
          <span className="picture-stage">
            <canvas ref={canvasRef} className="picture-canvas" />
            {/* the server draws the real one; this is so the corner is not a
                surprise when the post appears */}
            <span className="picture-sign" aria-hidden>
              <img src="/logo.png" alt="" />@{handle}
            </span>
          </span>
        ) : (
          <span className="picture-drop-empty">
            <PhotoIcon size={30} />
            <span>Choose a picture</span>
          </span>
        )}
      </button>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={choose} aria-label="Picture file" />

      {file && (
        <>
          <label className="picture-toggle">
            <input
              type="checkbox"
              checked={showText}
              disabled={busy}
              onChange={(e) => setShowText(e.target.checked)}
            />
            <TextIcon size={17} />
            <span>Words on the picture</span>
          </label>

          {showText && (
            <div className="text-tools">
              <textarea
                className="input"
                rows={2}
                value={text.value}
                maxLength={280}
                placeholder="What should it say?"
                aria-label="Text on the picture"
                disabled={busy}
                onChange={(e) => set('value', e.target.value)}
              />

              <div className="seg" role="group" aria-label="Font">
                {FONTS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    className={`seg-btn${text.font === f.key ? ' is-active' : ''}`}
                    aria-pressed={text.font === f.key}
                    style={{ fontFamily: f.stack }}
                    disabled={busy}
                    onClick={() => set('font', f.key as FontKey)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <label className="tool-row">
                <span className="tool-label">Size</span>
                <input
                  type="range"
                  min={SIZE_RANGE.min * 100}
                  max={SIZE_RANGE.max * 100}
                  value={Math.round(text.size * 100)}
                  disabled={busy}
                  onChange={(e) => set('size', Number(e.target.value) / 100)}
                />
              </label>

              <label className="tool-row">
                <span className="tool-label">Turn</span>
                <input
                  type="range"
                  min={ROTATION_RANGE.min}
                  max={ROTATION_RANGE.max}
                  value={text.rotation}
                  disabled={busy}
                  onChange={(e) => set('rotation', Number(e.target.value))}
                />
                <span className="tool-value">{text.rotation}°</span>
              </label>

              <label className="tool-row">
                <span className="tool-label">Height</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(text.y * 100)}
                  disabled={busy}
                  onChange={(e) => set('y', Number(e.target.value) / 100)}
                />
              </label>

              <div className="tool-row">
                <span className="tool-label">Colour</span>
                <span className="swatches" role="group" aria-label="Text colour">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`swatch${text.color === c ? ' is-on' : ''}`}
                      style={{ background: c }}
                      aria-label={c}
                      aria-pressed={text.color === c}
                      disabled={busy}
                      onClick={() => set('color', c)}
                    />
                  ))}
                </span>
              </div>

              <label className="picture-toggle">
                <input
                  type="checkbox"
                  checked={text.plate}
                  disabled={busy}
                  onChange={(e) => set('plate', e.target.checked)}
                />
                <span>Dark backing behind the words</span>
              </label>
            </div>
          )}
        </>
      )}

      <div className="seg" role="group" aria-label="Kind" style={{ marginTop: 14 }}>
        {(['image', 'meme'] as const).map((c) => (
          <button
            key={c}
            type="button"
            className={`seg-btn${category === c ? ' is-active' : ''}`}
            aria-pressed={category === c}
            disabled={busy}
            onClick={() => setCategory(c)}
          >
            {c === 'image' ? 'Photo' : 'Meme'}
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
        <Button size="sm" onClick={() => void submit()} disabled={!file || busy}>
          {busy ? 'Posting…' : 'Post'}
        </Button>
      </div>
    </div>
  );
}
