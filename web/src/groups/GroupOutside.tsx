import { useEffect, useId, useRef, useState } from 'react';
import { GROUP_REQUEST_NOTE_MAX, type GroupRequestState, type GroupStanding } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { ApiError } from '../lib/types';
import { Button, LinkButton } from '../components/Button';
import { Sheet } from '../components/Sheet';
import { EmptyState } from '../components/states';
import { formatUntil, untilOf } from '../reports/restriction';
import { useLocale, useT } from '../i18n/I18nProvider';
import { GroupAvatar } from './GroupAvatar';
import { failureText, useOptimisticSend } from '../lib/optimistic';

/** Refusals that say where asking stands rather than what went wrong. */
const STANDING_CODES = ['REQUEST_WAIT', 'REQUESTS_CLOSED', 'REQUEST_PENDING', 'NOT_BANNED', 'GROUP_NOT_FOUND'];

/** Someone banned from a group: until when, why, and where asking to come back stands. */
type Banned = Extract<GroupStanding, { kind: 'banned' }>;

/**
 * A group in place of its chat for someone out of it. A banned person sees the group, the ban's length and reason, and
 * where asking to come back stands (ask with a note, withdraw, wait for a date, or not accepted). Someone removed while
 * the chat was open (`gone`) is told first, with focus, since their text box is gone; if only removed, an admin can
 * add them again. Anyone else gets `GroupMissing`, since the server reveals nothing.
 */
export function GroupOutside({
  group,
  banned,
  gone,
  onChanged,
}: {
  /** What the page still knows of the group: its picture and name. */
  group: { id: string; name: string; photoUrl?: string | null };
  /** The ban, when that is why they are out; null for someone only removed. */
  banned: Banned | null;
  gone: boolean;
  /** The reader's standing changed here (asked, withdrew, let back), so the group reloads. */
  onChanged: () => Promise<void>;
}): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const locale = useLocale();
  const id = useId();
  const sendShown = useOptimisticSend();
  const [error, setError] = useState<string | null>(null);
  /** Where asking stands as this page last heard, so a request sent or withdrawn shows at once. */
  const [request, setRequest] = useState<GroupRequestState | null>(banned?.request ?? null);
  const [asking, setAsking] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const headRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => setRequest(banned?.request ?? null), [banned]);
  useEffect(() => {
    if (gone) headRef.current?.focus();
  }, [gone]);

  /** A refusal that reveals where asking stands is shown as that state; anything else as an error. */
  async function refused(e: ApiError): Promise<void> {
    switch (e.code) {
      case 'REQUEST_WAIT': {
        const until = untilOf(e.details);
        if (until) return setRequest({ kind: 'wait', until });
        return onChanged();
      }
      case 'REQUESTS_CLOSED':
        return setRequest({ kind: 'closed' });
      // Already waiting, no longer banned, or the group gone: reload to show the current state.
      case 'REQUEST_PENDING':
      case 'NOT_BANNED':
      case 'GROUP_NOT_FOUND':
        return onChanged();
    }
    setError(describeError(e, t));
  }

  /** Withdrawn at once (lib/optimistic.ts); a refusal puts back where asking stood, or shows where it now stands. */
  async function withdraw(): Promise<void> {
    const before = request;
    setError(null);
    setRequest({ kind: 'can_ask' });
    setSaid(t('groups.ask.withdrawn'));
    await sendShown(
      () => client.delete(`/groups/${group.id}/requests`),
      {
        undo: () => {
          setRequest(before);
          setSaid(null);
        },
      },
      { onFailed: (e) => void refused(e) },
    );
  }

  /**
   * Asked at once: the sheet closes and the request shows as waiting while it is sent. A refusal puts back where asking
   * stood; one about the request itself shows where it now stands, and a refused note or a request that did not go
   * opens the sheet again with the words kept, returning why for it to say.
   */
  async function ask(note: string | null): Promise<string | null> {
    const before = request;
    setAsking(false);
    setError(null);
    setRequest({ kind: 'pending', sentAt: new Date().toISOString() });
    setSaid(t('groups.ask.sent'));
    let why: string | null = null;
    const res = await sendShown(
      () => client.post<{ request?: GroupRequestState }>(`/groups/${group.id}/requests`, { note }),
      {
        undo: () => {
          setRequest(before);
          setSaid(null);
        },
      },
      {
        onFailed: (e) => {
          if (STANDING_CODES.includes(e.code ?? '')) return void refused(e);
          why = e.code === 'GROUP_TEXT_REJECTED' ? t('groups.textRejected') : failureText(e, t);
          setAsking(true);
        },
      },
    );
    if (res.ok && res.data.request) setRequest(res.data.request);
    return why;
  }

  return (
    <div className="gout">
      <GroupAvatar name={group.name} photoUrl={group.photoUrl} size={88} />
      <h2 className="gout-name" dir="auto">
        {group.name}
      </h2>

      <div className="gstand" aria-labelledby={`${id}-title`} role="group">
        {gone && (
          <h3 className="gstand-gone" ref={headRef} tabIndex={-1}>
            {t('groups.out.gone')}
          </h3>
        )}
        {banned ? (
          <>
            <p className="gstand-title" id={`${id}-title`}>
              {banned.until ? t('groups.banned.until', { date: formatUntil(banned.until, locale) }) : t('groups.banned.forGood')}
            </p>
            {banned.reason && (
              <p className="gstand-reason">
                <span className="gstand-label">{t('groups.banned.reason')}</span> <bdi>{banned.reason}</bdi>
              </p>
            )}
            {request && <AskState request={request} onAsk={() => setAsking(true)} onWithdraw={() => void withdraw()} />}
          </>
        ) : (
          <p className="gstand-title" id={`${id}-title`}>
            {t('groups.out.canBeAdded')}
          </p>
        )}
        {error && (
          <div className="msg msg-error" role="alert">
            {error}
          </div>
        )}
        <p className="sr-only" role="status">
          {said}
        </p>
      </div>

      <AskSheet open={asking} groupName={group.name} onClose={() => setAsking(false)} onSend={ask} />
    </div>
  );
}

