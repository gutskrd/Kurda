import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { ImagePost } from '../lib/types';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { PhotoIcon } from '../components/icons';

const MAX_CAPTION = 2_000;

/**
 * Post a picture to Dîmen.
 *
 * Two steps, because the server insists on it: the bytes go to
 * `POST /images/upload`, which validates, resizes, compresses and scans them
 * before handing back a media id, and only then does `POST /images` accept a
 * post referencing it. A client cannot attach an arbitrary key, which is the
 * point — so this cannot be collapsed into one call.
 *
 * The preview is a local object URL: showing the file before it uploads means
 * the wrong picture is caught before anyone spends bandwidth on it.
 */
export function PostPicture({ onPosted }: { onPosted: (post: ImagePost) => void }): React.JSX.Element {
  const { client, status } = useAuth();
  const [open, setOpen] = useState(false);

  if (status !== 'signedIn') return <></>;

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>Post a picture</Button>
      <Modal open={open} onClose={() => setOpen(false)} label="Post a picture">
        <Composer
          client={client}
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

function Composer({ client, onDone }: { client: Client; onDone: (post: ImagePost) => void }): React.JSX.Element {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [category, setCategory] = useState<'meme' | 'image'>('image');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // an object URL is a live handle on the file; letting them pile up would
  // pin every picture the user browsed past in memory for the session
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function choose(e: React.ChangeEvent<HTMLInputElement>): void {
    const picked = e.target.files?.[0];
    e.target.value = '';
    if (!picked) return;
    if (!picked.type.startsWith('image/')) {
      setError('Please choose an image file.');
      return;
    }
    setError(null);
    setFile(picked);
  }

  async function submit(): Promise<void> {
    if (!file || busy) return;
    setBusy(true);
    setError(null);

    const up = await client.uploadBytes<{ imageMediaId: string }>('/images/upload', file);
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
    // the bytes are stored either way; only the post failed, so saying so
    // beats silently dropping them
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
        {preview ? (
          <img src={preview} alt="" />
        ) : (
          <span className="picture-drop-empty">
            <PhotoIcon size={30} />
            <span>Choose a picture</span>
          </span>
        )}
      </button>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={choose} aria-label="Picture file" />

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
