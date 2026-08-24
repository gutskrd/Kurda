import { useEffect, useState } from 'react';
import { applyTheme, readTheme, type ThemePref } from '../lib/theme';
import { MoonIcon, SunIcon } from './icons';

/** Cycles system → light → dark. Compact, icon-only, for the nav. */
export function ThemeToggle(): React.JSX.Element {
  const [pref, setPref] = useState<ThemePref>('system');

  useEffect(() => setPref(readTheme()), []);

  const next: ThemePref = pref === 'system' ? 'light' : pref === 'light' ? 'dark' : 'system';
  const label = `Theme: ${pref}. Switch to ${next}.`;

  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      style={{ width: 40, padding: 0 }}
      aria-label={label}
      title={label}
      onClick={() => {
        applyTheme(next);
        setPref(next);
      }}
    >
      {pref === 'dark' ? <MoonIcon size={18} /> : <SunIcon size={18} />}
    </button>
  );
}
