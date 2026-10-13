import { useState } from 'react';
import { api } from '../api';
import {
  Badge,
  Button,
  Checkbox,
  Drawer,
  FieldRow,
  FormActions,
  PageHeader,
  Section,
  Select,
  Table,
  Tabs,
  TextInput,
  errorLine,
  useDialogs,
  useLoad,
  useToast,
  type Column,
} from '../ui';

type Kind = 'main' | 'claimable';
type Acquisition = 'default' | 'role' | 'purchase' | 'self_claim' | 'auto_grant';

interface Tag {
  id: string;
  key: string;
  label: string;
  kind: Kind;
  category: string;
  acquisition: Acquisition;
  sensitive: boolean;
}

const HOW: Record<Acquisition, string> = {
  self_claim: 'Chosen by the person',
  auto_grant: 'Given automatically',
  purchase: 'Bought in the shop',
  role: 'Comes with a role',
  default: 'Everyone has it',
};

/**
 * Tags & badges (KUR-286): the identity tags a profile can show — the one
 * main tag, chosen by precedence, and the claimable ones a person picks.
 * Deactivating hides a tag everywhere and keeps its history.
 */
export function Tags(): React.JSX.Element {
  const toast = useToast();
  const dialogs = useDialogs();
  const tags = useLoad(() => api<{ tags: Tag[] }>('/tags').then((r) => r.tags), []);
  const [kind, setKind] = useState<Kind>('claimable');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function deactivate(t: Tag): Promise<void> {
    const yes = await dialogs.confirm({
      title: `Deactivate “${t.label}”?`,
      body: 'It disappears from every profile and from the list people choose from. Who had it is kept; the panel cannot switch it back on.',
      confirmLabel: 'Deactivate',
      tone: 'danger',
      typed: { phrase: t.key, label: `Type the key, ${t.key}, to confirm` },
    });
    if (!yes) return;
    setBusy(t.key);
    try {
      await api(`/admin/tags/${encodeURIComponent(t.key)}`, { method: 'DELETE' });
      toast.success(`Deactivated “${t.label}”.`);
      await tags.reload();
    } catch (err) {
      toast.error(errorLine(err, 'tags'));
    } finally {
      setBusy(null);
    }
  }

  const rows = tags.data ? tags.data.filter((t) => t.kind === kind) : null;
  const columns: Column<Tag>[] = [
    {
      key: 'label',
      header: 'Tag',
      card: 'title',
      sort: (a, b) => a.label.localeCompare(b.label),
      cell: (t) => (
        <>
          <strong>{t.label}</strong>
          <span className="cell-sub">
            <code>{t.key}</code>
          </span>
        </>
      ),
    },
    { key: 'category', header: 'Category', sort: (a, b) => a.category.localeCompare(b.category), cell: (t) => <Badge>{t.category}</Badge> },
    { key: 'how', header: 'How people get it', cell: (t) => HOW[t.acquisition] ?? t.acquisition },
    {
      key: 'sensitive',
      header: 'Personal',
      cell: (t) => (t.sensitive ? <Badge tone="warn" title="Personal data: claiming it asks for consent">Personal data</Badge> : <span className="subtle">No</span>),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Tags & badges"
        subtitle="The identity tags a profile can show: one main tag, chosen by precedence, and the claimable ones people pick for themselves."
        actions={
          <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
            New tag
          </Button>
        }
      />
      <Tabs
        label="Kind"
        value={kind}
        onChange={setKind}
        items={[
          { key: 'claimable', label: 'Claimable', count: tags.data?.filter((t) => t.kind === 'claimable').length },
          { key: 'main', label: 'Main (by precedence)', count: tags.data?.filter((t) => t.kind === 'main').length },
        ]}
      />
      <Section flush>
        <Table
          caption={kind === 'main' ? 'Main tags' : 'Claimable tags'}
          columns={columns}
          rows={rows}
          rowKey={(t) => t.id}
          loading={tags.loading}
          error={tags.error}
          onRetry={() => void tags.reload()}
          what="tags"
          empty={kind === 'main' ? 'No main tags.' : 'No claimable tags yet.'}
          actions={(t) => (
            <Button variant="danger" onClick={() => void deactivate(t)} disabled={busy === t.key}>
              Deactivate
            </Button>
          )}
        />
      </Section>
      <NewTag
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={async (t) => {
          setCreating(false);
          setKind(t.kind);
          toast.success(`Created “${t.label}”.`);
          await tags.reload();
        }}
      />
    </div>
  );
}

function NewTag({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (t: Tag) => Promise<void> }): React.JSX.Element {
  const [key, setKey] = useState('');
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<Kind>('claimable');
  const [category, setCategory] = useState('custom');
  const [acquisition, setAcquisition] = useState<Acquisition>('self_claim');
  const [sensitive, setSensitive] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      const t = await api<Tag>('/admin/tags', {
        method: 'POST',
        body: { key: key.trim(), label: label.trim(), kind, category: category.trim(), acquisition, sensitive },
      });
      setKey('');
      setLabel('');
      await onCreated({ ...t, kind });
    } catch (err) {
      setProblem(errorLine(err, 'tags'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="New tag"
      footer={
        <FormActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="new-tag" busy={busy}>
            {busy ? 'Creating…' : 'Create tag'}
          </Button>
        </FormActions>
      }
    >
      <form id="new-tag" className="form" onSubmit={(e) => void submit(e)}>
        <FieldRow>
          <TextInput label="Label" hint="What profiles show." value={label} onChange={(e) => setLabel(e.target.value)} required maxLength={80} placeholder="Poet" data-autofocus />
          <TextInput
            label="Key"
            hint="Lower case, for the code. Cannot be changed."
            value={key}
            onChange={(e) => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            required
            maxLength={40}
            placeholder="poet"
            autoCapitalize="off"
            spellCheck={false}
          />
        </FieldRow>
        <FieldRow>
          <Select
            label="Kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as Kind)}
            options={[
              { value: 'claimable', label: 'Claimable — people pick it' },
              { value: 'main', label: 'Main — one per profile' },
            ]}
          />
          <TextInput label="Category" value={category} onChange={(e) => setCategory(e.target.value)} required maxLength={40} />
        </FieldRow>
        <Select
          label="How people get it"
          value={acquisition}
          onChange={(e) => setAcquisition(e.target.value as Acquisition)}
          options={(Object.keys(HOW) as Acquisition[]).map((a) => ({ value: a, label: HOW[a] }))}
        />
        <Checkbox
          label="Personal data"
          hint="Something like religion or health: claiming it asks for the person’s consent first."
          checked={sensitive}
          onChange={setSensitive}
        />
        {problem && (
          <p className="field-error" role="alert">
            {problem}
          </p>
        )}
      </form>
    </Drawer>
  );
}
