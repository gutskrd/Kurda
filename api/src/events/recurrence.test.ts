import { describe, expect, it } from 'vitest';
import { occurrenceForYear, upcomingOccurrences, type AnnualEventTemplate } from './recurrence.js';

const newroz: AnnualEventTemplate = {
  key: 'newroz',
  name: 'Newroz',
  type: 'cultural',
  theme: 'newroz',
  month: 3,
  day: 21,
  durationDays: 3,
  priority: 10,
  quests: [{ id: 'q1' }],
  rewards: { gems: 50 },
};

describe('occurrenceForYear', () => {
  it('anchors the window on the fixed calendar day in UTC', () => {
    const occ = occurrenceForYear(newroz, 2027);
    expect(occ.key).toBe('newroz-2027');
    expect(occ.startsAt).toBe('2027-03-21T00:00:00.000Z');
    expect(occ.endsAt).toBe('2027-03-24T00:00:00.000Z'); // +3 days
    expect(occ.priority).toBe(10);
    expect(occ.quests).toEqual([{ id: 'q1' }]);
    expect(occ.rewards).toEqual({ gems: 50 });
  });

  it('lands on March 21 regardless of leap year', () => {
    expect(occurrenceForYear(newroz, 2028).startsAt).toBe('2028-03-21T00:00:00.000Z'); // leap
    expect(occurrenceForYear(newroz, 2029).startsAt).toBe('2029-03-21T00:00:00.000Z');
  });
});

describe('upcomingOccurrences', () => {
  it('materializes the requested number of future years', () => {
    const from = new Date('2026-01-01T00:00:00.000Z');
    const occ = upcomingOccurrences(newroz, from, 3);
    expect(occ.map((o) => o.key)).toEqual(['newroz-2026', 'newroz-2027', 'newroz-2028']);
  });

  it('includes a currently-running window and skips one that already ended', () => {
    // mid-window on 2026-03-22 (window is 03-21..03-24)
    const during = upcomingOccurrences(newroz, new Date('2026-03-22T00:00:00.000Z'), 2);
    expect(during.map((o) => o.key)).toEqual(['newroz-2026', 'newroz-2027']);

    // just after this year's window ended → this year is dropped
    const after = upcomingOccurrences(newroz, new Date('2026-03-25T00:00:00.000Z'), 2);
    expect(after.map((o) => o.key)).toEqual(['newroz-2027', 'newroz-2028']);
  });
});
