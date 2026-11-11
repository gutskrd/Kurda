import { useMemo } from 'react';

/**
 * Markup that goes into the page as it stands (a drawing from @kurda/shared,
 * a block of keyframes), as React is to be handed it: the same object for as
 * long as the markup is the same.
 *
 * React compares what it is handed, not the markup inside it. Handed a fresh
 * object on every render, it empties the element and parses the markup again
 * whenever anything around it changes: an animation running in there starts
 * over, and whatever held on to one of its nodes is left holding something no
 * longer on the page. Keyed on the markup itself, so it does not matter how
 * the caller came by the string, or whether it made it again.
 *
 * A hook, so each drawing in a list needs a small component of its own.
 */
export function useMarkup(html: string): { __html: string } {
  return useMemo(() => ({ __html: html }), [html]);
}
