/**
 * Exercise preview model (KUR-100). Normalizes a stored exercise payload into
 * the same view-model the mobile player renders from, so the admin "preview"
 * shows exactly what a learner will see — not an admin-only approximation. The
 * React shell renders these; keeping the mapping pure makes it testable and the
 * single definition of "how an exercise looks".
 */

export type ExerciseType = 'multiple_choice' | 'translate' | 'match_pairs' | 'listening' | 'speaking' | 'writing';

export type PreviewModel =
  | { kind: 'multiple_choice'; prompt: string; options: Array<{ text: string; correct: boolean }> }
  | { kind: 'translate'; prompt: string; accepted: string[] }
  | { kind: 'match_pairs'; pairs: Array<{ left: string; right: string }> }
  | { kind: 'prompt'; type: ExerciseType; prompt: string }
  | { kind: 'unsupported'; type: string };

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

/** Build the learner-accurate preview for an exercise, or an `unsupported` marker. */
export function toPreview(type: string, payload: unknown): PreviewModel {
  const p = (payload ?? {}) as Record<string, unknown>;
  switch (type) {
    case 'multiple_choice': {
      const options = Array.isArray(p.options) ? p.options : [];
      const correct = typeof p.correctIndex === 'number' ? p.correctIndex : -1;
      return {
        kind: 'multiple_choice',
        prompt: str(p.prompt),
        options: options.map((o, i) => ({ text: str(o), correct: i === correct })),
      };
    }
    case 'translate':
      return { kind: 'translate', prompt: str(p.prompt), accepted: Array.isArray(p.accepted) ? p.accepted.map((a) => str(a)) : [] };
    case 'match_pairs': {
      const pairs = Array.isArray(p.pairs) ? p.pairs : [];
      return {
        kind: 'match_pairs',
        pairs: pairs.map((pair) => {
          const pr = (pair ?? {}) as Record<string, unknown>;
          return { left: str(pr.left), right: str(pr.right) };
        }),
      };
    }
    case 'listening':
    case 'speaking':
    case 'writing':
      return { kind: 'prompt', type, prompt: str(p.prompt) };
    default:
      return { kind: 'unsupported', type };
  }
}
