import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Badge, Button, PageHeader, Section, Table, Time, UserLink, errorLine, useDialogs, useLoad, useToast, type Column } from '../ui';

interface PendingChange {
  id: string;
  target: 'shop_item' | 'event';
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

/** What a change would do, in a line or two a second admin can judge. */
function Change({ c }: { c: PendingChange }): React.JSX.Element {
  const p = c.payload;
  if (c.target === 'shop_item') {
    return (
      <>
        <strong>{s(p.name) || s(p.sku)}</strong>
        <span className="cell-sub">
          <code>{s(p.sku)}</code> · {Number(p.price).toLocaleString()} {p.currency === 'gems' ? 'Gems' : 'Zêr'}
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
 * Approvals: the shop and event changes that wait for a second admin (KUR-103)
 * — an item priced at 1,000 or more, an event that grants anything. The page
 * used to propose changes too, through a form that sent every shop item as a
 * tag and wiped the rest of the item; the Shop and Live events pages make
 * changes, and this is where they wait. Approving your own is refused by the
 * server, so the button says so instead of failing.
 */
export function Approvals(): React.JSX.Element {
  const { me } = useAuth();
  const toast = useToast();
  const dialogs = useDialogs();
  const list = useLoad(() => api<{ pending: PendingChange[] }>('/admin/config/changes').then((r) => r.pending), []);
  const [busy, setBusy] = useState<string | null>(null);

  async function approve(c: PendingChange): Promise<void> {
    const yes = await dialogs.confirm({
      title: c.target === 'shop_item' ? `Apply the change to “${s(c.payload.name)}”?` : `Schedule “${s(c.payload.name)}”?`,
      body: c.target === 'shop_item' ? 'It takes effect in the shop at once.' : 'The event goes live in its window, with its rewards.',
      confirmLabel: 'Approve',
    });
    if (!yes) return;
    setBusy(c.id);
    try {
      await api(`/admin/config/changes/${c.id}/approve`, { method: 'POST' });
      toast.success('Approved and applied.');
      await list.reload();
    } catch (err) {
      toast.error(errorLine(err, 'approvals'));
    } finally {
      setBusy(null);
    }
  }

  /** Your own change: taken back, kept on record as withdrawn (the reject route, with that reason). */
  async function withdraw(c: PendingChange): Promise<void> {
    const yes = await dialogs.confirm({
      title: `Withdraw your change to “${s(c.payload.name)}”?`,
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
    { key: 'kind', header: 'Kind', cell: (c) => <Badge tone="info">{c.target === 'shop_item' ? 'Shop item' : 'Event'}</Badge> },
    { key: 'by', header: 'Proposed by', cell: (c) => (c.proposerId ? <UserLink user={{ id: c.proposerId, username: c.proposerId === me?.id ? me.username : null }} /> : '—') },
    { key: 'when', header: 'Waiting since', sort: (a, b) => a.createdAt.localeCompare(b.createdAt), cell: (c) => <Time value={c.createdAt} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Approvals"
        subtitle="Shop items priced at 1,000 or more, and events that give rewards, wait here for a second admin. Nobody can approve their own."
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
            // the server refuses approving your own, so it is not offered: yours can only be withdrawn
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
