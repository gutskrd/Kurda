import { useEffect, useState } from 'react';

type Flags = typeof import('@kurda/shared/src/flags');

/** The flags arrive together, once, the first time a page shows one, so pages without a flag never carry them. */
let loading: Promise<Flags> | null = null;
const load = (): Promise<Flags> => (loading ??= import('@kurda/shared/src/flags'));

/**
 * A country's small flag before its name, drawn by Hevalo (shared/src/flags.ts). It holds its place while the flags
 * load, so the name beside it never shifts, and is left out for a code with no flag. Decorative: the name says it.
 */
export function Flag({ code }: { code: string }): React.JSX.Element | null {
  const [src, setSrc] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    setSrc(undefined);
    load().then(
      (m) => live && setSrc(m.flagDataUrl(code)),
      () => live && setSrc(null),
    );
    return () => {
      live = false;
    };
  }, [code]);
  if (src === null) return null;
  if (src === undefined) return <span className="flag" aria-hidden="true" />;
  return <img className="flag" src={src} alt="" width={21} height={14} />;
}
