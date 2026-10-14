import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useRoute } from '../nav';
import { ROLE_NAME } from '../navigation';
import { Badge, Icon, PageHeader, Section, Table, Time, useDebounced, useLoad, type Column } from '../ui';
import { UserPage } from './UserPage';

export type BanState = 'active' | 'temp_banned' | 'perm_banned';

interface UserRow {
  id: string;
  username: string;
  email: string;
  ban: BanState;
  /** a chat mute in force now */
  muted: boolean;
  /** a posting mute or a feature limit in force now (absent from an older API: then not known, not shown) */
  limited?: boolean;
  roles: string[];
  createdAt: string;
}

/** How many rows a page of the list holds. Matches the API default. */
export const USERS_PAGE = 25;

const FILTERS = [
  { value: '', label: 'Everyone' },
  { value: 'restricted', label: 'Suspended or banned now' },
  { value: 'muted', label: 'Muted now' },
  { value: 'staff', label: 'Staff' },
] as const;

/** The API path for a page of the list. */
export function usersPath(q: string, filter: string, page: number): string {
  const p = new URLSearchParams({ limit: String(USERS_PAGE), offset: String(page * USERS_PAGE) });
  if (q.trim()) p.set('q', q.trim());
  if (filter) p.set('filter', filter);
  return `/admin/users?${p}`;
}

/** The list's state as the address's query, the defaults left out. */
function listQuery(q: string, filter: string, page: number): string {
  const p = new URLSearchParams();
  if (q.trim()) p.set('q', q.trim());
  if (filter) p.set('filter', filter);
  if (page > 0) p.set('page', String(page + 1));
  return p.toString();
}

function goList(q: string, filter: string, page: number): void {
  const query = listQuery(q, filter, page);
  location.replace(`#/users${query ? `?${query}` : ''}`);
}

/**
 * People: the list (#/users), and one person (#/users/<id>, with a tab
 * after it: #/users/<id>/standing).
 *
 * The list loads itself, newest first — the account you need is usually the
 * one that just signed up — with the real total, a search (a username, an
 * email, or an id) and a filter for who is suspended, muted or staff right
 * now. Search, filter and page live in the address, so Back from a person
 * returns to the same page of the same search.
 */
export function Users(): React.JSX.Element {
  const route = useRoute();
  const id = route.page === 'users' ? route.rest[0] : undefined;
  return id ? <UserPage key={id} id={id} tab={route.rest[1]} /> : <UserList />;
}

/** The address of the list as it was last left, for the person page's "back". */
let lastList = '#/users';
export function usersListHref(): string {
  return lastList;
}

function UserList(): React.JSX.Element {
  const route = useRoute();
  const applied = route.query.get('q') ?? '';
  const raw = route.query.get('filter') ?? '';
  const filter = FILTERS.some((f) => f.value === raw) ? raw : '';
  const page = Math.max(0, (Number(route.query.get('page')) || 1) - 1);
  const list = useLoad(() => api<{ users: UserRow[]; total: number }>(usersPath(applied, filter, page)), [applied, filter, page]);

  useEffect(() => {
    const query = listQuery(applied, filter, page);
    lastList = `#/users${query ? `?${query}` : ''}`;
  }, [applied, filter, page]);

  // the search box types freely; the list follows once typing pauses, from its first page
  const [q, setQ] = useState(applied);
  const settled = useDebounced(q, 400);
  useEffect(() => {
    if (settled.trim() !== applied) goList(settled, filter, 0);
    // only the typed text moves the address; the rest is already there
  }, [settled]);

  const total = list.data?.total ?? 0;
  const columns = useMemo(() => COLUMNS, []);
  const subtitle = !list.data
    ? 'Everyone with an account, newest first.'
    : `${total.toLocaleString()} ${total === 1 ? 'account' : 'accounts'}${applied ? ` matching “${applied}”` : ''}${filter ? ` · ${FILTERS.find((f) => f.value === filter)!.label.toLowerCase()}` : ''}, newest first.`;

  return (
    <div>
      <PageHeader title="Users" subtitle={subtitle} />
      <Section flush>
        <div className="table-tools" role="search">
          <div className="search-box">
            <Icon name="search" size={16} />
            <input type="search" aria-label="Search people" placeholder="A username, an email, or an id" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <label className="sr-only" htmlFor="users-filter">
            Show
          </label>
          <select id="users-filter" value={filter} onChange={(e) => goList(applied, e.target.value, 0)}>
            {FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          {(applied || filter) && (
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setQ('');
                goList('', '', 0);
              }}
            >
              Show everyone
            </button>
          )}
        </div>
        <Table
          caption="People"
          columns={columns}
          rows={list.data?.users ?? null}
          rowKey={(u) => u.id}
          loading={list.loading}
          error={list.error}
          onRetry={() => void list.reload()}
          what="people"
          empty={applied || filter ? 'Nobody matches. Try part of a username, or an email.' : 'No accounts yet.'}
          paging={{ page, pageCount: Math.max(1, Math.ceil(total / USERS_PAGE)), total, pageSize: USERS_PAGE, onPage: (p) => goList(applied, filter, p) }}
          actions={(u) => (
            <a className="button-link" href={`#/users/${encodeURIComponent(u.id)}`} aria-label={`Open @${u.username}`}>
              Open
              <Icon name="chevronRight" size={16} />
            </a>
          )}
        />
      </Section>
    </div>
  );
}

/**
 * "Banned", "Suspended", "Muted", "Limited" (a posting mute or a feature
 * limit) and staff roles: what someone opening the row should know first.
 * "Active" only when nothing at all limits the account.
 */
export function StatusBadges({
  ban,
  muted,
  limited = false,
  roles,
}: {
  ban: BanState;
  muted: boolean;
  limited?: boolean;
  roles: readonly string[];
}): React.JSX.Element {
  const staff = roles.filter((r) => Object.hasOwn(ROLE_NAME, r));
  return (
    <span className="badges">
      {ban === 'perm_banned' && <Badge tone="bad">Banned</Badge>}
      {ban === 'temp_banned' && <Badge tone="bad">Suspended</Badge>}
      {muted && <Badge tone="warn">Muted</Badge>}
      {limited && <Badge tone="warn">Limited</Badge>}
      {ban === 'active' && !muted && !limited && <Badge tone="ok">Active</Badge>}
      {staff.map((r) => (
        <Badge key={r} tone="info">
          {ROLE_NAME[r]}
        </Badge>
      ))}
    </span>
  );
}

const COLUMNS: ReadonlyArray<Column<UserRow>> = [
  {
    key: 'person',
    header: 'Person',
    card: 'title',
    cell: (u) => (
      <span>
        <a className="table-link" href={`#/users/${encodeURIComponent(u.id)}`}>
          <strong>@{u.username}</strong>
        </a>
        <span className="cell-sub">{u.email}</span>
      </span>
    ),
  },
  { key: 'joined', header: 'Joined', cell: (u) => <Time value={u.createdAt} mode="date" /> },
  { key: 'status', header: 'Status', cell: (u) => <StatusBadges ban={u.ban} muted={u.muted} limited={u.limited} roles={u.roles} /> },
];
