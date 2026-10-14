import { useState } from 'react';
import { api } from '../api';
import {
  Badge,
  Button,
  Checkbox,
  Drawer,
  FormActions,
  Icon,
  PageHeader,
  Section,
  Table,
  TextInput,
  Textarea,
  errorLine,
  useDialogs,
  useLoad,
  useToast,
  type Column,
} from '../ui';

interface Variant {
  key: string;
  weight: number;
}
interface Experiment {
  key: string;
  description: string | null;
  enabled: boolean;
  variants: Variant[];
}

const KEY = /^[a-z0-9][a-z0-9_]*$/;

/** Each variant's share, as a person reads it: "control 50% · new 50%". */
export function shares(variants: readonly Variant[]): string {
  const total = variants.reduce((n, v) => n + v.weight, 0);
  return variants.map((v) => `${v.key} ${total > 0 ? Math.round((v.weight / total) * 100) : 0}%`).join(' · ');
}

/**
 * Feature flags and A/B tests (KUR-107). A flag is on or off for everyone;
 * a test splits people between variants by weight. Changing a flag needs no
 * deploy. Variants used to be typed as "control:1, treatment:2" and an
 * experiment could only be changed by retyping its key; now each has an Edit.
 */
export function Experiments(): React.JSX.Element {
  const toast = useToast();
  const dialogs = useDialogs();
  const list = useLoad(() => api<{ experiments: Experiment[] }>('/admin/experiments').then((r) => r.experiments), []);
  const [editing, setEditing] = useState<Experiment | 'new' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function toggle(e: Experiment): Promise<void> {
    if (e.enabled) {
      const yes = await dialogs.confirm({
        title: `Turn “${e.key}” off?`,
        body: 'Everyone gets “control” straight away. Turning it on again puts each person back in the same variant, as long as the variants have not changed.',
        confirmLabel: 'Turn off',
        tone: 'danger',
      });
      if (!yes) return;
    }
    setBusy(e.key);
    try {
      await api(`/admin/experiments/${encodeURIComponent(e.key)}/enabled`, { method: 'POST', body: { enabled: !e.enabled } });
      toast.success(`“${e.key}” is ${e.enabled ? 'off' : 'on'}.`);
      await list.reload();
    } catch (err) {
      toast.error(errorLine(err, 'feature flags'));
    } finally {
      setBusy(null);
    }
  }

  const columns: Column<Experiment>[] = [
    {
      key: 'key',
      header: 'Flag',
      card: 'title',
      sort: (a, b) => a.key.localeCompare(b.key),
      cell: (e) => (
        <>
          <code className="strong-code">{e.key}</code>
          {e.description && <span className="cell-sub">{e.description}</span>}
        </>
      ),
    },
    { key: 'variants', header: 'Split', cell: (e) => (e.variants.length === 1 ? <span className="subtle">One variant: {e.variants[0]!.key}</span> : shares(e.variants)) },
    { key: 'state', header: 'State', sort: (a, b) => Number(b.enabled) - Number(a.enabled), cell: (e) => <Badge tone={e.enabled ? 'ok' : 'neutral'}>{e.enabled ? 'On' : 'Off'}</Badge> },
  ];

  return (
    <div>
      <PageHeader
        title="Feature flags"
        subtitle="Switch a feature on or off for everyone, or split people between variants to compare them. No deploy needed."
        actions={
          <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>
            New flag
          </Button>
        }
      />
      <Section flush>
        <Table
          caption="Feature flags"
          columns={columns}
          rows={list.data ?? null}
          rowKey={(e) => e.key}
          loading={list.loading}
          error={list.error}
          onRetry={() => void list.reload()}
          what="feature flags"
          empty="No flags yet."
          actions={(e) => (
            <>
              <Button onClick={() => setEditing(e)}>Edit</Button>
              <Button variant={e.enabled ? 'danger' : 'primary'} onClick={() => void toggle(e)} disabled={busy === e.key}>
                {e.enabled ? 'Turn off' : 'Turn on'}
              </Button>
            </>
          )}
        />
      </Section>
      {editing && (
        <FlagForm
          key={editing === 'new' ? 'new' : editing.key}
          flag={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async (key) => {
            setEditing(null);
            toast.success(`Saved “${key}”.`);
            await list.reload();
          }}
        />
      )}
    </div>
  );
}

