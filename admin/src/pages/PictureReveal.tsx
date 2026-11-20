/**
 * A picture waiting for a decision, hidden until a moderator chooses to look: nothing is requested before then, and
 * each look asks the server for a link that lasts a few minutes and is written to the audit log. A child-safety hit
 * asks first and warns not to share it.
 */
import { useCallback, useRef, useState } from 'react';
import type { PictureView } from '@kurda/shared';
import { api } from '../api';
import { picturePath } from '../pictureChecks';
import { Icon, errorLine, useDialogs } from '../ui';

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
  /** The file did not load: the link ran out, or storage refused it. */
  failed: () => void;
}

/** A link this close to running out is asked for again, rather than shown and lost mid-load. */
const FRESH_FOR_MS = 15_000;

export function usePictureReveal(caseId: string, sensitive: boolean): Reveal {
  const dialogs = useDialogs();
  const [view, setView] = useState<PictureView | null>(null);
  const [shown, setShown] = useState(false);
  const [seen, setSeen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const asking = useRef(false);

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
      // A link still good is used again: hiding and showing is one look, not another entry in the audit log.
      if (view && Date.parse(view.expiresAt) - Date.now() > FRESH_FOR_MS) {
        setShown(true);
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const next = await api<PictureView>(picturePath(caseId, 'view'), { method: 'POST' });
        setView(next);
        setShown(true);
      } catch (err) {
        setError(errorLine(err, 'picture checks'));
      } finally {
        setBusy(false);
      }
    } finally {
      asking.current = false;
    }
  }, [caseId, sensitive, dialogs, view]);

  const hide = useCallback(() => setShown(false), []);
  const loaded = useCallback(() => setSeen(true), []);
  const failed = useCallback(() => {
    setShown(false);
    setSeen(false);
    setView(null);
    setError('The picture didn’t load. Its link may have run out; show it again for a new one.');
  }, []);

  return {
    shown,
    seen,
    busy,
    error,
    url: shown ? (view?.url ?? null) : null,
    show,
    hide,
    toggle: () => (shown ? hide() : void show()),
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
          {/* Only now is the file requested: before the reveal it is not on this device at all, not even in the cache. */}
          <img src={reveal.url} alt={alt} draggable={false} referrerPolicy="no-referrer" onLoad={reveal.loaded} onError={reveal.failed} />
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
