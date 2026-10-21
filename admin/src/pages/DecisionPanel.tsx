import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CSAM_REPORTING_LINKS,
  HELPLINE_URL,
  type CaseDetail,
  type DecideResult,
  type DecisionActionKind,
  type DecisionTarget,
  type CsamActionResult,
} from '@kurda/shared';
import { api } from '../api';
import {
  ACTION_KINDS,
  SANCTION_EFFECT,
  banModeText,
  categoryName,
  contentTarget,
  decisionRequest,
  defaultStatement,
  draftProblems,
  needsTakedown,
  durationName,
  hasDuration,
  isOpenStatus,
  newAction,
  policyOptions,
  sanctionName,
  statusName,
  withDuration,
  withKind,
  withPolicy,
  type ActionDraft,
  type DecisionDraft,
} from '../moderation';
import { Badge, Banner, Button, Checkbox, Dialog, Icon, Select, Textarea, Time, errorLine, useDebounced, useDialogs, useToast } from '../ui';
import { DurationChips } from './SanctionParts';

export type SetDraft = (change: (d: DecisionDraft) => DecisionDraft) => void;

/**
 * The decision: was a rule broken, which one, what happens to whom — the
 * reported person, and any reporter who reported in bad faith — and what
 * each of them will read.
 *
 * What they will read is the server's own preview of the exact messages
 * (`preview: true`), asked again a moment after every change, so the
 * moderator sees the real notice — with its end date, its "a person reviewed
 * this" and its "ask for a review" — before anything is sent. The preview
 * also runs every rule the decision would, so a decision the server would
 * refuse says why here, not after the click.
 */
