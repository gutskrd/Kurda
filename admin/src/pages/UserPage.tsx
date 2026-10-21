import { useState } from 'react';
import type { AdminUserModeration, AdminUserReport, AgeBadge, ApplySanctionRequest, ApplySanctionResult, AppealStatus, CaseSanctionView } from '@kurda/shared';
import { api } from '../api';
import { useAuth } from '../auth';
import {
  PRIORITY_NAME,
  PRIORITY_TONE,
  categoryName,
  historyLine,
  liftEffect,
  sanctionName,
  statusName,
  statusTone,
  targetName,
} from '../moderation';
import { ROLE_NAME } from '../navigation';
import { useSession } from '../session';
import {
  ActionMenu,
  Badge,
  Button,
  Drawer,
  EmptyState,
  ErrorState,
  FormActions,
  Loading,
  PageHeader,
  Section,
  Table,
  Tabs,
  Time,
  UserLink,
  absoluteTime,
  errorLine,
  useDialogs,
  useLoad,
  useToast,
  type Column,
  type Tone,
} from '../ui';
import { AgeTag, LinkedVia, SanctionLine } from './CasePeople';
import { PERSON_KINDS, SanctionFields, newSanctionDraft, sanctionDraftProblems, type SanctionDraft } from './SanctionParts';
import { ItemsPanel, WalletPanel } from './UserEconomy';
import { BadgesTab, RanksTab } from './UserProgress';
import { holdsRankTools } from '../progress';
import { usersListHref, type BanState } from './Users';

/** `GET /admin/users/:id`: the moderation fields only for a reader who can moderate. */
export interface UserDetail extends Partial<AdminUserModeration> {
  id: string;
  username: string;
  email: string;
  displayName: string | null;
  roles: string[];
  createdAt: string;
  /** older APIs leave it out */
  age?: AgeBadge;
  ban: BanState;
  bannedUntil: string | null;
  mutedUntil: string | null;
  balances: { zer: number; gems: number };
  ledger: Array<{ currency: string; amount: number; reason: string; createdAt: string }>;
  sessions: Array<{ deviceName: string | null; createdAt: string; expiresAt: string }>;
  /** adminUsername: who did it, by name (absent from an older API; null when their account is gone) */
  actions: Array<{ action: string; reason: string; meta: unknown; adminId: string | null; adminUsername?: string | null; createdAt: string }>;
}

type TabKey = 'profile' | 'standing' | 'reports' | 'wallet' | 'items' | 'ranks' | 'badges' | 'sessions' | 'audit';

/**
 * One person (#/users/<id>/<tab>): who they are, where they stand — the
 * sanctions in force and before, their appeals, the cases about them, with
 * a sanction to give and each one liftable — the reports about them and the
 * ones they made, their wallet and ledger, what they own, where they are
 * signed in, and what admins have done to the account.
 *
 * Support staff open the page too, without what moderation knows (the API
 * leaves it out for them), so the Standing and Reports tabs are for
 * moderators only; balances and items change only for a superadmin. Their
 * game ranks and badges are for the legacy admin role and superadmin, the
 * roles every rank and badge route is guarded by.
 */
