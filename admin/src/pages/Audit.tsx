import { useEffect, useState } from 'react';
import { api } from '../api';
import { Badge, Button, Checkbox, Drawer, FieldRow, FormActions, PageHeader, Section, Table, TextInput, Time, UserLink, errorLine, useToast, type Column } from '../ui';

interface AuditRow {
  id: string;
  adminId: string;
  adminUsername: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  before: unknown;
  after: unknown;
  reason: string | null;
  requestId: string | null;
  createdAt: string;
}

const PAGE = 100;

interface Filters {
  action: string;
  adminId: string;
  targetId: string;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Signing in and 2FA, and looks that changed nothing: in the trail, but rarely what anyone is looking for. */
const QUIET = /^POST \/admin\/(auth|2fa|session)\/|\((dry run|preview)\)$/;

/** The kinds of action people look for, as the trail spells them (method and route). */
const SUGGESTIONS = [
  'POST /admin/users',
  'POST /admin/moderation/cases',
  'POST /admin/sanctions',
  'PUT /admin/content/lessons',
  'POST /admin/content/lessons',
  'POST /admin/stories',
  'POST /shop/items',
  'PATCH /shop/items',
  'PUT /admin/gem-rules',
  'POST /admin/config/changes',
  'POST /admin/events',
  'POST /admin/experiments',
  'POST /admin/fraud/reviews',
];

/** "POST /admin/users/:id/ban" → "Ban · users" — the verb a person would use, then where. */
export function describeAction(action: string): { verb: string; where: string } {
  const [method = '', path = ''] = action.split(' ');
  const parts = path.split('/').filter((p) => p && p !== 'admin' && !p.startsWith(':'));
  const last = parts[parts.length - 1] ?? '';
  const named = ['ban', 'unban', 'mute', 'unmute', 'warn', 'approve', 'reject', 'publish', 'unpublish', 'archive', 'submit', 'claim', 'release', 'decide', 'resolve', 'revoke', 'enabled', 'rebuild', 'settle', 'clear', 'reverse', 'escalate', 'reopen', 'note', 'stock', 'csam'];
  const verb = named.includes(last)
    ? last === 'enabled'
      ? 'Switch on/off'
      : last.charAt(0).toUpperCase() + last.slice(1)
    : method === 'DELETE'
      ? 'Delete'
      : method === 'PUT' || method === 'PATCH'
        ? 'Change'
        : 'Create';
  const where = (named.includes(last) ? parts.slice(0, -1) : parts).join(' › ').replace(/-/g, ' ');
  const suffix = /\((dry run|preview)\)$/.exec(action)?.[1];
  return { verb: suffix ? `${verb} (${suffix})` : verb, where };
}

/**
 * The audit log (KUR-104): every change an admin made, append-only, for a
 * superadmin. It searched on every keystroke (a half-typed id answered 400)
 * and showed eight characters of each id; now it searches when asked, names
 * people, pages back, and can hide sign-ins and dry runs.
 */
export function Audit(): React.JSX.Element {
  const toast = useToast();
  const [action, setAction] = useState('');
  const [adminId, setAdminId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [quiet, setQuiet] = useState(true);
  const [entries, setEntries] = useState<AuditRow[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [more, setMore] = useState(false);
  const [looking, setLooking] = useState<AuditRow | null>(null);
  const badAdmin = adminId.trim() !== '' && !UUID.test(adminId.trim());

  /** The filters the list on screen was searched with: older entries are paged with these, not with what is typed since. */
  const [applied, setApplied] = useState<Filters>({ action: '', adminId: '', targetId: '' });

  async function load(filters: Filters, beforeId?: string): Promise<void> {
    const params = new URLSearchParams({ limit: String(PAGE) });
    if (filters.action) params.set('action', filters.action);
    if (filters.adminId) params.set('adminId', filters.adminId);
    if (filters.targetId) params.set('targetId', filters.targetId);
    if (beforeId) params.set('beforeId', beforeId);
    setApplied(filters);
    setLoading(true);
    try {
      const res = await api<{ entries: AuditRow[] }>(`/admin/audit?${params}`);
      setEntries((prev) => (beforeId && prev ? [...prev, ...res.entries] : res.entries));
      setMore(res.entries.length === PAGE);
      setError(null);
    } catch (err) {
      if (beforeId) toast.error(errorLine(err, 'the audit log'));
      else setError(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(applied);
    // the first page, once; after that the form asks
  }, []);

  const shown = entries ? entries.filter((e) => !quiet || !QUIET.test(e.action)) : null;
  const columns: Column<AuditRow>[] = [
    { key: 'when', header: 'When', cell: (e) => <Time value={e.createdAt} /> },
    { key: 'who', header: 'Who', cell: (e) => <UserLink user={{ id: e.adminId, username: e.adminUsername }} /> },
    {
      key: 'what',
      header: 'What',
      card: 'title',
      cell: (e) => {
        const d = describeAction(e.action);
        return (
          <>
            <strong>{d.verb}</strong> <span className="subtle">{d.where}</span>
            <span className="cell-sub mono">{e.action}</span>
          </>
        );
      },
    },
    {
      key: 'target',
      header: 'On',
      cell: (e) =>
        !e.targetId ? (
          <span className="subtle">—</span>
        ) : e.targetType === 'user' ? (
          <UserLink user={{ id: e.targetId }} />
        ) : (
          <>
            {e.targetType && <Badge>{e.targetType.replace(/_/g, ' ')}</Badge>} <code>{e.targetId}</code>
          </>
        ),
    },
    { key: 'why', header: 'Reason', cell: (e) => e.reason ?? <span className="subtle">—</span> },
  ];

  return (
    <div>
      <PageHeader title="Audit log" subtitle="Every change an admin made, in order. It cannot be edited or deleted — not even from here." />
      <Section>
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!badAdmin) void load({ action: action.trim(), adminId: adminId.trim(), targetId: targetId.trim() });
          }}
        >
          <FieldRow>
            <TextInput label="Action starts with" hint="Pick one or type: POST /admin/users…" list="audit-actions" value={action} onChange={(e) => setAction(e.target.value)} autoCapitalize="off" spellCheck={false} />
            <TextInput
              label="Admin’s account id"
              value={adminId}
              onChange={(e) => setAdminId(e.target.value)}
              error={badAdmin ? 'A whole account id, or nothing.' : undefined}
              autoCapitalize="off"
              spellCheck={false}
            />
            <TextInput label="Done to (id, key or SKU)" value={targetId} onChange={(e) => setTargetId(e.target.value)} autoCapitalize="off" spellCheck={false} />
          </FieldRow>
          <datalist id="audit-actions">
            {SUGGESTIONS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <FormActions>
            <Checkbox label="Hide sign-ins and dry runs" checked={quiet} onChange={setQuiet} />
            <Button variant="primary" type="submit" icon="search" busy={loading && !more} disabled={badAdmin}>
              Search
            </Button>
          </FormActions>
        </form>
      </Section>
      <Section flush title={shown ? `${shown.length}${more ? '+' : ''} ${shown.length === 1 ? 'entry' : 'entries'}` : 'Entries'}>
        <Table
          caption="Audit log entries"
          columns={columns}
          rows={shown}
          rowKey={(e) => e.id}
          loading={loading}
          error={error}
          onRetry={() => void load(applied)}
          what="the audit log"
          empty="No entries match."
          actions={(e) => <Button onClick={() => setLooking(e)}>Details</Button>}
        />
        {more && entries && (
          <div className="load-more">
            <Button onClick={() => void load(applied, entries[entries.length - 1]!.id)} busy={loading}>
              Older entries
            </Button>
          </div>
        )}
      </Section>
      {looking && (
        <Drawer open onClose={() => setLooking(null)} title={describeAction(looking.action).verb}>
          <dl className="facts">
            {(
              [
                ['When', <Time key="t" value={looking.createdAt} mode="absolute" />],
                ['Who', <UserLink key="u" user={{ id: looking.adminId, username: looking.adminUsername }} />],
                ['Action', <code key="a">{looking.action}</code>],
                ['On', looking.targetId ? `${looking.targetType ?? ''} ${looking.targetId}`.trim() : '—'],
                ['Reason', looking.reason ?? '—'],
                ['Request', <code key="r">{looking.requestId ?? '—'}</code>],
              ] as const
            ).map(([term, value]) => (
              <div key={term} className="facts-row">
                <dt>{term}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {(looking.before != null || looking.after != null) && (
            <>
              <h3 className="drawer-sub">Before and after</h3>
              <pre className="code-block">{JSON.stringify({ before: looking.before, after: looking.after }, null, 2)}</pre>
            </>
          )}
        </Drawer>
      )}
    </div>
  );
}