export function DecisionPanel({
  detail,
  draft,
  setDraft,
  locked,
  onDecided,
  names,
  heading = true,
}: {
  detail: CaseDetail;
  draft: DecisionDraft;
  setDraft: SetDraft;
  /** why this moderator cannot decide right now (another holds the claim) */
  locked: string | null;
  onDecided: () => void;
  /** a person's name in the decision: "@heval" */
  names: (target: DecisionTarget) => string;
  /** off inside the phone's sheet, whose own title says "Decision" */
  heading?: boolean;
}): React.JSX.Element {
  const c = detail.case;
  const dialogs = useDialogs();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [csamOpen, setCsamOpen] = useState(false);
  const open = isOpenStatus(c.status);
  const decidable = open && c.status !== 'needs_second_approval';
  const actioned = draft.outcome === 'actioned';
  const canRemove = contentTarget(c.targetType, c.source);
  // a copyright notice about a post still up is upheld only by taking it down (CONTENT_REMOVAL_REQUIRED)
  const problems = draftProblems(draft, names, { takedown: needsTakedown(c, canRemove) });
  const preview = usePreview(c.id, draft, decidable && !locked && problems.length === 0);
  const reporters = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of detail.reports) if (r.reporter && !seen.has(r.reporter.id)) seen.set(r.reporter.id, r.reporter.username);
    return [...seen];
  }, [detail.reports]);

  async function act(label: string, run: () => Promise<void>): Promise<void> {
    setBusy(label);
    try {
      await run();
    } catch (err) {
      toast.error(errorLine(err, 'moderation'));
    } finally {
      setBusy(null);
    }
  }

  async function decide(): Promise<void> {
    await act('decide', async () => {
      // the preview again, now, so the confirmation describes exactly this decision
      const check = await api<DecideResult>(`/admin/moderation/cases/${c.id}/decide`, {
        method: 'POST',
        body: decisionRequest(draft, { preview: true }),
      });
      // every name typed: a decision may ban two people for good (the reported person and a bad-faith reporter)
      const confirmUsernames: string[] = [];
      for (const ban of check.permanentBans) {
        const yes = await dialogs.confirm({
          title: `Ban @${ban.username} for good?`,
          body: (
            <div className="dialog-text">
              <p>{banModeText(ban.mode)}</p>
              <p>They are signed out everywhere, and their email can’t be used to sign up again. They can ask for a review.</p>
            </div>
          ),
          confirmLabel: ban.mode === 'second_approval' ? 'Ask for the ban' : 'Ban for good',
          tone: 'danger',
          typed: ban.usernameRequired ? { phrase: ban.username, label: `Type ${ban.username} to confirm` } : undefined,
        });
        if (!yes) return;
        if (ban.usernameRequired) confirmUsernames.push(ban.username);
      }
      if (check.permanentBans.length === 0) {
        const yes = await dialogs.confirm({
          title: actioned ? 'Apply this decision?' : 'Close the case: no rule broken?',
          body: <DecisionSummary draft={draft} names={names} reporters={reporters.length} canRemove={canRemove} />,
          confirmLabel: actioned ? 'Apply' : 'Close the case',
          tone: actioned && draft.actions.some((a) => a.kind === 'suspension') ? 'danger' : 'default',
        });
        if (!yes) return;
      }
      const result = await api<DecideResult>(`/admin/moderation/cases/${c.id}/decide`, {
        method: 'POST',
        body: decisionRequest(draft, { confirmUsernames }),
      });
      toast.success(
        result.status === 'needs_second_approval'
          ? 'Sent. The ban waits for a second admin; the account is suspended until then.'
          : actioned
            ? 'Decision applied. Everyone it concerns has been told.'
            : 'Closed: no rule broken.',
      );
      onDecided();
    });
  }

  async function escalate(): Promise<void> {
    const reason = await dialogs.prompt({
      title: 'Escalate this case',
      label: 'Why, and who should look at it',
      body: 'It stays in the queue, marked escalated, with your reason as a task. Use it for a legal question, a threat to someone’s life, or a case you should not decide alone.',
      multiline: true,
      maxLength: 2000,
      confirmLabel: 'Escalate',
    });
    if (!reason) return;
    await act('escalate', async () => {
      await api(`/admin/moderation/cases/${c.id}/escalate`, { method: 'POST', body: { reason } });
      toast.success('Escalated.');
      onDecided();
    });
  }

  async function reopen(): Promise<void> {
    const reason = await dialogs.prompt({
      title: 'Reopen this case?',
      label: 'Why it needs a second look',
      body: 'It goes back to the queue as open. Sanctions it gave stay until someone lifts them.',
      multiline: true,
      maxLength: 2000,
      confirmLabel: 'Reopen',
    });
    if (!reason) return;
    await act('reopen', async () => {
      await api(`/admin/moderation/cases/${c.id}/reopen`, { method: 'POST', body: { reason } });
      toast.success('Reopened. It is back in the queue.');
      onDecided();
    });
  }

  const addSubject = (kind: DecisionActionKind): void =>
    setDraft((d) => ({ ...d, actions: [...d.actions, newAction('subject', kind, d.policy)] }));
  const addReporter = (id: string): void =>
    setDraft((d) => ({ ...d, actions: [...d.actions, newAction(`reporter:${id}`, 'warning', d.policy)] }));
  const update = (key: string, change: (a: ActionDraft) => ActionDraft): void =>
    setDraft((d) => ({ ...d, actions: d.actions.map((a) => (a.key === key ? change(a) : a)) }));
  const remove = (key: string): void => setDraft((d) => ({ ...d, actions: d.actions.filter((a) => a.key !== key) }));

  if (!decidable) {
    return (
      <div className="decision is-closed">
        {heading && <h2 className="section-heading">Decision</h2>}
        <p>
          <Badge tone={c.status === 'needs_second_approval' ? 'warn' : c.status === 'actioned' ? 'ok' : 'neutral'}>{statusName(c.status)}</Badge>{' '}
          {c.policy && <span>under {categoryName(c.policy)}</span>}
        </p>
        {c.resolvedAt && (
          <p className="subtle">
            Decided <Time value={c.resolvedAt} mode="absolute" />
          </p>
        )}
        {c.resolutionNote && <blockquote className="report-note">{c.resolutionNote}</blockquote>}
        {c.contentRemoved && <p>The content was removed.</p>}
        {c.status === 'needs_second_approval' ? (
          <p>
            A permanent ban from this case waits for a second admin. <a href="#/ban-approvals">Open ban approvals</a>
          </p>
        ) : (
          <Button icon="refresh" onClick={() => void reopen()} busy={busy === 'reopen'}>
            Reopen for a second look
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="decision">
      {heading && <h2 className="section-heading">Decision</h2>}
      {locked && (
        <Banner tone="warn" title="Someone else is on this case">
          {locked}
        </Banner>
      )}

      <fieldset className="choice-row" disabled={!!locked}>
        <legend className="sr-only">Outcome</legend>
        <label className={`choice${actioned ? ' is-on' : ''}`}>
          <input type="radio" name={`outcome-${c.id}`} checked={actioned} onChange={() => setDraft((d) => ({ ...d, outcome: 'actioned' }))} />
          <span>
            <strong>Breaks a rule</strong>
            <span className="choice-sub">Act on it</span>
          </span>
        </label>
        <label className={`choice${!actioned ? ' is-on' : ''}`}>
          <input type="radio" name={`outcome-${c.id}`} checked={!actioned} onChange={() => setDraft((d) => ({ ...d, outcome: 'no_violation' }))} />
          <span>
            <strong>No rule broken</strong>
            <span className="choice-sub">Close it</span>
          </span>
        </label>
      </fieldset>

      <fieldset className="decision-body" disabled={!!locked}>
        <legend className="sr-only">The decision</legend>
        <Select
          label={actioned ? 'Rule broken' : 'Rule it was reported under'}
          required={actioned}
          value={draft.policy}
          onChange={(e) => {
            const policy = e.target.value;
            setDraft((d) => withPolicy(d, policy));
          }}
          options={[{ value: '', label: 'Choose a rule…', disabled: actioned }, ...policyOptions(c.category ?? draft.policy)]}
        />

        {draft.policy === 'self_harm' && (
          <Banner
            tone="info"
            title="Someone who may hurt themselves is helped, never punished"
            actions={
              !draft.actions.some((a) => a.kind === 'caring_message') && detail.subject ? (
                <Button onClick={() => addSubject('caring_message')}>Add a caring message</Button>
              ) : undefined
            }
          >
            Send a caring message with places to find help. If their life is in danger now, follow the playbook: contact the emergency services where
            they live.
          </Banner>
        )}

        {draft.actions.length > 0 && (
          <ul className="action-rows">
            {draft.actions.map((a) => (
              <ActionRow key={a.key} action={a} policy={draft.policy} who={names(a.target)} onChange={(ch) => update(a.key, ch)} onRemove={() => remove(a.key)} />
            ))}
          </ul>
        )}

        <div className="action-add">
          {detail.subject && (
            <Button icon="plus" onClick={() => addSubject(draft.policy === 'self_harm' ? 'caring_message' : 'warning')}>
              Action for {names('subject')}
            </Button>
          )}
          {reporters.length > 0 && (
            <ReporterPicker reporters={reporters} taken={draft.actions.map((a) => a.target)} onPick={addReporter} />
          )}
        </div>

        {canRemove && actioned && (
          <Checkbox
            label={c.contentRemoved ? 'Remove the content (already removed)' : 'Remove the content'}
            hint="Hidden from everyone and kept as evidence. The author is told why, and can ask for a review."
            checked={draft.removeContent}
            disabled={c.contentRemoved}
            onChange={(v) => setDraft((d) => ({ ...d, removeContent: v }))}
          />
        )}
        {reporters.length > 0 && (
          <Checkbox
            label="Tell the reporters the outcome"
            hint="They hear only that we acted, or that it doesn’t break our rules — never what the other person got."
            checked={draft.notifyReporters}
            onChange={(v) => setDraft((d) => ({ ...d, notifyReporters: v }))}
          />
        )}
        <Textarea
          label="Note for the case record"
          hint="Only moderators see this."
          rows={2}
          maxLength={4000}
          value={draft.note}
          onChange={(e) => {
            const note = e.target.value;
            setDraft((d) => ({ ...d, note }));
          }}
        />
      </fieldset>

      {problems.length > 0 && !locked && (
        <ul className="decision-problems" aria-live="polite">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      {problems.length === 0 && !locked && <PreviewBox state={preview} names={names} />}

      <div className="decision-actions">
        <Button
          variant="primary"
          onClick={() => void decide()}
          busy={busy === 'decide'}
          disabled={!!locked || problems.length > 0 || !!busy || preview.error !== null}
        >
          {busy === 'decide' ? 'Applying…' : actioned ? 'Apply decision' : 'Close: no rule broken'}
        </Button>
        <div className="decision-more">
          <Button onClick={() => void escalate()} disabled={!!locked || !!busy} busy={busy === 'escalate'}>
            Escalate
          </Button>
          <Button variant="danger" icon="shield" onClick={() => setCsamOpen(true)} disabled={!!busy}>
            Child abuse material…
          </Button>
        </div>
      </div>

      <CsamDialog
        open={csamOpen}
        caseId={c.id}
        onClose={() => setCsamOpen(false)}
        onDone={(res) => {
          setCsamOpen(false);
          toast.success(
            res.sanctions.length > 0
              ? 'Hidden, preserved and banned. File the report with a hotline and record its reference below.'
              : 'Hidden and preserved. File the report with a hotline and record its reference below.',
          );
          onDecided();
        }}
      />
    </div>
  );
}

/** One action: who, what, how long, and in what words. */
function ActionRow({
  action: a,
  policy,
  who,
  onChange,
  onRemove,
}: {
  action: ActionDraft;
  policy: string;
  who: string;
  onChange: (change: (a: ActionDraft) => ActionDraft) => void;
  onRemove: () => void;
}): React.JSX.Element {
  const forSubject = a.target === 'subject';
  const kinds: DecisionActionKind[] = forSubject ? [...ACTION_KINDS, 'caring_message'] : [...ACTION_KINDS];
  const caring = a.kind === 'caring_message';
  return (
    <li className={`action-row${a.kind === 'permanent_ban' ? ' is-ban' : ''}`}>
      <div className="action-row-head">
        <strong>
          For {who} <span className="subtle">({forSubject ? 'reported' : 'reporter'})</span>
        </strong>
        <button type="button" className="icon-button ghost" aria-label={`Remove this action for ${who}`} title="Remove this action" onClick={onRemove}>
          <Icon name="close" />
        </button>
      </div>
      <Select
        label="Action"
        value={a.kind}
        onChange={(e) => {
          const kind = e.target.value as DecisionActionKind;
          onChange((x) => withKind(x, kind, policy));
        }}
        options={kinds.map((k) => ({ value: k, label: k === 'caring_message' ? 'Caring message (not a sanction)' : sanctionName(k) }))}
        hint={SANCTION_EFFECT[a.kind]}
      />
      {hasDuration(a.kind) && (
        <DurationChips
          kind={a.kind}
          hours={a.durationHours}
          onPick={(h) =>
            onChange((x) => {
              // "Permanent" on a suspension makes it a ban: its words follow, unless typed
              const next = withDuration(x.kind, h);
              const reword = !x.statementEdited && next.kind !== x.kind;
              return { ...x, ...next, statement: reword ? defaultStatement(next.kind, policy, !forSubject) : x.statement };
            })
          }
        />
      )}
      <Textarea
        label={caring ? 'A few words of your own (optional)' : `What ${who} is told`}
        hint={caring ? `Sent with places to find help near them (${HELPLINE_URL.replace('https://', '')}).` : 'Plain words a child can read. It appears inside the full notice shown below.'}
        rows={3}
        maxLength={2000}
        value={a.statement}
        onChange={(e) => {
          const statement = e.target.value;
          onChange((x) => ({ ...x, statement, statementEdited: true }));
        }}
      />
      {a.statementEdited && !caring && (
        <button type="button" className="link" onClick={() => onChange((x) => ({ ...x, statement: defaultStatement(x.kind, policy, !forSubject), statementEdited: false }))}>
          Use the standard wording
        </button>
      )}
    </li>
  );
}

function ReporterPicker({ reporters, taken, onPick }: { reporters: Array<[string, string]>; taken: DecisionTarget[]; onPick: (id: string) => void }): React.JSX.Element {
  const free = reporters.filter(([id]) => !taken.includes(`reporter:${id}`));
  if (free.length === 1) {
    const [id, name] = free[0]!;
    return (
      <Button icon="plus" onClick={() => onPick(id)}>
        Action for reporter @{name}
      </Button>
    );
  }
  return (
    <label className="inline-select">
      <span className="sr-only">Sanction a reporter</span>
      <select
        value=""
        disabled={free.length === 0}
        onChange={(e) => {
          if (e.target.value) onPick(e.target.value);
        }}
      >
        <option value="">{free.length === 0 ? 'Every reporter has an action' : '+ Action for a reporter…'}</option>
        {free.map(([id, name]) => (
          <option key={id} value={id}>
            @{name}
          </option>
        ))}
      </select>
    </label>
  );
}

function DecisionSummary({
  draft,
  names,
  reporters,
  canRemove,
}: {
  draft: DecisionDraft;
  names: (t: DecisionTarget) => string;
  reporters: number;
  canRemove: boolean;
}): React.JSX.Element {
  const lines = draft.actions.map(
    (a) => `${sanctionName(a.kind)}${hasDuration(a.kind) && a.kind !== 'permanent_ban' ? `, ${durationName(a.durationHours).toLowerCase()}` : ''} — ${names(a.target)}`,
  );
  if (canRemove && draft.outcome === 'actioned' && draft.removeContent) lines.push('Remove the content');
  if (reporters > 0) lines.push(draft.notifyReporters ? 'Tell the reporters the outcome' : 'Don’t tell the reporters');
  return (
    <div className="dialog-text">
      {draft.outcome === 'actioned' && <p>Under the rule on {categoryName(draft.policy).toLowerCase()}:</p>}
      <ul className="plain-list">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </div>
  );
}

interface PreviewState {
  loading: boolean;
  result: DecideResult | null;
  error: unknown;
}

/** The server's preview of a draft, asked again half a second after it stops changing. */
function usePreview(caseId: string, draft: DecisionDraft, enabled: boolean): PreviewState {
  const body = useMemo(() => JSON.stringify(decisionRequest(draft, { preview: true })), [draft]);
  const settled = useDebounced(body, 500);
  const [state, setState] = useState<PreviewState>({ loading: false, result: null, error: null });
  const ticket = useRef(0);
  useEffect(() => {
    if (!enabled) {
      setState({ loading: false, result: null, error: null });
      return;
    }
    const mine = ++ticket.current;
    setState((s) => ({ ...s, loading: true }));
    api<DecideResult>(`/admin/moderation/cases/${caseId}/decide`, { method: 'POST', body: JSON.parse(settled) as unknown })
      .then((result) => {
        if (mine === ticket.current) setState({ loading: false, result, error: null });
      })
      .catch((error: unknown) => {
        if (mine === ticket.current) setState({ loading: false, result: null, error });
      });
  }, [settled, enabled, caseId]);
  return state;
}

function PreviewBox({ state, names }: { state: PreviewState; names: (t: DecisionTarget) => string }): React.JSX.Element {
  const to = (t: string): string => (t === 'reporters' ? 'The reporters' : names(t as DecisionTarget));
  return (
    <div className="preview" aria-live="polite" aria-busy={state.loading}>
      <h3 className="drawer-sub">
        What they will receive
        {state.loading && <span className="spinner" aria-hidden="true" />}
      </h3>
      {state.error !== null ? (
        <p className="field-error" role="alert">
          {errorLine(state.error, 'moderation')}
        </p>
      ) : !state.result ? (
        <p className="subtle">{state.loading ? 'Working out the messages…' : 'The messages appear here.'}</p>
      ) : state.result.messages.length === 0 ? (
        <p className="subtle">Nobody is sent anything.</p>
      ) : (
        <ul className="preview-list">
          {state.result.messages.map((m, i) => (
            <li key={i} className="preview-message">
              <div className="preview-to">To {to(m.to)}</div>
              <div className="preview-title">{m.title}</div>
              <div className="preview-body">{m.body}</div>
            </li>
          ))}
        </ul>
      )}
      {state.result?.permanentBans.map((b) => (
        <Banner key={b.userId} tone="warn" title={`Permanent ban for @${b.username}`}>
          {banModeText(b.mode)}
        </Banner>
      ))}
    </div>
  );
}

/**
 * Child sexual abuse material: the playbook, then the one button that hides
 * it everywhere, keeps it as evidence off the public storage, closes the
 * account for good and opens the filing task. Nothing leaves Hevalo by
 * itself — a moderator files the report with the hotline.
 */
function CsamDialog({
  open,
  caseId,
  onClose,
  onDone,
}: {
  open: boolean;
  caseId: string;
  onClose: () => void;
  onDone: (res: CsamActionResult) => void;
}): React.JSX.Element | null {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  async function run(): Promise<void> {
    setBusy(true);
    try {
      const res = await api<CsamActionResult>(`/admin/moderation/cases/${caseId}/csam`, { method: 'POST', body: note.trim() ? { note: note.trim() } : {} });
      setNote('');
      onDone(res);
    } catch (err) {
      toast.error(errorLine(err, 'moderation'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="medium"
      alert
      dismissable={false}
      title="Child sexual abuse material"
      footer={
        <>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="danger-solid" onClick={() => void run()} disabled={busy} aria-busy={busy || undefined}>
            {busy ? 'Working…' : 'Hide, preserve and ban'}
          </button>
        </>
      }
    >
      <ol className="playbook-steps">
        <li>
          <strong>Don’t download, forward or screenshot it.</strong> Look only as much as you need to decide.
        </li>
        <li>
          This button hides the content everywhere, moves the files off public storage into private evidence storage, and closes the account for good —
          zero tolerance, no waiting for a second admin.
        </li>
        <li>
          Then file a report with the hotline for where the content or the account is. The case keeps a filing task with these links; write the reference
          the hotline gives you on it.
        </li>
        <li>If a child is in danger right now, call the emergency services or the police where they live.</li>
      </ol>
      <p className="subtle">
        <a href="#/playbook">The whole playbook</a>
      </p>
      <ul className="link-list">
        {CSAM_REPORTING_LINKS.map((l) => (
          <li key={l.url}>
            <a href={l.url} target="_blank" rel="noreferrer noopener">
              {l.label}
              <Icon name="external" size={14} />
            </a>
          </li>
        ))}
      </ul>
      <Textarea label="Note for the case record (optional)" rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
    </Dialog>
  );
}
