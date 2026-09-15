/**
 * Shared contract for the platform-split Google module (KUR-018).
 * `google.ts` is the native implementation (imports the native SDK); Metro
 * swaps in `google.web.ts` for the web bundle so the native-only module is
 * never pulled into a web build.
 */
import type { TranslationKey } from '../i18n/translations';

export type GoogleResult =
  | { kind: 'success'; idToken: string }
  | { kind: 'cancelled' }
  | { kind: 'not-configured' }
  /**
   * `messageKey` is ours and is translated; `message` is whatever the Google
   * SDK said and is not. The screen shows the SDK's detail when there is one,
   * because it is the more specific of the two.
   */
  | { kind: 'error'; messageKey: TranslationKey; message?: string };
