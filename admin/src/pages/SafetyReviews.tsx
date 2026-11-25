import { useEffect, useState } from 'react';
import {
  SAFETY_REVIEW_HOURS,
  SAFETY_REVIEW_NOTE_MAX,
  SAFETY_REVIEW_REASONS,
  SAFETY_REVIEW_REASON_INFO,
  type ReviewConversationKind,
  type ReviewConversationPage,
  type ReviewMessage,
  type ReviewOpened,
  type SafetyReview,
  type SafetyReviewReason,
} from '@kurda/shared';
import { api, ApiError } from '../api';
import { conversationName, countText, isUuid, reasonLabel, reviewDraftProblems, type ReviewDraft } from '../messageAccess';
import { go } from '../nav';
import { href, type Route } from '../navigation';
import { useSession } from '../session';
import {
  Badge,
  Banner,
  Button,
  EmptyState,
  ErrorState,
  FieldRow,
  FormActions,
  Loading,
  PageHeader,
  Section,
  Select,
  Table,
  TextInput,
  Textarea,
  Time,
  UserLink,
  errorLine,
  useDialogs,
  useLoad,
  useToast,
  type Column,
} from '../ui';
import { LetterPaperEvidence } from './CaseLetter';

/**
 * Safety reviews (#/safety-reviews): one account's letters and private chats, read-only, for 24 hours, for a reason
 * from a fixed list. A superadmin opens one here or from the person's page; only its reader opens it
 * (#/safety-reviews/<id>), one conversation at a time (#/safety-reviews/<id>/<kind>/<conversationId>). Every list and
 * conversation opened is on the Access log, and the person is never told.
 */
export function SafetyReviews({ route }: { route: Route }): React.JSX.Element {
  const [id, kind, conversationId] = route.rest;
  if (id) return <ReviewReader key={id} id={id} open={kind && conversationId ? { kind: kind as ReviewConversationKind, id: conversationId } : null} />;
  return <ReviewsHome userId={route.query.get('user')} />;
}

function ReviewsHome({ userId }: { userId: string | null }): React.JSX.Element {
  const session = useSession();
  const superadmin = session.staffRoles.includes('superadmin');
  const list = useLoad(() => api<{ reviews: SafetyReview[] }>('/admin/safety-reviews'), []);
  const dialogs = useDialogs();
  const toast = useToast();

  async function end(r: SafetyReview): Promise<void> {
    const yes = await dialogs.confirm({
      title: `End the review of @${r.subject.username ?? 'this account'} now?`,
      body: 'Nothing more can be opened under it. A new review needs a superadmin and a reason again.',
      confirmLabel: 'End it now',
      tone: 'danger',
    });
    if (!yes) return;
    try {
      await api(`/admin/safety-reviews/${encodeURIComponent(r.id)}/end`, { method: 'POST' });
      toast.success('The review has ended.');
      await list.reload();
    } catch (err) {
      toast.error(errorLine(err, 'safety reviews'));
    }
  }

  const columns: ReadonlyArray<Column<SafetyReview>> = [
    { key: 'who', header: 'Account', card: 'title', cell: (r) => <UserLink user={r.subject} /> },
    { key: 'reader', header: 'Read by', cell: (r) => (r.yours ? <Badge tone="info">You</Badge> : <UserLink user={r.reviewer} />) },
    { key: 'why', header: 'Why', cell: (r) => reasonLabel(r.reason) },
    { key: 'until', header: 'Until', cell: (r) => <Time value={r.expiresAt} mode="absolute" /> },
  ];

  return (
    <div>
      <PageHeader
        title="Safety reviews"
        subtitle={
          `One account’s letters and private chats, read-only, for ${SAFETY_REVIEW_HOURS} hours, for a serious reason. Only a superadmin opens one. ` +
          'Everything opened is on the Access log, and the person is never told.'
        }
      />
      <Banner tone="info" title="Reports and flags are read in their cases">
        A reported or flagged letter or message, with the few around it, is in its case. Open a review only when a case cannot show what you need,
        or for a child’s safety, a threat to someone, or a legal request. There is no search across everyone’s messages and nothing to export.
      </Banner>
      <Section title="Open now" flush>
        {list.error != null && !list.data ? (
          <ErrorState error={list.error} onRetry={() => void list.reload()} what="safety reviews" compact />
        ) : !list.data ? (
          <Loading rows={2} label="Loading safety reviews…" />
        ) : list.data.reviews.length === 0 ? (
          <EmptyState title="No review is open" icon="lock" compact>
            Nobody can read anyone’s letters or private chats beyond their cases.
          </EmptyState>
        ) : (
          <Table
            caption="Open safety reviews"
            columns={columns}
            rows={list.data.reviews}
            rowKey={(r) => r.id}
            empty="None."
            actions={(r) => (
              <>
                {r.yours && (
                  <a className="button-link" href={href('safety-reviews', r.id)}>
                    Read
                  </a>
                )}
                {(r.yours || superadmin) && (
                  <Button variant="danger" onClick={() => void end(r)}>
                    End now
                  </Button>
                )}
              </>
            )}
          />
        )}
      </Section>
      {superadmin ? (
        <GrantForm initialUserId={userId} onGranted={(r) => (r.yours ? go(`safety-reviews/${r.id}`) : void list.reload())} />
      ) : (
        <p className="section-text subtle">Only a superadmin can open a safety review. One opened for you to read appears above.</p>
      )}
    </div>
  );
}

