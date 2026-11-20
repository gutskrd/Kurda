import type { StandingSanction } from '@kurda/shared';

/*
 * Telling a hold apart from other decisions. The server lists a hold in Account standing as an automatic post mute
 * under "other", with no end and its own statement (api/src/moderation/sanctions-service.ts `HOLD_STATEMENT`), and
 * tells the person with the same kind of notice, both marked `hold: true`; an older server sent no marker, so its own
 * English words decide there. They are compared, never shown: the reader sees `hold.*` in their language.
 */

/** Whether a decision in Account standing is a hold rather than a finding about something the person did. */
export function isHoldSanction(s: Pick<StandingSanction, 'kind' | 'policy' | 'origin' | 'endsAt' | 'statement'> & { hold?: boolean }): boolean {
  // The server's own marker when it sends one; its words, for a server from before it did.
  if (s.hold === true) return true;
  return (
    s.kind === 'post_mute' &&
    s.policy === 'other' &&
    s.origin === 'automatic' &&
    s.endsAt === null &&
    s.statement ===
      'A person is checking your account before you can post, comment, send messages, share pictures, write letters or join groups. Learning works as usual. This is not a finding that you broke a rule.'
  );
}

/** Whether an inbox notice says the account is being checked. */
export function isHoldNotice(note: { title: string; data?: Record<string, unknown> | null }): boolean {
  const d = note.data;
  if (!d || d.kind !== 'sanction') return false;
  if (d.hold === true) return true;
  return d.sanction === 'post_mute' && d.policy === 'other' && note.title === 'Your account is being checked';
}
