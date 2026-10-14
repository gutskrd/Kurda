import { useCallback, useMemo, useRef, useState } from 'react';
import type { CopyrightField, CopyrightProblem } from '@kurda/shared';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';

/*
 * The pieces both copyright forms are made of: a labelled field that says what
 * is wrong with it, and the rule for when it says so.
 *
 * Both forms run the shared check (copyrightNoticeProblems,
 * counterNoticeProblems) on every change — the same check the API runs, so
 * what the form lets through the server accepts. A field's problem is shown
 * once the field has been left (or the form sent), and goes the moment it is
 * fixed; nobody is told off for a field they have not reached yet.
 */

const PROBLEM_COPY: Record<CopyrightProblem['code'], MessageKey> = {
  REQUIRED: 'copyright.problem.required',
  TOO_LONG: 'copyright.problem.tooLong',
  INVALID_EMAIL: 'copyright.problem.email',
  INVALID_LINK: 'copyright.problem.link',
  NOT_CONFIRMED: 'copyright.problem.confirm',
};

/** One field's problem, in words. */
export function useProblemText(): (problem: CopyrightProblem | undefined) => string | null {
  const t = useT();
  return useCallback(
    (problem) => {
      if (!problem) return null;
      if (problem.field === 'role') return t('copyright.problem.role');
      return t(PROBLEM_COPY[problem.code], { max: (problem.max ?? 0).toLocaleString() });
    },
    [t],
  );
}

/**
 * Which problems to show, and where to send focus when the form is sent with
 * some left.
 */
export function useFormProblems(problems: CopyrightProblem[], idPrefix: string) {
  const [touched, setTouched] = useState<ReadonlySet<CopyrightField>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const byField = useMemo(() => {
    const m = new Map<CopyrightField, CopyrightProblem>();
    for (const p of problems) if (!m.has(p.field)) m.set(p.field, p);
    return m;
  }, [problems]);

  const shown = (field: CopyrightField): CopyrightProblem | undefined =>
    submitted || touched.has(field) ? byField.get(field) : undefined;

  const touch = (field: CopyrightField) => () =>
    setTouched((prev) => (prev.has(field) ? prev : new Set(prev).add(field)));

  /** Send the form only if nothing is wrong; otherwise show everything and go to the first problem. */
  function check(): boolean {
    setSubmitted(true);
    const first = problems[0];
    if (!first) return true;
    // the first problem is the first field on the page: the checks list them in the form's order
    const el = formRef.current?.querySelector<HTMLElement>(`#${idPrefix}-${first.field}`);
    el?.focus();
    return false;
  }

  function reset(): void {
    setTouched(new Set());
    setSubmitted(false);
  }

  return { formRef, shown, touch, check, reset };
}

/** A labelled text input or text area, with its hint and its problem tied to it for screen readers. */
export function TextField({
  id,
  label,
  hint,
  problem,
  optional = false,
  multiline = false,
  rows = 3,
  value,
  onChange,
  onBlur,
  type = 'text',
  autoComplete,
  dir,
  maxLength,
}: {
  id: string;
  label: string;
  hint?: string;
  problem: string | null;
  optional?: boolean;
  multiline?: boolean;
  rows?: number;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  type?: 'text' | 'email' | 'tel' | 'url';
  autoComplete?: string;
  /** links and emails read left to right in every language */
  dir?: 'ltr';
  /** a hard stop a little past the limit, so a paste is not silently cut at the limit itself */
  maxLength?: number;
}): React.JSX.Element {
  const t = useT();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = problem ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  const common = {
    id,
    value,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value),
    onBlur,
    'aria-invalid': problem ? true : undefined,
    'aria-describedby': describedBy,
    'aria-required': optional ? undefined : true,
    autoComplete,
    dir,
    maxLength,
  } as const;
  return (
    <div className={`field cr-field${problem ? ' has-problem' : ''}`}>
      <label className="field-label" htmlFor={id}>
        {label}
        {optional && <span className="cr-optional"> · {t('copyright.optional')}</span>}
      </label>
      {multiline ? (
        <textarea className="input cr-textarea" rows={rows} {...common} />
      ) : (
        <input className="input" type={type} {...common} />
      )}
      {hint && (
        <span className="field-hint" id={hintId}>
          {hint}
        </span>
      )}
      {problem && (
        <span className="cr-problem" id={errorId}>
          {problem}
        </span>
      )}
    </div>
  );
}

/** A statement the sender confirms by ticking it. */
export function Confirm({
  id,
  label,
  checked,
  onChange,
  problem,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  problem: string | null;
}): React.JSX.Element {
  const errorId = problem ? `${id}-error` : undefined;
  return (
    <div className={`cr-confirm${problem ? ' has-problem' : ''}`}>
      <label className="cr-confirm-label" htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-invalid={problem ? true : undefined}
          aria-describedby={errorId}
        />
        <span>{label}</span>
      </label>
      {problem && (
        <span className="cr-problem" id={errorId}>
          {problem}
        </span>
      )}
    </div>
  );
}
