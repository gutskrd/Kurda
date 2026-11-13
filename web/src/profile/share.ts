/**
 * Sending somebody a profile: the device's own share sheet where there is
 * one, and the link copied where there is not (a desktop). The caller says
 * which of the two happened, in its own words.
 */
export type ShareOutcome = 'shared' | 'copied' | 'failed';

/** The address of a profile, as anybody can open it. */
export function profileUrl(userId: string): string {
  return new URL(`/app/users/${userId}`, window.location.origin).toString();
}

export async function shareProfileLink(userId: string, name: string): Promise<ShareOutcome> {
  const url = profileUrl(userId);
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: name, url });
      return 'shared';
    } catch {
      // dismissed, or refused: copying is still a working answer
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}
