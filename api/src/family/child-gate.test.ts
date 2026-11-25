/**
 * A child's session reaches only the routes the child gate lists (child-gate.ts). This walks the route table of a
 * built app: every listed route exists, nothing a child must never use is listed, and the gate's two rules (the
 * list, and no browser) hold for routes that do not exist yet.
 */
import type { FastifyRequest, RouteOptions } from 'fastify';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { CHILD_ROUTES, childMayUse, fromBrowser } from './child-gate.js';

/** The parts of Hevalo a child never reaches, by where their routes live. */
const NEVER_FOR_A_CHILD: Array<[RegExp, string]> = [
  [/^\/chat\b/, 'direct messages'],
  [/^\/groups\b/, 'group chats'],
  [/^\/me\/groups\b/, 'group chats'],
  [/^\/friends\b/, 'friends'],
  [/^\/users\b/, 'other people’s profiles and search'],
  [/^\/me\/social\b/, 'the social rail'],
  [/^\/library\b/, 'posts and comments'],
  [/^\/images\b/, 'picture posts'],
  [/^\/posts\b/, 'reactions on posts'],
  [/^\/feed\b/, 'the wall'],
  [/^\/activity\b/, 'the activity feed'],
  [/^\/letters\b/, 'letters and pen pals'],
  [/^\/play\b/, 'online games'],
  [/^\/mp\b/, 'online games'],
  [/^\/story-games\b/, 'story games with others'],
  [/^\/wordle\/battles\b/, 'online games'],
  [/^\/rhyme\/matches\b/, 'online games'],
  [/^\/tournaments\b/, 'tournaments'],
  [/^\/leaderboards\b/, 'public boards'],
  [/^\/me\/league\b/, 'leagues'],
  [/^\/ranks\b/, 'rankings'],
  [/^\/media\b/, 'uploads'],
  [/^\/me\/profile-picture\b/, 'uploads'],
  [/^\/gifts\b/, 'gifts'],
  [/^\/me\/gifts\b/, 'gifts'],
  [/^\/shop\b/, 'the shop'],
  [/^\/iap\b/, 'payments'],
  [/^\/me\/wallet\b/, 'currency'],
  [/^\/me\/tree\/kinds\b/, 'buying a tree'],
  [/^\/me\/streak\/repair\b/, 'buying a streak back'],
  [/^\/experiments\b/, 'analytics'],
  [/^\/me\/heartbeat\b/, 'presence'],
  [/^\/realtime\b/, 'live updates from other people'],
  [/^\/me\/notifications\b/, 'the notifications list'],
  [/^\/me\/notification-prefs\b/, 'notification settings, which are the parent’s'],
  [/^\/me\/parental\b/, 'a teen’s side of parental controls'],
  [/^\/me\/export\b/, 'the data export, which the parent asks for'],
  [/^\/me\/sessions\b/, 'devices, which the parent signs out'],
  [/^\/me\/password\b/, 'a password'],
  [/^\/reports\b/, 'reports'],
  [/^\/me\/app-feedback\b/, 'feedback and store prompts'],
  [/^\/me\/store-review\b/, 'store prompts'],
  [/^\/admin\b/, 'staff'],
];

async function routeTable(): Promise<string[]> {
  const routes: string[] = [];
  const app = buildApp(loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'fatal', DATABASE_URL: 'postgres://nobody:nothing@127.0.0.1:1/none' }), {
    onRoute: (route: RouteOptions) => {
      for (const method of [route.method].flat()) if (method !== 'HEAD') routes.push(`${method} ${route.url}`);
    },
  });
  try {
    await app.ready();
  } finally {
    await app.close();
  }
  return routes;
}

describe('the child gate', () => {
  it('lists only routes that exist, and none a child must never use', async () => {
    const routes = new Set(await routeTable());
    expect([...CHILD_ROUTES].filter((r) => !routes.has(r))).toEqual([]);
    const wrong = [...CHILD_ROUTES].filter((r) => NEVER_FOR_A_CHILD.some(([pattern]) => pattern.test(r.split(' ')[1]!)));
    expect(wrong).toEqual([]);
    // and the routes a child is refused are most of Hevalo
    expect(routes.size - CHILD_ROUTES.size).toBeGreaterThan(400);
  });

  it('refuses a child any route it does not list', () => {
    expect(childMayUse('GET', '/courses')).toBe(true);
    expect(childMayUse('POST', '/courses')).toBe(false);
    expect(childMayUse('GET', '/a/route/added/later')).toBe(false);
    expect(childMayUse('GET', undefined)).toBe(false);
  });

  it('takes any request with an origin for a browser’s, but a developer’s own machine outside production', () => {
    const req = (origin?: string) => ({ headers: origin ? { origin } : {} }) as unknown as FastifyRequest;
    expect(fromBrowser(req(), { NODE_ENV: 'production' })).toBe(false);
    expect(fromBrowser(req('https://hevalo.app'), { NODE_ENV: 'production' })).toBe(true);
    expect(fromBrowser(req('http://localhost:8081'), { NODE_ENV: 'production' })).toBe(true);
    expect(fromBrowser(req('http://localhost:8081'), { NODE_ENV: 'development' })).toBe(false);
    expect(fromBrowser(req('https://hevalo.app'), { NODE_ENV: 'development' })).toBe(true);
  });
});
