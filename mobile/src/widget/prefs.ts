import type { WidgetLetter, WidgetPrefs, WidgetSettings } from '@kurda/shared';
import type { ApiClient } from '../api/client';
import type { ApiResult } from '../api/types';
import { isRecord, WIDGET_PREFS_PATH } from './contract';
import { reloadLetterWidget } from './reload';

/**
 * The account's letter widget choices, saved with the session: a pinned letter or always the newest, and whether
 * the words show or only the sender. Every device's widget follows; this device's is asked to catch up at once,
 * the others at their next refresh.
 */

/** The settings as the server sent them, with any fields a choices-only answer leaves out filled as empty. */
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
 * Save a choice (either may be omitted to keep it) and ask this device's widget to show it. Resolves to the
 * current settings, refetched if the answer held only the choices, since pinning changes which letter shows.
 */
export async function saveWidgetPrefs(client: ApiClient, prefs: Partial<WidgetPrefs>): Promise<ApiResult<WidgetSettings>> {
  const res = await client.put<unknown>(WIDGET_PREFS_PATH, prefs);
  if (!res.ok) return res;
  reloadLetterWidget();
  const settings = asSettings(res.data);
  return settings && isRecord(res.data) && 'letter' in res.data ? { ok: true, data: settings } : loadWidgetSettings(client);
}
