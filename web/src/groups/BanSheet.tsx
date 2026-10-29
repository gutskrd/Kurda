import { useId, useState } from 'react';
import { GROUP_BAN_DURATIONS, GROUP_BAN_REASON_MAX, type GroupBan, type GroupBanDuration } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { Sheet } from '../components/Sheet';
import { Button } from '../components/Button';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';

const DURATION: Record<GroupBanDuration, MessageKey> = {
  '1d': 'groups.ban.day',
  '7d': 'groups.ban.week',
  perm: 'groups.ban.forGood',
};

/**
 * Banning somebody from a group, as its owner or an admin.
 *
 * How long is a choice of three, made in plain sight; a reason is optional,
 * and the person banned reads it, which the field says. Their messages can go
 * with them. One line says how a ban differs from removing somebody — the
 * difference is the whole reason to pick one — and the button that does it
 * names who it bans.
 */
export function BanSheet({
  groupId,
  groupName,
  member,
  onClose,
  onBanned,
}: {
  groupId: string;
  groupName: string;
  /** who is being banned; null: the sheet is closed */
  member: { userId: string; username: string } | null;
  onClose: () => void;
  /** the ban is in force (the server's account of it, when it sent one) */
  onBanned: (ban: GroupBan | null) => void;
}): React.JSX.Element | null {
  if (!member) return null;
  return <BanForm groupId={groupId} groupName={groupName} member={member} onClose={onClose} onBanned={onBanned} />;
}

function BanForm({
  groupId,
  groupName,
  member,
  onClose,
  onBanned,
}: {
  groupId: string;
  groupName: string;
  member: { userId: string; username: string };
  onClose: () => void;
  onBanned: (ban: GroupBan | null) => void;
}): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const id = useId();
  const [duration, setDuration] = useState<GroupBanDuration>('1d');
  const [reason, setReason] = useState('');
  const [wipe, setWipe] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = member.username;
  const title = t('groups.ban.title', { name });

  async function ban(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await client.post<{ ban?: GroupBan }>(`/groups/${groupId}/bans`, {
      userId: member.userId,
      duration,
      reason: reason.trim() || null,
      deleteMessages: wipe,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.code === 'GROUP_TEXT_REJECTED' ? t('groups.textRejected') : describeError(res.error, t));
      return;
    }
    onBanned(res.data.ban ?? null);
  }

  return (
    <Sheet open onClose={onClose} label={title} className="gban-sheet">
      <p className="report-eyebrow">
        {/* the group's name in its own direction, the line in the page's, clear of the close */}
        <bdi>{groupName}</bdi>
      </p>
      <form className="gban" onSubmit={(e) => void ban(e)}>
        <h2 className="report-heading">
          {title}
        </h2>
        <p className="report-intro">{t('groups.ban.difference')}</p>

        <fieldset className="chip-radio" disabled={busy}>
          <legend className="chip-radio-legend">{t('groups.ban.howLong')}</legend>
          <div className="chip-radio-options">
            {GROUP_BAN_DURATIONS.map((d) => (
              <label key={d} className={`chip-radio-option${duration === d ? ' is-on' : ''}`}>
                <input type="radio" name={`${id}-duration`} value={d} checked={duration === d} onChange={() => setDuration(d)} />
                {t(DURATION[d])}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="field">
          <div className="gedit-label-row">
            <label className="field-label" htmlFor={`${id}-reason`}>
              {t('groups.ban.reason')} <span className="muted">{t('groups.optional')}</span>
            </label>
            <span className="gedit-count" aria-hidden="true">
              {reason.length}/{GROUP_BAN_REASON_MAX}
            </span>
          </div>
          <textarea
            id={`${id}-reason`}
            className="input gban-reason"
            rows={3}
            dir="auto"
            value={reason}
            maxLength={GROUP_BAN_REASON_MAX}
            onChange={(e) => setReason(e.target.value)}
            aria-describedby={`${id}-reason-hint`}
          />
          <span className="field-hint" id={`${id}-reason-hint`}>
            {t('groups.ban.reasonHint', { name })}
          </span>
        </div>

        <label className="gswitch">
          <input type="checkbox" role="switch" className="settings-switch-input" checked={wipe} disabled={busy} onChange={(e) => setWipe(e.target.checked)} />
          <span>{t('groups.ban.deleteMessages')}</span>
        </label>

        {error && (
          <div className="msg msg-error" role="alert">
            {error}
          </div>
        )}
        <div className="report-actions">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" className="btn-danger" disabled={busy}>
            {busy ? t('groups.ban.banning') : title}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
