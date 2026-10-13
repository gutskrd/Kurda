import { useState } from 'react';
import { ratioLabel } from '../format';
import { api } from '../api';
import { Badge, Button, EmptyState, ErrorState, Loading, PageHeader, Section, Stat, Table, Tabs, errorLine, useLoad, useToast, type Column } from '../ui';

type Currency = 'zer' | 'gems';

interface DailyPoint {
  day: string;
  faucet: number;
  sink: number;
  net: number;
  supply: number;
}
interface DriftReport {
  currency: string;
  windowDays: number;
  faucet: number;
  sink: number;
  /** null when nothing has been spent yet, so the ratio is infinite. */
  ratio: number | null;
  target: number;
  drifting: boolean;
}

const CURRENCY_LABEL: Record<Currency, string> = { zer: 'Zêr', gems: 'Gems' };

/**
 * The economy (KUR-074): how much of each currency is out there, how much
 * came in (faucets) and went out (sinks) each day, and whether the balance is
 * drifting from its target.
 */
export function Economy(): React.JSX.Element {
  const toast = useToast();
  const [currency, setCurrency] = useState<Currency>('zer');
  const [aggregating, setAggregating] = useState(false);
  const data = useLoad(async () => {
    const [s, d] = await Promise.all([
      api<{ currency: Currency; points: DailyPoint[] }>(`/admin/economy/supply?currency=${currency}&days=30`),
      api<DriftReport>(`/admin/economy/drift?currency=${currency}`),
    ]);
    return { points: s.points, drift: d };
  }, [currency]);

  async function aggregateToday(): Promise<void> {
    setAggregating(true);
    try {
      await api('/admin/economy/aggregate', { method: 'POST', body: {} });
      toast.success('Today’s totals were counted again from the wallet ledger.');
      await data.reload();
    } catch (err) {
      toast.error(errorLine(err, 'the economy'));
    } finally {
      setAggregating(false);
    }
  }

  const points = data.data?.points ?? [];
  const drift = data.data?.drift ?? null;
  const latest = points[points.length - 1];
  const name = CURRENCY_LABEL[currency];

  const columns: Column<DailyPoint>[] = [
    { key: 'day', header: 'Day', card: 'title', sort: (a, b) => a.day.localeCompare(b.day), cell: (p) => p.day },
    { key: 'faucet', header: 'Came in', align: 'end', cell: (p) => p.faucet.toLocaleString() },
    { key: 'sink', header: 'Went out', align: 'end', cell: (p) => p.sink.toLocaleString() },
    { key: 'net', header: 'Net', align: 'end', cell: (p) => <span className={p.net < 0 ? 'is-negative' : undefined}>{p.net.toLocaleString()}</span> },
    { key: 'supply', header: 'In circulation', align: 'end', cell: (p) => p.supply.toLocaleString() },
  ];

  return (
    <div>
      <PageHeader
        title="Economy"
        subtitle="How much of each currency is out there, what came in and went out each day, over the last 30 days."
        actions={
          <Button icon="refresh" onClick={() => void aggregateToday()} busy={aggregating}>
            {aggregating ? 'Counting…' : 'Count today again'}
          </Button>
        }
      />
      <Tabs
        label="Currency"
        value={currency}
        onChange={setCurrency}
        items={[
          { key: 'zer', label: 'Zêr' },
          { key: 'gems', label: 'Gems' },
        ]}
      />

      {data.error != null ? (
        <ErrorState error={data.error} onRetry={() => void data.reload()} what="the economy" />
      ) : !data.data ? (
        <Loading rows={5} />
      ) : (
        <>
          <div className="stats">
            <Stat label={`${name} in circulation`} value={latest ? latest.supply.toLocaleString() : '0'} />
            <Stat label={`Came in (${drift?.windowDays ?? 7} days)`} value={drift ? drift.faucet.toLocaleString() : '0'} hint="Earned, granted, bought" />
            <Stat label={`Went out (${drift?.windowDays ?? 7} days)`} value={drift ? drift.sink.toLocaleString() : '0'} hint="Spent in the shop and elsewhere" />
            <Stat
              label="In for every one out"
              value={
                <>
                  {ratioLabel(drift)} {drift && <Badge tone={drift.drifting ? 'bad' : 'ok'}>{drift.drifting ? 'Drifting' : 'Healthy'}</Badge>}
                </>
              }
              hint={
                drift?.ratio === null && drift.faucet > 0
                  ? 'Nothing was spent in this window, so there is no ratio.'
                  : `The target is ${drift?.target ?? 1}.`
              }
            />
          </div>

          <Section title={`${name} in circulation`}>
            {points.length === 0 ? (
              <EmptyState title="No days counted yet." icon="coins" action={<Button onClick={() => void aggregateToday()}>Count today</Button>}>
                The server counts the daily totals from the wallet ledger every six hours.
              </EmptyState>
            ) : (
              <div className="bars" role="img" aria-label={`${name} in circulation over ${points.length} days, now ${latest!.supply.toLocaleString()}.`}>
                {points.map((p) => {
                  const max = Math.max(1, ...points.map((x) => Math.abs(x.supply)));
                  return <div key={p.day} className="b" style={{ height: `${(Math.abs(p.supply) / max) * 100}%` }} title={`${p.day}: ${p.supply.toLocaleString()}`} />;
                })}
              </div>
            )}
          </Section>

          {points.length > 0 && (
            <Section flush title="Day by day">
              <Table caption={`${name} day by day`} columns={columns} rows={[...points].reverse()} rowKey={(p) => p.day} />
            </Section>
          )}
        </>
      )}
    </div>
  );
}