export function UserPage({ id, tab }: { id: string; tab?: string }): React.JSX.Element {
  const loaded = useLoad(() => api<UserDetail>(`/admin/users/${encodeURIComponent(id)}`), [id]);
  const session = useSession();
  const u = loaded.data;
  const canModerate = session.capabilities.includes('moderation.act');
  const canAdjust = session.staffRoles.includes('superadmin');
  const rankTools = holdsRankTools(session.staffRoles);
  const moderation = !!u && u.sanctions !== undefined;

  const tabs: Array<{ key: TabKey; label: string; count?: number }> = [
    { key: 'profile', label: 'Profile' },
    ...(moderation
      ? [
          { key: 'standing' as const, label: 'Standing', count: u!.sanctions!.filter((s) => s.active || s.pendingApproval).length || undefined },
          { key: 'reports' as const, label: 'Reports', count: u!.reportsAgainst!.length || undefined },
        ]
      : []),
    { key: 'wallet', label: 'Wallet & ledger' },
    { key: 'items', label: 'Items' },
    ...(rankTools ? [{ key: 'ranks' as const, label: 'Ranks' }, { key: 'badges' as const, label: 'Badges' }] : []),
    { key: 'sessions', label: 'Sessions', count: u?.sessions.length || undefined },
    { key: 'audit', label: 'Audit' },
  ];
  const current: TabKey = tabs.some((t) => t.key === tab) ? (tab as TabKey) : 'profile';
  const back = { href: usersListHref(), label: 'Users' };

  if (loaded.error != null && !u) {
    return (
      <div>
        <PageHeader back={back} title="Person" />
        <ErrorState error={loaded.error} onRetry={() => void loaded.reload()} what="people" />
      </div>
    );
  }
  if (!u) {
    return (
      <div>
        <PageHeader back={back} title="Person" />
        <Loading rows={5} label="Loading this person…" />
      </div>
    );
  }

  const reload = (): void => void loaded.reload();
  const base = `#/users/${encodeURIComponent(u.id)}`;
  return (
    <div>
      <PageHeader
        back={back}
        title={`@${u.username}`}
        subtitle={u.displayName && u.displayName !== u.username ? u.displayName : undefined}
        meta={
          <>
            {standingBadge(u)}
            {u.age && <AgeTag age={u.age} />}
            {u.roles
              .filter((r) => Object.hasOwn(ROLE_NAME, r))
              .map((r) => (
                <Badge key={r} tone="info">
                  {ROLE_NAME[r]}
                </Badge>
              ))}
          </>
        }
      />
      <Tabs
        label="About this person"
        className="user-tabs"
        idBase="user"
        value={current}
        items={tabs.map((t) => ({ key: t.key, label: t.label, count: t.count, href: t.key === 'profile' ? base : `${base}/${t.key}` }))}
      />
      {loaded.error != null && <ErrorState error={loaded.error} onRetry={reload} what="people" compact />}
      <div role="tabpanel" id="user-panel" aria-labelledby={`user-tab-${current}`}>
        {current === 'profile' && <ProfileTab user={u} />}
        {current === 'standing' && moderation && <StandingTab user={u} canModerate={canModerate} onChanged={reload} />}
        {current === 'reports' && moderation && <ReportsTab user={u} />}
        {current === 'wallet' && <WalletPanel user={u} canAdjust={canAdjust} onChanged={reload} />}
        {current === 'items' && <ItemsPanel user={u} canAdjust={canAdjust} />}
        {current === 'ranks' && rankTools && <RanksTab user={u} />}
        {current === 'badges' && rankTools && <BadgesTab user={u} />}
        {current === 'sessions' && <SessionsTab user={u} canModerate={canModerate} onChanged={reload} />}
        {current === 'audit' && <AuditTab user={u} />}
      </div>
    </div>
  );
}

/**
 * The one badge that says where the account stands, beside the name. "Active"
 * only when nothing limits it: a posting mute or a feature limit is "Limited",
 * so a moderator scanning the header is never told an account is free when it
 * is not. (Support staff get no sanctions with the page; for them a limit
 * cannot show, and the header says only what the account record says.)
 */
function standingBadge(u: UserDetail): React.JSX.Element {
  if (u.ban === 'perm_banned') return <Badge tone="bad">Banned</Badge>;
  if (u.ban === 'temp_banned') return <Badge tone="bad">Suspended</Badge>;
  if (u.mutedPermanently || (u.mutedUntil && new Date(u.mutedUntil).getTime() > Date.now())) return <Badge tone="warn">Muted</Badge>;
  if (limitsInForce(u).length > 0) return <Badge tone="warn">Limited</Badge>;
  return <Badge tone="ok">Active</Badge>;
}

