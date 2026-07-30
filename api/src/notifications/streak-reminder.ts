/**
 * Pure streak-reminder timing (KUR-096). Decides, for one user at one moment,
 * whether to nudge them and with which reminder — evaluated against their LOCAL
 * hour so a global spread of timezones each gets its reminder at the right local
 * time. The job runs hourly and only users whose local hour matches fire.
 */

/** Default send hour when we have no practice history for a user. */
export const FALLBACK_HOUR = 19; // 7pm local
export const LAST_CHANCE_HOUR = 22; // 2h before local midnight
export const LAST_CHANCE_MIN_STREAK = 7;

export type ReminderKind = 'primary' | 'last_chance';

export interface ReminderContext {
  currentStreak: number;
  practicedToday: boolean;
  /** 0-23 in the user's timezone. */
  localHour: number;
  /** The user's most common practice hour (0-23), or null if unknown. */
  historicalHour: number | null;
}

/** Where the primary reminder fires: the historical practice hour, else 19:00. */
export function preferredHour(historicalHour: number | null): number {
  if (historicalHour === null || historicalHour < 0 || historicalHour > 23) return FALLBACK_HOUR;
  return historicalHour;
}

/**
 * The reminder to send right now, or null. Never fires if the user already
 * practiced today or has no live streak. A "last chance" nudge at 22:00 (for
 * streaks ≥ 7) takes precedence over the primary reminder if they coincide.
 */
export function dueReminder(ctx: ReminderContext): ReminderKind | null {
  if (ctx.practicedToday) return null;
  if (ctx.currentStreak < 1) return null;
  if (ctx.currentStreak >= LAST_CHANCE_MIN_STREAK && ctx.localHour === LAST_CHANCE_HOUR) {
    return 'last_chance';
  }
  if (ctx.localHour === preferredHour(ctx.historicalHour)) return 'primary';
  return null;
}

export interface ReminderMessage {
  title: string;
  body: string;
}

/** Copy for each reminder kind. */
export function reminderMessage(kind: ReminderKind, streak: number): ReminderMessage {
  if (kind === 'last_chance') {
    return {
      title: 'Last chance! ⏰',
      body: `Your ${streak}-day streak ends at midnight — practice now to save it.`,
    };
  }
  return {
    title: "Don't lose your streak! 🔥",
    body: `You're on a ${streak}-day streak. A quick practice keeps it alive.`,
  };
}
