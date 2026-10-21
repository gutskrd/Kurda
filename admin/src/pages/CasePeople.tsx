import type { AgeBadge, CaseDetail, CaseReportView, CaseSanctionView, CaseSubjectView } from '@kurda/shared';
import { categoryName, isSnapshot, sanctionName, sanctionPeriod, statusName, statusTone } from '../moderation';
import { Badge, Button, Section, Time, UserLink, absoluteTime, duration } from '../ui';
import { Snapshot } from './CaseEvidence';

/** "Minor", "Adult", "Age not given" — whether a child is involved changes what may be done. */
export function AgeTag({ age }: { age: AgeBadge }): React.JSX.Element {
  if (age === 'minor') return <Badge tone="warn">Minor</Badge>;
  if (age === 'adult') return <Badge>Adult</Badge>;
  return <Badge title="No birth year on the account">Age not given</Badge>;
}

/**
 * How a linked account is linked: "same device", or "same network · 3 days",
 * with what that evidence means on hover. A network only counts when both were
 * seen on it within two days of each other and few other accounts used it,
 * so it reads as a household rather than a phone carrier.
 */
export function LinkedVia({ link }: { link: CaseSubjectView['linkedAccounts'][number] }): React.JSX.Element {
  const last = absoluteTime(new Date(link.lastSeenTogether));
  if (link.via === 'device') {
    return (
      <span className="subtle" title={`Signed up or signed in with the same device. Last: ${last}.`}>
        same device
      </span>
    );
  }
  const days = `${link.days} ${link.days === 1 ? 'day' : 'days'}`;
  return (
    <span
      className="subtle"
      title={`Seen on the same network within 48 hours of each other on ${days}, last ${last}, while few other accounts used it: often one household or a small office. Busy networks — mobile carriers, schools, cafés, VPNs — never count.`}
    >
      same network · {days}
    </span>
  );
}

/** "Account 3 days old" — a brand-new account weighs differently. */
export function AccountAge({ createdAt }: { createdAt: string }): React.JSX.Element {
  const seconds = (Date.now() - new Date(createdAt).getTime()) / 1000;
  return <span className="subtle">Account {seconds < 86_400 * 2 ? `${duration(seconds)} old` : `${Math.round(seconds / 86_400)} days old`}</span>;
}

export function SanctionLine({
  s,
  who,
  actions,
  link,
}: {
  s: CaseSanctionView;
  who?: React.ReactNode;
  actions?: React.ReactNode;
  /** after the dates: where it came from ("Open the case") */
  link?: React.ReactNode;
}): React.JSX.Element {
  return (
    <li className="sanction-line">
      {actions && <div className="sanction-line-actions">{actions}</div>}
      <div className="sanction-line-head">
        <strong>{sanctionName(s.kind)}</strong>
        {who}
        <span className="subtle">{categoryName(s.policy)}</span>
        {s.zeroTolerance && <Badge tone="bad">Zero tolerance</Badge>}
        {s.pendingApproval && <Badge tone="warn">Waiting for a second admin</Badge>}
        {s.singleApproved && <Badge title="Only one moderator could act; nobody else confirmed it">Single-approved</Badge>}
        {s.active && !s.pendingApproval && <Badge tone="bad">In force</Badge>}
      </div>
      <div className="cell-sub">
        {/* a warning or a removal happens once: its day is the whole story */}
        {(s.kind === 'warning' || s.kind === 'content_removal') && !s.revokedAt ? (
          <>
            Given <Time value={s.createdAt} />
          </>
        ) : (
          <>
            {sanctionPeriod(s)} · given <Time value={s.createdAt} />
          </>
        )}
        {s.revokeReason ? ` · lifted: ${s.revokeReason}` : ''}
        {link && <> · {link}</>}
      </div>
      {s.statement && (
        <details className="sanction-statement">
          <summary>What they were told</summary>
          <p dir="auto">{s.statement}</p>
        </details>
      )}
    </li>
  );
}

/**
 * The reported person: age, how old the account is, what they have had
 * before, earlier cases, and accounts that share a device or network with
 * them (ban evasion shows up here first).
 */
