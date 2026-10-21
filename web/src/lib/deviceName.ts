import { deviceNameFrom } from '@kurda/shared';

/**
 * This browser's name, for the sign-in and sign-up bodies: what Settings →
 * signed-in devices lists the session under (`deviceNameFrom` in
 * @kurda/shared reads it from the user agent).
 */
export function thisDeviceName(): string | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return deviceNameFrom(navigator.userAgent ?? '', navigator.maxTouchPoints ?? 0) ?? undefined;
}
