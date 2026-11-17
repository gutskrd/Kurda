import type { WidgetLetter, WidgetPrefs, WidgetSettings } from '@kurda/shared';
import type { ApiClient } from '../api/client';
import type { ApiResult } from '../api/types';
import { WIDGET_PREFS_PATH } from './contract';
import { reloadLetterWidget } from './reload';

/**
 * What the account chooses for its letter widgets, with the session: a
 * letter pinned to them for good, or always the newest; and whether they show
 * the words or only who a letter is from. A change is the account's, so every
 * phone with the widget follows it; this phone's widget is asked to catch up
 * at once, the others at their next refresh.
 */

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The settings as the server sent them, with what an answer of the choices alone leaves out filled in as nothing yet. */
function asSettings(raw: unknown): WidgetSettings | null {
  if (!isRecord(raw) || typeof raw.showWords !== 'boolean') return null;
  const pinnedLetterId = typeof raw.pinnedLetterId === 'string' ? raw.pinnedLetterId : null;
  return {
    pinnedLetterId,
    showWords: raw.showWords,
    letter: isRecord(raw.letter) ? (raw.letter as unknown as WidgetLetter) : null,
    pinned: typeof raw.pinned === 'boolean' ? raw.pinned : pinnedLetterId !== null,
    widgets: typeof raw.widgets === 'number' ? raw.widgets : 0,
  };
}

const unreadable = (): ApiResult<never> => ({ ok: false, error: { kind: 'server', message: 'unexpected answer' } });

export async function loadWidgetSettings(client: ApiClient): Promise<ApiResult<WidgetSettings>> {
  const res = await client.get<unknown>(WIDGET_PREFS_PATH);
  if (!res.ok) return res;
  const settings = asSettings(res.data);
  return settings ? { ok: true, data: settings } : unreadable();
}

/**
 * Save a choice — either may be left out to keep it as it is — and ask this
 * phone's widget to show it. Resolves to the settings as they now are (asked
 * again if the answer was the choices alone, since pinning changes which
 * letter the widget shows).
 */
export async function saveWidgetPrefs(client: ApiClient, prefs: Partial<WidgetPrefs>): Promise<ApiResult<WidgetSettings>> {
  const res = await client.put<unknown>(WIDGET_PREFS_PATH, prefs);
  if (!res.ok) return res;
  reloadLetterWidget();
  const settings = asSettings(res.data);
  return settings && isRecord(res.data) && 'letter' in res.data ? { ok: true, data: settings } : loadWidgetSettings(client);
}
