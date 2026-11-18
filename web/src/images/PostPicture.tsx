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
 * Edits one picture for the composer (web/src/composer): framing, words, stickers, a filter, a drawing. It returns the
 * edited picture as a file, or nothing on cancel. The edits are burned into a canvas so preview and file are the same
 * pixels; the Hevalo mark is added by the server. The export canvas is made at the end, since the editor's canvas is not
 * mounted while framing.
 */
export function PictureEditor({
  file,
  handle,
  onDone,
  onCancel,
}: {
  file: File;
  handle: string;
  /** The edited picture, or the original when the browser could not draw it. */
  onDone: (edited: File) => void;
  onCancel: () => void;
}): React.JSX.Element {
  const t = useT();
  const imageRef = useRef<CanvasImageSource | null>(null);

  /** The source picture's own pixels, before framing. */
  const [source, setSource] = useState<{ w: number; h: number } | null>(null);
  const history = useHistory<Composition>(UNTOUCHED);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The browser could not decode it, so there is nothing to draw on. */
  const [rawOnly, setRawOnly] = useState(false);
  /** What the bytes turned out to be, so a failure is worded honestly. */
  const [format, setFormat] = useState<string | null>(null);
  /** Bumped to decode the same file again, for a failure that may not repeat. */
  const [attempt, setAttempt] = useState(0);

  // A new picture is a new document: undo must not reach the last one, and its graded copy is stale.
  const { reset } = history;
  useEffect(() => {
    forgetGraded();
    reset(UNTOUCHED);
  }, [file, reset]);

  /** Decodes the picture for the canvas. */
  useEffect(() => {
    let cancelled = false;
    let decoded: DecodedPicture | null = null;
    setRawOnly(false);

    void decodePicture(file).then((result) => {
      decoded = result;
      // Development runs effects twice; a result from a torn-down run is dropped.
      if (cancelled) {
        result?.release();
        return;
      }
      if (!result) {
        // Usually no decoder for these bytes (a phone's HEIC), but check the bytes first: a PNG that will not decode is
        // not a format problem.
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
    // Decode everything first: the export draws synchronously, so anything still loading would be missing.
    await ensureStickersFor([
      ...history.present.layers.map((l) => (l.kind === 'sticker' ? l.src : undefined)),
      ...overlaySources(),
    ]);
    const canvas = document.createElement('canvas');
    // Full size this time: this is the file.
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
            /* No promise it will convert: HEIC needs a codec the server may lack, and it says so if it cannot. */
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
