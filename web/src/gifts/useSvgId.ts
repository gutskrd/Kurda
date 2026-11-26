import { useId } from 'react';

/** An id usable inside url(#…), since React's ids contain characters a fragment would need escaped. */
export function useSvgId(prefix: string): string {
  return `${prefix}${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
}
