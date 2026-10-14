import { useState } from 'react';
import { api } from '../api';
import { Badge, Button, Drawer, PageHeader, Section, Table, Time, UserLink, errorLine, useDialogs, useLoad, useToast, type Column } from '../ui';

type FraudFlag = 'VELOCITY' | 'REFUND_ABUSE' | 'RECEIPT_REUSE';

interface FraudReview {
  id: string;
  userId: string;
  /** null once the account is gone */
  username?: string | null;
  receiptId: string | null;
  flags: FraudFlag[];
  evidence: Record<string, unknown>;
  status: string;
  createdAt: string;
}

const FLAG: Record<FraudFlag, { label: string; meaning: string }> = {
  VELOCITY: { label: 'Many purchases fast', meaning: 'More than 6 purchases on this account in the last hour.' },
  REFUND_ABUSE: { label: 'Refunds after spending', meaning: 'At least 2 earlier purchases were refunded after their Gems were spent.' },
  RECEIPT_REUSE: { label: 'Receipt used by another account', meaning: 'The store receipt was already used on a different account, and not through family sharing.' },
};

/** "maxPerHour" → "Max per hour" */
function words(key: string): string {
  const w = key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase();
  return w.charAt(0).toUpperCase() + w.slice(1);
}

/**
 * Fraud (KUR-073): purchases held for a check before their Gems are given.
 * Clearing one gives the Gems, which cannot be taken back from here, so both
 * decisions are asked first — Clear used to grant on a click.
 */
export function Fraud(): React.JSX.Element {
  const toast = useToast();
  const dialogs = useDialogs();
  const list = useLoad(() => api<{ reviews: FraudReview[] }>('/admin/fraud/reviews').then((r) => r.reviews), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [looking, setLooking] = useState<FraudReview | null>(null);

  async function resolve(r: FraudReview, decision: 'clear' | 'confirm'): Promise<void> {
    const yes = await dialogs.confirm(
      decision === 'clear'
        ? {
            title: 'Clear this purchase?',
            body: 'The held Gems are given to the account, and its hold is lifted once nothing else on it is waiting. That cannot be undone from here.',
            confirmLabel: 'Clear and give the Gems',
          }
        : {
            title: 'Confirm this is fraud?',
            body: 'The account stays on hold and the held Gems are not given.',
            confirmLabel: 'Confirm fraud',
            tone: 'danger',
          },
    );
    if (!yes) return;
    setBusy(r.id);
    try {
      const res = await api<{ status: string; grantedGems: number }>(`/admin/fraud/reviews/${r.id}/resolve`, { method: 'POST', body: { decision } });
      toast.success(decision === 'clear' ? `Cleared: ${res.grantedGems} Gems given.` : 'Confirmed as fraud: the hold stays.');
      setLooking(null);
      await list.reload();
    } catch (err) {
      toast.error(errorLine(err, 'fraud reviews'));
    } finally {
      setBusy(null);
    }
  }

  const columns: Column<FraudReview>[] = [
    { key: 'user', header: 'Account', card: 'title', cell: (r) => <UserLink user={{ id: r.userId, username: r.username ?? null }} /> },
    {
      key: 'flags',
      header: 'Why it was held',
      cell: (r) => (
        <span className="badges">
          {r.flags.map((f) => (
            <Badge key={f} tone="bad" title={FLAG[f]?.meaning}>
              {FLAG[f]?.label ?? f}
            </Badge>
          ))}
        </span>
      ),
    },
    { key: 'when', header: 'Held since', sort: (a, b) => a.createdAt.localeCompare(b.createdAt), cell: (r) => <Time value={r.createdAt} /> },
  ];

  const decide = (r: FraudReview): React.JSX.Element => (
    <>
      <Button variant="danger" onClick={() => void resolve(r, 'confirm')} disabled={busy === r.id}>
        Confirm fraud
      </Button>
      <Button variant="primary" onClick={() => void resolve(r, 'clear')} disabled={busy === r.id}>
        Clear
      </Button>
    </>
  );

  return (
    <div>
      <PageHeader title="Fraud" subtitle="Purchases held for a check before their Gems are given. Look at why, then clear the purchase or confirm the fraud." />
      <Section flush>
        <Table
          caption="Purchases on hold"
          columns={columns}
          rows={list.data ?? null}
          rowKey={(r) => r.id}
          loading={list.loading}
          error={list.error}
          onRetry={() => void list.reload()}
          what="fraud reviews"
          empty="Nothing is on hold."
          actions={(r) => (
            <>
              <Button onClick={() => setLooking(r)}>Look</Button>
              {decide(r)}
            </>
          )}
        />
      </Section>
      {looking && (
        <Drawer open onClose={() => setLooking(null)} title="Why it was held" footer={<div className="row-actions">{decide(looking)}</div>}>
          <dl className="facts">
            <div className="facts-row">
              <dt>Account</dt>
              <dd>
                <UserLink user={{ id: looking.userId, username: looking.username ?? null }} />
              </dd>
            </div>
            <div className="facts-row">
              <dt>Held since</dt>
              <dd>
                <Time value={looking.createdAt} mode="absolute" />
              </dd>
            </div>
            {looking.receiptId && (
              <div className="facts-row">
                <dt>Receipt</dt>
                <dd>
                  <code>{looking.receiptId}</code>
                </dd>
              </div>
            )}
            {looking.flags.map((f) => (
              <div key={f} className="facts-row">
                <dt>{FLAG[f]?.label ?? f}</dt>
                <dd>{FLAG[f]?.meaning ?? ''}</dd>
              </div>
            ))}
          </dl>
          <h3 className="drawer-sub">What the check saw</h3>
          <dl className="facts">
            {Object.entries(looking.evidence).map(([k, v]) => (
              <div key={k} className="facts-row">
                <dt>{words(k)}</dt>
                <dd>{v !== null && typeof v === 'object' ? <pre className="code-block">{JSON.stringify(v, null, 2)}</pre> : String(v)}</dd>
              </div>
            ))}
          </dl>
        </Drawer>
      )}
    </div>
  );
}
