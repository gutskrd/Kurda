import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiError } from '../lib/types';

/**
 * Shows a sign-in or sign-up refusal under the field it concerns: the field is marked, shaken once
 * (styles/motion.css) and focused. Refusals about no field stay above the form.
 */

/** The fields a refusal from the server can be about. */
export type AuthField = 'email' | 'username' | 'password';

/**
 * Which field a refusal is about, or null. A wrong email and password pair goes under the password, since the server
 * must not say which was wrong and the password is the one retyped.
 */
export function authErrorField(error: ApiError): AuthField | null {
  switch (error.code) {
    case 'INVALID_USERNAME':
    case 'USERNAME_TAKEN':
      return 'username';
    case 'WEAK_PASSWORD':
    case 'PASSWORD_BREACHED':
    case 'INVALID_CREDENTIALS':
      return 'password';
    case 'VALIDATION_ERROR': {
      // The issues name their field (lib/api.ts reads the same list for its message).
      const issues = Array.isArray(error.details) ? (error.details as Array<{ path?: unknown }>) : [];
      for (const field of ['email', 'username', 'password'] as const) {
        if (issues.some((issue) => Array.isArray(issue.path) && issue.path.includes(field))) return field;
      }
      return null;
    }
    default:
      return null;
  }
}

interface Problem<F extends string> {
  field: F;
  message: string;
  /** Counts refusals, so the same field refused twice running is shaken twice. */
  turn: number;
}

/**
 * One field's problem at a time for a form: `show` marks a field and `clear` unmarks it once the reader edits it.
 * `ids` are the inputs to focus; a field made of two selects has none and is only marked.
 */
export function useFieldProblem<F extends string>(ids: Partial<Record<F, string>> = {}): {
  /** The message under `field`, or null. */
  of: (field: F) => string | null;
  /** The class for `field`'s wrapper: marked, and shaken once for each refusal. */
  fieldClass: (field: F, base?: string) => string;
  any: boolean;
  show: (field: F, message: string) => void;
  clear: (field?: F) => void;
} {
  const [problem, setProblem] = useState<Problem<F> | null>(null);
  const turns = useRef(0);
  const inputs = useRef(ids);
  inputs.current = ids;

  const show = useCallback((field: F, message: string): void => {
    turns.current += 1;
    setProblem({ field, message, turn: turns.current });
  }, []);
  const clear = useCallback((field?: F): void => {
    setProblem((now) => (now && (field === undefined || now.field === field) ? null : now));
  }, []);

  // Focus the field at fault once per refusal, not on every render that still has the problem.
  const turn = problem?.turn;
  useEffect(() => {
    if (!problem) return;
    const id = inputs.current[problem.field];
    if (id) document.getElementById(id)?.focus();
  }, [turn]);

  return {
    of: (field) => (problem?.field === field ? problem.message : null),
    // Two class names for one shake (motion.css), so a second refusal restarts it.
    fieldClass: (field, base = 'field') => (problem?.field === field ? `${base} has-problem is-shake-${problem.turn % 2 === 1 ? 'a' : 'b'}` : base),
    any: problem !== null,
    show,
    clear,
  };
}
