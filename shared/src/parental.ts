/**
 * Parental controls: a parent's link to a teen's account and the limits they set on it. Shared so the server enforces,
 * and both apps offer and explain, the same options, and so all three work out the same pause from the same numbers.
 *
 * A parent can only make a teen's account quieter than any teen's already is: every control narrows something, none
 * opens anything the rules for minors keep closed. A parent sees learning time and progress, never messages, letters
 * or posts.
 */

/** A teen can have two parents connected (each family decides who); a parent can look after five teens. */
export const MAX_PARENTS_PER_TEEN = 2;
export const MAX_TEENS_PER_PARENT = 5;

/** How long a parent's code works, and how many letters it has. */
export const PARENT_CODE_TTL_HOURS = 24;
export const PARENT_CODE_LENGTH = 8;

/** The letters a code is made of: no 0/O, 1/I/L, so it can be read aloud and typed from another screen without doubt. */
export const PARENT_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** The daily limits a parent can choose, in minutes of the app open in front of the teen. */
export const PARENTAL_DAILY_LIMITS = [15, 30, 45, 60, 90, 120] as const;
export type ParentalDailyLimit = (typeof PARENTAL_DAILY_LIMITS)[number];

/** A night pause, as wall-clock times where the teen is ('HH:MM', 24-hour); `from` is in the evening, `to` the morning. */
export interface Bedtime {
  from: string;
  to: string;
}

/** The bedtimes a parent can choose. Every one ends at seven, before school. */
export const PARENTAL_BEDTIMES: readonly Bedtime[] = [
  { from: '20:00', to: '07:00' },
  { from: '21:00', to: '07:00' },
  { from: '22:00', to: '07:00' },
  { from: '23:00', to: '07:00' },
];

/**
 * What a parent can switch off, in the order the apps list them: messages and group chats, letters by bird, posting
 * and commenting, online games, adding friends, and buying with real money.
 */
export const PARENTAL_SWITCHES = ['chat', 'letters', 'posts', 'games', 'friends', 'purchases'] as const;
export type ParentalSwitch = (typeof PARENTAL_SWITCHES)[number];

/** Everything a parent has set. A switch that is true leaves that part of Hevalo as it is for any teen. */
export interface ParentalControls {
  /** Minutes a day, one of `PARENTAL_DAILY_LIMITS`; null for no limit. */
  dailyLimitMinutes: number | null;
  /** One of `PARENTAL_BEDTIMES`; null for none. */
  bedtime: Bedtime | null;
  chat: boolean;
  letters: boolean;
  posts: boolean;
  games: boolean;
  friends: boolean;
  purchases: boolean;
}

/** A newly connected teen's controls: nothing narrowed until a parent chooses. */
export const OPEN_CONTROLS: ParentalControls = {
  dailyLimitMinutes: null,
  bedtime: null,
  chat: true,
  letters: true,
  posts: true,
  games: true,
  friends: true,
  purchases: true,
};

/** Why the app is paused for a teen right now, or null when it is not. */
export type ParentalPause = 'bedtime' | 'limit' | null;

/** A supervised teen's own view of where they stand, sent with their account and with every usage beat. */
export interface SupervisionState {
  controls: ParentalControls;
  /** Minutes the app has been open in front of them today, in their own time zone. */
  minutesToday: number;
  /** The IANA time zone their day and bedtime are counted in. */
  timeZone: string;
  paused: ParentalPause;
  /** When the pause ends (ISO 8601), or null when there is none. */
  resumesAt: string | null;
}

/** One of the allowed daily limits, or null. */
export function isParentalDailyLimit(value: unknown): value is ParentalDailyLimit {
  return typeof value === 'number' && (PARENTAL_DAILY_LIMITS as readonly number[]).includes(value);
}

/** One of the allowed bedtimes. */
export function isParentalBedtime(value: unknown): value is Bedtime {
  if (!value || typeof value !== 'object') return false;
  const { from, to } = value as Partial<Bedtime>;
  return PARENTAL_BEDTIMES.some((b) => b.from === from && b.to === to);
}

