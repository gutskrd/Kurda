import { useEffect, useId, useRef, useState } from 'react';
import { HELPLINE_URL, PICTURE_REVIEW_NOTE_MAX, type PendingPicture, type PictureRejection } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/Button';
import { Sheet } from '../components/Sheet';
import { PhotoIcon, ShieldIcon } from '../components/icons';
import { describeError } from '../lib/api';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { REFUSED } from './words';
import './check.css';

/**
 * How a picture's check shows to its owner (shared picture-review.ts): a refusal with its reason and a way to ask a
 * person, the calm "being checked" mark on something only they see for now, and a new photo waiting beside the old one.
 */

/** What became of asking a person to look; asking twice is answered the same kind way. */
type Asked = 'thanks' | 'already';

/**
 * A picture refused at upload: why, the helpline after self-harm, and, when the refusal allows it, "Ask a person to
 * check", which opens a sheet for an optional note and sends `POST /me/picture-reviews/:reviewId`.
 */
export function PictureRefusal({ rejection, className }: { rejection: PictureRejection; className?: string }): React.JSX.Element {
  const t = useT();
  const { client } = useAuth();
  const noteId = useId();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asked, setAsked] = useState<Asked | null>(null);
  const answerRef = useRef<HTMLParagraphElement>(null);

  // The button that opened the sheet is gone once it is answered, so focus goes to the answer in its place.
  useEffect(() => {
    if (asked) answerRef.current?.focus({ preventScroll: true });
  }, [asked]);

  async function send(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (busy || !rejection.reviewId) return;
    setBusy(true);
    setError(null);
    const text = note.trim();
    const res = await client.post(`/me/picture-reviews/${encodeURIComponent(rejection.reviewId)}`, text ? { note: text } : {});
    setBusy(false);
    if (res.ok || res.error.code === 'REVIEW_ALREADY_ASKED') {
      setAsked(res.ok ? 'thanks' : 'already');
      setOpen(false);
      return;
    }
    // Not found means it is no longer there to ask about, which the server's English would say as "not found".
    setError(res.error.status === 404 ? t('common.somethingWentWrong') : describeError(res.error, t));
  }

  const used = [...note].length;
  return (
    <div className={`pcheck-refused${className ? ` ${className}` : ''}`}>
      <p className="pcheck-refused-why" role="alert">
        {t(REFUSED[rejection.reason])}
      </p>
      {rejection.reason === 'self_harm' && (
        <a className="pcheck-help" href={HELPLINE_URL} target="_blank" rel="noopener noreferrer">
          {t('report.help.link')}
        </a>
      )}
      {asked ? (
        <p className="pcheck-asked" role="status" tabIndex={-1} ref={answerRef}>
          {t(asked === 'thanks' ? 'pictureCheck.ask.thanks' : 'pictureCheck.ask.already')}
        </p>
      ) : (
        rejection.reviewId && (
          <Button type="button" variant="secondary" size="sm" className="pcheck-ask" aria-haspopup="dialog" onClick={() => setOpen(true)}>
            {t('pictureCheck.ask')}
          </Button>
        )
      )}

      <Sheet open={open} onClose={() => !busy && setOpen(false)} label={t('pictureCheck.ask')}>
        <form className="pcheck-sheet" onSubmit={(e) => void send(e)}>
          <h2 className="report-heading">{t('pictureCheck.ask')}</h2>
          <label className="field-label" htmlFor={noteId}>
            {t('pictureCheck.ask.note')}
          </label>
          <textarea
            id={noteId}
            className="input pcheck-note"
            dir="auto"
            rows={3}
            maxLength={PICTURE_REVIEW_NOTE_MAX}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          {used > PICTURE_REVIEW_NOTE_MAX * 0.9 && (
            <p className="field-hint">{t('composer.charsLeft', { n: (PICTURE_REVIEW_NOTE_MAX - used).toLocaleString() })}</p>
          )}
          {error && (
            <div className="msg msg-error" role="alert">
              {error}
            </div>
          )}
          <div className="report-actions">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? t('report.sending') : t('pictureCheck.ask.send')}
            </Button>
          </div>
        </form>
      </Sheet>
    </div>
  );
}

/** The quiet mark on something only its owner sees until a person has checked its picture. */
export function HeldChip({ className }: { className?: string }): React.JSX.Element {
  const t = useT();
  return (
    <span className={`pcheck-chip${className ? ` ${className}` : ''}`}>
      <ShieldIcon size={12} />
      {t('pictureCheck.held.chip')}
    </span>
  );
}

/** A post of yours whose picture is being checked: the mark, and that nobody else sees it yet. */
export function HeldPost({ className }: { className?: string }): React.JSX.Element {
  const t = useT();
  return (
    <div className={`pcheck-held${className ? ` ${className}` : ''}`} role="note">
      <HeldChip />
      <p className="pcheck-held-text">{t('pictureCheck.held.post')}</p>
    </div>
  );
}

/**
 * A new photo waiting for a person, small beside the words saying others still see the old one. The link it is shown
 * from is private and short-lived, so one that has expired shows a plain tile instead.
 */
export function PendingPhoto({ pending, words, round = false }: { pending: PendingPicture; words: MessageKey; round?: boolean }): React.JSX.Element {
  const t = useT();
  const [broken, setBroken] = useState<string | null>(null);
  return (
    <div className="pcheck-pending" role="note">
      <span className={`pcheck-pending-pic${round ? ' is-round' : ''}`} aria-hidden="true">
        {broken === pending.url ? <PhotoIcon size={20} /> : <img src={pending.url} alt="" onError={() => setBroken(pending.url)} />}
      </span>
      <span className="pcheck-pending-text">
        <HeldChip />
        <span>{t(words)}</span>
      </span>
    </div>
  );
}
