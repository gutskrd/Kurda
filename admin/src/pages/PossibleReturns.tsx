import { useState } from 'react';
import { REPORT_CATEGORIES, type ReportCategory } from '@kurda/shared';
import { api } from '../api';
import {
  RETURN_STATUS_NAME,
  SAME_PERSON_STATEMENT,
  STRENGTH_NAME,
  STRENGTH_TONE,
  banSummary,
  signalName,
  type PossibleReturnItem,
  type PossibleReturnsPage,
} from '../bans';
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
  Select,
  Tabs,
  Textarea,
  Time,
  UserLink,
  errorLine,
  useDialogs,
  useLoad,
  useToast,
} from '../ui';
import { BanSummaryText, ContentChoiceFields, useContentSummary, type ContentChoiceValue } from './BanContent';

type StatusTab = 'open' | 'same_person' | 'not_same_person' | 'closed';
const TABS: ReadonlyArray<{ key: StatusTab; label: string }> = [
  { key: 'open', label: 'Waiting' },
  { key: 'same_person', label: 'Same person' },
  { key: 'not_same_person', label: 'Not the same person' },
  { key: 'closed', label: 'Closed' },
];

/**
 * Possible returns (#/possible-returns): accounts that may belong to someone who is banned or suspended, with the
 * signals that matched and how strong each is. A strong match holds the account (it can learn, not post or message)
 * until a moderator decides: the same person (the ban is applied to this account too, with its own notice and appeal)
 * or not (the hold ends, and the pair is never flagged again). A network alone never brings anyone here.
 */
export function PossibleReturns(): React.JSX.Element {
  const [status, setStatus] = useState<StatusTab>('open');
  const [cursor, setCursor] = useState<string | null>(null);
  const [trail, setTrail] = useState<Array<string | null>>([]);
  const page = useLoad(
    () => api<PossibleReturnsPage>(`/admin/moderation/possible-returns?status=${status}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`),
    [status, cursor],
  );
  const dialogs = useDialogs();
  const toast = useToast();
  const [deciding, setDeciding] = useState<PossibleReturnItem | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  function pick(next: StatusTab): void {
    setStatus(next);
    setCursor(null);
    setTrail([]);
  }

  async function notSame(item: PossibleReturnItem): Promise<void> {
    const note = await dialogs.prompt({
      title: `Not the same person as @${item.banned?.username ?? 'the banned account'}?`,
      body: `${item.held ? 'The hold on the account ends at once and they are told they can post and message again. ' : ''}These two accounts are never flagged together again.`,
      label: 'Why (for the record)',
      multiline: true,
      maxLength: 2000,
      confirmLabel: 'Not the same person',
    });
    if (!note) return;
    setBusy(item.id);
    try {
      await api(`/admin/moderation/possible-returns/${item.id}/decide`, { method: 'POST', body: { decision: 'not_same_person', note } });
      toast.success(item.held ? 'Decided. The hold is lifted.' : 'Decided.');
      await page.reload();
    } catch (err) {
      toast.error(errorLine(err, 'moderation'));
    } finally {
      setBusy(null);
    }
  }

  const data = page.data;
  return (
    <div>
      <PageHeader
        title="Possible returns"
        subtitle="Accounts that may belong to someone banned or suspended. Strong matches are held — they can learn, but not post, message, upload, write letters or join groups — until you decide."
        meta={data ? <Badge tone={data.counts.held > 0 ? 'warn' : 'neutral'}>{`${data.counts.open} waiting · ${data.counts.held} held`}</Badge> : undefined}
        actions={
          <Button icon="refresh" onClick={() => void page.reload()} busy={page.loading && !!data}>
            Refresh
          </Button>
        }
      />
      <Tabs label="Which entries" idBase="returns" value={status} onChange={pick} items={TABS.map((t) => ({ key: t.key, label: t.label }))} />
      <div role="tabpanel" id="returns-panel" aria-labelledby={`returns-tab-${status}`}>
        {page.error != null && !data ? (
          <ErrorState error={page.error} onRetry={() => void page.reload()} what="possible returns" />
        ) : !data ? (
          <Loading rows={3} label="Loading possible returns…" />
        ) : data.items.length === 0 ? (
          <Section>
            <EmptyState title={status === 'open' ? 'Nothing is waiting' : 'Nothing here'} icon="check" compact>
              {status === 'open' ? 'When a new account shares a phone, sign-in or home network with someone banned, it waits here.' : 'Decided entries appear here.'}
            </EmptyState>
          </Section>
        ) : (
          <>
            <ol className="appeal-list" aria-label="Possible returns">
              {data.items.map((item) => (
                <ReturnCard key={item.id} item={item} busy={busy === item.id} onSame={() => setDeciding(item)} onNotSame={() => void notSame(item)} />
              ))}
            </ol>
            <div className="pager" role="group" aria-label="Pages">
              <Button
                disabled={trail.length === 0}
                onClick={() => {
                  const back = [...trail];
                  setCursor(back.pop() ?? null);
                  setTrail(back);
                }}
              >
                Previous
              </Button>
              <Button
                disabled={!data.nextCursor}
                onClick={() => {
                  setTrail([...trail, cursor]);
                  setCursor(data.nextCursor);
                }}
              >
                Next
              </Button>
            </div>
          </>
        )}
      </div>
      {deciding && (
        <SamePersonDrawer
          item={deciding}
          onClose={() => setDeciding(null)}
          onDone={() => {
            setDeciding(null);
            void page.reload();
          }}
        />
      )}
    </div>
  );
}