/** The time zone to count in: the one given when the runtime knows it, otherwise UTC. */
export function safeTimeZone(timeZone: string | null | undefined): string {
  if (!timeZone) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(0);
    return timeZone;
  } catch {
    return 'UTC';
  }
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/** The wall clock in `timeZone` at `at`. */
function wallClock(at: Date, timeZone: string): WallClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') };
}

/** The teen's calendar day at `at` ('YYYY-MM-DD'), the day their minutes are counted under. */
export function localDay(at: Date, timeZone: string): string {
  const c = wallClock(at, safeTimeZone(timeZone));
  return `${c.year}-${String(c.month).padStart(2, '0')}-${String(c.day).padStart(2, '0')}`;
}

/**
 * The instant a wall-clock time falls at in `timeZone`. The zone's offset is read at a first guess and once more at
 * the corrected time, which settles every day but the hour a clock change skips; that hour resolves to just after it.
 */
function instantAt(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  const wanted = Date.UTC(year, month - 1, day, hour, minute);
  let guess = wanted;
  for (let i = 0; i < 2; i++) {
    const c = wallClock(new Date(guess), timeZone);
    const seen = Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute);
    guess += wanted - seen;
  }
  return new Date(guess);
}

/** Minutes since midnight of an 'HH:MM' time. */
function minutesOf(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** The next time the wall clock in `timeZone` reads `time`, after `at`. */
function nextWallTime(at: Date, time: string, timeZone: string): Date {
  const now = wallClock(at, timeZone);
  const target = minutesOf(time);
  const dayShift = now.hour * 60 + now.minute < target ? 0 : 1;
  // Noon UTC on the wanted day steps a whole day in any zone without landing on the wrong date.
  const base = new Date(Date.UTC(now.year, now.month - 1, now.day + dayShift, 12));
  return instantAt(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), Math.floor(target / 60), target % 60, timeZone);
}

/** Whether `at` falls inside the bedtime in `timeZone`. A bedtime that runs past midnight covers both sides of it. */
export function inBedtime(bedtime: Bedtime, at: Date, timeZone: string): boolean {
  const c = wallClock(at, safeTimeZone(timeZone));
  const now = c.hour * 60 + c.minute;
  const from = minutesOf(bedtime.from);
  const to = minutesOf(bedtime.to);
  return from > to ? now >= from || now < to : now >= from && now < to;
}

/**
 * Whether the app is paused for a teen now, and until when. Bedtime comes first, since it ends later in the night than
 * a used-up day does and says more about why; a used-up day ends at the next midnight where the teen is.
 */
export function parentalPause(
  controls: Pick<ParentalControls, 'dailyLimitMinutes' | 'bedtime'>,
  minutesToday: number,
  at: Date,
  timeZone: string,
): { paused: ParentalPause; resumesAt: string | null } {
  const zone = safeTimeZone(timeZone);
  if (controls.bedtime && inBedtime(controls.bedtime, at, zone)) {
    return { paused: 'bedtime', resumesAt: nextWallTime(at, controls.bedtime.to, zone).toISOString() };
  }
  if (controls.dailyLimitMinutes != null && minutesToday >= controls.dailyLimitMinutes) {
    return { paused: 'limit', resumesAt: nextWallTime(at, '00:00', zone).toISOString() };
  }
  return { paused: null, resumesAt: null };
}

/**
 * A typed or pasted code in its stored form (eight letters, no dash), or null when it cannot be one. Case, spaces and
 * dashes are forgiven; a letter the alphabet leaves out is not guessed at.
 */
export function normalizeParentCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, '');
  if (code.length !== PARENT_CODE_LENGTH) return null;
  for (const ch of code) if (!PARENT_CODE_ALPHABET.includes(ch)) return null;
  return code;
}

/** A code as shown and read aloud: two groups of four. */
export function formatParentCode(code: string): string {
  return code.length === PARENT_CODE_LENGTH ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}
