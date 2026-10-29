import type { ChestTier, Quest, QuestKind, QuestStep } from '@kurda/shared';

/** A quest as its row shows it: where its bar starts, where it ends up, and its chest. */
export interface QuestRow {
  id: string;
  kind: QuestKind;
  target: number;
  chest: ChestTier;
  /** where the bar starts: before this session on the results, where it stands anywhere else */
  from: number;
  to: number;
  claimable: boolean;
  claimed: boolean;
}

const clamp = (n: number, target: number): number => Math.max(0, Math.min(target, n));

/**
 * Today's quests as rows. On the results, a quest this session moved (`steps`)
 * starts where it stood before the session and fills to where it is now; the
 * others stand where they are. The day is what counts when it was read; when it
 * could not be, the steps alone still show what this session did.
 */
export function questRows(day: { quests: readonly Quest[] } | null, steps: readonly QuestStep[] = []): QuestRow[] {
  if (!day) {
    return steps.map((s) => ({
      id: s.id,
      kind: s.kind,
      target: s.target,
      chest: s.chest,
      from: clamp(Math.min(s.from, s.to), s.target),
      to: clamp(s.to, s.target),
      claimable: s.claimable,
      claimed: false,
    }));
  }
  const moved = new Map(steps.map((s) => [s.id, s]));
  return day.quests.map((q) => {
    const step = moved.get(q.id);
    const to = clamp(q.progress, q.target);
    return {
      id: q.id,
      kind: q.kind,
      target: q.target,
      chest: q.chest,
      from: step ? clamp(Math.min(step.from, to), q.target) : to,
      to,
      claimable: q.claimable,
      claimed: q.claimed,
    };
  });
}

/** The quests of the last week done with their chests still shut, as rows: a chest is never lost at midnight. */
export function earlierRows(day: { waiting?: readonly Quest[] } | null): QuestRow[] {
  return questRows({ quests: day?.waiting ?? [] });
}

/** The rows with the chests opened since they were read marked open. */
export function withOpened(rows: QuestRow[], opened: ReadonlySet<string>): QuestRow[] {
  return opened.size === 0 ? rows : rows.map((r) => (opened.has(r.id) ? { ...r, claimable: false, claimed: true } : r));
}

/** Finished in this session: its bar reaches the end now. */
export function justDone(row: QuestRow): boolean {
  return row.from < row.target && row.to >= row.target;
}
