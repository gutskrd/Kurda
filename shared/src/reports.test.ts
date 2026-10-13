import { describe, expect, it } from 'vitest';
import {
  CASE_SOURCES,
  CASE_SOURCE_GROUP,
  MAX_REPORT_NOTE_LEN,
  OPEN_CASE_STATUSES,
  PRIORITY_SLA_HOURS,
  REPORT_CATEGORIES,
  REPORT_CATEGORY_KEYS,
  REPORT_PRIORITIES,
  SANCTION_KINDS,
  SANCTION_SCOPE,
  categoryPriority,
  isReportCategory,
  isReportTargetType,
  isSanctionKind,
  normalizeReportNote,
  reportCategoryFrom,
  sanctionHasDuration,
} from './reports.js';

describe('report categories', () => {
  it('lists every category once, most urgent first', () => {
    expect(REPORT_CATEGORIES.map((c) => c.key).sort()).toEqual([...REPORT_CATEGORY_KEYS].sort());
    const priorities = REPORT_CATEGORIES.map((c) => c.priority);
    expect([...priorities].sort((a, b) => a - b)).toEqual(priorities);
  });

  it('puts a child at risk, self-harm and threats at P0, and spam at P3', () => {
    expect(categoryPriority('child_safety')).toBe(0);
    expect(categoryPriority('self_harm')).toBe(0);
    expect(categoryPriority('violence')).toBe(0);
    expect(categoryPriority('sexual')).toBe(1);
    expect(categoryPriority('hate')).toBe(1);
    expect(categoryPriority('private_info')).toBe(1);
    expect(categoryPriority('harassment')).toBe(2);
    expect(categoryPriority('spam')).toBe(3);
    expect(categoryPriority('impersonation')).toBe(3);
    expect(categoryPriority('other')).toBe(3);
  });

  it('gives every category a label key and a plain label, and only self-harm shows help', () => {
    for (const c of REPORT_CATEGORIES) {
      expect(c.labelKey).toMatch(/^report\.category\.[a-zA-Z]+$/);
      expect(c.label.length).toBeGreaterThan(3);
    }
    expect(REPORT_CATEGORIES.filter((c) => c.showsHelp).map((c) => c.key)).toEqual(['self_harm']);
  });

  it('maps the old values onto the new categories', () => {
    expect(reportCategoryFrom('selfHarm')).toBe('self_harm');
    expect(reportCategoryFrom('self_harm')).toBe('self_harm');
    expect(reportCategoryFrom('harassment')).toBe('harassment');
    expect(reportCategoryFrom('child_safety')).toBe('child_safety');
    expect(reportCategoryFrom('nonsense')).toBeNull();
    expect(reportCategoryFrom('toString')).toBeNull(); // not fooled by the prototype
    expect(reportCategoryFrom(undefined)).toBeNull();
    expect(isReportCategory('selfHarm')).toBe(false);
  });

  it('has an SLA for every priority, tighter for the more urgent', () => {
    const hours = REPORT_PRIORITIES.map((p) => PRIORITY_SLA_HOURS[p]);
    expect([...hours].sort((a, b) => a - b)).toEqual(hours);
    expect(PRIORITY_SLA_HOURS[0]).toBe(1);
  });
});

describe('report notes', () => {
  it('has no minimum length and drops what is blank', () => {
    expect(normalizeReportNote('x')).toBe('x');
    expect(normalizeReportNote('   ')).toBeNull();
    expect(normalizeReportNote(undefined)).toBeNull();
    expect(normalizeReportNote(42)).toBeNull();
  });

  it('strips control characters but keeps Kurdish letters', () => {
    expect(normalizeReportNote('  ç\u0000ê\u0007 şîû  ')).toBe('çê şîû');
  });

  it('caps the length by characters, not code units', () => {
    const long = 'ê'.repeat(MAX_REPORT_NOTE_LEN + 50);
    expect([...normalizeReportNote(long)!]).toHaveLength(MAX_REPORT_NOTE_LEN);
  });
});

describe('targets, sanctions and cases', () => {
  it('knows the reportable targets', () => {
    expect(isReportTargetType('game_player')).toBe(true);
    expect(isReportTargetType('dm_message')).toBe(true);
    expect(isReportTargetType('profile')).toBe(false);
  });

  it('gives each sanction kind what it restricts', () => {
    expect(SANCTION_SCOPE.chat_mute).toBe('chat');
    expect(SANCTION_SCOPE.post_mute).toBe('post');
    expect(SANCTION_SCOPE.feature_limit).toBe('media');
    expect(SANCTION_SCOPE.suspension).toBe('account');
    expect(SANCTION_SCOPE.permanent_ban).toBe('account');
    expect(SANCTION_SCOPE.warning).toBeNull();
    expect(SANCTION_KINDS.every(isSanctionKind)).toBe(true);
  });

  it('says which kinds last a while', () => {
    expect(sanctionHasDuration('chat_mute')).toBe(true);
    expect(sanctionHasDuration('suspension')).toBe(true);
    expect(sanctionHasDuration('warning')).toBe(false);
    expect(sanctionHasDuration('content_removal')).toBe(false);
    expect(sanctionHasDuration('permanent_ban')).toBe(false);
  });

  it('groups every case source for the queue filter', () => {
    for (const s of CASE_SOURCES) expect(CASE_SOURCE_GROUP[s]).toBeTruthy();
    expect(CASE_SOURCE_GROUP.report).toBe('reports');
    expect(CASE_SOURCE_GROUP.text_flag).toBe('automated');
    expect(OPEN_CASE_STATUSES).not.toContain('actioned');
    expect(OPEN_CASE_STATUSES).not.toContain('no_violation');
  });
});
