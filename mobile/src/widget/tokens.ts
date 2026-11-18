import type { WidgetTokenResult } from '@kurda/shared';
import type { ApiClient } from '../api/client';
import { WIDGET_TOKENS_PATH, WIDGET_TOKEN_CURRENT_PATH, widgetAuthorization, type WidgetConfig } from './contract';
import { timedFetch, type FetchLike } from './feed';
import { reloadLetterWidget } from './reload';
import { clearWidgetConfig, readWidgetConfig, widgetTokenRejected, writeWidgetConfig, writeWidgetLocale } from './storage';

/**
 * This device's widget token: created at sign-in, kept while signed in, and revoked at sign-out.
 *
 * The widget cannot use the account session: on iPhone it is another program, it runs while the app is closed,
 * and an all-powerful session does not belong on a home screen. So the app requests a token that can only read
 * the widget's letter (`POST /letters/widget/tokens`, shown once) and stores it where the widget reads it
 * (storage.ts). Signing out revokes it with the token itself (`DELETE …/tokens/current`, which needs no session)
 * and removes it locally.
 *
 * A fresh token is made on each app start and sign-in, naming its predecessor as replaced, so a device never
 * holds two. The server also ends a token with the session it was made in, with all the account's sessions (a new
 * password, signing out everywhere), and thirty days after creation. The widget then gets 401, records it in
 * storage and shows "Open Hevalo", and the app makes a new one next time it opens.
 */

export type TokenOutcome = 'kept' | 'made' | 'failed';

/** After the server refused to make a token, how long before retrying; every foregrounding would be too often. */
const RETRY_AFTER_FAILURE_MS = 30 * 60_000;

/** How long a token's removal may take before the phone forgets it anyway. */
const REVOKE_TIMEOUT_MS = 10_000;

let making: Promise<TokenOutcome> | null = null;
/** When the server last would not make a token, or null. */
let failedAt: number | null = null;
/** Whether the token was made in this app run (since startup or the last sign-out). */
let madeThisRun = false;

/** Revoke a token on its server with the token itself. Best effort: the device forgets it either way. */
async function revoke(config: WidgetConfig, fetchFn: FetchLike): Promise<void> {
  try {
    await timedFetch(fetchFn, `${config.apiBase}${WIDGET_TOKEN_CURRENT_PATH}`, { method: 'DELETE', headers: { authorization: widgetAuthorization(config.token) } }, REVOKE_TIMEOUT_MS);
  } catch {
    // Offline: the token stays on the server unused until it is the oldest of five and is dropped.
  }
}

/**
 * Ensure the widget has a token from this server, in the app's language. One at a time: a call made during
 * another waits for it and then checks only what it asked for (such as the app language, which arrives just after
 * the session at startup), so a sign-in and a foregrounding together make one token.
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
    // The token the widget has stays while it works and a new one cannot be had.
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
    // A token for another server (from a build pointed elsewhere) is revoked there first; one from this server is
    // replaced as the new one is made.
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

/** Revoke this device's widget token on the server and locally, and show the widget signed out. Resolves to whether there was one. */
export async function forgetWidgetToken(opts: { fetchFn?: FetchLike } = {}): Promise<boolean> {
  // A token being made as somebody signs out is taken away with the rest, not left behind.
  if (making) await making.catch(() => undefined);
  // The next sign-in makes its own.
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
 * Remove the widget from every device of the account (`DELETE …/tokens`, with the session), then give this device
 * a new token so its own widget continues.
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
