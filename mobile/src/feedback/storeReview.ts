/**
 * The native "rate this app" prompt (expo-store-review), behind a guard.
 *
 * It is a native module, so it exists only in an app built after it was added
 * (a new EAS build; the phone takes no over-the-air updates). In a build
 * without it, importing the package throws — so it is required lazily, inside
 * a try, and a phone without it simply never asks.
 *
 * And it is only ever the system's own prompt: `requestReview()` on its own
 * would open the store page instead when the system prompt is unavailable
 * (TestFlight, an old Android), which from inside the app is a custom review
 * prompt — so it is called only after `isAvailableAsync()` says the real one
 * is there. Never from a button: Apple and Google both forbid that, and the
 * persistent "Rate Hevalo" row in Settings opens the store page instead.
 */
interface StoreReviewModule {
  isAvailableAsync(): Promise<boolean>;
  requestReview(): Promise<void>;
}

let cached: StoreReviewModule | null | undefined;

function storeReview(): StoreReviewModule | null {
  if (cached === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      cached = require('expo-store-review') as StoreReviewModule;
    } catch {
      cached = null;
    }
  }
  return cached;
}

/**
 * Ask the system to show its review prompt. True when it was asked — whether
 * the system then shows anything is its own business (it keeps its own quota
 * and never says).
 */
export async function requestStoreReview(module: StoreReviewModule | null = storeReview()): Promise<boolean> {
  if (!module) return false;
  try {
    if (!(await module.isAvailableAsync())) return false;
    await module.requestReview();
    return true;
  } catch {
    return false;
  }
}