export function SubjectPanel({
  subject,
  onSanction,
  canAct,
  selfHarm = false,
}: {
  subject: NonNullable<CaseDetail['subject']>;
  onSanction: () => void;
  canAct: boolean;
  /** someone who may hurt themselves gets a caring message, never a sanction */
  selfHarm?: boolean;
}): React.JSX.Element {
  return (
    <Section
      title="Reported person"
      className="person-panel"
      actions={
        canAct ? (
          <Button icon="plus" onClick={onSanction}>
            {selfHarm ? 'Send a caring message' : 'Sanction this person'}
          </Button>
        ) : undefined
      }
    >
      <div className="person-head">
        <UserLink user={subject} minor={subject.age === 'minor'} />
        {subject.age !== 'minor' && <AgeTag age={subject.age} />}
        <AccountAge createdAt={subject.accountCreatedAt} />
      </div>

      <h3 className="drawer-sub">In force now</h3>
      {subject.activeSanctions.length === 0 ? (
        <p className="subtle">Nothing.</p>
      ) : (
        <ul className="sanction-list">
          {subject.activeSanctions.map((s) => (
            <SanctionLine key={s.id} s={s} />
          ))}
        </ul>
      )}

      {subject.pastSanctions.length > 0 && (
        <details className="person-more">
          <summary>
            {subject.pastSanctions.length} earlier {subject.pastSanctions.length === 1 ? 'sanction' : 'sanctions'}
          </summary>
          <ul className="sanction-list">
            {subject.pastSanctions.map((s) => (
              <SanctionLine key={s.id} s={s} />
            ))}
          </ul>
        </details>
      )}

      {subject.priorCases.length > 0 && (
        <>
          <h3 className="drawer-sub">Earlier cases about them</h3>
          <ul className="link-list">
            {subject.priorCases.map((c) => (
              <li key={c.id}>
                <a href={`#/moderation/${c.id}`}>{categoryName(c.category)}</a>
                <Badge tone={statusTone(c.status)}>{statusName(c.status)}</Badge>
                <Time value={c.createdAt} />
              </li>
            ))}
          </ul>
        </>
      )}

      {subject.linkedAccounts.length > 0 && (
        <>
          <h3 className="drawer-sub">Accounts on the same device or network</h3>
          <ul className="link-list">
            {subject.linkedAccounts.map((a) => (
              <li key={a.id}>
                <UserLink user={a} />
                <LinkedVia link={a} />
                {a.banned && <Badge tone="bad">Banned</Badge>}
              </li>
            ))}
          </ul>
          <p className="note">A shared network means seen there within two days of each other while few others used it — often a family. A shared device says more.</p>
        </>
      )}
    </Section>
  );
}

/**
 * Who reported it, and how far to trust them: how many of their decided
 * reports led to action, how many they filed this month, how new the account
 * is. "Sanction this reporter" is for reports made in bad faith.
 */
export function ReportersPanel({
  reports,
  media,
  onSanction,
  canAct,
  inDraft,
  sensitive,
}: {
  reports: CaseReportView[];
  media: CaseDetail['media'];
  onSanction: (reporterId: string) => void;
  canAct: boolean;
  /** reporters who already have an action in the decision */
  inDraft: ReadonlySet<string>;
  /** pictures may be child abuse material: ask before showing one */
  sensitive: boolean;
}): React.JSX.Element {
  // a later report that captured something different (an edit in between, another message) shows its own capture
  const first = reports.map((r) => r.evidence).find(isSnapshot) ?? null;
  const differs = (e: unknown): boolean =>
    isSnapshot(e) && !!first && (e.targetId !== first.targetId || e.text !== first.text || e.caption !== first.caption || e.title !== first.title);
  return (
    <Section
      title={reports.length === 1 ? 'The report' : `${reports.length} reports`}
      description={reports.length === 0 ? undefined : 'Reporters are never named to the person they reported.'}
      className="reports-panel"
    >
      {reports.length === 0 ? (
        <p className="section-text">Nobody reported this: an automatic check opened the case.</p>
      ) : (
        <ol className="report-list">
          {reports.map((r, i) => (
            <li key={r.id} className="report-item">
              <div className="report-head">
                {r.reporter ? (
                  <UserLink user={r.reporter} minor={r.reporter.age === 'minor'} />
                ) : (
                  <span className="subtle">A deleted account</span>
                )}
                <Badge>{categoryName(r.category)}</Badge>
                <Time value={r.createdAt} />
                {r.weight < 1 && <Badge title="Accounts under a day old count half when the queue is ordered">New account</Badge>}
              </div>
              {r.note ? (
                <blockquote className="report-note" dir="auto">
                  {r.note}
                </blockquote>
              ) : (
                <p className="subtle report-note-none">No note.</p>
              )}
              {r.reporter && (
                <p className="report-trust">
                  {r.reporter.accuracyPercent === null
                    ? 'None of their reports has been decided yet.'
                    : `${r.reporter.accuracyPercent}% of their decided reports led to action.`}{' '}
                  {r.reporter.reportsLast30Days} {r.reporter.reportsLast30Days === 1 ? 'report' : 'reports'} in the last 30 days.{' '}
                  <AccountAge createdAt={r.reporter.accountCreatedAt} />
                </p>
              )}
              {i > 0 && isSnapshot(r.evidence) && differs(r.evidence) && (
                <details className="report-capture">
                  <summary>What this report captured</summary>
                  <Snapshot snapshot={r.evidence} media={media} sensitive={sensitive} />
                </details>
              )}
              {canAct && r.reporter && (
                <div className="report-actions">
                  <Button onClick={() => onSanction(r.reporter!.id)} disabled={inDraft.has(r.reporter.id)}>
                    {inDraft.has(r.reporter.id) ? 'In the decision' : 'Sanction this reporter'}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}