function ReturnCard({ item, busy, onSame, onNotSame }: { item: PossibleReturnItem; busy: boolean; onSame: () => void; onNotSame: () => void }): React.JSX.Element {
  const ban = item.banned?.ban ?? null;
  return (
    <li className="card section appeal">
      <div className="appeal-head">
        <UserLink user={item.account} />
        <Badge tone={STRENGTH_TONE[item.strength]}>{STRENGTH_NAME[item.strength]}</Badge>
        {item.held && item.status === 'open' && <Badge tone="warn">Held</Badge>}
        {item.status !== 'open' && <Badge>{RETURN_STATUS_NAME[item.status]}</Badge>}
        <span className="subtle">
          first seen <Time value={item.firstSeenAt} /> · last <Time value={item.lastSeenAt} />
        </span>
      </div>
      <p className="section-text">
        May be <UserLink user={item.banned} />
        {ban && (
          <span className="subtle">
            {' '}
            — {sanctionName(ban.kind).toLowerCase()} under the rule on {categoryName(ban.policy).toLowerCase()}, since <Time value={ban.startsAt} />
            {ban.endsAt ? (
              <>
                , until <Time value={ban.endsAt} mode="absolute" />
              </>
            ) : null}
          </span>
        )}
      </p>
      <ul className="signal-list" aria-label="What matched">
        {item.signals.map((s) => (
          <li key={`${s.kind}-${s.at}`}>
            <Badge tone={STRENGTH_TONE[s.strength]}>{STRENGTH_NAME[s.strength]}</Badge> {signalName(s.kind)} · <Time value={s.at} />
          </li>
        ))}
      </ul>
      {item.personNote && (
        <details className="sanction-statement" open>
          <summary>
            They appealed the hold · <Time value={item.personNote.at} />
          </summary>
          <p dir="auto">{item.personNote.text}</p>
          <p className="subtle">
            Deciding here answers it in effect; the appeal itself is answered on <a href="#/appeals">Appeals</a>.
          </p>
        </details>
      )}
      {item.decision && (
        <p className="subtle">
          {RETURN_STATUS_NAME[item.status]} · {item.decision.byUsername ? `@${item.decision.byUsername}` : 'automatically'} · <Time value={item.decision.at} />
          {item.decision.note ? ` — ${item.decision.note}` : ''}
        </p>
      )}
      {item.status === 'open' && (
        <div className="appeal-actions">
          <Button variant="danger" onClick={onSame} disabled={busy || !ban}>
            Same person…
          </Button>
          <Button onClick={onNotSame} busy={busy}>
            Not the same person…
          </Button>
        </div>
      )}
    </li>
  );
}

