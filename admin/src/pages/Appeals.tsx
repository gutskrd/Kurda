import { useState } from 'react';
import type { AdminAppealItem, AppealOutcome, AppealStatus, AppealView, DecideAppealRequest, SanctionKind } from '@kurda/shared';
import { api } from '../api';
import { useAuth } from '../auth';
import { useRoute } from '../nav';
import { categoryName, sanctionName } from '../moderation';
import {
  Badge,
  Banner,
  Button,
  Drawer,
  EmptyState,
  ErrorState,
  FormActions,
  Loading,
  PageHeader,
  Section,
  Tabs,
  Textarea,
  Time,
  UserLink,
  errorLine,
  useLoad,
  useToast,
  type Tone,
} from '../ui';
import { SanctionLine } from './CasePeople';
import { SanctionFields, newSanctionDraft, sanctionDraftProblems, type SanctionDraft } from './SanctionParts';

type Filter = 'open' | 'upheld' | 'overturned' | 'modified' | 'all';
const FILTERS: ReadonlyArray<{ key: Filter; label: string }> = [
  { key: 'open', label: 'Waiting' },
  { key: 'upheld', label: 'Upheld' },
  { key: 'overturned', label: 'Overturned' },
  { key: 'modified', label: 'Changed' },
  { key: 'all', label: 'All' },
];

const STATUS: Readonly<Record<AppealStatus, { name: string; tone: Tone }>> = {
  open: { name: 'Waiting', tone: 'info' },
  upheld: { name: 'Upheld', tone: 'neutral' },
  overturned: { name: 'Overturned', tone: 'ok' },
  modified: { name: 'Changed', tone: 'warn' },
};

/** What an appeal's new sanction can be: lighter or different, never a ban (that is decided on a case). */
const MODIFY_KINDS: readonly SanctionKind[] = ['warning', 'chat_mute', 'post_mute', 'feature_limit', 'suspension'];

/**
 * Appeals (#/appeals): people asking for a second look at a sanction they
 * got, or at a report of theirs that was closed as not breaking the rules.
 * Oldest first, because each has waited longest. The answer is the
 * person's to read, so it is written for them; someone other than the
 * moderator who decided answers it whenever there is someone else (the API
 * insists).
 */
export function Appeals(): React.JSX.Element {
  const route = useRoute();
  const raw = route.query.get('status');
  const filter: Filter = FILTERS.some((f) => f.key === raw) ? (raw as Filter) : 'open';
  const list = useLoad(() => api<{ appeals: AdminAppealItem[] }>(`/admin/appeals?status=${filter}`).then((r) => r.appeals), [filter]);
  const [answering, setAnswering] = useState<AdminAppealItem | null>(null);
  const { me } = useAuth();

  return (
    <div>
      <PageHeader
        title="Appeals"
        subtitle="People asking for a second look at a decision. Read what they wrote, look at the case again, and answer them — they read your answer."
        actions={
          <Button icon="refresh" onClick={() => void list.reload()} busy={list.loading && !!list.data}>
            Refresh
          </Button>
        }
      />
      <Tabs
        label="Show"
        value={filter}
        items={FILTERS.map((f) => ({ key: f.key, label: f.label, href: f.key === 'open' ? '#/appeals' : `#/appeals?status=${f.key}` }))}
      />
      {list.error != null && !list.data ? (
        <ErrorState error={list.error} onRetry={() => void list.reload()} what="appeals" />
      ) : !list.data ? (
        <Loading rows={3} label="Loading appeals…" />
      ) : list.data.length === 0 ? (
        <Section>
          <EmptyState title={filter === 'open' ? 'No appeal is waiting' : 'No appeals here'} icon="check" compact>
            {filter === 'open' ? 'When someone asks for a review of a decision, it appears here.' : 'Choose another tab to see the rest.'}
          </EmptyState>
        </Section>
      ) : (
        <ol className="appeal-list" aria-label="Appeals">
          {list.data.map((a) => (
            <AppealCard key={a.id} appeal={a} mine={!!me && a.originalDeciderId === me.id} onAnswer={() => setAnswering(a)} />
          ))}
        </ol>
      )}
      {answering && (
        <AnswerDrawer
          key={answering.id}
          appeal={answering}
          mine={!!me && answering.originalDeciderId === me.id}
          onClose={() => setAnswering(null)}
          onDone={() => {
            setAnswering(null);
            void list.reload();
          }}
        />
      )}
    </div>
  );
}

