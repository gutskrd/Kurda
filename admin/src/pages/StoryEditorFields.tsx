import { createContext } from 'react';
import type { StoryProblem } from '@kurda/shared';
import { fieldId } from '../stories';

/**
 * The pieces every section of the story editor is built from: a field with its label, hint, counter and problems, the
 * problems by tone, the props tying a control to its path, and the read-only switch, so the sections can live in files
 * of their own and still read as one form.
 */

export type ProblemTone = 'error' | 'publish' | 'warning';

/** The problems at one path, by what they stop: a save, a publish, or nothing. */
export interface FieldProblems {
  error: StoryProblem[];
  publish: StoryProblem[];
  warning: StoryProblem[];
}

export type ProblemsAt = (path: string, exact?: boolean) => FieldProblems;


export const TAG: Record<ProblemTone, string> = { error: 'Must fix', publish: 'Before publishing', warning: 'Check' };

/**
 * Whether the story's fields are locked: while published or archived, or while a request is out. Text fields go
 * read-only, not disabled, so their text can still be copied.
 */
export const ReadOnly = createContext(false);

/** Props that tie a control to its path: its id, and its problems for assistive tech. */
export function described(path: string, problems: FieldProblems): { id: string; 'aria-invalid'?: true; 'aria-describedby'?: string } {
  const any = problems.error.length + problems.publish.length + problems.warning.length > 0;
  return {
    id: fieldId(path),
    ...(problems.error.length > 0 ? { 'aria-invalid': true as const } : {}),
    ...(any ? { 'aria-describedby': `${fieldId(path)}-problems` } : {}),
  };
}

export function Field({
  path,
  label,
  optional,
  hint,
  counter,
  problems,
  children,
}: {
  path: string;
  label: string;
  optional?: boolean;
  hint?: React.ReactNode;
  counter?: { n: number; max: number; soft?: number };
  problems: FieldProblems;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="st-field">
      <div className="st-label-row">
        <label htmlFor={fieldId(path)}>
          {label}
          {optional && <span className="subtle"> (optional)</span>}
        </label>
        {counter && <Counter {...counter} />}
      </div>
      {children}
      {hint && <div className="subtle st-hint">{hint}</div>}
      <ProblemList id={`${fieldId(path)}-problems`} problems={problems} />
    </div>
  );
}

export function Counter({ n, max, soft }: { n: number; max: number; soft?: number }): React.JSX.Element {
  const tone = n > max ? ' is-over' : soft !== undefined && n > soft ? ' is-near' : '';
  return (
    <span className={`st-counter${tone}`}>
      {n} / {max}
    </span>
  );
}

export function ProblemList({ id, problems }: { id: string; problems: FieldProblems }): React.JSX.Element | null {
  const items: Array<[ProblemTone, StoryProblem]> = [
    ...problems.error.map((p) => ['error', p] as [ProblemTone, StoryProblem]),
    ...problems.publish.map((p) => ['publish', p] as [ProblemTone, StoryProblem]),
    ...problems.warning.map((p) => ['warning', p] as [ProblemTone, StoryProblem]),
  ];
  if (items.length === 0) return null;
  return (
    <ul className="st-problems" id={id}>
      {items.map(([tone, p], i) => (
        <li key={i} className={`st-problem is-${tone}`}>
          <span className="st-problem-tag">{TAG[tone]}:</span> {p.message}
        </li>
      ))}
    </ul>
  );
}

/** A section card of the editor, with its heading and an optional row of tools beside it. */
export function EditorSection({
  id,
  title,
  count,
  tools,
  hint,
  children,
  className,
}: {
  /** The section's key: 'about' → aria-labelledby st-about. */
  id: string;
  title: string;
  /** "(3 of 20)" after the title. */
  count?: React.ReactNode;
  tools?: React.ReactNode;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <section className={`card st-section${className ? ` ${className}` : ''}`} aria-labelledby={`st-${id}`} id={fieldId(id)} tabIndex={-1}>
      {tools ? (
        <div className="row st-section-head">
          <h2 className="st-h2" id={`st-${id}`}>
            {title} {count && <span className="subtle">{count}</span>}
          </h2>
          <div className="spacer" />
          {tools}
        </div>
      ) : (
        <h2 className="st-h2" id={`st-${id}`}>
          {title} {count && <span className="subtle">{count}</span>}
        </h2>
      )}
      {hint && <p className="subtle st-hint">{hint}</p>}
      {children}
    </section>
  );
}
