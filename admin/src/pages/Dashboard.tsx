import { ALPHABET_CLIPS, PRIORITY_SLA_HOURS, type AdminFeedbackSummary, type ModerationSummary, type ReportPriority, type SuspiciousPair } from '@kurda/shared';
import { api } from '../api';
import { useAuth } from '../auth';
import { canOpen, NAV, type SessionAccess } from '../navigation';
import { useSession } from '../session';
import { describeAction } from './Audit';
import { isStoryUsage, type Listing } from '../lessonAudio';
import type { AdminStorySummary } from '../stories';
import { Badge, Button, ErrorState, Icon, Loading, PageHeader, Section, Stat, Time, UserLink, duration, relativeTime, useLoad } from '../ui';
import { runState, type LeagueOverview } from '../progress';

/** The guard of the page a tile is about, so a tile only shows to someone who can act on it. */
function allowed(page: string, session: SessionAccess): boolean {
  const entry = NAV.find((n) => n.page === page);
  return entry ? canOpen(entry.access, session) : false;
}

const PRIORITY_NAME: Record<ReportPriority, string> = { 0: 'Urgent', 1: 'High', 2: 'Normal', 3: 'Low' };

/** "within 1 h", "within 3 days" — how soon each priority should be decided. */
function slaLabel(p: ReportPriority): string {
  const h = PRIORITY_SLA_HOURS[p];
  return h < 48 ? `within ${h} h` : `within ${Math.round(h / 24)} days`;
}

/**
 * The start page: what is waiting for a person, for this person's role.
 *
 * Every number links to the page that acts on it. A moderator sees the queue
 * by priority with its oldest case and overdue ones, appeals and second
 * approvals; a content editor what still needs a recording and what is waiting
 * for review; an admin the fraud holds, bot flags and config approvals; a
 * superadmin also the latest admin actions. Each part loads by itself, so one
 * slow or refused request never blanks the rest.
 */
export function Dashboard(): React.JSX.Element {
  const session = useSession();
  const { me } = useAuth();
  const can = (page: string): boolean => allowed(page, session);
  const moderator = session.capabilities.includes('moderation.act');

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={me ? `Signed in as @${me.username}. What is waiting, for the pages your role opens.` : 'What is waiting, for the pages your role opens.'}
        actions={
          <Button icon="refresh" onClick={() => location.reload()}>
            Refresh
          </Button>
        }
      />

      {can('audio') && <Recordings />}
      {moderator && <ModerationPanel />}
      <Waiting
        stories={can('stories')}
        lessons={can('lessons')}
        feedback={can('feedback')}
        fraud={can('fraud')}
        bots={can('antibot')}
        approvals={can('approvals')}
      />
      {(can('leagues') || can('ranks')) && <RanksPanel leagues={can('leagues')} ranks={can('ranks')} />}
      {can('audit') && <RecentAudit />}
    </div>
  );
}

/**
 * What still needs a recording: the owner could not find where to record, so
 * the count is on the first page, and each line goes straight into the studio
 * on the things still missing.
 */
