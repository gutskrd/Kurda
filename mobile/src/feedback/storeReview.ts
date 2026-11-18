/**
 * The native review prompt (expo-store-review), guarded. It is a native module, so it exists only in builds made
 * after it was added; importing it elsewhere throws, so it is required lazily inside a try and a phone without it
 * never asks.
 *
 * Only the system prompt is ever used: `requestReview()` alone opens the store page when the system prompt is
 * unavailable, which from inside the app is a custom review prompt, so it is called only after
 * `isAvailableAsync()` confirms the real one. Never from a button, which both stores forbid; Settings' "Rate
 * Hevalo" opens the store page instead.
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

/** Ask the system to show its review prompt. True when asked; whether anything shows is up to the system's own quota. */
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
