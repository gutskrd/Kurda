import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { Button } from '../components/Button';
import { BlockIcon, CloseIcon, FlagIcon, MoreIcon } from '../components/icons';

/** What a reporter says the problem is. Matches the server's enum exactly. */
const CATEGORIES = [
  { key: 'harassment', label: 'Harassment or bullying' },
  { key: 'spam', label: 'Spam or scams' },
  { key: 'impersonation', label: 'Pretending to be someone else' },
  { key: 'hate', label: 'Hate or slurs' },
  { key: 'self_harm', label: 'Self-harm or someone in danger' },
  { key: 'other', label: 'Something else' },
] as const;

/** The server refuses anything shorter; saying so up front beats a rejection. */
const MIN_REASON = 10;
const MAX_REASON = 1000;

type Panel = null | 'menu' | 'report' | 'block';

/**
 * What you can do about another person, tucked behind a ⋯.
 *
 * Block used to be a button sitting in the open on the profile card. It is the
 * one action there that cannot be undone from that screen — the moment it lands
 * the profile answers 404 to you — and it sat one thumb-width from "Message".
 * Behind a menu it takes an extra, deliberate press.
 *
 * Reporting lives here too, because the two are what you reach for at the same
 * moment and they do different halves of the job: a block ends it for you and
 * tells nobody; a report tells a moderator and changes nothing you can see.
 * Most people want both, so neither is offered as a substitute for the other.
 */
export function UserActions({
  userId,
  name,
  onBlocked,
  className = '',
}: {
  userId: string;
  /** how to name them in the confirmations, so it is clear who this is about */
  name: string;
  /** called once the block has actually landed */
  onBlocked?: () => void;
  className?: string;
}): React.JSX.Element {
  const { client } = useAuth();
  const [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [category, setCategory] = useState<string>('harassment');
  const [reason, setReason] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);

  /**
   * Escape closes, and so does a click anywhere else.
   *
   * Bound on the document rather than the wrapper: a menu that only closes when
   * you find its own button again is a menu that stays open.
   */
  useEffect(() => {
    if (!panel) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setPanel(null);
        menuRef.current?.focus();
      }
    };
    const onDown = (e: PointerEvent): void => {
      if (!wrapRef.current?.contains(e.target as Node)) setPanel(null);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [panel]);

  function open(next: Panel): void {
    setError(null);
    setPanel(next);
  }

  async function block(): Promise<void> {
    setBusy(true);
    setError(null);
    const res = await client.post(`/friends/${userId}/block`);
    setBusy(false);
    if (!res.ok) {
      setError(describeError(res.error));
      return;
    }
    setPanel(null);
    onBlocked?.();
  }

  async function report(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (reason.trim().length < MIN_REASON) return;
    setBusy(true);
    setError(null);
    const res = await client.post(`/users/${userId}/report`, { category, reason: reason.trim() });
    setBusy(false);
    if (!res.ok) {
      setError(describeError(res.error));
      return;
    }
    setPanel(null);
    setReason('');
    // the server tells nobody anything either way, so this note is the only
    // acknowledgement there is — and it must not promise an outcome
    setDone('Thank you. A moderator will look at this.');
  }

  const short = reason.trim().length < MIN_REASON;

  return (
    <div className={`user-actions${className ? ` ${className}` : ''}`} ref={wrapRef}>
      <button
        ref={menuRef}
        type="button"
        className="user-actions-btn"
        aria-haspopup="menu"
        aria-expanded={panel !== null}
        aria-label={`More about ${name}`}
        title="More"
        onClick={() => setPanel(panel ? null : 'menu')}
      >
        <MoreIcon size={18} />
      </button>

      {panel === 'menu' && (
        <div className="user-menu" role="menu">
          <button type="button" role="menuitem" className="user-menu-item" onClick={() => open('report')}>
            <FlagIcon size={16} /> Report
          </button>
          <button type="button" role="menuitem" className="user-menu-item is-danger" onClick={() => open('block')}>
            <BlockIcon size={16} /> Block
          </button>
        </div>
      )}

      {panel === 'block' && (
        <div className="user-menu user-menu-wide" role="dialog" aria-label={`Block ${name}`}>
          <div className="user-menu-head">
            <strong>Block {name}?</strong>
            <button type="button" className="user-menu-x" onClick={() => setPanel(null)} aria-label="Close">
              <CloseIcon size={15} />
            </button>
          </div>
          <p className="user-menu-note">
            They will not be able to find you, message you or add you, and you will not see them anywhere. They
            are not told. You can undo this in Settings.
          </p>
          {error && <div className="msg msg-error">{error}</div>}
          <div className="user-menu-actions">
            <Button variant="secondary" size="sm" onClick={() => setPanel(null)} disabled={busy}>
              Cancel
            </Button>
            <button type="button" className="btn btn-sm user-menu-danger" onClick={() => void block()} disabled={busy}>
              {busy ? 'Blocking…' : 'Block'}
            </button>
          </div>
        </div>
      )}

      {panel === 'report' && (
        <form className="user-menu user-menu-wide" onSubmit={report} aria-label={`Report ${name}`}>
          <div className="user-menu-head">
            <strong>Report {name}</strong>
            <button type="button" className="user-menu-x" onClick={() => setPanel(null)} aria-label="Close">
              <CloseIcon size={15} />
            </button>
          </div>

          <label className="user-menu-label" htmlFor="report-category">
            What is happening?
          </label>
          <select
            id="report-category"
            className="input"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>

          <label className="user-menu-label" htmlFor="report-reason">
            What should a moderator know?
          </label>
          {/*
            Required, unlike reporting a post. There is no post attached to a
            report about a person, so what is written here is the entire case —
            without it there is nothing for a moderator to act on.
          */}
          <textarea
            id="report-reason"
            className="input"
            rows={3}
            value={reason}
            maxLength={MAX_REASON}
            required
            placeholder="What they did, and where. Enough for someone who has not seen it."
            onChange={(e) => setReason(e.target.value)}
          />
          <p className="user-menu-note">
            {short
              ? `A few more words — at least ${MIN_REASON} characters.`
              : `${MAX_REASON - reason.trim().length} characters left. They are not told you reported them.`}
          </p>

          {error && <div className="msg msg-error">{error}</div>}
          <div className="user-menu-actions">
            <Button variant="secondary" size="sm" onClick={() => setPanel(null)} disabled={busy}>
              Cancel
            </Button>
            <Button size="sm" type="submit" disabled={busy || short}>
              {busy ? 'Sending…' : 'Send report'}
            </Button>
          </div>
        </form>
      )}

      {done && (
        <p className="user-actions-done" role="status">
          {done}
        </p>
      )}
    </div>
  );
}
