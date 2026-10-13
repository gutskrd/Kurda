import { useState } from 'react';
import type { CaseAuditEntry, CaseEscalation, CaseNote, CaseSanctionView } from '@kurda/shared';
import { api } from '../api';
import { categoryName, historyLine, sanctionName } from '../moderation';
import { ActionMenu, Badge, Button, Icon, Section, Textarea, Time, errorLine, useDialogs, useToast } from '../ui';
import { SanctionLine } from './CasePeople';

/** The sanctions this case gave, each liftable (with a reason the person never sees). */
export function CaseSanctions({
  sanctions,
  nameOf,
  onChanged,
}: {
  sanctions: CaseSanctionView[];
  nameOf: (userId: string | null) => string;
  onChanged: () => void;
}): React.JSX.Element | null {
  const dialogs = useDialogs();
  const toast = useToast();
  if (sanctions.length === 0) return null;

  async function lift(s: CaseSanctionView): Promise<void> {
    const reason = await dialogs.prompt({
      title: `Lift this ${s.kind === 'permanent_ban' ? 'ban' : 'sanction'}?`,
      label: 'Why (for the record)',
      body: `${nameOf(s.userId)} is told it was lifted. What it stopped works again at once.`,
      multiline: true,
      maxLength: 2000,
      confirmLabel: 'Lift it',
    });
    if (!reason) return;
    try {
      await api(`/admin/sanctions/${s.id}/revoke`, { method: 'POST', body: { reason } });
      toast.success('Lifted.');
      onChanged();
    } catch (err) {
      toast.error(errorLine(err, 'moderation'));
    }
  }

  return (
    <Section title="Sanctions from this case">
      <ul className="sanction-list">
        {sanctions.map((s) => (
          <SanctionLine
            key={s.id}
            s={s}
            who={<span>for {nameOf(s.userId)}</span>}
            actions={
              s.revokedAt ? undefined : (
                <ActionMenu label={`More for the ${sanctionName(s.kind).toLowerCase()} of ${nameOf(s.userId)}`} items={[{ label: 'Lift it…', onSelect: () => void lift(s), tone: 'danger' }]} />
              )
            }
          />
        ))}
      </ul>
    </Section>
  );
}

/**
 * Tasks the case has opened: an escalation, or the CSAM filing task with the
 * hotlines' links and the files it took off public storage. A filed report's
 * reference is written here, which closes a CSAM case.
 */
export function Escalations({ escalations, onChanged }: { escalations: CaseEscalation[]; onChanged: () => void }): React.JSX.Element | null {
  const dialogs = useDialogs();
  const toast = useToast();
  if (escalations.length === 0) return null;

  async function filed(e: CaseEscalation): Promise<void> {
    const reference = await dialogs.prompt({
      title: e.kind === 'csam' ? 'Record the hotline report' : 'Mark this escalation done',
      label: e.kind === 'csam' ? 'The reference the hotline gave you' : 'What was done (a reference, or a short note)',
      maxLength: 500,
      confirmLabel: 'Save',
    });
    if (!reference) return;
    try {
      await api(`/admin/moderation/escalations/${e.id}/filed`, { method: 'POST', body: { reference } });
      toast.success('Recorded.');
      onChanged();
    } catch (err) {
      toast.error(errorLine(err, 'moderation'));
    }
  }

  return (
    <Section title="Escalations" className="escalations">
      <ul className="escalation-list">
        {escalations.map((e) => (
          <li key={e.id} className={`escalation${e.status === 'open' ? ' is-open' : ''}`}>
            <div className="escalation-head">
              <strong>{e.kind === 'csam' ? 'Report to a child-abuse hotline' : 'Escalated'}</strong>
              <Badge tone={e.status === 'open' ? 'bad' : 'ok'}>{e.status === 'open' ? 'To do' : 'Done'}</Badge>
              <Time value={e.createdAt} />
            </div>
            {e.reason && <p dir="auto">{e.reason}</p>}
            {e.links.length > 0 && (
              <ul className="link-list">
                {e.links.map((l) => (
                  <li key={l.url}>
                    <a href={l.url} target="_blank" rel="noreferrer noopener">
                      {l.label}
                      <Icon name="external" size={14} />
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {e.media.length > 0 && (
              <>
                <h3 className="drawer-sub">Files taken off public storage</h3>
                <ul className="plain-list">
                  {e.media.map((m) => (
                    <li key={m.key}>
                      <span className="mono">{m.key}</span>{' '}
                      <Badge tone={m.quarantine === 'done' ? 'ok' : 'warn'}>{m.quarantine === 'done' ? 'In private storage' : 'Being moved'}</Badge>
                      {m.cdnPurged !== true && m.publicUrl && (
                        <span className="cell-sub">
                          The CDN may still have it: purge <span className="mono">{m.publicUrl}</span> by hand.
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {e.status === 'filed' ? (
              <p className="subtle">
                Reference: <span className="mono">{e.reference}</span> · <Time value={e.filedAt} mode="absolute" />
              </p>
            ) : (
              <Button onClick={() => void filed(e)}>{e.kind === 'csam' ? 'Record the report’s reference' : 'Mark as done'}</Button>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** Notes moderators leave each other on the case. */
export function Notes({ caseId, notes, onAdded }: { caseId: string; notes: CaseNote[]; onAdded: (note: CaseNote) => void }): React.JSX.Element {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  async function add(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      const note = await api<CaseNote>(`/admin/moderation/cases/${caseId}/note`, { method: 'POST', body: { text: text.trim() } });
      onAdded(note);
      setText('');
    } catch (err) {
      toast.error(errorLine(err, 'moderation'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Section title="Notes" description="For moderators only.">
      {notes.length > 0 && (
        <ol className="note-list">
          {notes.map((n) => (
            <li key={n.id}>
              <div className="note-head">
                <strong>{n.authorUsername ? `@${n.authorUsername}` : 'A moderator'}</strong>
                <Time value={n.createdAt} />
              </div>
              <p dir="auto">{n.text}</p>
            </li>
          ))}
        </ol>
      )}
      <form className="note-form" onSubmit={(e) => void add(e)}>
        <Textarea label="Add a note" rows={2} maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} />
        <div className="form-actions">
          <Button type="submit" busy={busy} disabled={!text.trim()}>
            Add note
          </Button>
        </div>
      </form>
    </Section>
  );
}

/** Everything that happened to the case, oldest first: claims, decisions, notes, approvals. */
export function History({ audit, nameOf }: { audit: CaseAuditEntry[]; nameOf: (adminId: string | null) => string }): React.JSX.Element | null {
  if (audit.length === 0) return null;
  return (
    <Section title="History">
      <ol className="history-list">
        {audit.map((a, i) => {
          const detail = a.detail ?? {};
          const reason = typeof detail.reason === 'string' ? detail.reason : null;
          const policy = typeof detail.policy === 'string' ? detail.policy : null;
          return (
            <li key={`${a.at}-${i}`}>
              <Time value={a.at} mode="absolute" />
              <span>
                <strong>{historyLine(a.action)}</strong> · {nameOf(a.adminId)}
                {policy && <span className="subtle"> · {categoryName(policy)}</span>}
              </span>
              {reason && (
                <span className="cell-sub" dir="auto">
                  {reason}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </Section>
  );
}

