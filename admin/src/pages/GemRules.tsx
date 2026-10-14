import { useState } from 'react';
import { api } from '../api';
import { Badge, Button, Checkbox, Drawer, FieldRow, FormActions, PageHeader, Section, Table, TextInput, errorLine, useDialogs, useLoad, useToast, type Column } from '../ui';

interface GemRule {
  key: string;
  amount: number;
  dailyCap: number | null;
  cooldownSeconds: number;
  active: boolean;
}

function cooldown(s: number): string {
  if (s === 0) return 'None';
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  return `${Math.round((s / 3600) * 10) / 10} h`;
}

/**
 * Gem rules (KUR-068): how many Gems each action earns, at most how many a
 * day, and how long before it pays again. A change applies to the next Gem
 * earned, for everyone, so it is asked first — it used to save on a click.
 */
export function GemRules(): React.JSX.Element {
  const toast = useToast();
  const list = useLoad(() => api<{ rules: GemRule[] }>('/admin/gem-rules').then((r) => r.rules), []);
  const [editing, setEditing] = useState<GemRule | null>(null);

  const columns: Column<GemRule>[] = [
    { key: 'key', header: 'Earned for', card: 'title', sort: (a, b) => a.key.localeCompare(b.key), cell: (r) => <code className="strong-code">{r.key}</code> },
    { key: 'amount', header: 'Gems', align: 'end', sort: (a, b) => a.amount - b.amount, cell: (r) => r.amount.toLocaleString() },
    { key: 'cap', header: 'Most a day', align: 'end', cell: (r) => (r.dailyCap === null ? <span className="subtle">No limit</span> : r.dailyCap.toLocaleString()) },
    { key: 'cooldown', header: 'Wait between', align: 'end', cell: (r) => cooldown(r.cooldownSeconds) },
    { key: 'active', header: 'State', cell: (r) => <Badge tone={r.active ? 'ok' : 'neutral'}>{r.active ? 'Paying' : 'Off'}</Badge> },
  ];

  return (
    <div>
      <PageHeader title="Gem rules" subtitle="How many Gems each action earns, the most a day, and the wait before it pays again. Changes apply to the next Gem earned." />
      <Section flush>
        <Table
          caption="Gem rules"
          columns={columns}
          rows={list.data ?? null}
          rowKey={(r) => r.key}
          loading={list.loading}
          error={list.error}
          onRetry={() => void list.reload()}
          what="gem rules"
          empty="No gem rules are set up."
          actions={(r) => <Button onClick={() => setEditing(r)}>Edit</Button>}
        />
      </Section>
      {editing && (
        <RuleForm
          key={editing.key}
          rule={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            toast.success(`Saved the rule for ${editing.key}.`);
            await list.reload();
          }}
        />
      )}
    </div>
  );
}

function RuleForm({ rule, onClose, onSaved }: { rule: GemRule; onClose: () => void; onSaved: () => Promise<void> }): React.JSX.Element {
  const dialogs = useDialogs();
  const [amount, setAmount] = useState(String(rule.amount));
  const [cap, setCap] = useState(rule.dailyCap === null ? '' : String(rule.dailyCap));
  const [wait, setWait] = useState(String(rule.cooldownSeconds));
  const [active, setActive] = useState(rule.active);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const n = Number(amount);
    const c = cap.trim() === '' ? null : Number(cap);
    const w = Number(wait);
    if (!Number.isInteger(n) || n < 1 || n > 100_000) return setProblem('Gems is a whole number from 1 to 100,000.');
    if (c !== null && (!Number.isInteger(c) || c < 1)) return setProblem('The daily limit is a whole number of 1 or more, or empty for no limit.');
    if (!Number.isInteger(w) || w < 0 || w > 86_400) return setProblem('The wait is 0 to 86,400 seconds (a day).');
    const yes = await dialogs.confirm({
      title: `Change what ${rule.key} pays?`,
      body: `${n} Gems, ${c === null ? 'no daily limit' : `at most ${c} a day`}, ${w ? `${cooldown(w)} between` : 'no wait'}${active ? '' : ', and switched off'}. It applies to everyone from the next Gem earned.`,
      confirmLabel: 'Save the rule',
    });
    if (!yes) return;
    setBusy(true);
    setProblem(null);
    try {
      await api(`/admin/gem-rules/${encodeURIComponent(rule.key)}`, { method: 'PUT', body: { amount: n, dailyCap: c, cooldownSeconds: w, active } });
      await onSaved();
    } catch (err) {
      setProblem(errorLine(err, 'gem rules'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={`Edit ${rule.key}`}
      footer={
        <FormActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="rule-form" busy={busy}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </FormActions>
      }
    >
      <form id="rule-form" className="form" onSubmit={(e) => void save(e)}>
        <FieldRow>
          <TextInput label="Gems each time" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} required />
          <TextInput label="Most a day" hint="Empty for no limit." inputMode="numeric" value={cap} onChange={(e) => setCap(e.target.value.replace(/\D/g, ''))} />
          <TextInput label="Wait between (seconds)" inputMode="numeric" value={wait} onChange={(e) => setWait(e.target.value.replace(/\D/g, ''))} required />
        </FieldRow>
        <Checkbox label="Paying" hint="Off: the action earns no Gems until it is switched back on." checked={active} onChange={setActive} />
        {problem && (
          <p className="field-error" role="alert">
            {problem}
          </p>
        )}
      </form>
    </Drawer>
  );
}