function FlagForm({ flag, onClose, onSaved }: { flag: Experiment | null; onClose: () => void; onSaved: (key: string) => Promise<void> }): React.JSX.Element {
  const [key, setKey] = useState(flag?.key ?? '');
  const [description, setDescription] = useState(flag?.description ?? '');
  const [enabled, setEnabled] = useState(flag?.enabled ?? false);
  const [variants, setVariants] = useState<Array<{ key: string; weight: string }>>(
    flag ? flag.variants.map((v) => ({ key: v.key, weight: String(v.weight) })) : [
      { key: 'control', weight: '1' },
      { key: 'treatment', weight: '1' },
    ],
  );
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const parsed = variants.map((v) => ({ key: v.key.trim(), weight: Number(v.weight) }));
    if (!KEY.test(key.trim())) return setProblem('The key is lower-case letters, digits and _, starting with a letter or digit.');
    if (parsed.length === 0) return setProblem('Add at least one variant.');
    if (parsed.some((v) => !KEY.test(v.key))) return setProblem('Each variant’s name is lower-case letters, digits and _.');
    if (new Set(parsed.map((v) => v.key)).size !== parsed.length) return setProblem('Two variants have the same name.');
    if (parsed.some((v) => !Number.isFinite(v.weight) || v.weight < 0)) return setProblem('A weight is a number of 0 or more.');
    if (parsed.every((v) => v.weight === 0)) return setProblem('At least one variant needs a weight above 0.');
    setBusy(true);
    setProblem(null);
    try {
      await api('/admin/experiments', { method: 'POST', body: { key: key.trim(), description: description.trim() || null, enabled, variants: parsed } });
      await onSaved(key.trim());
    } catch (err) {
      setProblem(errorLine(err, 'feature flags'));
    } finally {
      setBusy(false);
    }
  }

  const total = variants.reduce((n, v) => n + (Number(v.weight) || 0), 0);
  return (
    <Drawer
      open
      onClose={onClose}
      title={flag ? `Edit “${flag.key}”` : 'New flag'}
      footer={
        <FormActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="flag-form" busy={busy}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </FormActions>
      }
    >
      <form id="flag-form" className="form" onSubmit={(e) => void save(e)}>
        <TextInput
          label="Key"
          hint={flag ? 'The key cannot change: the app asks for the flag by it.' : 'What the app asks for: lower case, digits and _.'}
          value={key}
          onChange={(e) => setKey(e.target.value.toLowerCase())}
          readOnly={!!flag}
          required
          maxLength={64}
          autoCapitalize="off"
          spellCheck={false}
          placeholder="new_onboarding"
        />
        <Textarea label="What it is for" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} rows={2} />
        <fieldset className="ex-list">
          <legend>Variants and their weights</legend>
          {variants.map((v, i) => (
            <div key={i} className="ex-list-row">
              <input
                aria-label={`Variant ${i + 1} name`}
                value={v.key}
                onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, key: e.target.value.toLowerCase() } : x)))}
                autoCapitalize="off"
                spellCheck={false}
              />
              <input
                aria-label={`Variant ${i + 1} weight`}
                className="weight-input"
                inputMode="decimal"
                value={v.weight}
                onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, weight: e.target.value } : x)))}
              />
              <span className="weight-share subtle" aria-hidden="true">
                {total > 0 ? `${Math.round(((Number(v.weight) || 0) / total) * 100)}%` : '—'}
              </span>
              {variants.length > 1 && (
                <button type="button" className="icon-button ghost" aria-label={`Remove variant ${i + 1}`} onClick={() => setVariants(variants.filter((_, j) => j !== i))}>
                  <Icon name="close" />
                </button>
              )}
            </div>
          ))}
          {variants.length < 20 && (
            <button type="button" className="ghost ex-add" onClick={() => setVariants([...variants, { key: '', weight: '1' }])}>
              <Icon name="plus" />
              Add a variant
            </button>
          )}
        </fieldset>
        <Checkbox label="On" hint="Off gives everyone “control”." checked={enabled} onChange={setEnabled} />
        {problem && (
          <p className="field-error" role="alert">
            {problem}
          </p>
        )}
      </form>
    </Drawer>
  );
}
