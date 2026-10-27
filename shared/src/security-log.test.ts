import { describe, expect, it } from 'vitest';
import {
  SECURITY_CATEGORIES,
  SECURITY_EVENTS,
  SECURITY_EVENT_KINDS,
  SECURITY_RETENTION_DAYS,
  isSecurityEventKind,
  needsAttention,
  securityEventInfo,
  securitySeverity,
} from './security-log.js';

describe('the security log’s kinds of event', () => {
  it('names every kind, in a category the panel knows, with what it means', () => {
    for (const kind of SECURITY_EVENT_KINDS) {
      const info = SECURITY_EVENTS[kind];
      expect(SECURITY_CATEGORIES).toContain(info.category);
      expect(info.title.length).toBeGreaterThan(3);
      expect(info.meaning.length).toBeGreaterThan(10);
      // a kind is `area.what`, so it can be filtered by its area
      expect(kind).toMatch(/^[a-z0-9]+\.[a-z0-9_]+$/);
    }
  });

  it('makes an event about a staff account one step more serious where the kind says so', () => {
    expect(securitySeverity('signin.failed')).toBe('notice');
    expect(securitySeverity('signin.failed', true)).toBe('warning');
    expect(securitySeverity('signin.locked', true)).toBe('critical');
    // never past critical, and never for a kind that does not escalate
    expect(securitySeverity('console.2fa_locked', true)).toBe('critical');
    expect(securitySeverity('signup.rejected', true)).toBe('notice');
  });

  it('puts warnings and worse on the list, and keeps them a year', () => {
    expect(needsAttention('warning')).toBe(true);
    expect(needsAttention('critical')).toBe(true);
    expect(needsAttention('notice')).toBe(false);
    expect(SECURITY_RETENTION_DAYS.critical).toBe(365);
    expect(SECURITY_RETENTION_DAYS.info).toBe(90);
  });

  it('shows a kind it does not know rather than nothing', () => {
    expect(isSecurityEventKind('nothing.known')).toBe(false);
    expect(securityEventInfo('nothing.known').title).toBe('nothing known');
    expect(securityEventInfo('signin.surge').severity).toBe('critical');
  });
});
