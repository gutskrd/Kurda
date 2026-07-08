import type { MatchPair } from './types';

/** Transient state of the match-pairs interaction. */
export interface MatchState {
  matches: MatchPair[];
  /** a left token awaiting its right, or null */
  selectedLeft: string | null;
}

export const emptyMatch: MatchState = { matches: [], selectedLeft: null };

export function isLeftMatched(state: MatchState, left: string): boolean {
  return state.matches.some((m) => m.left === left);
}

export function isRightMatched(state: MatchState, right: string): boolean {
  return state.matches.some((m) => m.right === right);
}

/**
 * Tap a left token: matched → unmatch it; already-selected → deselect;
 * otherwise select it (waiting for a right token).
 */
export function tapLeft(state: MatchState, left: string): MatchState {
  if (isLeftMatched(state, left)) {
    return { matches: state.matches.filter((m) => m.left !== left), selectedLeft: null };
  }
  return { ...state, selectedLeft: state.selectedLeft === left ? null : left };
}

/**
 * Tap a right token: matched → unmatch it; else if a left is selected,
 * form the pair; else nothing (no left chosen yet).
 */
export function tapRight(state: MatchState, right: string): MatchState {
  if (isRightMatched(state, right)) {
    return { ...state, matches: state.matches.filter((m) => m.right !== right) };
  }
  if (state.selectedLeft === null) return state;
  return {
    matches: [...state.matches, { left: state.selectedLeft, right }],
    selectedLeft: null,
  };
}
