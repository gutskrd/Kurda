/**
 * Shared contract for the platform-split Google module (KUR-018).
 * `google.ts` is the native implementation (imports the native SDK); Metro
 * swaps in `google.web.ts` for the web bundle so the native-only module is
 * never pulled into a web build.
 */
export type GoogleResult =
  | { kind: 'success'; idToken: string }
  | { kind: 'cancelled' }
  | { kind: 'not-configured' }
  | { kind: 'error'; message: string };
