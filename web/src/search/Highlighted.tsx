import { Fragment } from 'react';
import { matchedParts } from '@kurda/shared';

/**
 * A result's name with the part that answers the search marked, so a list of
 * people or words shows at a glance why each one is there — "serk" inside
 * "berserker" — folded the way the searches match (@kurda/shared
 * search-highlight.ts). A near spelling holds no piece of the query and shows
 * as written.
 */
export function Highlighted({ text, query }: { text: string; query: string }): React.JSX.Element {
  return (
    <>
      {matchedParts(text, query).map((part, i) =>
        part.match ? (
          <mark key={i} className="search-match">
            {part.text}
          </mark>
        ) : (
          <Fragment key={i}>{part.text}</Fragment>
        ),
      )}
    </>
  );
}
