/**
 * Sharing a profile link through the device's share sheet, or copying it where there is none; the caller words the
 * outcome.
 */
type ShareOutcome = 'shared' | 'copied' | 'failed';

/** The address of a profile, as anybody can open it. */
function profileUrl(userId: string): string {
  return new URL(`/app/users/${userId}`, window.location.origin).toString();
}

export async function shareProfileLink(userId: string, name: string): Promise<ShareOutcome> {
  const url = profileUrl(userId);
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: name, url });
      return 'shared';
    } catch {
      // Dismissed or refused, so copying is still a useful fallback.
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}
