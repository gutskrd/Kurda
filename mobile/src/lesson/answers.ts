import type { ExerciseType, MatchPair } from './types';

/**
 * The learner's in-progress answer, keyed by exercise type. The player
 * holds this locally; `encodeAnswer` turns it into the server's wire shape
 * (graded server-side — the client never knows the correct answer).
 */
export type DraftAnswer =
  | { type: 'multiple_choice'; choice: number | null }
  | { type: 'translate'; text: string }
  | { type: 'listening'; text: string }
  | { type: 'match_pairs'; matches: MatchPair[] };

export function emptyDraft(type: ExerciseType): DraftAnswer {
  switch (type) {
    case 'multiple_choice':
      return { type, choice: null };
    case 'translate':
      return { type, text: '' };
    case 'listening':
      return { type, text: '' };
    case 'match_pairs':
      return { type, matches: [] };
  }
}

/** True once the draft has enough input to submit. */
export function isDraftComplete(draft: DraftAnswer, pairCount: number): boolean {
  switch (draft.type) {
    case 'multiple_choice':
      return draft.choice !== null;
    case 'translate':
    case 'listening':
      return draft.text.trim().length > 0;
    case 'match_pairs':
      return draft.matches.length === pairCount;
  }
}

/** Encode a draft into the request body the answers endpoint expects. */
export function encodeAnswer(draft: DraftAnswer): unknown {
  switch (draft.type) {
    case 'multiple_choice':
      return { choice: draft.choice };
    case 'translate':
    case 'listening':
      return { text: draft.text.trim() };
    case 'match_pairs':
      return { matches: draft.matches };
  }
}
