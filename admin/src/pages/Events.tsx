import { useState } from 'react';
import { api, ApiError } from '../api';
import {
  Badge,
  Banner,
  Button,
  Checkbox,
  Drawer,
  FieldRow,
  FormActions,
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
  type Tone,
} from '../ui';

interface GameEvent {
  key: string;
  name: string;
  type: string;
  startsAt: string;
  endsAt: string;
  priority: number;
  theme: string | null;
  quests: unknown[];
  rewards: Record<string, unknown>;
  enabled: boolean;
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** Where an event is in its life, for its badge. */
export function lifecycle(e: Pick<GameEvent, 'enabled' | 'startsAt' | 'endsAt'>, now = Date.now()): { text: string; tone: Tone } {
  if (!e.enabled) return { text: 'Off', tone: 'neutral' };
  if (now < Date.parse(e.startsAt)) return { text: 'Upcoming', tone: 'info' };
  if (now > Date.parse(e.endsAt)) return { text: 'Ended', tone: 'neutral' };
  return { text: 'Live', tone: 'ok' };
}

/** ISO string → value for <input type="datetime-local"> (local, minute precision). */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 16);
}

/** The same JSON whatever order its keys were written in. */
function sameJson(a: unknown, b: unknown): boolean {
  const canon = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canon)
      : v && typeof v === 'object'
        ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon((v as Record<string, unknown>)[k])]))
        : v;
  return JSON.stringify(canon(a)) === JSON.stringify(canon(b));
}

function rewardsText(r: Record<string, unknown>): string {
  const parts = Object.entries(r).map(([k, v]) => `${String(v)} ${k}`);
  return parts.length ? parts.join(', ') : 'Nothing';
}

/**
 * Live events (KUR-089): seasonal and holiday events with their window, theme,
 * quests and rewards — data, so launching one needs no deploy.
 *
 * Saving an event used to delete its quests and rewards (the form never sent
 * them), and a reward could be set here without the second admin the
 * Approvals page exists for. Now an edit keeps both; quests are edited as
 * JSON; a change of rewards goes to Approvals.
 */
export function Events(): React.JSX.Element {
  const toast = useToast();
  const dialogs = useDialogs();
  const list = useLoad(() => api<{ events: GameEvent[] }>('/admin/events').then((r) => r.events), []);
  const [editing, setEditing] = useState<GameEvent | 'new' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function toggle(e: GameEvent): Promise<void> {
    if (e.enabled) {
      const live = lifecycle(e).text === 'Live';
      const yes = await dialogs.confirm({
        title: `Turn “${e.name}” off?`,
        body: live ? 'It is live: it disappears from the app at once, quests and all. Turning it on again brings it back.' : 'It will not appear in its window until it is turned on again.',
        confirmLabel: 'Turn off',
        tone: live ? 'danger' : 'default',
      });
      if (!yes) return;
    }
    setBusy(e.key);
    try {
      await api(`/admin/events/${encodeURIComponent(e.key)}/enabled`, { method: 'POST', body: { enabled: !e.enabled } });
      toast.success(`“${e.name}” is ${e.enabled ? 'off' : 'on'}.`);
      await list.reload();
    } catch (err) {
      toast.error(errorLine(err, 'live events'));
    } finally {
      setBusy(null);
    }
  }

  const columns: Column<GameEvent>[] = [
    {
      key: 'name',
      header: 'Event',
      card: 'title',
      sort: (a, b) => a.name.localeCompare(b.name),
      cell: (e) => (
        <>
          <strong>{e.name}</strong>
          <span className="cell-sub">
            <code>{e.key}</code> · {e.type}
          </span>
        </>
      ),
    },
    {
      key: 'window',
      header: 'When',
      sort: (a, b) => a.startsAt.localeCompare(b.startsAt),
      cell: (e) => (
        <>
          {fmt(e.startsAt)}
          <span className="cell-sub">to {fmt(e.endsAt)}</span>
        </>
      ),
    },
    {
      key: 'gives',
      header: 'Quests · rewards',
      cell: (e) => (
        <>
          {e.quests.length} {e.quests.length === 1 ? 'quest' : 'quests'}
          <span className="cell-sub">Gives {rewardsText(e.rewards).toLowerCase()}</span>
        </>
      ),
    },
    {
      key: 'state',
      header: 'State',
      cell: (e) => {
        const l = lifecycle(e);
        return <Badge tone={l.tone}>{l.text}</Badge>;
      },
    },
  ];

  return (
    <div>
      <PageHeader
        title="Live events"
        subtitle="Seasonal and holiday events: their window, theme, quests and rewards. A change takes effect without a deploy."
        actions={
          <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>
            New event
          </Button>
        }
      />
      <Section flush>
        <Table
          caption="Live events"
          columns={columns}
          rows={list.data ?? null}
          rowKey={(e) => e.key}
          loading={list.loading}
          error={list.error}
          onRetry={() => void list.reload()}
          what="live events"
          empty="No events yet."
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
        <EventForm
          key={editing === 'new' ? 'new' : editing.key}
          event={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async (message) => {
            setEditing(null);
            toast.success(message);
            await list.reload();
          }}
        />
      )}
    </div>
  );
}

