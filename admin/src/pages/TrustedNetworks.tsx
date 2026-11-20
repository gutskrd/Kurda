import { useState } from 'react';
import { api } from '../api';
import { looksLikeAddress, type TrustedNetwork, type TrustedNetworksPage } from '../bans';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  FormActions,
  Loading,
  PageHeader,
  Section,
  Table,
  TextInput,
  Time,
  errorLine,
  useDialogs,
  useLoad,
  useToast,
  type Column,
} from '../ui';

/** How long a new entry lasts unless changed: a school term. */
const DEFAULT_DAYS = 120;

function dayInput(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/**
 * Trusted networks (#/trusted-networks, superadmins): a network many people share on purpose, such as a school's, so
 * a class can sign up together without the sign-up limit per network stopping them, and the network never counts
 * towards deciding that two accounts are one person. Each has a reason and ends within a year; there are at most a
 * hundred; adding and removing are in the audit log. Hevalo keeps only a scrambled form of the address.
 */
export function TrustedNetworks(): React.JSX.Element {
  const list = useLoad(() => api<TrustedNetworksPage>('/admin/trusted-networks'), []);
  const dialogs = useDialogs();
  const toast = useToast();
  const [ip, setIp] = useState('');
  const [reason, setReason] = useState('');
  const [until, setUntil] = useState(() => dayInput(new Date(Date.now() + DEFAULT_DAYS * 86_400_000)));
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const maxDays = list.data?.maxDays ?? 365;
  const latest = dayInput(new Date(Date.now() + maxDays * 86_400_000));
  const ipProblem = !looksLikeAddress(ip) ? 'Enter the network’s public IP address, such as 203.0.113.7.' : null;
  const reasonProblem = !reason.trim() ? 'Say whose network it is and why, for the record.' : null;
  const untilProblem = !until || until > latest || until <= dayInput(new Date()) ? `Choose an end between tomorrow and ${latest}.` : null;
  const live = (list.data?.networks ?? []).filter((n) => !n.expired).length;
  const full = !!list.data && live >= list.data.max;

  async function add(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setTried(true);
    if (ipProblem || reasonProblem || untilProblem || full) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ network: TrustedNetwork }>('/admin/trusted-networks', {
        method: 'POST',
        body: { ip: ip.trim(), reason: reason.trim(), expiresAt: new Date(`${until}T23:59:00Z`).toISOString() },
      });
      toast.success(`Trusted: ${res.network.hint}, until ${new Date(res.network.expiresAt).toLocaleDateString()}.`);
      setIp('');
      setReason('');
      setTried(false);
      await list.reload();
    } catch (err) {
      setError(errorLine(err, 'trusted networks'));
    } finally {
      setBusy(false);
    }
  }

  async function remove(n: TrustedNetwork): Promise<void> {
    const why = await dialogs.prompt({
      title: `Stop trusting ${n.hint}?`,
      body: 'Sign-ups from it count towards the limit per network again from now on.',
      label: 'Why (for the record)',
      maxLength: 500,
      confirmLabel: 'Stop trusting it',
    });
    if (!why) return;
    try {
      await api(`/admin/trusted-networks/${n.id}`, { method: 'DELETE', body: { reason: why } });
      toast.success(`${n.hint} is no longer trusted.`);
      await list.reload();
    } catch (err) {
      toast.error(errorLine(err, 'trusted networks'));
    }
  }

  const columns: ReadonlyArray<Column<TrustedNetwork>> = [
    { key: 'net', header: 'Network', card: 'title', cell: (n) => <span className="mono">{n.hint}</span> },
    { key: 'why', header: 'Why', cell: (n) => <span dir="auto">{n.reason}</span> },
    {
      key: 'until',
      header: 'Until',
      sort: (a, b) => a.expiresAt.localeCompare(b.expiresAt),
      cell: (n) => (n.expired ? <Badge>Ended</Badge> : <Time value={n.expiresAt} mode="absolute" />),
    },
    { key: 'by', header: 'Added by', cell: (n) => (n.createdBy ? `@${n.createdBy}` : <span className="subtle">—</span>) },
  ];

  return (
    <div>
      <PageHeader
        title="Trusted networks"
        subtitle="A school or other place where many people share one address. Trusted, a class can sign up together, and the address never counts towards linking two accounts. Each entry ends within a year."
      />
      <Section title="Trust a network" description={list.data ? `${live} of ${list.data.max} in use.` : undefined}>
        <form className="form" noValidate onSubmit={(e) => void add(e)}>
          <TextInput
            label="Public IP address"
            hint="As the school’s network shows it to the internet. Only a scrambled form is kept, with the last part hidden here."
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            error={tried ? (ipProblem ?? undefined) : undefined}
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            required
          />
          <TextInput
            label="Whose network, and why"
            hint="For example: Class 7 at the Amed school, signing up in lessons."
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
            error={tried ? (reasonProblem ?? undefined) : undefined}
            required
          />
          <TextInput
            label="Trusted until"
            type="date"
            min={dayInput(new Date(Date.now() + 86_400_000))}
            max={latest}
            value={until}
            onChange={(e) => setUntil(e.target.value)}
            error={tried ? (untilProblem ?? undefined) : undefined}
            required
          />
          {full && <p className="field-error">All {list.data!.max} places are in use. Remove one first.</p>}
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <FormActions>
            <Button type="submit" variant="primary" busy={busy} disabled={full}>
              Trust this network
            </Button>
          </FormActions>
        </form>
      </Section>
      <Section title="Trusted now" flush>
        {list.error != null && !list.data ? (
          <ErrorState error={list.error} onRetry={() => void list.reload()} what="trusted networks" compact />
        ) : !list.data ? (
          <Loading rows={2} label="Loading trusted networks…" />
        ) : list.data.networks.length === 0 ? (
          <EmptyState title="No network is trusted" icon="check" compact>
            Every network counts towards the sign-up limit, as usual.
          </EmptyState>
        ) : (
          <Table
            caption="Trusted networks"
            columns={columns}
            rows={list.data.networks}
            rowKey={(n) => n.id}
            empty="None."
            actions={(n) =>
              n.expired ? null : (
                <Button variant="danger" onClick={() => void remove(n)}>
                  Remove…
                </Button>
              )
            }
          />
        )}
      </Section>
    </div>
  );
}
