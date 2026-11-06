import { Platform } from 'react-native';
import { defaultApiBaseUrl } from '../api/env';
import { APP_VERSION, appPlatform, nativeBuildNumber } from '../feedback/appInfo';
import { CrashReporter, installGlobalErrorHandler, type ErrorUtilsLike } from './reporter';

/**
 * The app's one crash reporter, and the three places it is fed from: the error
 * boundary round the screens (a render that threw), React Native's global
 * handler (an error nothing else caught), and the navigator (which screen was
 * open). How it batches and what it leaves out is in reporter.ts.
 *
 * Only store and internal builds report. In development the error is already
 * on the developer's screen, and development builds talk to the live API too,
 * so their mistakes would land in the same log as real crashes. The web
 * preview does not report either.
 */
const enabled = typeof __DEV__ === 'boolean' && !__DEV__ && Platform.OS !== 'web';

// the same address the rest of the app talks to (auth/AuthContext.tsx), without a trailing slash
const apiBase = (process.env.EXPO_PUBLIC_API_URL || defaultApiBaseUrl()).replace(/\/+$/, '');

/** A report that has not been answered by then is let go, so a stalled request never holds up the next batch. */
const SEND_TIMEOUT_MS = 15_000;

export const crashReporter = new CrashReporter({
  enabled,
  about: () => ({
    platform: appPlatform(Platform.OS),
    appVersion: APP_VERSION,
    buildNumber: nativeBuildNumber() ?? undefined,
    osVersion: String(Platform.Version),
  }),
  // plain fetch, not the API client: no token, no refresh, no retry, nothing that could report a failure of its own
  send: async (batch) => {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), SEND_TIMEOUT_MS);
    try {
      await fetch(`${apiBase}/client-errors`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(batch),
        signal: abort.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  },
});

/** Once, as the app starts: errors nothing else caught are reported, then handled as before. */
export function installCrashReporting(): void {
  installGlobalErrorHandler(crashReporter, (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils);
}

/** The route now on screen, so a report can say where it happened. */
export function noteScreen(name: string | undefined): void {
  crashReporter.noteScreen(name);
}

/** A render that threw and was caught by the boundary: the app goes on, showing the crash screen. */
export function reportRenderError(error: unknown, componentStack: string | null | undefined): void {
  crashReporter.capture(error, { kind: 'render', fatal: false, componentStack: componentStack ?? undefined });
}