interface Account {
  id: string;
  username: string;
  kind?: 'person' | 'guest' | 'child';
}

interface StaffRow extends Account {
  roles: string[];
}

/** Who may read a review: a staff member who moderates, as the API checks it (roles.ts `moderation.act`). */
const MODERATING_ROLES = ['superadmin', 'moderator', 'admin'];

/** Why an account cannot be reviewed, before asking the API. */
function nothingToReview(a: Account): string | null {
  if (a.kind === 'child') return 'A child’s profile writes to nobody, so there is nothing to review.';
  if (a.kind === 'guest') return 'A guest writes to nobody, so there is nothing to review.';
  return null;
}

function GrantForm({ initialUserId, onGranted }: { initialUserId: string | null; onGranted: (r: SafetyReview) => void }): React.JSX.Element {
  const dialogs = useDialogs();
  const toast = useToast();
  const [subject, setSubject] = useState<Account | null>(null);
  const [lookup, setLookup] = useState('');
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [finding, setFinding] = useState(false);
  const [reviewer, setReviewer] = useState('');
  const [reason, setReason] = useState<SafetyReviewReason | ''>('');
  const [note, setNote] = useState('');
  const [caseId, setCaseId] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const me = useLoad(() => api<{ userId: string }>('/admin/me'), []);
  const staff = useLoad(() => api<{ users: StaffRow[] }>('/admin/users?filter=staff&limit=100'), []);

  // Opened from a person's page: that account, looked up so the form names it.
  useEffect(() => {
    if (!initialUserId || !isUuid(initialUserId)) return;
    void api<Account>(`/admin/users/${encodeURIComponent(initialUserId)}`)
      .then((a) => {
        const why = nothingToReview(a);
        if (why) setLookupError(why);
        else setSubject({ id: a.id, username: a.username, kind: a.kind });
      })
      .catch((err: unknown) => setLookupError(errorLine(err, 'people')));
  }, [initialUserId]);

  async function find(): Promise<void> {
    const name = lookup.trim().replace(/^@/, '');
    if (!name) return;
    setFinding(true);
    setLookupError(null);
    try {
      const res = await api<{ users: Account[] }>(`/admin/users?q=${encodeURIComponent(name)}&limit=25`);
      const found = res.users.find((u) => u.username.toLowerCase() === name.toLowerCase());
      if (!found) setLookupError('No account has exactly that username.');
      else if (nothingToReview(found)) setLookupError(nothingToReview(found));
      else setSubject(found);
    } catch (err) {
      setLookupError(errorLine(err, 'people'));
    } finally {
      setFinding(false);
    }
  }

  const draft: ReviewDraft = { subjectId: subject?.id ?? null, reason, note, caseId };
  const problems = reviewDraftProblems(draft);
  const readers = (staff.data?.users ?? []).filter((u) => u.id !== me.data?.userId && u.id !== subject?.id && u.roles.some((r) => MODERATING_ROLES.includes(r)));
  const readerName = reviewer ? `@${readers.find((u) => u.id === reviewer)?.username ?? 'them'}` : 'You';

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setTried(true);
    if (Object.keys(problems).length > 0 || !subject || !reason) return;
    const until = new Date(Date.now() + SAFETY_REVIEW_HOURS * 3_600_000);
    const yes = await dialogs.confirm({
      title: `Open @${subject.username}’s letters and private chats?`,
      body:
        `${readerName} can read them, read-only, until ${until.toLocaleString()}. ` +
        `Every conversation opened is on the Access log, and @${subject.username} is not told.`,
      confirmLabel: 'Open the review',
      tone: 'danger',
    });
    if (!yes) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ review: SafetyReview }>(`/admin/users/${encodeURIComponent(subject.id)}/safety-reviews`, {
        method: 'POST',
        body: { reason, note: note.trim(), ...(reviewer ? { reviewerId: reviewer } : {}), ...(caseId.trim() ? { caseId: caseId.trim() } : {}) },
      });
      toast.success(`The review of @${subject.username} is open until ${new Date(res.review.expiresAt).toLocaleString()}.`);
      setNote('');
      setReason('');
      setCaseId('');
      setTried(false);
      onGranted(res.review);
    } catch (err) {
      setError(errorLine(err, 'safety reviews'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Open a safety review" description="For one named account. Ask yourself first whether the case alone can answer it.">
      <form className="form" noValidate onSubmit={(e) => void submit(e)}>
        {subject ? (
          <div className="field">
            <span className="field-label">Account</span>
            <p className="section-text">
              <UserLink user={subject} />{' '}
              <Button variant="ghost" onClick={() => setSubject(null)}>
                Choose another
              </Button>
            </p>
          </div>
        ) : (
          <FieldRow>
            <TextInput
              label="Username"
              hint="Exactly as it is, with or without the @."
              value={lookup}
              onChange={(e) => setLookup(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void find();
                }
              }}
              error={lookupError ?? (tried ? problems.subjectId : undefined)}
              autoCapitalize="off"
              spellCheck={false}
            />
            <FormActions>
              <Button onClick={() => void find()} busy={finding} icon="search">
                Find the account
              </Button>
            </FormActions>
          </FieldRow>
        )}
        <Select
          label="Who reads"
          hint="Only this person can open the review. The reader must be a moderator or a superadmin."
          value={reviewer}
          onChange={(e) => setReviewer(e.target.value)}
          options={[{ value: '', label: 'Me' }, ...readers.map((u) => ({ value: u.id, label: `@${u.username}` }))]}
        />
        <fieldset className="choice-row is-stacked">
          <legend className="field-label">Reason</legend>
          {SAFETY_REVIEW_REASONS.map((r) => (
            <label key={r} className={`choice${reason === r ? ' is-on' : ''}`}>
              <input type="radio" name="safety-review-reason" checked={reason === r} onChange={() => setReason(r)} />
              <span>
                <strong>{SAFETY_REVIEW_REASON_INFO[r].label}</strong>
                <span className="choice-sub">{SAFETY_REVIEW_REASON_INFO[r].hint}</span>
              </span>
            </label>
          ))}
          {tried && problems.reason && <p className="field-error">{problems.reason}</p>}
        </fieldset>
        <TextInput
          label={reason === 'report_context' ? 'Case id' : 'Case id (if there is one)'}
          value={caseId}
          onChange={(e) => setCaseId(e.target.value)}
          error={tried ? problems.caseId : undefined}
          autoCapitalize="off"
          spellCheck={false}
          required={reason === 'report_context'}
        />
        <Textarea
          label="Why this account, and why now"
          hint="Every admin reads this note on the Access log. Say what makes the review necessary, with no more about the person than that needs."
          rows={4}
          maxLength={SAFETY_REVIEW_NOTE_MAX}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          error={tried ? problems.note : undefined}
          required
        />
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <FormActions>
          <Button type="submit" variant="primary" busy={busy}>
            Open the review…
          </Button>
        </FormActions>
      </form>
    </Section>
  );
}