function AppealCard({ appeal: a, mine, onAnswer }: { appeal: AdminAppealItem; mine: boolean; onAnswer: () => void }): React.JSX.Element {
  const status = STATUS[a.status];
  const caseId = a.sanction?.caseId ?? a.caseId;
  return (
    <li className="card section appeal">
      <div className="appeal-head">
        <UserLink user={a.user} />
        <Badge tone={status.tone}>{status.name}</Badge>
        <span className="subtle">
          asked <Time value={a.createdAt} />
        </span>
      </div>
      {a.sanction ? (
        <ul className="sanction-list">
          <SanctionLine s={a.sanction} />
        </ul>
      ) : (
        <p className="section-text">About a report they made that was closed as not breaking the rules.</p>
      )}
      <blockquote className="appeal-text" dir="auto">
        {a.text}
      </blockquote>
      {a.status === 'open' && mine && (
        <Banner tone="warn" title="You made this decision">
          Another moderator should answer it. If you are the only one, you can — say in your answer that you looked again.
        </Banner>
      )}
      {a.status !== 'open' && a.decisionNote && (
        <div>
          <p className="subtle">
            Answered <Time value={a.decidedAt} mode="absolute" />
          </p>
          <p className="fb-note" dir="auto">
            {a.decisionNote}
          </p>
        </div>
      )}
      <div className="appeal-actions">
        {a.status === 'open' && (
          <Button variant="primary" onClick={onAnswer}>
            Answer
          </Button>
        )}
        {caseId && (
          <a className="button-link" href={`#/moderation/${caseId}`}>
            Open the case
          </a>
        )}
      </div>
    </li>
  );
}

const OUTCOME_TEXT: Readonly<Record<AppealOutcome, { title: string; sub: (hasSanction: boolean) => string }>> = {
  upheld: { title: 'The decision stands', sub: () => 'Nothing changes.' },
  overturned: {
    title: 'Overturn it',
    sub: (s) => (s ? 'The sanction is lifted. Content it removed comes back.' : 'The case opens again for a second look.'),
  },
  modified: { title: 'Change it', sub: () => 'Replace it with a lighter or different sanction.' },
};

/** The answer: an outcome, the words the person reads, and for a change, the new sanction. */
function AnswerDrawer({
  appeal,
  mine,
  onClose,
  onDone,
}: {
  appeal: AdminAppealItem;
  mine: boolean;
  onClose: () => void;
  onDone: () => void;
}): React.JSX.Element {
  const toast = useToast();
  const [outcome, setOutcome] = useState<AppealOutcome>('upheld');
  const [note, setNote] = useState('');
  // the new sanction keeps the rule of the one it replaces
  const [draft, setDraft] = useState<SanctionDraft>(() => newSanctionDraft('warning', appeal.sanction?.policy ?? ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const outcomes: AppealOutcome[] = appeal.sanction && appeal.sanction.kind !== 'permanent_ban' ? ['upheld', 'overturned', 'modified'] : ['upheld', 'overturned'];
  const problems = [...(note.trim() ? [] : ['Write the answer they will read.']), ...(outcome === 'modified' ? sanctionDraftProblems(draft, { needsPolicy: false }) : [])];

  async function send(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (problems.length > 0) return;
    setBusy(true);
    setError(null);
    const body: DecideAppealRequest = {
      outcome,
      note: note.trim(),
      ...(outcome === 'modified'
        ? { modifiedSanction: { kind: draft.kind, ...(draft.kind === 'warning' ? {} : { durationHours: draft.durationHours }), statement: draft.statement.trim() } }
        : {}),
    };
    try {
      await api<{ appeal: AppealView }>(`/admin/appeals/${appeal.id}/decide`, { method: 'POST', body });
      toast.success(outcome === 'upheld' ? 'Answered: the decision stands.' : outcome === 'overturned' ? 'Overturned. They have been told.' : 'Changed. They have been told.');
      onDone();
    } catch (err) {
      setError(errorLine(err, 'appeals'));
    } finally {
      setBusy(false);
    }
  }

  const who = appeal.user ? `@${appeal.user.username}` : 'They';
  return (
    <Drawer
      open
      onClose={onClose}
      title={`Answer ${appeal.user ? `@${appeal.user.username}` : 'this appeal'}`}
      footer={
        <FormActions>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <Button type="submit" form="appeal-answer" variant="primary" busy={busy} disabled={problems.length > 0}>
            Send the answer
          </Button>
        </FormActions>
      }
    >
      <form id="appeal-answer" className="form" onSubmit={(e) => void send(e)}>
        {appeal.sanction && (
          <p className="section-text">
            {sanctionName(appeal.sanction.kind)} under the rule on {categoryName(appeal.sanction.policy).toLowerCase()}.
          </p>
        )}
        <blockquote className="appeal-text" dir="auto">
          {appeal.text}
        </blockquote>
        {mine && (
          <Banner tone="warn" title="You made this decision">
            When there is another moderator, the server asks them to answer instead.
          </Banner>
        )}
        <fieldset className="choice-row is-stacked">
          <legend className="field-label">Your answer</legend>
          {outcomes.map((o) => (
            <label key={o} className={`choice${outcome === o ? ' is-on' : ''}`}>
              <input type="radio" name="appeal-outcome" checked={outcome === o} onChange={() => setOutcome(o)} />
              <span>
                <strong>{OUTCOME_TEXT[o].title}</strong>
                <span className="choice-sub">{OUTCOME_TEXT[o].sub(!!appeal.sanction)}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {outcome === 'modified' && <SanctionFields draft={draft} onChange={setDraft} who={who} kinds={MODIFY_KINDS} withPolicy={false} withNote={false} />}
        <Textarea
          label={`What ${who === 'They' ? 'they read' : `${who} reads`}`}
          hint="Kind and plain: what you looked at, and what happens now."
          rows={4}
          maxLength={2000}
          required
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {problems.length > 0 && (
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
