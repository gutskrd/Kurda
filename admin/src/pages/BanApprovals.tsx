import { useState } from 'react';
import type { PendingApproval } from '@kurda/shared';
import { api } from '../api';
import { useAuth } from '../auth';
import { categoryName } from '../moderation';
import { Badge, Banner, Button, EmptyState, ErrorState, Loading, PageHeader, Section, Time, UserLink, duration, errorLine, useDialogs, useLoad, useToast } from '../ui';

/**
 * Ban approvals (#/ban-approvals): permanent bans that wait for a second
 * moderator. A ban one moderator asks for keeps the account suspended for up
 * to 72 hours; a second one confirms it or turns it down, and if nobody does
 * it lapses and its case opens again. A child-safety ban is in force at once —
 * here it is confirmed after the fact. The moderator who asked can withdraw
 * their own request, never confirm it.
 */
export function BanApprovals(): React.JSX.Element {
  const list = useLoad(() => api<{ approvals: PendingApproval[] }>('/admin/moderation/approvals').then((r) => r.approvals), []);
  const { me } = useAuth();
  const dialogs = useDialogs();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function approve(a: PendingApproval): Promise<void> {
    const name = a.user ? `@${a.user.username}` : 'this account';
    const yes = await dialogs.confirm({
      title: a.inForce ? `Confirm the ban on ${name}?` : `Ban ${name} for good?`,
      body: (
        <div className="dialog-text">
          <p>
            {a.inForce
              ? 'It is already in force. Confirming records that a second moderator looked at it.'
              : 'The account is closed for good: they are signed out everywhere, and their email can’t sign up again.'}
          </p>
          <p>They are told why, and can ask for a review.</p>
        </div>
      ),
      confirmLabel: a.inForce ? 'Confirm the ban' : 'Ban for good',
      tone: 'danger',
    });
    if (!yes) return;
    setBusy(a.sanction.id);
    try {
      await api(`/admin/moderation/approvals/${a.sanction.id}/approve`, { method: 'POST' });
      toast.success(a.inForce ? 'Confirmed.' : `${name} is banned for good.`);
      await list.reload();
    } catch (err) {
      toast.error(errorLine(err, 'ban approvals'));
    } finally {
      setBusy(null);
    }
  }

  async function reject(a: PendingApproval, own: boolean): Promise<void> {
    const reason = await dialogs.prompt({
      title: own ? 'Withdraw your request?' : 'Turn this ban down?',
      label: 'Why (for the record)',
      body: `${a.inForce ? 'The ban is lifted at once' : 'The emergency suspension ends'}${a.caseId ? ', and the case opens again for another decision' : ''}.`,
      multiline: true,
      maxLength: 2000,
      confirmLabel: own ? 'Withdraw' : 'Turn it down',
    });
    if (!reason) return;
    setBusy(a.sanction.id);
    try {
      await api(`/admin/moderation/approvals/${a.sanction.id}/reject`, { method: 'POST', body: { reason } });
      toast.success(a.caseId ? 'Turned down. The case is open again.' : 'Turned down.');
      await list.reload();
    } catch (err) {
      toast.error(errorLine(err, 'ban approvals'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Ban approvals"
        subtitle="A permanent ban needs a second moderator. Until one decides, the account stays suspended; after 72 hours the request lapses and the case opens again."
        actions={
          <Button icon="refresh" onClick={() => void list.reload()} busy={list.loading && !!list.data}>
            Refresh
          </Button>
        }
      />
      {list.error != null && !list.data ? (
        <ErrorState error={list.error} onRetry={() => void list.reload()} what="ban approvals" />
      ) : !list.data ? (
        <Loading rows={2} label="Loading ban approvals…" />
      ) : list.data.length === 0 ? (
        <Section>
          <EmptyState title="No ban is waiting" icon="check" compact>
            When a moderator asks for a permanent ban, it waits here for a second one.
          </EmptyState>
        </Section>
      ) : (
        <ol className="appeal-list" aria-label="Bans waiting for a second moderator">
          {list.data.map((a) => {
            const own = !!me && a.sanction.createdBy === me.id;
            const left = (new Date(a.expiresAt).getTime() - Date.now()) / 1000;
            return (
              <li key={a.sanction.id} className="card section appeal">
                <div className="appeal-head">
                  <strong>Permanent ban</strong>
                  <UserLink user={a.user} />
                  {a.inForce ? (
                    <Badge tone="bad">In force · zero tolerance</Badge>
                  ) : left > 0 ? (
                    <Badge tone={left < 12 * 3600 ? 'warn' : 'neutral'}>Lapses in {duration(left)}</Badge>
                  ) : (
                    <Badge tone="bad">Lapsing now</Badge>
                  )}
                </div>
                <p className="subtle">
                  Under the rule on {categoryName(a.sanction.policy).toLowerCase()} · asked <Time value={a.sanction.createdAt} />
                </p>
                <details className="sanction-statement" open>
                  <summary>What they will be told</summary>
                  <p dir="auto">{a.sanction.statement}</p>
                </details>
                {own && (
                  <Banner tone="info" title="You asked for this ban">
                    Another moderator confirms it. You can withdraw it.
                  </Banner>
                )}
                <div className="appeal-actions">
                  {!own && (
                    <Button variant="danger" onClick={() => void approve(a)} busy={busy === a.sanction.id}>
                      {a.inForce ? 'Confirm the ban' : 'Approve the ban'}
                    </Button>
                  )}
                  <Button onClick={() => void reject(a, own)} disabled={busy === a.sanction.id}>
                    {own ? 'Withdraw' : 'Turn it down'}
                  </Button>
                  {a.caseId && (
                    <a className="button-link" href={`#/moderation/${a.caseId}`}>
                      Open the case
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
