import type { WidgetTokenResult } from '@kurda/shared';
import type { ApiClient } from '../api/client';
import { WIDGET_TOKENS_PATH, WIDGET_TOKEN_CURRENT_PATH, widgetAuthorization, type WidgetConfig } from './contract';
import { timedFetch, type FetchLike } from './feed';
import { reloadLetterWidget } from './reload';
import { clearWidgetConfig, readWidgetConfig, widgetTokenRejected, writeWidgetConfig, writeWidgetLocale } from './storage';

/**
 * This phone's widget token: made when somebody signs in, kept while they
 * are, and taken away again when they sign out.
 *
 * The widget cannot use the account's session — it is another program on
 * iPhone, it runs when the app is closed, and a session that can do
 * everything has no business on a home screen. So the app asks the server
 * for a token that can read the widget's letter and nothing else
 * (`POST /letters/widget/tokens`), shown once, and leaves it where the widget
 * reads it (storage.ts). Signing out removes it from the server with the
 * token itself (`DELETE …/tokens/current`, which needs no session, so it
 * works after the session has ended) and from the phone.
 *
 * The token is made afresh once each time the app starts and at each
 * sign-in, naming the one before as the one it replaces, so a phone never
 * holds two and a token lasts no longer than it must. The server ends a token
 * with the session it was made in (this phone signed out from the list of
 * devices, or its session running out), with all of the account's sessions (a
 * new password, signing out everywhere), and thirty days after it was made
 * whatever else happens. The widget then hears 401, says so in storage, and
 * shows "Open Hevalo"; the next time the app is open it makes a new one.
 */

export type TokenOutcome = 'kept' | 'made' | 'failed';

/** After the server would not make a token, how long before asking again: each time the app comes to the front would be too often. */
const RETRY_AFTER_FAILURE_MS = 30 * 60_000;

/** How long a token's removal may take before the phone forgets it anyway. */
const REVOKE_TIMEOUT_MS = 10_000;

let making: Promise<TokenOutcome> | null = null;
/** When the server last would not make a token, or null. */
let failedAt: number | null = null;
/** Whether the token was made in this run of the app (since it started, or since the last sign-out). */
let madeThisRun = false;

/** Remove a token from the server it belongs to, with the token itself. Best effort: the phone forgets it either way. */
async function revoke(config: WidgetConfig, fetchFn: FetchLike): Promise<void> {
  try {
    await timedFetch(fetchFn, `${config.apiBase}${WIDGET_TOKEN_CURRENT_PATH}`, { method: 'DELETE', headers: { authorization: widgetAuthorization(config.token) } }, REVOKE_TIMEOUT_MS);
  } catch {
    // offline: the token stays on the server unused until it is the oldest of five and is dropped
  }
}

/**
 * Make sure the widget has a token from this server, in the app's language.
 * One at a time: a call made while another is under way waits for it and
 * then only checks what it asked for — the app's language, say, which
 * arrives a moment after the session as the app starts — so signing in and
 * coming to the front together make one token.
 */
export function ensureWidgetToken(
  { client, apiBase, locale }: { client: ApiClient; apiBase: string; locale: string },
  opts: { now?: number; fetchFn?: FetchLike } = {},
): Promise<TokenOutcome> {
  if (making) return making.catch(() => undefined).then(() => ensureWidgetToken({ client, apiBase, locale }, opts));
  making = (async (): Promise<TokenOutcome> => {
    const now = opts.now ?? Date.now();
    const config = await readWidgetConfig();
    const refused = await widgetTokenRejected();
    const usable = config !== null && config.apiBase === apiBase && !refused;
    // the token the widget has stays while it works and a new one cannot be had
    const keep = async (): Promise<TokenOutcome> => {
      if (!usable) return 'failed';
      if (config.locale !== locale) {
        await writeWidgetLocale(locale);
        reloadLetterWidget();
      }
      return 'kept';
    };
    if (usable && madeThisRun) return keep();
    if (failedAt !== null && now - failedAt < RETRY_AFTER_FAILURE_MS) return keep();
    // one for another server (a build pointed elsewhere before) goes from there first; one from this server goes as the new one is made
    const sameServer = config?.apiBase === apiBase;
    if (config && !sameServer) await revoke(config, opts.fetchFn ?? fetch);
    const res = await client.post<WidgetTokenResult>(WIDGET_TOKENS_PATH, config && sameServer ? { replaces: config.token } : {});
    const token = res.ok ? res.data?.token : undefined;
    if (typeof token !== 'string' || token.length === 0) {
      failedAt = now;
      return keep();
    }
    failedAt = null;
    madeThisRun = true;
    await writeWidgetConfig({ token, apiBase, locale });
    reloadLetterWidget();
    return 'made';
  })().finally(() => {
    making = null;
  });
  return making;
}

/**
 * Take this phone's widget token away, from the server and the phone, and
 * show the widget signed out. Resolves to whether there was one.
 */
export async function forgetWidgetToken(opts: { fetchFn?: FetchLike } = {}): Promise<boolean> {
  // a token being made as somebody signs out is taken away with the rest, not left behind
  if (making) await making.catch(() => undefined);
  // the next sign-in makes its own
  madeThisRun = false;
  const config = await readWidgetConfig();
  const refused = await widgetTokenRejected();
  if (!config && !refused) return false;
  if (config) await revoke(config, opts.fetchFn ?? fetch);
  await clearWidgetConfig();
  reloadLetterWidget();
  return true;
}

/**
 * Take the widget off every phone of the account (`DELETE …/tokens`, with the
 * session), then give this phone a new token so its own widget carries on.
 */
export async function removeEveryWidget({ client, apiBase, locale }: { client: ApiClient; apiBase: string; locale: string }): Promise<boolean> {
  const res = await client.delete(WIDGET_TOKENS_PATH);
  if (!res.ok) return false;
  if (making) await making.catch(() => undefined);
  await clearWidgetConfig();
  failedAt = null;
  madeThisRun = false;
  await ensureWidgetToken({ client, apiBase, locale });
  return true;
}

/** For tests: as the app is when it starts. */
export function resetTokenRun(): void {
  failedAt = null;
  madeThisRun = false;
  making = null;
}