/**
 * "Same person": the banned account's ban is applied to this one too (a suspension for what is left of theirs), with
 * its own statement, notice, email and appeal. A permanent ban is confirmed by typing the username, as on a person's page.
 */
function SamePersonDrawer({ item, onClose, onDone }: { item: PossibleReturnItem; onClose: () => void; onDone: () => void }): React.JSX.Element {
  const ban = item.banned?.ban;
  const account = item.account;
  const [statement, setStatement] = useState(SAME_PERSON_STATEMENT);
  const [policy, setPolicy] = useState<ReportCategory>(ban?.policy ?? 'other');
  const [note, setNote] = useState('');
  const [content, setContent] = useState<ContentChoiceValue>({ choice: 'hide', includeMessages: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const summary = useContentSummary(account?.id ?? null);
  const dialogs = useDialogs();
  const toast = useToast();
  const kind = ban?.kind ?? 'permanent_ban';
  const hoursLeft = ban?.endsAt ? Math.max(1, Math.ceil((new Date(ban.endsAt).getTime() - Date.now()) / 3_600_000)) : null;
  const lines = account ? banSummary({ username: account.username, kind, durationHours: hoursLeft, choice: content.choice, includeMessages: content.includeMessages, summary }) : [];

  async function send(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!account || !statement.trim() || !note.trim()) {
      setError('Write what they are told and why, for the record.');
      return;
    }
    const yes = await dialogs.confirm({
      title: `@${account.username} is @${item.banned?.username ?? 'the banned person'}?`,
      body: (
        <div className="dialog-text">
          <BanSummaryText lines={lines} />
          <p>The ban is linked to theirs. They are told why and can ask for a review, as for any ban.</p>
        </div>
      ),
      confirmLabel: kind === 'permanent_ban' ? 'Ban for good' : 'Suspend',
      tone: 'danger',
      ...(kind === 'permanent_ban' ? { typed: { phrase: account.username, label: `Type ${account.username} to confirm` } } : {}),
    });
    if (!yes) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/admin/moderation/possible-returns/${item.id}/decide`, {
        method: 'POST',
        body: { decision: 'same_person', note: note.trim(), statement: statement.trim(), policy, content, ...(kind === 'permanent_ban' ? { confirmUsername: account.username } : {}) },
      });
      toast.success(`Decided. @${account.username} has the same ban and has been told why.`);
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
      title={`Same person as @${item.banned?.username ?? 'the banned account'}`}
      footer={
        <FormActions>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <Button type="submit" form="same-person" variant="danger" busy={busy}>
            {kind === 'permanent_ban' ? 'Ban this account too…' : 'Suspend this account too…'}
          </Button>
        </FormActions>
      }
    >
      <form id="same-person" className="form" noValidate onSubmit={(e) => void send(e)}>
        {!ban && <Banner tone="warn" title="The ban is no longer in force">There is nothing to link to; choose Not the same person, or close.</Banner>}
        <p className="section-text">
          {kind === 'permanent_ban'
            ? 'They are banned permanently, as the account they came back from.'
            : `They are suspended for the ${hoursLeft ?? 0} hours left of the other account’s suspension.`}
        </p>
        <Select
          label="Rule broken"
          value={policy}
          onChange={(e) => setPolicy(e.target.value as ReportCategory)}
          options={REPORT_CATEGORIES.filter((c) => c.key !== 'self_harm').map((c) => ({ value: c.key, label: categoryName(c.key) }))}
        />
        <Textarea
          label={`What @${account?.username ?? 'they'} is told`}
          hint="Plain words a child can read; it goes in the notice and the email, with how to ask for a review."
          rows={3}
          maxLength={2000}
          required
          value={statement}
          onChange={(e) => setStatement(e.target.value)}
        />
        <ContentChoiceFields value={content} onChange={setContent} summary={summary} who={`@${account?.username ?? 'they'}`} />
        <BanSummaryText lines={lines} />
        <Textarea label="Why you decided (for the record)" rows={2} maxLength={2000} required value={note} onChange={(e) => setNote(e.target.value)} />
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </Drawer>
  );
}
