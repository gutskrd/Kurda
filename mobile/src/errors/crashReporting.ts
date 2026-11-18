import { Platform } from 'react-native';
import { defaultApiBaseUrl } from '../api/env';
import { APP_VERSION, appPlatform, nativeBuildNumber } from '../feedback/appInfo';
import { CrashReporter, installGlobalErrorHandler, type ErrorUtilsLike } from './reporter';

/**
 * The app's crash reporter and its three feeds: the error boundary (render errors), React Native's global handler
 * (uncaught errors) and the navigator (the current screen). Batching and redaction are in reporter.ts.
 *
 * Only store and internal builds report: in development the error is already on screen, and development builds
 * use the live API, so their errors would mix with real crashes. The web preview does not report either.
 */
const enabled = typeof __DEV__ === 'boolean' && !__DEV__ && Platform.OS !== 'web';

// The same address the rest of the app talks to (auth/AuthContext.tsx), without a trailing slash.
const apiBase = (process.env.EXPO_PUBLIC_API_URL || defaultApiBaseUrl()).replace(/\/+$/, '');

/** A report unanswered by then is dropped, so a stalled request never holds up the next batch. */
const SEND_TIMEOUT_MS = 15_000;

export const crashReporter = new CrashReporter({
  enabled,
  about: () => ({
    platform: appPlatform(Platform.OS),
    appVersion: APP_VERSION,
    buildNumber: nativeBuildNumber() ?? undefined,
    osVersion: String(Platform.Version),
  }),
  // Plain fetch, not the API client: no token, refresh or retry, nothing that could report a failure of its own.
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

/** A render error caught by the boundary; the app carries on showing the crash screen. */
export function reportRenderError(error: unknown, componentStack: string | null | undefined): void {
  crashReporter.capture(error, { kind: 'render', fatal: false, componentStack: componentStack ?? undefined });
}