/** What a group's address shows a non-member: no such group, and a link back to their conversations, whether or not it exists. */
export function GroupMissing(): React.JSX.Element {
  const t = useT();
  return (
    <EmptyState
      title={t('groups.missing.title')}
      message={t('groups.missing.body')}
      action={
        <LinkButton to="/app/messages" size="sm" variant="secondary" className="state-action">
          {t('groups.missing.back')}
        </LinkButton>
      }
    />
  );
}

/** Where asking to come back stands, and the one action, if any. */
function AskState({ request, onAsk, onWithdraw }: { request: GroupRequestState; onAsk: () => void; onWithdraw: () => void }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  switch (request.kind) {
    case 'can_ask':
      return (
        <Button className="gstand-act" onClick={onAsk} aria-haspopup="dialog">
          {t('groups.ask.button')}
        </Button>
      );
    case 'pending':
      return (
        <>
          <p className="gstand-line">{t('groups.ask.pending', { when: formatUntil(request.sentAt, locale) })}</p>
          <Button variant="secondary" size="sm" className="gstand-act" onClick={onWithdraw}>
            {t('groups.ask.withdraw')}
          </Button>
        </>
      );
    case 'wait':
      return <p className="gstand-line">{t('groups.ask.wait', { date: formatUntil(request.until, locale) })}</p>;
    case 'closed':
      return <p className="gstand-line">{t('groups.ask.closed')}</p>;
  }
}

/** Asking to come back with an optional note for the admins; the server enforces one request at a time and the rest. */
function AskSheet({
  open,
  groupName,
  onClose,
  onSend,
}: {
  open: boolean;
  groupName: string;
  onClose: () => void;
  /** Sends the note, closing the sheet at once; resolves to why when it opens again to say so, or null. */
  onSend: (note: string | null) => Promise<string | null>;
}): React.JSX.Element | null {
  const t = useT();
  const id = useId();
  // Kept while the sheet is closed, so a refused note comes back as it was written.
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function send(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    const why = await onSend(note.trim() || null);
    if (why) setError(why);
    else setNote('');
  }

  return (
    <Sheet open onClose={onClose} label={t('groups.ask.button')}>
      <p className="report-eyebrow">
        {/* The group's name in its own direction, the line in the page's, clear of the close button. */}
        <bdi>{groupName}</bdi>
      </p>
      <form onSubmit={(e) => void send(e)}>
        <h2 className="report-heading">{t('groups.ask.button')}</h2>
        <div className="field gask-field">
          <div className="gedit-label-row">
            <label className="field-label" htmlFor={`${id}-note`}>
              {t('groups.ask.note')} <span className="muted">{t('groups.optional')}</span>
            </label>
            <span className="gedit-count" aria-hidden="true">
              {note.length}/{GROUP_REQUEST_NOTE_MAX}
            </span>
          </div>
          <textarea
            id={`${id}-note`}
            className="input gban-reason"
            rows={3}
            dir="auto"
            value={note}
            maxLength={GROUP_REQUEST_NOTE_MAX}
            onChange={(e) => setNote(e.target.value)}
            aria-describedby={`${id}-hint`}
          />
          <span className="field-hint" id={`${id}-hint`}>
            {t('groups.ask.noteHint')}
          </span>
        </div>
        {error && (
          <div className="msg msg-error" role="alert">
            {error}
          </div>
        )}
        <div className="report-actions">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit">{t('groups.ask.send')}</Button>
        </div>
      </form>
    </Sheet>
  );
}
