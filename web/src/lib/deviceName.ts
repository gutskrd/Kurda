import { deviceNameFrom } from '@kurda/shared';

/** This browser's name for the sign-in and sign-up bodies, listed under Settings → signed-in devices. */
export function thisDeviceName(): string | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return deviceNameFrom(navigator.userAgent ?? '', navigator.maxTouchPoints ?? 0) ?? undefined;
}
