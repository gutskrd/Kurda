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
export type Banned = Extract<GroupStanding, { kind: 'banned' }>;

/**
 * A group in place of its chat, for someone who is out of it.
 *
 * A group is private: only its members see it. So this has just two readers.
 * Someone banned sees the group's picture and name, how long the ban lasts,
 * the reason if the admins gave one, and where asking to come back stands:
 * they can ask (with a short note), their request is waiting (and can be
 * withdrawn), they can ask again from a date, or the admins are not taking
 * requests from them. And someone taken out while its chat was open (`gone`)
 * is told so first, calmly, with the focus, since the box they were typing in
 * has gone; if they were only removed, an admin can add them again.
 *
 * Anyone else who opens a group's address is shown `GroupMissing`: the server
 * tells them nothing about it, not even whether it exists.
 */
export function GroupOutside({
  group,
  banned,
  gone,
  onChanged,
}: {
  /** what the page still knows of the group: its picture and name */
  group: { id: string; name: string; photoUrl?: string | null };
  /** the ban, when that is why they are out; null for someone only removed */
  banned: Banned | null;
  gone: boolean;
  /** the reader's standing changed here (asked, withdrew, let back): read the group again */
  onChanged: () => Promise<void>;
}): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const locale = useLocale();
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** where asking stands, as this page last heard it (a request sent or withdrawn shows at once) */
  const [request, setRequest] = useState<GroupRequestState | null>(banned?.request ?? null);
  const [asking, setAsking] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const headRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => setRequest(banned?.request ?? null), [banned]);
  useEffect(() => {
    if (gone) headRef.current?.focus();
  }, [gone]);

  /** A refusal that says where asking really stands is shown as that; anything else is said as an error. */
  async function refused(e: ApiError): Promise<void> {
    switch (e.code) {
      case 'REQUEST_WAIT': {
        const until = untilOf(e.details);
        if (until) return setRequest({ kind: 'wait', until });
        return onChanged();
      }
      case 'REQUESTS_CLOSED':
        return setRequest({ kind: 'closed' });
      // already waiting, not banned any more, or the group itself gone: the group says how things are now
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

/**
 * What a group's address shows someone who is not in it: that there is no
 * such group here, and the way back to their own conversations. The same
 * whether the group exists or not, because the server says the same.
 */
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

/** Where asking to come back stands, and the one thing to do about it, if there is one. */
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

/**
 * Asking to come back: a short note, if they want one, that the admins will
 * read. One request waits at a time and the server holds the rest of the
 * rules; whatever it says is shown where asking stands.
 */
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
  /** a refusal about the request itself (a wait, closed, already waiting, not banned any more) */
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
        {/* the group's name in its own direction, the line in the page's, clear of the close */}
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
