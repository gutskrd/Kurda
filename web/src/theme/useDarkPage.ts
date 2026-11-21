import { useEffect, useState } from 'react';

/** Whether the page is dark (theme/theme.ts sets the scheme on the root), followed as it changes. */
export function useDarkPage(): boolean {
  const read = (): boolean => typeof document !== 'undefined' && document.documentElement.dataset.theme !== 'light';
  const [dark, setDark] = useState(read);
  useEffect(() => {
    if (typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver(() => setDark(read()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);
  return dark;
}
