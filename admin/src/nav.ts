import { useEffect, useState } from 'react';

/**
 * Minimal hash-based navigation (no react-router — it carries high-severity
 * advisories across its 7.x line, and an admin tool needs only a page switch).
 * The active page lives in `location.hash` so links are bookmarkable and the
 * back button works.
 */
export function useHashRoute(fallback: string): [string, (page: string) => void] {
  const read = (): string => location.hash.replace(/^#\/?/, '') || fallback;
  const [page, setPage] = useState(read);

  useEffect(() => {
    const onChange = (): void => setPage(read());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = (next: string): void => {
    location.hash = `/${next}`;
  };
  return [page, navigate];
}
