import { useState } from 'react';
import { api } from '../api';
import { Badge, Button, Section, Table, UserLink, errorLine, useToast, type Column } from '../ui';

/**
 * The check that every balance still equals the sum of its ledger, asked from
 * the Economy page (`GET /admin/economy/reconcile`).
 *
 * The server runs the same check every day and logs what it finds; this is for
 * the moment someone wants to know now. It reads the whole ledger, so it runs
 * when asked rather than whenever the page opens. It only reports: which of
 * the two numbers is wrong is a question for a person, and a balance is never
 * edited by hand — a correction goes through the ledger like any change.
 */

interface Mismatch {
  userId: string;
  currency: 'zer' | 'gems';
  balance: number;
  ledgerSum: number;
}

interface ReconcileReport {
  checkedAt: string;
  checked: number;
  mismatched: number;
  mismatches: Mismatch[];
}

const CURRENCY_LABEL: Record<Mismatch['currency'], string> = { zer: 'Zêr', gems: 'Gems' };

const COLUMNS: ReadonlyArray<Column<Mismatch>> = [
  { key: 'who', header: 'Person', card: 'title', cell: (m) => <UserLink user={{ id: m.userId }} /> },
  { key: 'currency', header: 'Currency', cell: (m) => CURRENCY_LABEL[m.currency] ?? m.currency },
  { key: 'balance', header: 'Balance says', align: 'end', cell: (m) => m.balance.toLocaleString() },
  { key: 'ledger', header: 'Ledger adds up to', align: 'end', cell: (m) => m.ledgerSum.toLocaleString() },
  {
    key: 'gap',
    header: 'Difference',
    align: 'end',
    cell: (m) => {
      const gap = m.balance - m.ledgerSum;
      return <span className={gap < 0 ? 'is-negative' : undefined}>{`${gap > 0 ? '+' : ''}${gap.toLocaleString()}`}</span>;
    },
  },
];

export function LedgerCheck(): React.JSX.Element {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<ReconcileReport | null>(null);

  async function check(): Promise<void> {
    setBusy(true);
    try {
      setReport(await api<ReconcileReport>('/admin/economy/reconcile?limit=100'));
    } catch (err) {
      toast.error(errorLine(err, 'the ledger check'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="Balances against the ledger"
      description="Every balance should equal the sum of its ledger. The server checks this daily; check now to see it here."
      actions={
        <Button icon="refresh" onClick={() => void check()} busy={busy}>
          {busy ? 'Checking…' : 'Check now'}
        </Button>
      }
    >
      {report === null ? null : report.mismatched === 0 ? (
        <p role="status">
          <Badge tone="ok">All match</Badge> {`Every balance equals its ledger — ${report.checked.toLocaleString()} checked.`}
        </p>
      ) : (
        <>
          <p role="status">
            <Badge tone="bad">{report.mismatched === 1 ? '1 differs' : `${report.mismatched.toLocaleString()} differ`}</Badge>{' '}
            {`${report.mismatched.toLocaleString()} of ${report.checked.toLocaleString()} balances differ from their ledger. The largest gaps first.`}
          </p>
          <Table caption="Balances that differ from their ledger" columns={COLUMNS} rows={report.mismatches} rowKey={(m) => `${m.userId}:${m.currency}`} />
        </>
      )}
    </Section>
  );
}
