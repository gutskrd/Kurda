import { useState } from 'react';
import { api } from '../api';
import { Badge, Button, PageHeader, Section, Table, Time, UserLink, errorLine, useDialogs, useLoad, useToast, type Column, type Tone } from '../ui';

interface BotFlag {
  userId: string;
  score: number;
  tier: string;
  signals: unknown;
  computedAt: string;
}

const TIER_TONE: Record<string, Tone> = { flagged: 'bad', challenge: 'warn', clear: 'ok' };

function short(id: string): string {
  return id.slice(0, 8);
}

/**
 * Behavioural bot detection (KUR-110): flagged accounts, confirmed as bots or
 * cleared. On the kit, like the pages around it: a flag is a card on a phone,
 * and confirming one asks in the admin's own dialog rather than the browser's,
 * which some phones block outright.
 */
export function Antibot(): React.JSX.Element {
  const toast = useToast();
  const dialogs = useDialogs();
  const list = useLoad(() => api<{ flagged: BotFlag[] }>('/admin/antibot/flagged').then((r) => r.flagged), []);
  const [scoring, setScoring] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function runScoring(): Promise<void> {
    setScoring(true);
    try {
      const res = await api<{ scored: number }>('/admin/antibot/score', { method: 'POST' });
      toast.success(`Scored ${res.scored} active account${res.scored === 1 ? '' : 's'}.`);
      await list.reload();
    } catch (err) {
      toast.error(errorLine(err, 'bot flags'));
    } finally {
      setScoring(false);
    }
  }

  async function reverse(userId: string): Promise<void> {
    const yes = await dialogs.confirm({
      title: `Confirm ${short(userId)} as a bot?`,
      body: 'Its XP gains are reversed through the ledger.',
      confirmLabel: 'Confirm bot',
      tone: 'danger',
    });
    if (!yes) return;
    setBusy(userId);
    try {
      const res = await api<{ reversedXp: number }>(`/admin/antibot/${userId}/reverse`, { method: 'POST' });
      toast.success(`Confirmed ${short(userId)} as a bot: ${res.reversedXp} XP reversed.`);
      await list.reload();
    } catch (err) {
      toast.error(errorLine(err, 'bot flags'));
    } finally {
      setBusy(null);
    }
  }

  async function clear(userId: string): Promise<void> {
    setBusy(userId);
    try {
      await api(`/admin/antibot/${userId}/clear`, { method: 'POST' });
      toast.success(`Cleared ${short(userId)} as a false positive.`);
      await list.reload();
    } catch (err) {
      toast.error(errorLine(err, 'bot flags'));
    } finally {
      setBusy(null);
    }
  }

  const columns: Column<BotFlag>[] = [
    { key: 'user', header: 'Account', card: 'title', cell: (f) => <UserLink user={{ id: f.userId, username: null }} /> },
    { key: 'score', header: 'Score', align: 'end', sort: (a, b) => a.score - b.score, cell: (f) => `${Math.round(f.score * 100)}%` },
    { key: 'tier', header: 'Tier', cell: (f) => <Badge tone={TIER_TONE[f.tier] ?? 'neutral'}>{f.tier}</Badge> },
    { key: 'when', header: 'Flagged', sort: (a, b) => a.computedAt.localeCompare(b.computedAt), cell: (f) => <Time value={f.computedAt} /> },
    {
      key: 'signals',
      header: 'Signals',
      cell: (f) => (
        <details>
          <summary className="subtle">Show</summary>
          <pre className="code-block">{JSON.stringify(f.signals, null, 2)}</pre>
        </details>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Bot flags"
        subtitle="Accounts whose behaviour scored as likely bots, waiting for a person to confirm or clear them."
        actions={
          <>
            <Button busy={scoring} onClick={() => void runScoring()}>
              {scoring ? 'Scoring…' : 'Run the scoring'}
            </Button>
            <Button icon="refresh" onClick={() => void list.reload()} busy={list.loading && !!list.data}>
              Refresh
            </Button>
          </>
        }
      />
      <Section flush>
        <Table
          caption="Flagged accounts"
          columns={columns}
          rows={list.data ?? null}
          rowKey={(f) => f.userId}
          loading={list.loading}
          error={list.error}
          onRetry={() => void list.reload()}
          what="bot flags"
          empty="No account is flagged."
          actions={(f) => (
            <>
              <Button variant="danger" onClick={() => void reverse(f.userId)} disabled={busy === f.userId}>
                Confirm bot
              </Button>
              <Button onClick={() => void clear(f.userId)} disabled={busy === f.userId}>
                Clear
              </Button>
            </>
          )}
        />
      </Section>
    </div>
  );
}
