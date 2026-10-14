import { useId } from 'react';
import { REPORT_CATEGORIES, type SanctionKind } from '@kurda/shared';
import {
  DURATION_PRESETS,
  SANCTION_EFFECT,
  categoryName,
  defaultDuration,
  defaultStatement,
  durationName,
  durationShort,
  hasDuration,
  sanctionName,
  withDuration,
} from '../moderation';
import { Select, Textarea } from '../ui';

/**
 * The parts of a sanction form that the case's decision, a person's page and
 * an appeal's "change it" share: the row of lengths (24 h to permanent), and
 * a whole sanction — what, how long, which rule, and the words the person
 * reads — kept as one draft so a change of kind or rule rewrites the words
 * nobody has typed into.
 */

/**
 * The lengths as a row of chips, one chosen. `permanent: false` leaves out
 * "Permanent" — an appeal's new sanction can never be a ban, and a
 * suspension needs an end.
 */
export function DurationChips({
  kind,
  hours,
  onPick,
  permanent = true,
  label = 'How long',
}: {
  kind: string;
  hours: number | null;
  onPick: (hours: number | null) => void;
  permanent?: boolean;
  label?: string;
}): React.JSX.Element {
  const id = useId();
  const presets = DURATION_PRESETS.filter((h) => permanent || h !== null);
  return (
    <div className="field">
      <span className="field-label" id={`${id}-len`}>
        {label}
      </span>
      <div className="chips" role="radiogroup" aria-labelledby={`${id}-len`}>
        {presets.map((h) => {
          const on = kind === 'permanent_ban' ? h === null : hours === h;
          return (
            <button
              key={String(h)}
              type="button"
              role="radio"
              aria-checked={on}
              className={`chip${on ? ' is-on' : ''}${h === null ? ' is-permanent' : ''}`}
              title={durationName(h)}
              onClick={() => onPick(h)}
            >
              {durationShort(h)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export interface SanctionDraft {
  kind: SanctionKind;
  durationHours: number | null;
  /** '' until one is chosen */
  policy: string;
  statement: string;
  /** typed by the moderator: a change of rule or kind leaves it alone */
  statementEdited: boolean;
  internalNote: string;
}

export function newSanctionDraft(kind: SanctionKind = 'warning', policy = ''): SanctionDraft {
  return { kind, durationHours: defaultDuration(kind), policy, statement: policy ? defaultStatement(kind, policy) : '', statementEdited: false, internalNote: '' };
}

/** Another kind: the length carries over when both have one, the words follow unless typed. */
export function draftWithKind(d: SanctionDraft, kind: SanctionKind): SanctionDraft {
  const keep = hasDuration(kind) && kind !== 'permanent_ban' && hasDuration(d.kind) && d.kind !== 'permanent_ban' && !(kind === 'suspension' && d.durationHours === null);
  return {
    ...d,
    kind,
    durationHours: keep ? d.durationHours : defaultDuration(kind),
    statement: d.statementEdited || !d.policy ? d.statement : defaultStatement(kind, d.policy),
  };
}

/** Another length; "Permanent" on a suspension makes it a ban (and its words follow). */
export function draftWithDuration(d: SanctionDraft, hours: number | null): SanctionDraft {
  const next = withDuration(d.kind, hours);
  const kind = next.kind as SanctionKind;
  const reword = !d.statementEdited && kind !== d.kind && !!d.policy;
  return { ...d, kind, durationHours: next.durationHours, statement: reword ? defaultStatement(kind, d.policy) : d.statement };
}

export function draftWithPolicy(d: SanctionDraft, policy: string): SanctionDraft {
  return { ...d, policy, statement: d.statementEdited || !policy ? d.statement : defaultStatement(d.kind, policy) };
}

/** What is plainly missing before sending; the server checks the rest. */
export function sanctionDraftProblems(d: SanctionDraft, { needsPolicy = true }: { needsPolicy?: boolean } = {}): string[] {
  const out: string[] = [];
  if (needsPolicy && !d.policy) out.push('Choose the rule that was broken.');
  if (!d.statement.trim()) out.push('Write what they will be told.');
  if (d.kind === 'suspension' && d.durationHours === null) out.push('A suspension needs an end. For none, choose a permanent ban.');
  return out;
}

/** The kinds a person's page offers, lightest first. A removal needs content, so it is the case's to give. */
export const PERSON_KINDS: readonly SanctionKind[] = ['warning', 'chat_mute', 'post_mute', 'feature_limit', 'suspension', 'permanent_ban'];

/**
 * The fields of a sanction. `kinds` limits what can be chosen (an appeal's
 * new sanction is never a ban); `withPolicy` and `withNote` are off where the
 * rule and the record come from elsewhere (an appeal keeps the original rule).
 */
export function SanctionFields({
  draft,
  onChange,
  who,
  kinds = PERSON_KINDS,
  withPolicy = true,
  withNote = true,
}: {
  draft: SanctionDraft;
  onChange: (next: SanctionDraft) => void;
  /** "@heval" */
  who: string;
  kinds?: readonly SanctionKind[];
  withPolicy?: boolean;
  withNote?: boolean;
}): React.JSX.Element {
  const canBan = kinds.includes('permanent_ban');
  return (
    <div className="sanction-fields">
      <Select
        label="Action"
        value={draft.kind}
        onChange={(e) => onChange(draftWithKind(draft, e.target.value as SanctionKind))}
        options={kinds.map((k) => ({ value: k, label: sanctionName(k) }))}
        hint={SANCTION_EFFECT[draft.kind]}
      />
      {hasDuration(draft.kind) && (
        <DurationChips
          kind={draft.kind}
          hours={draft.durationHours}
          permanent={canBan || draft.kind !== 'suspension'}
          onPick={(h) => onChange(draftWithDuration(draft, h))}
        />
      )}
      {withPolicy && (
        <Select
          label="Rule broken"
          required
          value={draft.policy}
          onChange={(e) => onChange(draftWithPolicy(draft, e.target.value))}
          hint="Someone who may hurt themselves is helped from a case, with a caring message — never sanctioned."
          options={[
            { value: '', label: 'Choose a rule…', disabled: true },
            // self-harm is never a reason to sanction (the API refuses it too)
            ...REPORT_CATEGORIES.filter((c) => c.key !== 'self_harm').map((c) => ({ value: c.key, label: categoryName(c.key) })),
          ]}
        />
      )}
      <Textarea
        label={`What ${who} is told`}
        hint="Plain words a child can read. It appears inside the notice, with the end date and how to ask for a review."
        rows={3}
        maxLength={2000}
        required
        value={draft.statement}
        onChange={(e) => onChange({ ...draft, statement: e.target.value, statementEdited: true })}
      />
      {draft.statementEdited && draft.policy && (
        <button type="button" className="link" onClick={() => onChange({ ...draft, statement: defaultStatement(draft.kind, draft.policy), statementEdited: false })}>
          Use the standard wording
        </button>
      )}
      {withNote && (
        <Textarea
          label="Note for moderators"
          hint="Why, for the record. They never see it."
          rows={2}
          maxLength={2000}
          value={draft.internalNote}
          onChange={(e) => onChange({ ...draft, internalNote: e.target.value })}
        />
      )}
    </div>
  );
}