function Recordings(): React.JSX.Element {
  const lessons = useLoad(() => api<Listing>('/admin/lesson-audio'), []);
  const letters = useLoad(() => api<{ recordings: Array<{ key: string }> }>('/admin/alphabet/audio'), []);

  const lettersDone = letters.data ? new Set(letters.data.recordings.map((r) => r.key)) : null;
  const lettersMissing = lettersDone ? ALPHABET_CLIPS.filter((c) => !lettersDone.has(c.key)).length : null;
  const items = lessons.data?.items ?? null;
  const storyMissing = items ? items.filter((i) => !i.recorded && i.usedIn.some(isStoryUsage)).length : null;
  const lessonMissing = items ? items.filter((i) => !i.recorded && i.usedIn.some((u) => !isStoryUsage(u))).length : null;
  const lessonNeeded = items ? items.filter((i) => i.usedIn.some((u) => !isStoryUsage(u))).length : null;
  const storyNeeded = items ? items.filter((i) => i.usedIn.some(isStoryUsage)).length : null;

  const rows = [
    { key: 'letters', label: 'Alphabet: letters and example words', missing: lettersMissing, total: ALPHABET_CLIPS.length, error: letters.error },
    { key: 'lessons', label: 'Lesson sentences and words', missing: lessonMissing, total: lessonNeeded, error: lessons.error },
    { key: 'stories', label: 'Story sentences', missing: storyMissing, total: storyNeeded, error: lessons.error },
  ] as const;
  const firstMissing = rows.find((r) => (r.missing ?? 0) > 0);
  const totalMissing = rows.reduce((n, r) => n + (r.missing ?? 0), 0);
  const loading = lessons.loading || letters.loading;

  return (
    <Section
      title="What still needs a recording"
      description="Native recordings of the alphabet, the lessons’ Kurdish and the stories’ sentences. Until one is recorded, learners hear the synthesised voice or nothing."
      actions={
        firstMissing && (
          <a className="button-link primary" href={`#/audio/${firstMissing.key}?show=missing`}>
            <Icon name="mic" />
            Record what’s missing
          </a>
        )
      }
      className="dash-recordings"
    >
      {loading && totalMissing === 0 && !lessons.data && !letters.data ? (
        <Loading rows={3} />
      ) : (
        <ul className="dash-rec-list">
          {rows.map((r) => (
            <li key={r.key} className="dash-rec">
              <div className="dash-rec-text">
                <span className="dash-rec-label">{r.label}</span>
                {r.error ? (
                  <span className="field-error">Could not count these.</span>
                ) : r.missing === null || r.total === null ? (
                  <span className="subtle">Counting…</span>
                ) : r.missing === 0 ? (
                  <Badge tone="ok">All {r.total} recorded</Badge>
                ) : (
                  <span>
                    <strong className="dash-rec-n">{r.missing}</strong> <span className="subtle">of {r.total} still to record</span>
                  </span>
                )}
              </div>
              {r.total !== null && r.total > 0 && r.missing !== null && (
                <div className="progress" aria-hidden="true">
                  <div className="progress-bar" style={{ width: `${((r.total - r.missing) / r.total) * 100}%` }} />
                </div>
              )}
              <a className="button-link" href={`#/audio/${r.key}${r.missing ? '?show=missing' : ''}`} aria-label={`Record: ${r.label}`}>
                {r.missing ? 'Record' : 'Open'}
                <Icon name="chevronRight" size={16} />
              </a>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function ModerationPanel(): React.JSX.Element {
  const summary = useLoad(() => api<ModerationSummary>('/admin/moderation/summary'), []);
  // how long a case takes to decide, typically; a quiet extra, left out when it can't be read
  const sla = useLoad(() => api<{ medianSeconds: number | null; resolved: number }>('/admin/moderation/sla'), []);
  const s = summary.data;
  return (
    <Section
      title="Moderation"
      description="Open cases by priority, each with the time it should be decided in, counted from the first report."
      actions={
        <a className="button-link" href="#/moderation">
          Open the queue
          <Icon name="chevronRight" size={16} />
        </a>
      }
    >
      {summary.error ? (
        <ErrorState error={summary.error} onRetry={() => void summary.reload()} what="the moderation queue" compact />
      ) : !s ? (
        <Loading rows={2} />
      ) : (
        <>
          <div className="stats">
            {([0, 1, 2, 3] as const).map((p) => (
              <Stat
                key={p}
                label={PRIORITY_NAME[p]}
                value={s.byPriority[p]}
                tone={p === 0 && s.byPriority[0] > 0 ? 'bad' : 'neutral'}
                hint={`Decide ${slaLabel(p)} · ${s.slaBreachesByPriority[p] > 0 ? `${s.slaBreachesByPriority[p]} overdue` : 'none overdue'}`}
                href={`#/moderation?priority=${p}`}
              />
            ))}
          </div>
          <div className="dash-facts">
            <span>
              <strong>{s.open}</strong> open
            </span>
            <span>
              Oldest open: <strong>{s.oldestOpenAgeSeconds === null ? 'none' : duration(s.oldestOpenAgeSeconds)}</strong>
            </span>
            <span className={s.slaBreaches > 0 ? 'is-bad' : undefined}>
              Overdue: <strong>{s.slaBreaches}</strong>
            </span>
            <a href="#/appeals">
              Appeals waiting: <strong>{s.appealsWaiting}</strong>
            </a>
            <a href="#/ban-approvals" className={s.pendingApprovals > 0 ? 'is-warn' : undefined}>
              Bans waiting for a second admin: <strong>{s.pendingApprovals}</strong>
            </a>
            {sla.data && sla.data.medianSeconds !== null && (
              <span>
                Median time to a decision: <strong>{duration(sla.data.medianSeconds)}</strong> (of {sla.data.resolved.toLocaleString()} decided)
              </span>
            )}
            {s.openEscalations > 0 && (
              <span className="is-bad">
                Escalations to file: <strong>{s.openEscalations}</strong>
              </span>
            )}
          </div>
        </>
      )}
    </Section>
  );
}

/** A count for a tile: the number, or why there is none. */
function count<T>(loaded: { data: T | undefined; error: unknown }, pick: (d: T) => number): number | string {
  if (loaded.error) return '—';
  return loaded.data === undefined ? '…' : pick(loaded.data);
}

function Waiting({
  stories,
  lessons,
  feedback,
  fraud,
  bots,
  approvals,
}: {
  stories: boolean;
  lessons: boolean;
  feedback: boolean;
  fraud: boolean;
  bots: boolean;
  approvals: boolean;
}): React.JSX.Element | null {
  const storyList = useLoad(() => (stories ? api<{ stories: AdminStorySummary[] }>('/admin/stories') : Promise.resolve(null)), [stories]);
  const lessonList = useLoad(() => (lessons ? api<{ total: number }>('/admin/content/lessons?status=in_review&limit=1') : Promise.resolve(null)), [lessons]);
  const feedbackSummary = useLoad(() => (feedback ? api<AdminFeedbackSummary>('/admin/feedback/summary') : Promise.resolve(null)), [feedback]);
  const fraudList = useLoad(() => (fraud ? api<{ reviews: unknown[] }>('/admin/fraud/reviews') : Promise.resolve(null)), [fraud]);
  const botList = useLoad(() => (bots ? api<{ flagged: unknown[] }>('/admin/antibot/flagged') : Promise.resolve(null)), [bots]);
  const changes = useLoad(() => (approvals ? api<{ pending: unknown[] }>('/admin/config/changes') : Promise.resolve(null)), [approvals]);

  if (!stories && !lessons && !feedback && !fraud && !bots && !approvals) return null;
  const fb = feedbackSummary.data;
  return (
    <Section title="Waiting for a decision">
      <div className="stats is-flat">
        {stories && (
          <Stat
            icon="story"
            label="Stories in review"
            value={count(storyList, (d) => d!.stories.filter((s) => s.status === 'in_review').length)}
            href="#/stories"
            hint="Published once a reviewer approves"
          />
        )}
        {lessons && (
          <Stat icon="book" label="Lessons in review" value={count(lessonList, (d) => d!.total)} href="#/lessons?status=in_review" hint="Approve or send back" />
        )}
        {feedback && (
          <Stat
            icon="star"
            label="New feedback"
            value={count(feedbackSummary, (d) => d!.byStatus.new)}
            href="#/feedback"
            hint={
              fb
                ? fb.last30Days.averageStars === null
                  ? 'No stars in the last 30 days'
                  : `${fb.last30Days.averageStars.toFixed(1)} ★ average, last 30 days`
                : undefined
            }
          />
        )}
        {fraud && (
          <Stat
            icon="alert"
            label="Purchases on hold"
            value={count(fraudList, (d) => d!.reviews.length)}
            href="#/fraud"
            tone={fraudList.data && fraudList.data.reviews.length > 0 ? 'warn' : 'neutral'}
            hint="Held for a fraud check"
          />
        )}
        {bots && (
          <Stat icon="bot" label="Bot flags" value={count(botList, (d) => d!.flagged.length)} href="#/antibot" hint="Accounts scored as likely bots" />
        )}
        {approvals && (
          <Stat
            icon="approve"
            label="Changes to approve"
            value={count(changes, (d) => d!.pending.length)}
            href="#/approvals"
            hint="Shop and event changes a second admin signs off"
          />
        )}
      </div>
    </Section>
  );
}

/**
 * Whether the weekly league runs went through, and how many rating pairs are
 * worth a look: a settle that failed means nobody was promoted, which nobody
 * else would notice until learners asked.
 */
function RanksPanel({ leagues, ranks }: { leagues: boolean; ranks: boolean }): React.JSX.Element {
  const week = useLoad(() => (leagues ? api<LeagueOverview>('/admin/leagues') : Promise.resolve(null)), [leagues]);
  const pairs = useLoad(() => (ranks ? api<{ pairs: SuspiciousPair[] }>('/admin/ranks/suspicious-pairs') : Promise.resolve(null)), [ranks]);
  const settle = week.data ? runState(week.data.settle) : null;
  const merge = week.data ? runState(week.data.merge) : null;
  const strong = pairs.data ? pairs.data.pairs.filter((p) => p.score >= 5).length : 0;
  return (
    <Section title="Ranks and leagues">
      <div className="stats is-flat">
        {leagues && (
          <>
            <Stat
              icon="waves"
              label="This week’s settle"
              value={week.error ? '—' : settle ? settle.label : '…'}
              tone={settle?.tone === 'bad' || settle?.tone === 'warn' ? settle.tone : 'neutral'}
              hint={week.data?.settle?.finishedAt ? `Finished ${relativeTime(new Date(week.data.settle.finishedAt))}` : 'Runs Monday 00:00 UTC'}
              href="#/leagues"
            />
            <Stat
              icon="waves"
              label="Wednesday merge"
              value={week.error ? '—' : merge ? merge.label : '…'}
              tone={merge?.tone === 'bad' || merge?.tone === 'warn' ? merge.tone : 'neutral'}
              hint={week.data ? `${week.data.groups.filter((g) => !g.mergedInto).length} groups this week` : undefined}
              href="#/leagues"
            />
          </>
        )}
        {ranks && (
          <Stat
            icon="mountain"
            label="Rating pairs to check"
            value={count(pairs, (d) => d!.pairs.length)}
            tone={strong > 0 ? 'warn' : 'neutral'}
            hint={pairs.data ? (strong > 0 ? `${strong} with strong signals` : 'Signals only: nothing acts by itself') : undefined}
            href="#/ranks/pairs"
          />
        )}
      </div>
    </Section>
  );
}

interface AuditEntry {
  id: string;
  adminId: string;
  adminUsername: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  createdAt: string;
}

/** Signing in and setting up 2FA are in the trail too, but they are not what anyone did to Hevalo. */
const SIGN_IN = /^POST \/admin\/(auth|2fa|session)\//;

function RecentAudit(): React.JSX.Element {
  const audit = useLoad(
    () => api<{ entries: AuditEntry[] }>('/admin/audit?limit=60').then((r) => ({ entries: r.entries.filter((e) => !SIGN_IN.test(e.action)).slice(0, 8) })),
    [],
  );
  return (
    <Section
      title="Recent admin actions"
      actions={
        <a className="button-link" href="#/audit">
          Audit log
          <Icon name="chevronRight" size={16} />
        </a>
      }
    >
      {audit.error ? (
        <ErrorState error={audit.error} onRetry={() => void audit.reload()} what="the audit log" compact />
      ) : !audit.data ? (
        <Loading rows={3} />
      ) : audit.data.entries.length === 0 ? (
        <p className="subtle">Nothing yet.</p>
      ) : (
        <ul className="dash-audit">
          {audit.data.entries.map((e) => (
            <li key={e.id}>
              <Time value={e.createdAt} />
              <UserLink user={{ id: e.adminId, username: e.adminUsername }} />
              <span className="dash-audit-action" title={e.action}>
                {(({ verb, where }) => `${verb} · ${where}`)(describeAction(e.action))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
