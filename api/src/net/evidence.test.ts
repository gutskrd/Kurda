import { describe, expect, it } from 'vitest';
import { compareEvidence, foldEvidence, MAX_QUIET_CROWD, scoreEvidence, type EvidenceRow } from './evidence.js';

const at = (iso: string) => new Date(iso);
const net = (other: string, day: string, crowd = 0, time = `${day}T12:00:00.000Z`): EvidenceRow => ({
  other,
  via: 'network',
  day,
  at: at(time),
  crowd,
});
const dev = (other: string, day: string, time = `${day}T09:00:00.000Z`): EvidenceRow => ({ other, via: 'device', day, at: at(time), crowd: 0 });

describe('scoreEvidence', () => {
  it('counts distinct days together on a quiet network, and the latest of them', () => {
    const s = scoreEvidence([net('b', '2026-10-01'), net('b', '2026-10-01', 0, '2026-10-01T20:00:00.000Z'), net('b', '2026-10-03')]);
    expect(s.get('b')).toEqual({ via: 'network', days: 2, lastSeenTogether: '2026-10-03T12:00:00.000Z' });
  });

  it('drops days on a crowded network, keeping the quiet ones', () => {
    const s = scoreEvidence([net('b', '2026-10-01', MAX_QUIET_CROWD), net('b', '2026-10-02', MAX_QUIET_CROWD + 1)]);
    expect(s.get('b')).toEqual({ via: 'network', days: 1, lastSeenTogether: '2026-10-01T12:00:00.000Z' });
  });

  it('links nobody seen only on crowded networks', () => {
    const s = scoreEvidence([net('c', '2026-10-01', 4), net('c', '2026-10-02', 40)]);
    expect(s.has('c')).toBe(false);
  });

  it('lets a device outrank a network, counting the device’s own days', () => {
    const s = scoreEvidence([net('b', '2026-10-01'), net('b', '2026-10-02'), net('b', '2026-10-03'), dev('b', '2026-09-20')]);
    expect(s.get('b')).toEqual({ via: 'device', days: 1, lastSeenTogether: '2026-09-20T09:00:00.000Z' });
  });

  it('keeps both kinds for the ranks, which flag each', () => {
    const k = foldEvidence([dev('b', '2026-09-20'), net('b', '2026-10-01'), net('b', '2026-10-02', 9)]).get('b')!;
    expect(k.device).toEqual({ days: 1, lastSeenTogether: '2026-09-20T09:00:00.000Z' });
    expect(k.network).toEqual({ days: 1, lastSeenTogether: '2026-10-01T12:00:00.000Z' });
    expect(foldEvidence([net('c', '2026-10-01', 9)]).get('c')).toBeUndefined();
  });

  it('orders a device first, then more days, then more recent', () => {
    const list = [...scoreEvidence([
      net('few', '2026-10-05'),
      net('many', '2026-10-01'),
      net('many', '2026-10-02'),
      net('recent', '2026-10-06'),
      dev('device', '2026-08-01'),
    ]).entries()]
      .map(([id, e]) => ({ id, ...e }))
      .sort(compareEvidence)
      .map((e) => e.id);
    expect(list).toEqual(['device', 'many', 'recent', 'few']);
  });
});
