import { describe, expect, it } from 'vitest';
import { maintenancePhase, maintenanceNoticeOf } from './maintenance.js';

const now = new Date('2026-10-27T12:00:00Z');
const at = (h: number) => new Date(now.getTime() + h * 3_600_000).toISOString();

describe('where offline mode stands', () => {
  it('is off until turned on, whatever its times say', () => {
    expect(maintenancePhase({ enabled: false, startsAt: at(-1), endsAt: at(1), reopenAtEnd: true }, now)).toBe('off');
  });

  it('waits for its start, then is on', () => {
    expect(maintenancePhase({ enabled: true, startsAt: at(1), endsAt: null, reopenAtEnd: true }, now)).toBe('scheduled');
    expect(maintenancePhase({ enabled: true, startsAt: at(-1), endsAt: null, reopenAtEnd: true }, now)).toBe('on');
    expect(maintenancePhase({ enabled: true, startsAt: null, endsAt: null, reopenAtEnd: true }, now)).toBe('on');
  });

  it('is over at its end only when it reopens by itself', () => {
    expect(maintenancePhase({ enabled: true, startsAt: at(-2), endsAt: at(-1), reopenAtEnd: true }, now)).toBe('ended');
    // an end that is only said stays on past it, until someone reopens
    expect(maintenancePhase({ enabled: true, startsAt: at(-2), endsAt: at(-1), reopenAtEnd: false }, now)).toBe('on');
    expect(maintenancePhase({ enabled: true, startsAt: at(-2), endsAt: at(1), reopenAtEnd: true }, now)).toBe('on');
  });
});

describe('reading the notice from an answer', () => {
  it('reads a 503 body and the status answer alike', () => {
    const maintenance = { title: 'Back soon', message: '', pictureUrl: 'https://cdn.hevalo.app/a.webp', since: at(0), backBy: at(1) };
    expect(maintenanceNoticeOf({ code: 'MAINTENANCE', message: 'x', maintenance })).toEqual({ ...maintenance, message: null });
    expect(maintenanceNoticeOf({ maintenance })).not.toBeNull();
  });

  it('is null for anything else', () => {
    for (const body of [null, 'x', {}, { maintenance: null }, { code: 'MAINTENANCE' }, { maintenance: { title: 'x' } }]) {
      expect(maintenanceNoticeOf(body)).toBeNull();
    }
  });

  it('never passes on a picture that is not https', () => {
    const notice = maintenanceNoticeOf({ maintenance: { since: at(0), pictureUrl: 'javascript:alert(1)' } });
    expect(notice?.pictureUrl).toBeNull();
  });
});
