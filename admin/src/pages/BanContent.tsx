import { useId } from 'react';
import { BAN_CONTENT_CHOICES, type BanContentChoice } from '@kurda/shared';
import { api } from '../api';
import { CONTENT_CHOICE, coveredLine, type ContentSummary } from '../bans';
import { Checkbox, useLoad } from '../ui';

/**
 * What a suspension or ban does to the person's content, chosen in the ban dialog on a person's page and on a case:
 * Keep, Hide or Remove, each with a plain list of what it covers, and "also their private messages" with the two that
 * take content down. What the person has now is read from the API, so the choice and the summary say real numbers.
 */

export interface ContentChoiceValue {
  choice: BanContentChoice;
  includeMessages: boolean;
}

/** The person's content now, for the dialog; null while it loads or when it cannot be read. */
export function useContentSummary(userId: string | null): ContentSummary | null {
  const loaded = useLoad(
    () => (userId ? api<{ summary: ContentSummary }>(`/admin/users/${encodeURIComponent(userId)}/content-summary`).then((r) => r.summary) : Promise.resolve(null)),
    [userId],
  );
  return loaded.data ?? null;
}

export function ContentChoiceFields({
  value,
  onChange,
  summary,
  who,
}: {
  value: ContentChoiceValue;
  onChange: (next: ContentChoiceValue) => void;
  summary: ContentSummary | null;
  /** "@rojda" */
  who: string;
}): React.JSX.Element {
  const id = useId();
  const takesDown = value.choice !== 'keep';
  return (
    <fieldset className="ban-content" aria-describedby={`${id}-now`}>
      <legend>What happens to what {who} shared</legend>
      <p className="field-hint" id={`${id}-now`}>
        {summary ? `Up now: ${coveredLine(summary, true)}.` : 'Reading what they have shared…'}
      </p>
      <div className="ban-content-choices">
        {BAN_CONTENT_CHOICES.map((c) => (
          <label key={c} className={`choice${value.choice === c ? ' is-on' : ''}`}>
            <input
              type="radio"
              name={`${id}-choice`}
              value={c}
              checked={value.choice === c}
              onChange={() => onChange({ choice: c, includeMessages: c === 'keep' ? false : value.includeMessages })}
            />
            <span>
              <strong>{CONTENT_CHOICE[c].label}</strong>
              <ul>
                {CONTENT_CHOICE[c].covers.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </span>
          </label>
        ))}
      </div>
      <Checkbox
        label="Also their private messages"
        hint={
          takesDown
            ? `Their direct messages read “Removed by Hevalo” to the other person too${summary ? ` (${summary.directMessages})` : ''}.`
            : 'Choose Hide or Remove to take their private messages down too.'
        }
        checked={value.includeMessages}
        disabled={!takesDown}
        onChange={(on) => onChange({ ...value, includeMessages: on })}
      />
    </fieldset>
  );
}

/** The sentences a moderator reads before confirming a ban. */
export function BanSummaryText({ lines }: { lines: readonly string[] }): React.JSX.Element {
  return (
    <div className="ban-summary" aria-live="polite">
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </div>
  );
}
