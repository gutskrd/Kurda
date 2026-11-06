/**
 * The learning games' routes are registered and pass the app's boot checks
 * (every write declares its body, every path parameter its schema, every
 * staff route sits behind the 2FA gate), with a database configured but not
 * asked anything: building the app talks to nobody until a request comes.
 */
import { describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';

describe('the learning games’ routes', () => {
  it('are all there once the app is built', async () => {
    const config = loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'fatal', DATABASE_URL: 'postgres://nobody:nothing@127.0.0.1:1/none' });
    const app = buildApp(config);
    try {
      await app.ready();
      const routes = app.printRoutes({ commonPrefix: false });
      for (const path of ['/games/availability', '/games/build-sentence/ladder', '/games/solo/sessions', '/admin/game-content', '/admin/game-content/import']) {
        expect(routes, path).toContain(path.split('/').pop());
      }
      // nobody unsigned plays or edits
      const play = await app.inject({ method: 'POST', url: '/games/solo/sessions', payload: { game: 'build-sentence', dialect: 'kmr', difficulty: 'beginner' } });
      expect(play.statusCode).toBe(401);
      const bad = await app.inject({ method: 'GET', url: '/games/availability?dialect=kurmanji' });
      expect(bad.statusCode).toBe(400);
      // a round's clip is asked for by its handle, and nothing that is not one is looked up
      expect(routes).toContain(':clip');
      const clip = await app.inject({ method: 'GET', url: '/games/solo/sessions/00000000-0000-4000-8000-000000000001/clips/not%20a%20handle' });
      expect(clip.statusCode).toBe(400);
      for (const game of ['memory-thief', 'hear-it']) {
        const res = await app.inject({ method: 'POST', url: '/games/solo/sessions', payload: { game, dialect: 'kmr', difficulty: 'beginner' } });
        expect(res.statusCode, game).toBe(401);
      }
    } finally {
      await app.close();
    }
  });
});
