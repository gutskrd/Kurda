/**
 * A picture waiting for a decision, hidden until a moderator chooses to look: nothing is requested before then, and
 * the first look fetches it once through the API, which writes the fetch to the audit log. A child-safety hit asks
 * first and warns not to share it.
 */
import { useCallback, useRef, useState } from 'react';
import { PICTURE_IMAGE_PATH } from '@kurda/shared';
import { useApiImage } from '../apiImage';
import { Icon, useDialogs } from '../ui';

export interface Reveal {
  shown: boolean;
  /** Whether it has loaded on screen since this tile opened: approving waits for a look. */
  seen: boolean;
  busy: boolean;
  error: string | null;
  url: string | null;
  show: () => Promise<void>;
  hide: () => void;
  toggle: () => void;
  loaded: () => void;
  /** The copy did not decode. */
  failed: () => void;
}

export function usePictureReveal(caseId: string, sensitive: boolean): Reveal {
  const dialogs = useDialogs();
  const image = useApiImage(PICTURE_IMAGE_PATH(caseId), 'picture checks');
  const [seen, setSeen] = useState(false);
  const asking = useRef(false);
  const { show: fetchAndShow, hide, failed: forget } = image;

  const show = useCallback(async (): Promise<void> => {
    if (asking.current) return;
    asking.current = true;
    try {
      if (sensitive) {
        const yes = await dialogs.confirm({
          title: 'Show this picture?',
          body:
            'The automatic check found it may be child sexual abuse material. Look only as much as you need. ' +
            'Never download, forward or screenshot it: its case keeps the evidence for the report.',
          confirmLabel: 'Show it',
          tone: 'danger',
        });
        if (!yes) return;
      }
      await fetchAndShow();
    } finally {
      asking.current = false;
    }
  }, [sensitive, dialogs, fetchAndShow]);

  const loaded = useCallback(() => setSeen(true), []);
  const failed = useCallback(() => {
    setSeen(false);
    forget('The picture didn’t load. Show it again to fetch it once more.');
  }, [forget]);

  return {
    shown: image.src !== null,
    seen,
    busy: image.busy,
    error: image.error,
    url: image.src,
    show,
    hide,
    toggle: () => (image.src ? hide() : void show()),
    loaded,
    failed,
  };
}

/** The frame a revealed picture shows in: a quiet placeholder with a button until then, and a way to hide it again. */
export function PictureFrame({
  reveal,
  sensitive,
  alt,
  hint,
}: {
  reveal: Reveal;
  sensitive: boolean;
  alt: string;
  /** A line under the button while hidden. */
  hint?: string;
}): React.JSX.Element {
  return (
    <div className={`media-frame pcheck-frame${reveal.url ? ' is-shown' : ''}`}>
      {reveal.url ? (
        <>
          <img src={reveal.url} alt={alt} draggable={false} onLoad={reveal.loaded} onError={reveal.failed} />
          <button type="button" className="pcheck-hide" onClick={reveal.hide}>
            <Icon name="eyeOff" size={16} />
            Hide
          </button>
        </>
      ) : (
        <div className="pcheck-hidden">
          <Icon name="eyeOff" size={24} className="pcheck-hidden-icon" />
          {sensitive && <span className="pcheck-hidden-warn">May be child sexual abuse material</span>}
          <button type="button" className="media-reveal" onClick={() => void reveal.show()} disabled={reveal.busy} aria-busy={reveal.busy || undefined}>
            {reveal.busy ? <span className="spinner" aria-hidden="true" /> : <Icon name="eye" />}
            Show picture
          </button>
          {reveal.error ? (
            <span className="pcheck-hidden-error" role="alert">
              {reveal.error}
            </span>
          ) : (
            hint && <span className="pcheck-hidden-hint">{hint}</span>
          )}
        </div>
      )}
    </div>
  );
}

/** A picture on its own, for a page that only shows it: the Appeals page, beside what the person wrote. */
export function PictureReveal({ caseId, sensitive, alt }: { caseId: string; sensitive: boolean; alt: string }): React.JSX.Element {
  const reveal = usePictureReveal(caseId, sensitive);
  return <PictureFrame reveal={reveal} sensitive={sensitive} alt={alt} />;
}