function EventForm({ event, onClose, onSaved }: { event: GameEvent | null; onClose: () => void; onSaved: (message: string) => Promise<void> }): React.JSX.Element {
  const now = new Date();
  const [key, setKey] = useState(event?.key ?? '');
  const [name, setName] = useState(event?.name ?? '');
  const [type, setType] = useState(event?.type ?? 'seasonal');
  const [startsAt, setStartsAt] = useState(toLocalInput(event?.startsAt ?? now.toISOString()));
  const [endsAt, setEndsAt] = useState(toLocalInput(event?.endsAt ?? new Date(now.getTime() + 7 * 86_400_000).toISOString()));
  const [priority, setPriority] = useState(String(event?.priority ?? 0));
  const [theme, setTheme] = useState(event?.theme ?? '');
  const [enabled, setEnabled] = useState(event?.enabled ?? true);
  const [quests, setQuests] = useState(JSON.stringify(event?.quests ?? [], null, 2));
  const [rewards, setRewards] = useState(JSON.stringify(event?.rewards ?? {}, null, 2));
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setProblem(null);
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(key.trim())) return setProblem('The key is lower case: letters, digits, - and _.');
    if (Date.parse(endsAt) <= Date.parse(startsAt)) return setProblem('The end must be after the start.');
    let questList: unknown;
    let rewardMap: unknown;
    try {
      questList = JSON.parse(quests || '[]');
      rewardMap = JSON.parse(rewards || '{}');
    } catch {
      return setProblem('Quests and rewards must be valid JSON.');
    }
    if (!Array.isArray(questList)) return setProblem('Quests are a JSON array: [ … ].');
    if (!rewardMap || typeof rewardMap !== 'object' || Array.isArray(rewardMap)) return setProblem('Rewards are a JSON object: { "gems": 50 }.');
    const body = {
      key: key.trim(),
      name: name.trim(),
      type: type.trim(),
      startsAt: new Date(startsAt).toISOString(),
      endsAt: new Date(endsAt).toISOString(),
      priority: Number(priority) || 0,
      theme: theme.trim() || null,
      enabled,
      quests: questList,
    };
    const rewardsChanged = !sameJson(rewardMap, event?.rewards ?? {});
    setBusy(true);
    try {
      if (rewardsChanged) {
        // anything that grants currency waits for a second admin
        const res = await api<{ status: 'applied' | 'pending' }>('/admin/config/changes', {
          method: 'POST',
          body: { target: 'event', payload: { ...body, rewards: rewardMap } },
        });
        await onSaved(
          res.status === 'pending'
            ? `“${body.name}” is waiting in Approvals: a second admin signs off on its rewards.`
            : `Saved “${body.name}”.`,
        );
      } else {
        await api('/admin/events', { method: 'POST', body });
        await onSaved(`Saved “${body.name}”.`);
      }
    } catch (err) {
      setProblem(
        err instanceof ApiError && err.code === 'PAST_SCHEDULE'
          ? 'Rewards can only be changed before an event starts: it goes through Approvals, which takes only future events.'
          : errorLine(err, 'live events'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={event ? `Edit “${event.name}”` : 'New event'}
      footer={
        <FormActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="event-form" busy={busy}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </FormActions>
      }
    >
      <form id="event-form" className="form" onSubmit={(e) => void save(e)}>
        <FieldRow>
          <TextInput label="Name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} placeholder="Newroz" />
          <TextInput
            label="Key"
            hint={event ? 'Cannot change.' : 'Lower case, - and _.'}
            value={key}
            readOnly={!!event}
            onChange={(e) => setKey(e.target.value.toLowerCase())}
            required
            maxLength={64}
            autoCapitalize="off"
            spellCheck={false}
            placeholder="newroz_2027"
          />
        </FieldRow>
        <FieldRow>
          <TextInput label="Starts" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
          <TextInput label="Ends" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} required />
        </FieldRow>
        <FieldRow>
          <TextInput label="Kind" hint="seasonal, holiday, sale…" value={type} onChange={(e) => setType(e.target.value)} required maxLength={40} />
          <TextInput label="Priority" hint="Higher shows first." inputMode="numeric" value={priority} onChange={(e) => setPriority(e.target.value.replace(/\D/g, ''))} />
          <TextInput label="Theme" hint="Optional." value={theme} onChange={(e) => setTheme(e.target.value)} maxLength={64} />
        </FieldRow>
        <Textarea
          label="Quests (JSON)"
          hint="A list of quests, as the app reads them. Kept as it is unless you change it."
          className="code-area"
          rows={6}
          spellCheck={false}
          value={quests}
          onChange={(e) => setQuests(e.target.value)}
        />
        <Textarea
          label="Rewards (JSON)"
          hint={'For example { "gems": 50 }. A change of rewards waits in Approvals for a second admin.'}
          className="code-area"
          rows={3}
          spellCheck={false}
          value={rewards}
          onChange={(e) => setRewards(e.target.value)}
        />
        {event && Date.parse(event.startsAt) < Date.now() && (
          <Banner tone="info">It has started: its rewards can no longer change. Everything else can.</Banner>
        )}
        <Checkbox label="On" hint="Off hides it, even in its window." checked={enabled} onChange={setEnabled} />
        {problem && (
          <p className="field-error" role="alert">
            {problem}
          </p>
        )}
      </form>
    </Drawer>
  );
}