function ProfileTab({ user: u }: { user: UserDetail }): React.JSX.Element {
  const ageText: Record<AgeBadge, string> = { minor: 'Under 18', adult: '18 or over', unknown: 'No birth year on the account' };
  return (
    <>
      <Section title="Profile">
        <dl className="facts">
          <div>
            <dt>Username</dt>
            <dd>@{u.username}</dd>
          </div>
          <div>
            <dt>Display name</dt>
            <dd>{u.displayName ?? <span className="subtle">None</span>}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{u.email}</dd>
          </div>
          {u.age && (
            <div>
              <dt>Age</dt>
              <dd>{ageText[u.age]}</dd>
            </div>
          )}
          <div>
            <dt>Joined</dt>
            <dd>
              <Time value={u.createdAt} mode="absolute" />
            </dd>
          </div>
          <div>
            <dt>Roles</dt>
            <dd>{u.roles.length ? u.roles.map((r) => ROLE_NAME[r] ?? r).join(', ') : <span className="subtle">None</span>}</dd>
          </div>
          <div>
            <dt>Id</dt>
            <dd className="mono">{u.id}</dd>
          </div>
        </dl>
      </Section>
      {u.linkedAccounts && u.linkedAccounts.length > 0 && (
        <Section
          title="Accounts on the same device or network"
          description="A shared network means seen there within two days of each other while few others used it — often a family. A shared device says more."
        >
          <ul className="link-list">
            {u.linkedAccounts.map((a) => (
              <li key={a.id}>
                <UserLink user={a} />
                <LinkedVia link={a} />
                {a.banned && <Badge tone="bad">Banned</Badge>}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}

/** A posting mute or a feature limit in force now: the account works, but not all of it. */
function limitsInForce(u: UserDetail): NonNullable<UserDetail['sanctions']> {
  return (u.sanctions ?? []).filter((s) => s.active && !s.pendingApproval && (s.kind === 'post_mute' || s.kind === 'feature_limit'));
}

/** Where they stand, in a line: what stops them now, and until when. */
export function standingLine(u: UserDetail, now = new Date()): string {
  const parts: string[] = [];
  if (u.ban === 'perm_banned') parts.push('Banned for good');
  else if (u.ban === 'temp_banned') parts.push(`Suspended until ${u.bannedUntil ? absoluteTime(new Date(u.bannedUntil)) : 'further notice'}`);
  if (u.mutedPermanently) parts.push('Can’t send messages, with no end');
  else if (u.mutedUntil && new Date(u.mutedUntil).getTime() > now.getTime()) parts.push(`Can’t send messages until ${absoluteTime(new Date(u.mutedUntil))}`);
  for (const s of limitsInForce(u)) parts.push(`${sanctionName(s.kind)}${s.endsAt ? ` until ${absoluteTime(new Date(s.endsAt))}` : ''}`);
  return parts.length ? parts.join(' · ') : 'In good standing: nothing limits this account.';
}

const APPEAL_TONE: Readonly<Record<AppealStatus, Tone>> = { open: 'info', upheld: 'neutral', overturned: 'ok', modified: 'warn' };
const APPEAL_NAME: Readonly<Record<AppealStatus, string>> = { open: 'Waiting', upheld: 'Upheld', overturned: 'Overturned', modified: 'Changed' };

function StandingTab({ user: u, canModerate, onChanged }: { user: UserDetail; canModerate: boolean; onChanged: () => void }): React.JSX.Element {
  const dialogs = useDialogs();
  const toast = useToast();
  const { me } = useAuth();
  const [sanctioning, setSanctioning] = useState(false);
  const self = !!me && me.id === u.id;
  const sanctions = u.sanctions ?? [];
  const current = sanctions.filter((s) => (s.active || s.pendingApproval) && !s.revokedAt);
  const past = sanctions.filter((s) => !current.includes(s));
  const muted = u.mutedPermanently || (!!u.mutedUntil && new Date(u.mutedUntil).getTime() > Date.now());
  const autoMuted = !!u.chatOffenses && (u.chatOffenses.permanent || (!!u.chatOffenses.mutedUntil && new Date(u.chatOffenses.mutedUntil).getTime() > Date.now()));

  async function withReason(opts: { title: string; body: string; confirmLabel: string; run: (reason: string) => Promise<string> }): Promise<void> {
    const reason = await dialogs.prompt({ title: opts.title, label: 'Why (for the record)', body: opts.body, multiline: true, maxLength: 2000, confirmLabel: opts.confirmLabel });
    if (!reason) return;
    try {
      toast.success(await opts.run(reason));
      onChanged();
    } catch (err) {
      toast.error(errorLine(err, 'moderation'));
    }
  }

  const lift = (s: CaseSanctionView): Promise<void> =>
    withReason({
      title: `Lift this ${s.kind === 'permanent_ban' ? 'ban' : sanctionName(s.kind).toLowerCase()}?`,
      body: liftEffect(s.kind, `@${u.username}`),
      confirmLabel: 'Lift it',
      run: async (reason) => {
        await api(`/admin/sanctions/${s.id}/revoke`, { method: 'POST', body: { reason } });
        return 'Lifted.';
      },
    });

  return (
    <>
      <Section
        title="Standing"
        actions={
          canModerate && !self ? (
            <Button variant="primary" icon="plus" onClick={() => setSanctioning(true)}>
              Sanction…
            </Button>
          ) : undefined
        }
      >
        <p className="standing-summary">
          {standingBadge(u)} <span>{standingLine(u)}</span>
        </p>
        {canModerate && !self && (u.ban !== 'active' || muted || autoMuted) && (
          <div className="quick-actions">
            {u.ban !== 'active' && (
              <Button
                onClick={() =>
                  void withReason({
                    title: `Lift the ${u.ban === 'perm_banned' ? 'ban' : 'suspension'} on @${u.username}?`,
                    body: 'They can sign in again at once, and are told it was lifted.',
                    confirmLabel: 'Lift it',
                    run: async (reason) => {
                      await api(`/admin/users/${u.id}/unban`, { method: 'POST', body: { reason } });
                      return 'They can sign in again.';
                    },
                  })
                }
              >
                Lift the {u.ban === 'perm_banned' ? 'ban' : 'suspension'}…
              </Button>
            )}
            {muted && (
              <Button
                onClick={() =>
                  void withReason({
                    title: `Lift the mute on @${u.username}?`,
                    // the API lifts every limit with it, not only the chat mute: say so
                    body: 'Every mute and limit in force is lifted with it — on chat, on posting and on features. They can send messages and post again at once.',
                    confirmLabel: 'Lift it',
                    run: async (reason) => {
                      const r = await api<{ lifted: number }>(`/admin/users/${u.id}/unmute`, { method: 'POST', body: { reason } });
                      return r.lifted > 0 ? 'They can send messages again.' : 'There was no mute to lift.';
                    },
                  })
                }
              >
                Lift the mute…
              </Button>
            )}
            {autoMuted && (
              <Button
                onClick={() =>
                  void withReason({
                    title: 'Lift the automatic chat mute?',
                    body: `It came from ${u.chatOffenses!.count} flagged ${u.chatOffenses!.count === 1 ? 'message' : 'messages'}. The count starts again from nothing.`,
                    confirmLabel: 'Lift it',
                    run: async (reason) => {
                      await api(`/admin/users/${u.id}/chat-mute/lift`, { method: 'POST', body: { reason } });
                      return 'The automatic mute is lifted.';
                    },
                  })
                }
              >
                Lift the automatic chat mute…
              </Button>
            )}
          </div>
        )}
        {u.chatOffenses && u.chatOffenses.count > 0 && (
          <p className="note">
            {u.chatOffenses.count} {u.chatOffenses.count === 1 ? 'message was' : 'messages were'} flagged automatically
            {u.chatOffenses.permanent ? '; the automatic mute has no end.' : '.'}
          </p>
        )}
        {self && <p className="note">This is your own account: someone else handles it.</p>}
      </Section>

      <Section title="In force now">
        {current.length === 0 ? (
          <p className="section-text subtle">Nothing.</p>
        ) : (
          <ul className="sanction-list">
            {current.map((s) => (
              <SanctionLine
                key={s.id}
                s={s}
                link={s.caseId ? <CaseLink id={s.caseId} /> : undefined}
                actions={
                  canModerate && !self ? (
                    <ActionMenu label={`More for the ${sanctionName(s.kind).toLowerCase()}`} items={[{ label: 'Lift it…', onSelect: () => void lift(s), tone: 'danger' }]} />
                  ) : undefined
                }
              />
            ))}
          </ul>
        )}
      </Section>

      {past.length > 0 && (
        <Section title="Before">
          <ul className="sanction-list">
            {past.map((s) => (
              <SanctionLine key={s.id} s={s} link={s.caseId ? <CaseLink id={s.caseId} /> : undefined} />
            ))}
          </ul>
        </Section>
      )}

      <Section title="Appeals">
        {(u.appeals ?? []).length === 0 ? (
          <p className="section-text subtle">They have not asked for a review.</p>
        ) : (
          <ol className="appeal-list">
            {u.appeals!.map((a) => (
              <li key={a.id} className="appeal">
                <div className="appeal-head">
                  <Badge tone={APPEAL_TONE[a.status]}>{APPEAL_NAME[a.status]}</Badge>
                  <Time value={a.createdAt} />
                  {a.status === 'open' && <a href="#/appeals">Answer it in Appeals</a>}
                </div>
                <blockquote className="appeal-text" dir="auto">
                  {a.text}
                </blockquote>
                {a.decisionNote && (
                  <p className="fb-note" dir="auto">
                    <strong>Answer:</strong> {a.decisionNote}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section title="Cases about them">
        {(u.cases ?? []).length === 0 ? (
          <p className="section-text subtle">None.</p>
        ) : (
          <ul className="link-list">
            {u.cases!.map((c) => (
              <li key={c.id}>
                <a href={`#/moderation/${c.id}`}>{categoryName(c.category)}</a>
                <Badge tone={PRIORITY_TONE[c.priority]}>{PRIORITY_NAME[c.priority]}</Badge>
                <Badge tone={statusTone(c.status)}>{statusName(c.status)}</Badge>
                <Time value={c.createdAt} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      {sanctioning && <SanctionDrawer user={u} onClose={() => setSanctioning(false)} onDone={() => { setSanctioning(false); onChanged(); }} />}
    </>
  );
}

function CaseLink({ id }: { id: string | null }): React.JSX.Element | null {
  return id ? <a href={`#/moderation/${id}`}>Open the case</a> : null;
}

/**
 * A sanction straight from the person's page, under the same rules as a
 * case decision: a permanent ban waits for a second moderator when there is
 * one (the account is suspended meanwhile), applies at once for child
 * safety, and is confirmed by typing the username — which the only
 * moderator must do, and everyone does here, because a ban for life is not
 * a click.
 */
function SanctionDrawer({ user: u, onClose, onDone }: { user: UserDetail; onClose: () => void; onDone: () => void }): React.JSX.Element {
  const [draft, setDraft] = useState<SanctionDraft>(() => newSanctionDraft('warning'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const dialogs = useDialogs();
  const toast = useToast();
  const problems = sanctionDraftProblems(draft);
  const who = `@${u.username}`;

  async function send(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setTried(true);
    if (problems.length > 0) return;
    let confirmUsername: string | undefined;
    if (draft.kind === 'permanent_ban') {
      const yes = await dialogs.confirm({
        title: `Ban ${who} for good?`,
        body: (
          <div className="dialog-text">
            <p>
              When there is another moderator, the ban waits up to 72 hours for them to approve it and the account is suspended meanwhile. A child-safety
              ban applies at once.
            </p>
            <p>They are signed out everywhere, and their email can’t be used to sign up again. They can ask for a review.</p>
          </div>
        ),
        confirmLabel: 'Ban for good',
        tone: 'danger',
        typed: { phrase: u.username, label: `Type ${u.username} to confirm` },
      });
      if (!yes) return;
      confirmUsername = u.username;
    } else if (draft.kind === 'suspension') {
      const yes = await dialogs.confirm({
        title: `Suspend ${who}?`,
        body: 'They are signed out everywhere and can’t sign in until it ends. They are told why, and can ask for a review.',
        confirmLabel: 'Suspend',
        tone: 'danger',
      });
      if (!yes) return;
    }
    setBusy(true);
    setError(null);
    const body: ApplySanctionRequest = {
      kind: draft.kind,
      policy: draft.policy as ApplySanctionRequest['policy'],
      statement: draft.statement.trim(),
      ...(draft.kind === 'warning' || draft.kind === 'permanent_ban' ? {} : { durationHours: draft.durationHours }),
      ...(draft.internalNote.trim() ? { internalNote: draft.internalNote.trim() } : {}),
      ...(confirmUsername ? { confirmUsername } : {}),
    };
    try {
      const res = await api<ApplySanctionResult>(`/admin/users/${u.id}/sanctions`, { method: 'POST', body });
      toast.success(
        res.pendingApproval
          ? 'Sent. The ban waits for a second moderator; the account is suspended until then.'
          : `${sanctionName(draft.kind)} given. ${who} has been told why.`,
      );
      onDone();
    } catch (err) {
      setError(errorLine(err, 'moderation'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={`Sanction ${who}`}
      footer={
        <FormActions>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <Button type="submit" form="user-sanction" variant={draft.kind === 'permanent_ban' || draft.kind === 'suspension' ? 'danger' : 'primary'} busy={busy}>
            {draft.kind === 'permanent_ban' ? 'Ban for good…' : `Give the ${sanctionName(draft.kind).toLowerCase()}`}
          </Button>
        </FormActions>
      }
    >
      <form id="user-sanction" className="form" noValidate onSubmit={(e) => void send(e)}>
        <p className="section-text">For something a case doesn’t cover. When a report is about it, decide it on the case instead: the reporters are told the outcome there.</p>
        <SanctionFields draft={draft} onChange={setDraft} who={who} kinds={PERSON_KINDS} />
        {tried && problems.length > 0 && (
          <ul className="decision-problems" aria-live="polite">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </Drawer>
  );
}

const REPORT_STATUS: Readonly<Record<string, { name: string; tone: Tone }>> = {
  open: { name: 'Open', tone: 'info' },
  actioned: { name: 'Action taken', tone: 'ok' },
  no_violation: { name: 'No rule broken', tone: 'neutral' },
};

const REPORT_COLUMNS: ReadonlyArray<Column<AdminUserReport>> = [
  { key: 'rule', header: 'Rule', card: 'title', cell: (r) => <strong>{categoryName(r.category)}</strong> },
  { key: 'what', header: 'About', cell: (r) => targetName(r.targetType) },
  {
    key: 'status',
    header: 'Outcome',
    cell: (r) => {
      const s = REPORT_STATUS[r.status] ?? { name: r.status, tone: 'neutral' as Tone };
      return <Badge tone={s.tone}>{s.name}</Badge>;
    },
  },
  { key: 'when', header: 'When', sort: (a, b) => a.createdAt.localeCompare(b.createdAt), cell: (r) => <Time value={r.createdAt} /> },
];

/** "4 of 6 decided reports led to action" — how far to trust what they report. */
export function reportAccuracy(filed: readonly AdminUserReport[]): string | null {
  const decided = filed.filter((r) => r.status !== 'open');
  if (decided.length === 0) return null;
  const acted = decided.filter((r) => r.status === 'actioned').length;
  return `${acted} of ${decided.length} decided ${decided.length === 1 ? 'report' : 'reports'} led to action.`;
}

function ReportsTab({ user: u }: { user: UserDetail }): React.JSX.Element {
  const accuracy = reportAccuracy(u.reportsFiled ?? []);
  const caseLink = (r: AdminUserReport): React.ReactNode =>
    r.caseId ? (
      <a className="button-link" href={`#/moderation/${r.caseId}`}>
        Open the case
      </a>
    ) : null;
  return (
    <>
      <Section title="Reports about them" flush>
        <Table caption="Reports about them" columns={REPORT_COLUMNS} rows={u.reportsAgainst ?? []} rowKey={(r) => r.id} empty="Nobody has reported them." actions={caseLink} />
      </Section>
      <Section title="Reports they made" description={accuracy ?? undefined} flush>
        <Table caption="Reports they made" columns={REPORT_COLUMNS} rows={u.reportsFiled ?? []} rowKey={(r) => r.id} empty="They have not reported anyone." actions={caseLink} />
      </Section>
    </>
  );
}

function SessionsTab({ user: u, canModerate, onChanged }: { user: UserDetail; canModerate: boolean; onChanged: () => void }): React.JSX.Element {
  const dialogs = useDialogs();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function revoke(): Promise<void> {
    const yes = await dialogs.confirm({
      title: `Sign @${u.username} out everywhere?`,
      body: 'Every app and browser they are signed in on asks them to sign in again. Nothing else changes.',
      confirmLabel: 'Sign out everywhere',
      tone: 'danger',
    });
    if (!yes) return;
    setBusy(true);
    try {
      const r = await api<{ revoked: number }>(`/admin/users/${u.id}/sessions/revoke`, { method: 'POST' });
      toast.success(r.revoked === 1 ? 'Signed out of 1 session.' : `Signed out of ${r.revoked} sessions.`);
      onChanged();
    } catch (err) {
      toast.error(errorLine(err, 'moderation'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Section
      title="Where they are signed in"
      description="Each app or browser that stays signed in. A sanction that closes the account signs them out by itself."
      actions={
        canModerate ? (
          <Button variant="danger" onClick={() => void revoke()} busy={busy} disabled={u.sessions.length === 0}>
            Sign out everywhere
          </Button>
        ) : undefined
      }
    >
      {u.sessions.length === 0 ? (
        <EmptyState title="Not signed in anywhere" icon="lock" compact />
      ) : (
        <ul className="link-list">
          {u.sessions.map((s, i) => (
            <li key={`${s.createdAt}-${i}`}>
              <strong>{s.deviceName || 'A device without a name'}</strong>
              <span className="subtle">
                signed in <Time value={s.createdAt} />
              </span>
              <span className="subtle">
                until <Time value={s.expiresAt} mode="date" />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function AuditTab({ user: u }: { user: UserDetail }): React.JSX.Element {
  return (
    <Section title="What admins did to this account" description="The latest 20, newest first.">
      {u.actions.length === 0 ? (
        <EmptyState title="Nothing yet" icon="list" compact />
      ) : (
        <ol className="history-list">
          {u.actions.map((a, i) => (
            <li key={`${a.createdAt}-${i}`}>
              <Time value={a.createdAt} mode="absolute" />
              <span>
                <strong>{historyLine(a.action)}</strong> · {a.adminId ? <UserLink user={{ id: a.adminId, username: a.adminUsername }} /> : 'automatic'}
              </span>
              {a.reason && (
                <span className="cell-sub" dir="auto">
                  {a.reason}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}
