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
  const [busy, setBusy] = useState(false);
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

  async function withdraw(): Promise<void> {
    setBusy(true);
    setError(null);
    const res = await client.delete(`/groups/${group.id}/requests`);
    setBusy(false);
    if (!res.ok) return refused(res.error);
    setRequest({ kind: 'can_ask' });
    setSaid(t('groups.ask.withdrawn'));
  }

  return (
    <div className="gout">
      <GroupAvatar id={group.id} name={group.name} photoUrl={group.photoUrl} size={88} />
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
            {request && <AskState request={request} busy={busy} onAsk={() => setAsking(true)} onWithdraw={() => void withdraw()} />}
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

      <AskSheet
        open={asking}
        groupId={group.id}
        groupName={group.name}
        onClose={() => setAsking(false)}
        onSent={(state) => {
          setAsking(false);
          setRequest(state);
          setSaid(t('groups.ask.sent'));
        }}
        onRefused={(e) => {
          setAsking(false);
          void refused(e);
        }}
      />
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
function AskState({
  request,
  busy,
  onAsk,
  onWithdraw,
}: {
  request: GroupRequestState;
  busy: boolean;
  onAsk: () => void;
  onWithdraw: () => void;
}): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  switch (request.kind) {
    case 'can_ask':
      return (
        <Button className="gstand-act" onClick={onAsk} disabled={busy} aria-haspopup="dialog">
          {t('groups.ask.button')}
        </Button>
      );
    case 'pending':
      return (
        <>
          <p className="gstand-line">{t('groups.ask.pending', { when: formatUntil(request.sentAt, locale) })}</p>
          <Button variant="secondary" size="sm" className="gstand-act" onClick={onWithdraw} disabled={busy}>
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
  groupId,
  groupName,
  onClose,
  onSent,
  onRefused,
}: {
  open: boolean;
  groupId: string;
  groupName: string;
  onClose: () => void;
  onSent: (state: GroupRequestState) => void;
  /** A refusal about the request itself, such as a wait or an already pending request. */
  onRefused: (error: ApiError) => void;
}): React.JSX.Element | null {
  const { client } = useAuth();
  const t = useT();
  const id = useId();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function send(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await client.post<{ request?: GroupRequestState }>(`/groups/${groupId}/requests`, { note: note.trim() || null });
    setBusy(false);
    if (res.ok) {
      setNote('');
      onSent(res.data.request ?? { kind: 'pending', sentAt: new Date().toISOString() });
      return;
    }
    const e2 = res.error;
    if (['REQUEST_WAIT', 'REQUESTS_CLOSED', 'REQUEST_PENDING', 'NOT_BANNED', 'GROUP_NOT_FOUND'].includes(e2.code ?? '')) onRefused(e2);
    else setError(e2.code === 'GROUP_TEXT_REJECTED' ? t('groups.textRejected') : describeError(e2, t));
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
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? t('report.sending') : t('groups.ask.send')}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
