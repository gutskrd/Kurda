import { useEffect, useRef, useState } from 'react';
import { Button } from '../components/Button';
import { PhotoIcon } from '../components/icons';
import { canvasToFile } from './photoText';
import { decodePicture, shouldHaveDecoded, sniffPictureFormat, type DecodedPicture } from './decode';
import { PhotoEditor } from './PhotoEditor';
import { UNTOUCHED, compose, forgetGraded, type Composition } from './composition';
import { useHistory } from './useHistory';
import { ensureStickersFor } from './stickers';
import { overlaySources } from './filters';
import { useT } from '../i18n/I18nProvider';

/**
 * Edit one picture before it is posted: frame it, add words, stickers, a
 * filter, a drawing.
 *
 * This was the whole of "post a picture" — choose a file, edit it, pick photo
 * or meme, write a caption, post. Posting is the composer's now
 * (web/src/composer), where a picture is one of up to four on a post with
 * words, and this is what its "Edit" opens: it takes the picture, and gives
 * back the edited one as a file, or nothing if you cancel.
 *
 * The framing and everything added is burned into a canvas here and the canvas
 * is what comes back, so the preview and the stored file are the same pixels.
 * The Hevalo mark is the exception: the server adds that on upload, because a
 * mark the client applies is a mark the client can leave off — which is also
 * why nothing here can end up over the top of it.
 *
 * The export canvas is made when you are done rather than being the one on
 * screen. The editor's canvas is not mounted while you are framing, and an
 * export that failed because you happened to be on the wrong tab would be a
 * baffling thing to debug.
 */
export function PictureEditor({
  file,
  handle,
  onDone,
  onCancel,
}: {
  file: File;
  handle: string;
  /** the edited picture; the original when the browser could not draw it */
  onDone: (edited: File) => void;
  onCancel: () => void;
}): React.JSX.Element {
  const t = useT();
  const imageRef = useRef<CanvasImageSource | null>(null);

  /** the source picture's own pixels, before any framing */
  const [source, setSource] = useState<{ w: number; h: number } | null>(null);
  const history = useHistory<Composition>(UNTOUCHED);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The browser could not decode it, so there is nothing to draw on. */
  const [rawOnly, setRawOnly] = useState(false);
  /** what the bytes turned out to be, so a failure can be worded honestly */
  const [format, setFormat] = useState<string | null>(null);
  /** bumped to decode the same file again, for a failure that may not repeat */
  const [attempt, setAttempt] = useState(0);

  // a new picture is a new document: undo must not walk back into the last
  // one, and the graded copy of the last one is now worth nothing
  const { reset } = history;
  useEffect(() => {
    forgetGraded();
    reset(UNTOUCHED);
  }, [file, reset]);

  /** Decode the picture into something the canvas can draw from. */
  useEffect(() => {
    let cancelled = false;
    let decoded: DecodedPicture | null = null;
    setRawOnly(false);

    void decodePicture(file).then((result) => {
      decoded = result;
      // React runs this effect twice in development, so a result belonging to a
      // run that has already been torn down is dropped rather than rendered
      if (cancelled) {
        result?.release();
        return;
      }
      if (!result) {
        // Usually this browser has no decoder for these bytes — a HEIC from a
        // phone. But read the bytes before saying so: a PNG that will not decode
        // is not a format problem, and saying it is sends someone converting a
        // file that is already fine.
        void sniffPictureFormat(file).then((f) => {
          if (!cancelled) setFormat(f);
        });
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
  }, [file, attempt]);

  async function done(): Promise<void> {
    if (busy) return;
    if (rawOnly || !imageRef.current || !source) {
      onDone(file);
      return;
    }
    setBusy(true);
    setError(null);
    // every picture the draw will need, decoded first: the export draws
    // synchronously, so anything still loading would export as nothing
    await ensureStickersFor([
      ...history.present.layers.map((l) => (l.kind === 'sticker' ? l.src : undefined)),
      ...overlaySources(),
    ]);
    const canvas = document.createElement('canvas');
    // full size this time, not the preview's ceiling — this is the file
    compose(canvas, imageRef.current, source.w, source.h, history.present);
    const edited = await canvasToFile(canvas, 'dimen');
    setBusy(false);
    if (edited) onDone(edited);
    else setError(t('picture.couldNotPrepare'));
  }

  const editable = source !== null && imageRef.current !== null;

  return (
    <div className="post-picture">
      {editable ? (
        <PhotoEditor image={imageRef.current!} iw={source.w} ih={source.h} handle={handle} history={history} />
      ) : rawOnly ? (
        <div className="picture-raw" role="status">
          <PhotoIcon size={26} />
          <p className="picture-raw-name">{file.name}</p>
          {shouldHaveDecoded(format) ? (
            <>
              <p className="muted">{t('picture.decodeFailed', { format: format!.toUpperCase() })}</p>
              <Button size="sm" variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
                {t('common.retry')}
              </Button>
            </>
          ) : (
            /* no promise that it will convert: HEIC needs a codec the server
               may not carry, and it says so plainly if it cannot */
            <p className="muted">
              {t('picture.browserCannotShow', {
                what: format ? t('picture.formatPictures', { format: format.toUpperCase() }) : t('picture.thisKind'),
              })}
            </p>
          )}
        </div>
      ) : (
        <div className="picture-raw" aria-busy="true">
          <PhotoIcon size={26} />
        </div>
      )}

      {error && <div className="msg msg-error" role="alert">{error}</div>}

      <div className="comment-form-actions">
        <Button size="sm" variant="secondary" onClick={onCancel} disabled={busy}>
          {t('common.cancel')}
        </Button>
        <Button size="sm" onClick={() => void done()} disabled={busy || (!editable && !rawOnly)}>
          {t('picture.useEdited')}
        </Button>
      </div>
    </div>
  );
}
