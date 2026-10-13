/**
 * A moment, the way a person scans a list for it ("3 h ago", "yesterday"),
 * with the exact date and time on hover and in the markup. Pages used to print
 * `toLocaleString()` in full, so every row's date was a wall of digits and the
 * recent ones did not stand out.
 */
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function relativeTime(value: Date, now: Date = new Date()): string {
  const diff = now.getTime() - value.getTime();
  const future = diff < 0;
  const abs = Math.abs(diff);
  const say = (n: number, unit: string): string => (future ? `in ${n} ${unit}` : `${n} ${unit} ago`);
  if (abs < 45_000) return future ? 'in a moment' : 'just now';
  if (abs < HOUR) return say(Math.max(1, Math.round(abs / MINUTE)), 'min');
  if (abs < DAY) return say(Math.round(abs / HOUR), 'h');
  const days = Math.round(abs / DAY);
  if (days === 1) return future ? 'tomorrow' : 'yesterday';
  if (days < 7) return say(days, 'days');
  return shortDate(value, now);
}

/** "12 Oct", or "12 Oct 2025" when it is not this year. */
export function shortDate(value: Date, now: Date = new Date()): string {
  return value.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    ...(value.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  });
}

export function absoluteTime(value: Date): string {
  return value.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** An age in words: "2 h 5 min", "3 days" — how long something has waited. */
export function duration(seconds: number): string {
  if (seconds < 60) return `${Math.max(0, Math.round(seconds))} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`;
  return `${Math.round(hours / 24)} days`;
}

export function Time({
  value,
  mode = 'relative',
}: {
  value: string | Date | null | undefined;
  /** relative: "3 h ago"; date: "12 Oct"; absolute: date and time in full */
  mode?: 'relative' | 'date' | 'absolute';
}): React.JSX.Element {
  if (!value) return <span className="subtle">—</span>;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return <span className="subtle">—</span>;
  const full = absoluteTime(date);
  const text = mode === 'relative' ? relativeTime(date) : mode === 'date' ? shortDate(date) : full;
  return (
    <time dateTime={date.toISOString()} title={full} className="time">
      {text}
    </time>
  );
}
