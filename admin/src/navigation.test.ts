import { describe, expect, it } from 'vitest';
import { activeEntry, canOpen, landingRoute, mayOpenPage, NAV, parseRoute, searchNav, visibleNav, type SessionAccess } from './navigation';

const MODERATOR: SessionAccess = { staffRoles: ['moderator'], capabilities: ['users.view', 'users.moderate', 'moderation.act'] };
const EDITOR: SessionAccess = { staffRoles: ['content_editor'], capabilities: ['content.edit', 'content.publish', 'events.manage'] };
const LEGACY: SessionAccess = { staffRoles: ['admin'], capabilities: ['moderation.act'] };
const SUPPORT: SessionAccess = { staffRoles: ['support'], capabilities: ['users.view', 'economy.view'] };
const FOUNDER: SessionAccess = { staffRoles: ['founder'], capabilities: [] };
const OWNER: SessionAccess = { staffRoles: ['admin', 'superadmin'], capabilities: ['moderation.act', 'users.view', 'users.moderate', 'content.edit'] };

const ids = (s: SessionAccess): string[] => visibleNav(s).map((n) => n.id);

describe('who sees which page — what the API allows, not a guess', () => {
  it('a moderator sees the queue and the people, and not what refuses them', () => {
    expect(ids(MODERATOR)).toEqual(['dashboard', 'users', 'moderation', 'appeals', 'ban-approvals', 'aimod', 'feedback', 'playbook', 'security']);
    // the old nav showed these to everyone; the API answers a moderator 403
    for (const page of ['analytics', 'shop', 'economy', 'antibot', 'lessons', 'audit']) expect(mayOpenPage(page, MODERATOR)).toBe(false);
  });

  it('a content editor sees recording, lessons, stories and the games, and nothing about people', () => {
    expect(ids(EDITOR)).toEqual([
      'dashboard',
      'record-letters',
      'record-lessons',
      'record-stories',
      'lessons',
      'stories',
      'words',
      'wordle',
      'rhyme',
      'race',
      'security',
    ]);
  });

  it('the legacy admin role opens what its routes are guarded by, and not the RBAC-only pages', () => {
    const seen = ids(LEGACY);
    for (const id of ['analytics', 'record-lessons', 'moderation', 'antibot', 'stories', 'events', 'shop', 'fraud', 'approvals', 'flags', 'system'])
      expect(seen).toContain(id);
    // Users, Lessons and the audit log are requireAdmin(…) with RBAC roles only
    for (const id of ['users', 'lessons', 'audit']) expect(seen).not.toContain(id);
  });

  it('opens the ranks, seasons, leagues and badges to the legacy admin role and superadmin their routes are guarded by, and to nobody else', () => {
    const tools = ['ranks', 'seasons', 'leagues', 'badges'];
    const superadminOnly: SessionAccess = { staffRoles: ['superadmin'], capabilities: ['moderation.act', 'users.view'] };
    for (const id of tools) expect(ids(LEGACY)).toContain(id);
    for (const id of tools) expect(ids(superadminOnly)).toContain(id);
    for (const s of [MODERATOR, EDITOR, SUPPORT, FOUNDER]) {
      for (const page of tools) expect(mayOpenPage(page, s)).toBe(false);
    }
    expect(NAV.filter((n) => tools.includes(n.id)).every((n) => n.group === 'ranks')).toBe(true);
    expect(searchNav(visibleNav(LEGACY), 'void').map((n) => n.id)).toEqual(['ranks']);
    expect(searchNav(visibleNav(LEGACY), 'settle').map((n) => n.id)).toEqual(['leagues']);
  });

  it('support sees the people, the support inbox and the feedback, a founder the tags', () => {
    expect(ids(SUPPORT)).toEqual(['dashboard', 'users', 'email', 'feedback', 'security']);
    expect(ids(FOUNDER)).toEqual(['dashboard', 'tags', 'security']);
  });

  it('an owner with both roles sees every page', () => {
    expect(ids(OWNER)).toEqual(NAV.map((n) => n.id));
  });

  it('starts every role on the first page it can open', () => {
    expect(landingRoute(MODERATOR)).toBe('dashboard');
    expect(landingRoute(FOUNDER)).toBe('dashboard');
  });

  it('opens nothing it does not know', () => {
    expect(mayOpenPage('nowhere', OWNER)).toBe(false);
    expect(canOpen({ anyone: true }, { staffRoles: [], capabilities: [] })).toBe(true);
  });
});

describe('addresses', () => {
  it('reads a page, the parts below it and its query', () => {
    expect(parseRoute('#/users/7d1c')).toMatchObject({ page: 'users', rest: ['7d1c'] });
    expect(parseRoute('#/moderation/case-9')).toMatchObject({ page: 'moderation', rest: ['case-9'] });
    const r = parseRoute('#/audio/lessons?show=missing&lesson=s1%3A2');
    expect(r).toMatchObject({ page: 'audio', rest: ['lessons'] });
    expect(r.query.get('show')).toBe('missing');
    expect(r.query.get('lesson')).toBe('s1:2');
    expect(parseRoute('')).toMatchObject({ page: '', rest: [] });
  });

  it('keeps every old address working', () => {
    expect(parseRoute('#/alphabet')).toMatchObject({ page: 'audio', rest: ['letters'] });
    expect(parseRoute('#/content/l-1')).toMatchObject({ page: 'lessons', rest: ['l-1'] });
    expect(parseRoute('#/config')).toMatchObject({ page: 'approvals' });
    expect(parseRoute('#/experiments')).toMatchObject({ page: 'flags' });
    expect(parseRoute('#/ops')).toMatchObject({ page: 'system' });
    expect(parseRoute('#/games')).toMatchObject({ page: 'words' });
    // pages that kept their name are themselves
    for (const page of ['moderation', 'antibot', 'aimod', 'users', 'analytics', 'events', 'economy', 'fraud', 'shop', 'tags', 'audit', 'security', 'stories', 'audio'])
      expect(parseRoute(`#/${page}`).page).toBe(page);
  });

  it('marks the most specific nav link as the current page', () => {
    expect(activeEntry(parseRoute('#/audio/stories'))?.id).toBe('record-stories');
    expect(activeEntry(parseRoute('#/audio'))?.id).toBe('record-letters');
    expect(activeEntry(parseRoute('#/stories/abc'))?.id).toBe('stories');
  });
});

describe('finding a page', () => {
  it('finds a page by its name, its group or the words people use for it', () => {
    const all = visibleNav(OWNER);
    expect(searchNav(all, 'record').map((n) => n.id)).toEqual(['record-letters', 'record-lessons', 'record-stories']);
    expect(searchNav(all, 'microphone').map((n) => n.id)).toEqual(['record-letters', 'record-lessons', 'record-stories']);
    expect(searchNav(all, 'ban').map((n) => n.id)).toEqual(['users', 'ban-approvals']);
    expect(searchNav(all, 'audit log').map((n) => n.id)).toEqual(['audit']);
    expect(searchNav(all, '')).toHaveLength(all.length);
  });
});
