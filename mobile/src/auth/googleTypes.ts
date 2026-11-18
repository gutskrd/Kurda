/**
 * Shared contract for the platform-split Google module: `google.ts` is the native implementation, and Metro swaps in
 * `google.web.ts` for the web bundle so the native SDK is never pulled in there.
 */
import type { TranslationKey } from '../i18n/translations';

export type GoogleResult =
  | { kind: 'success'; idToken: string }
  | { kind: 'cancelled' }
  | { kind: 'not-configured' }
  /**
   * `messageKey` is ours and translated; `message` is the SDK's own English detail, kept for debugging and never shown.
   */
  | { kind: 'error'; messageKey: TranslationKey; message?: string };
