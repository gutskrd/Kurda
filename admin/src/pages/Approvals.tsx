import { useState } from 'react';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import { Badge, Button, PageHeader, Section, Table, Time, UserLink, errorLine, useDialogs, useLoad, useToast, type Column } from '../ui';

interface PendingChange {
  id: string;
  target: 'shop_item' | 'event' | 'earn_rule' | 'plus_grant';
  payload: Record<string, unknown>;
  sensitive: boolean;
  proposerId: string | null;
  createdAt: string;
}

const s = (v: unknown): string => (v === undefined || v === null ? '' : String(v));

function day(v: unknown): string {
  const d = new Date(s(v));
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** What each kind of change is called on the list. */
const KIND: Record<PendingChange['target'], string> = { shop_item: 'Shop item', event: 'Event', earn_rule: 'Earn rule', plus_grant: 'Own Hevalo+' };

/** An earn rule as it would pay: "80 Zêr each time, at most 200 a day, 60 s between". */
function rulePays(p: Record<string, unknown>): string {
  const cap = p.dailyCap === null || p.dailyCap === undefined ? 'no daily limit' : `at most ${Number(p.dailyCap).toLocaleString()} a day`;
  const wait = Number(p.cooldownSeconds) > 0 ? `${Number(p.cooldownSeconds).toLocaleString()} s between` : 'no wait';
  return `${Number(p.amount).toLocaleString()} Zêr each time, ${cap}, ${wait}`;
}

/** What a change would do, in a line or two a second admin can judge. */
function Change({ c }: { c: PendingChange }): React.JSX.Element {
  const p = c.payload;
  if (c.target === 'earn_rule') {
    return (
      <>
        <strong>{s(p.key)}</strong>
        <span className="cell-sub">{rulePays(p)}</span>
      </>
    );
  }
  if (c.target === 'plus_grant') {
    return (
      <>
        <strong>{`Hevalo+ for ${Number(p.days).toLocaleString()} ${Number(p.days) === 1 ? 'day' : 'days'}, for their own account`}</strong>
        <span className="cell-sub">Reason: {s(p.reason)}</span>
      </>
    );
  }
  if (c.target === 'shop_item') {
    return (
      <>
        <strong>{s(p.name) || s(p.sku)}</strong>
        <span className="cell-sub">
          <code>{s(p.sku)}</code> · {Number(p.price).toLocaleString()} Zêr
          {p.category ? ` · ${s(p.category)}` : ''}
        </span>
      </>
    );
  }
  const rewards = p.rewards && typeof p.rewards === 'object' ? Object.entries(p.rewards as Record<string, unknown>) : [];
  return (
    <>
      <strong>{s(p.name) || s(p.key)}</strong>
      <span className="cell-sub">
        <code>{s(p.key)}</code> · {day(p.startsAt)} → {day(p.endsAt)}
      </span>
      {rewards.length > 0 && <span className="cell-sub">Gives {rewards.map(([k, v]) => `${s(v)} ${k}`).join(', ')}</span>}
    </>
  );
}

/**
 * Approvals: changes waiting for a second admin (a shop item at 500 or more, an event that grants anything, an earn rule
 * that pays more, Hevalo+ for an admin's own account), made on the Shop, Live events, Earn rules and people's pages. The
 * server refuses approving your own, so the button says so.
 */
export function Approvals(): React.JSX.Element {
  const { me } = useAuth();
  const toast = useToast();
  const dialogs = useDialogs();
  const list = useLoad(() => api<{ pending: PendingChange[] }>('/admin/config/changes').then((r) => r.pending), []);
  const [busy, setBusy] = useState<string | null>(null);

  async function approve(c: PendingChange): Promise<void> {
    const asked: Record<PendingChange['target'], { title: string; body: string }> = {
      shop_item: { title: `Apply the change to “${s(c.payload.name)}”?`, body: 'It takes effect in the shop at once.' },
      event: { title: `Schedule “${s(c.payload.name)}”?`, body: 'The event goes live in its window, with its rewards.' },
      earn_rule: { title: `Let ${s(c.payload.key)} pay more?`, body: `${rulePays(c.payload)}, for everyone, from the next Zêr earned that way.` },
      plus_grant: { title: 'Give the admin who asked Hevalo+ for their own account?', body: 'Membership pays Zêr, so it is never given to oneself alone.' },
    };
    const yes = await dialogs.confirm({ ...asked[c.target], confirmLabel: 'Approve' });
    if (!yes) return;
    setBusy(c.id);
    try {
      await api(`/admin/config/changes/${c.id}/approve`, { method: 'POST' });
      toast.success('Approved and applied.');
      await list.reload();
    } catch (err) {
      toast.error(
        err instanceof ApiError && err.code === 'SELF_APPROVE' ? 'You proposed this change: another admin approves it.' : errorLine(err, 'approvals'),
      );
    } finally {
      setBusy(null);
    }
  }

  /** Your own change: taken back, kept on record as withdrawn (the reject route, with that reason). */
  async function withdraw(c: PendingChange): Promise<void> {
    const yes = await dialogs.confirm({
      title: `Withdraw your change to “${s(c.payload.name ?? c.payload.key ?? 'Hevalo+')}”?`,
      body: 'Nothing is changed, and it leaves this list. You can propose it again.',
      confirmLabel: 'Withdraw',
    });
    if (!yes) return;
    setBusy(c.id);
    try {
      await api(`/admin/config/changes/${c.id}/reject`, { method: 'POST', body: { reason: 'Withdrawn by the admin who proposed it' } });
      toast.success('Withdrawn. Nothing was changed.');
      await list.reload();
    } catch (err) {
      toast.error(errorLine(err, 'approvals'));
    } finally {
      setBusy(null);
    }
  }

  async function reject(c: PendingChange): Promise<void> {
    const reason = await dialogs.prompt({
      title: 'Reject this change?',
      label: 'Why (kept on record with the change)',
      multiline: true,
      maxLength: 500,
      confirmLabel: 'Reject',
    });
    if (reason === null) return;
    setBusy(c.id);
    try {
      await api(`/admin/config/changes/${c.id}/reject`, { method: 'POST', body: { reason } });
      toast.success('Rejected. Nothing was changed.');
      await list.reload();
    } catch (err) {
      toast.error(errorLine(err, 'approvals'));
    } finally {
      setBusy(null);
    }
  }

  const columns: Column<PendingChange>[] = [
    { key: 'change', header: 'Change', card: 'title', cell: (c) => <Change c={c} /> },
    { key: 'kind', header: 'Kind', cell: (c) => <Badge tone="info">{KIND[c.target] ?? c.target}</Badge> },
    { key: 'by', header: 'Proposed by', cell: (c) => (c.proposerId ? <UserLink user={{ id: c.proposerId, username: c.proposerId === me?.id ? me.username : null }} /> : '—') },
    { key: 'when', header: 'Waiting since', sort: (a, b) => a.createdAt.localeCompare(b.createdAt), cell: (c) => <Time value={c.createdAt} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Approvals"
        subtitle={
          'Shop items priced at 500 or more, events that give rewards, earn rules that pay more and an admin’s Hevalo+ for ' +
          'their own account wait here for a second admin. Nobody can approve their own.'
        }
        actions={
          <Button icon="refresh" onClick={() => void list.reload()} disabled={list.loading}>
            Refresh
          </Button>
        }
      />
      <Section flush title="Waiting for a second admin">
        <Table
          caption="Changes waiting for approval"
          columns={columns}
          rows={list.data ?? null}
          rowKey={(c) => c.id}
          loading={list.loading}
          error={list.error}
          onRetry={() => void list.reload()}
          what="approvals"
          empty="Nothing is waiting. Changes that need a second admin will appear here."
          actions={(c) => {
            // The server refuses approving your own, so it is not offered: yours can only be withdrawn.
            if (me && c.proposerId === me.id) {
              return (
                <>
                  <span className="subtle">Another admin approves it</span>
                  <Button onClick={() => void withdraw(c)} disabled={busy === c.id}>
                    Withdraw
                  </Button>
                </>
              );
            }
            return (
              <>
                <Button variant="danger" onClick={() => void reject(c)} disabled={busy === c.id}>
                  Reject
                </Button>
                <Button variant="primary" onClick={() => void approve(c)} disabled={busy === c.id}>
                  Approve
                </Button>
              </>
            );
          }}
        />
      </Section>
    </div>
  );
}
