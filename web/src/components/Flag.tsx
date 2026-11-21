import { useState } from 'react';
import { flagUrl } from '../lib/countries';

/** A country's small flag beside its name; a flag that cannot be fetched is left out rather than drawn as an empty box. */
export function Flag({ code }: { code: string }): React.JSX.Element | null {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return <img className="flag" src={flagUrl(code)} alt="" width={22} height={16} loading="lazy" onError={() => setFailed(true)} />;
}
