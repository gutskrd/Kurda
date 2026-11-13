import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiError } from '../lib/types';

/**
 * What is wrong with a sign-in or a sign-up, said where it is wrong.
 *
 * Both forms used to answer every refusal with one red box above the first
 * field. A username already taken was said three fields away from the
 * username, and on a phone above the screen: the reader pressed the button,
 * nothing near the button changed, and the reason had to be scrolled to and
 * then matched to a field by reading it. A refusal that is about one field is
 * said under that field now, the field is marked and given the one small shake
 * a wrong answer gets (styles/motion.css), and the caret is put in it. What is
 * not about a field — no connection, a paused sign-in, an address that may
 * already have an account — is still said above the form, as before.
 */

/** The fields a refusal from the server can be about. */
export type AuthField = 'email' | 'username' | 'password';

/**
 * Which field a refusal is about, or null when it is about none of them.
 *
 * A wrong email-and-password pair is said under the password: the server does
 * not say which of the two was wrong, and must not, and the password is the
 * one retyped.
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
      // the issues name the field they are about (lib/api.ts reads the same list for its words)
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
  /** which refusal this is, so the same field refused twice running is shaken twice */
  turn: number;
}

/**
 * One field's problem at a time, for a form: `show` marks a field, `clear`
 * takes the mark off again as soon as the reader starts to mend it.
 *
 * `ids` are the inputs' own ids, for the fields that have one to put the
 * caret in; a field made of two selects has none and is only marked.
 */
export function useFieldProblem<F extends string>(ids: Partial<Record<F, string>> = {}): {
  /** the words under `field`, or null */
  of: (field: F) => string | null;
  /** the class for `field`'s wrapper: marked, and shaken once for each refusal */
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

  // the caret goes to the field that has to change, each time the form is refused over it:
  // a new refusal moves it, not every render that still has the problem
  const turn = problem?.turn;
  useEffect(() => {
    if (!problem) return;
    const id = inputs.current[problem.field];
    if (id) document.getElementById(id)?.focus();
  }, [turn]);

  return {
    of: (field) => (problem?.field === field ? problem.message : null),
    // two names for one shake (motion.css), so a second refusal starts it again
    fieldClass: (field, base = 'field') => (problem?.field === field ? `${base} has-problem is-shake-${problem.turn % 2 === 1 ? 'a' : 'b'}` : base),
    any: problem !== null,
    show,
    clear,
  };
}