/** A review's reader: what it covers, then one conversation at a time. */
function ReviewReader({ id, open }: { id: string; open: { kind: ReviewConversationKind; id: string } | null }): React.JSX.Element {
  const loaded = useLoad(() => api<ReviewOpened>(`/admin/safety-reviews/${encodeURIComponent(id)}`), [id]);
  const dialogs = useDialogs();
  const toast = useToast();
  const back = { href: href('safety-reviews'), label: 'Safety reviews' };

  if (loaded.error != null && !loaded.data) {
    const ended = loaded.error instanceof ApiError && loaded.error.status === 410;
    const missing = loaded.error instanceof ApiError && loaded.error.status === 404;
    return (
      <div>
        <PageHeader back={back} title="Safety review" />
        {ended || missing ? (
          <EmptyState
            title={ended ? 'This review has ended' : 'There is no review here for you'}
            icon="lock"
            action={<a href={back.href}>Back to safety reviews</a>}
          >
            {ended
              ? 'Its 24 hours are over, or it was ended early. Nothing under it can be opened any more.'
              : 'Only the person a review was opened for can read it.'}
          </EmptyState>
        ) : (
          <ErrorState error={loaded.error} onRetry={() => void loaded.reload()} what="this safety review" />
        )}
      </div>
    );
  }
  if (!loaded.data) {
    return (
      <div>
        <PageHeader back={back} title="Safety review" />
        <Loading rows={4} label="Opening the review…" />
      </div>
    );
  }
  const { review, conversations } = loaded.data;
  const name = review.subject.username ? `@${review.subject.username}` : 'a deleted account';
  const sensitive = review.reason === 'child_safety';

  async function end(): Promise<void> {
    const yes = await dialogs.confirm({ title: 'End this review now?', body: 'Nothing more can be opened under it.', confirmLabel: 'End it now', tone: 'danger' });
    if (!yes) return;
    try {
      await api(`/admin/safety-reviews/${encodeURIComponent(review.id)}/end`, { method: 'POST' });
      toast.success('The review has ended.');
      go('safety-reviews');
    } catch (err) {
      toast.error(errorLine(err, 'safety reviews'));
    }
  }

  return (
    <div>
      <PageHeader
        back={back}
        title={`Safety review of ${name}`}
        meta={<Badge tone="warn">{reasonLabel(review.reason)}</Badge>}
        subtitle={
          <>
            Read-only, until <Time value={review.expiresAt} mode="absolute" />. Every conversation you open is on the Access log.
          </>
        }
        actions={
          <Button variant="danger" onClick={() => void end()}>
            End now
          </Button>
        }
      />
      <Banner tone="warn" title="Read only what the reason needs">
        Do not copy, screenshot or pass on what you read here. If something must be acted on, do it through a case or the person’s page.
      </Banner>
      <Section title="Why">
        <dl className="facts">
          <div>
            <dt>Opened by</dt>
            <dd>
              <UserLink user={review.grantedBy} /> <Time value={review.grantedAt} />
            </dd>
          </div>
          <div>
            <dt>Reason</dt>
            <dd>{reasonLabel(review.reason)}</dd>
          </div>
          <div>
            <dt>Note</dt>
            <dd dir="auto">{review.note}</dd>
          </div>
          {review.caseId && (
            <div>
              <dt>Case</dt>
              <dd>
                <a href={href('moderation', review.caseId)}>{review.caseId.slice(0, 8)}</a>
              </dd>
            </div>
          )}
        </dl>
      </Section>
      <Section title="Conversations" description="Nothing of what they say is shown until you open one.">
        {conversations.length === 0 ? (
          <EmptyState title="No letters or private chats" icon="chat" compact>
            {name} has written to nobody and been written to by nobody.
          </EmptyState>
        ) : (
          <ul className="plain-list review-conversations">
            {conversations.map((c) => {
              const current = open?.kind === c.kind && open.id === c.id;
              return (
                <li key={`${c.kind}:${c.id}`}>
                  <a href={href('safety-reviews', review.id, c.kind, c.id)} aria-current={current ? 'page' : undefined}>
                    {conversationName(c)}
                  </a>{' '}
                  <span className="subtle">
                    {countText(c.kind, c.messages)}
                    {c.lastAt && (
                      <>
                        , last <Time value={c.lastAt} />
                      </>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
      {open && <ConversationView key={`${open.kind}:${open.id}`} reviewId={review.id} kind={open.kind} id={open.id} subjectName={name} sensitive={sensitive} />}
    </div>
  );
}

/** One conversation, newest page first; older pages only when asked for. */
function ConversationView({
  reviewId,
  kind,
  id,
  subjectName,
  sensitive,
}: {
  reviewId: string;
  kind: ReviewConversationKind;
  id: string;
  subjectName: string;
  sensitive: boolean;
}): React.JSX.Element {
  const path = `/admin/safety-reviews/${encodeURIComponent(reviewId)}/conversations/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`;
  const first = useLoad(() => api<ReviewConversationPage>(path), [path]);
  const [older, setOlder] = useState<ReviewMessage[]>([]);
  const [cursor, setCursor] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  if (first.error != null && !first.data) return <ErrorState error={first.error} onRetry={() => void first.reload()} what="this conversation" />;
  if (!first.data) return <Loading rows={4} label="Opening the conversation…" />;
  const page = first.data;
  const next = cursor === undefined ? page.olderCursor : cursor;
  const messages = [...older, ...page.messages];

  async function loadOlder(): Promise<void> {
    if (!next) return;
    setBusy(true);
    try {
      const res = await api<ReviewConversationPage>(`${path}?before=${encodeURIComponent(next)}`);
      setOlder((prev) => [...res.messages, ...prev]);
      setCursor(res.olderCursor);
    } catch (err) {
      toast.error(errorLine(err, 'this conversation'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title={conversationName(page.conversation)} description={`${countText(kind, page.conversation.messages)} in all. Each page you open is recorded.`}>
      {next && (
        <div className="load-more">
          <Button onClick={() => void loadOlder()} busy={busy}>
            Older
          </Button>
        </div>
      )}
      {messages.length === 0 ? (
        <p className="section-text subtle">Nothing here.</p>
      ) : (
        <ol className="chat-lines">
          {messages.map((m) => (
            <ReviewLine key={m.id} message={m} subjectName={subjectName} sensitive={sensitive} />
          ))}
        </ol>
      )}
    </Section>
  );
}

const STATUS_TEXT: Readonly<Record<string, string>> = {
  deleted: 'Deleted',
  removed: 'Removed by moderation',
  held: 'Drawing waiting for a check',
  recalled: 'Called back, never sent',
  flying: 'Still out with its bird',
};

function ReviewLine({ message: m, subjectName, sensitive }: { message: ReviewMessage; subjectName: string; sensitive: boolean }): React.JSX.Element {
  const letter = m.kind === 'letter';
  return (
    <li className="chat-line">
      <div className="chat-line-head">
        {m.sender ? <UserLink user={m.sender} /> : <span className="subtle">Deleted account</span>}
        <Time value={m.createdAt} mode="absolute" />
        {m.fromSubject && <Badge tone="info">{`Written by ${subjectName}`}</Badge>}
        {m.status && STATUS_TEXT[m.status] && <Badge tone="warn">{STATUS_TEXT[m.status]}</Badge>}
      </div>
      <div className="chat-line-body" dir="auto">
        {m.body ?? <span className="subtle">{m.kind === 'text' ? 'No text' : `A ${m.kind.replace(/_/g, ' ')}`}</span>}
      </div>
      {letter && m.decor && <LetterPaperEvidence raw={m.decor} sensitive={sensitive} />}
    </li>
  );
}
