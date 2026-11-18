import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { installRawBodyGate } from './raw-body-gate.js';

describe('raw upload bodies', () => {
  let app: FastifyInstance;
  afterEach(async () => {
    await app.close();
  });

  async function build(): Promise<FastifyInstance> {
    app = Fastify();
    installRawBodyGate(app);
    app.addContentTypeParser(['image/png', 'application/octet-stream'], { parseAs: 'buffer' }, (_req, body, done) => done(null, body));
    app.post('/upload', { config: { rawBody: true } }, async (req) => ({ bytes: (req.body as Buffer).length }));
    app.post('/form', async () => ({ ok: true }));
    await app.ready();
    return app;
  }

  it('are taken by a route that stores uploads', async () => {
    const res = await (await build()).inject({ method: 'POST', url: '/upload', headers: { 'content-type': 'image/png' }, payload: Buffer.alloc(64) });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ bytes: 64 });
  });

  it('are refused before they are read by any other route, and by an address that does not exist', async () => {
    const built = await build();
    for (const url of ['/form', '/nowhere']) {
      for (const type of ['image/png', 'application/octet-stream; charset=binary', 'AUDIO/MP4']) {
        const res = await built.inject({ method: 'POST', url, headers: { 'content-type': type }, payload: Buffer.alloc(64) });
        expect(res.statusCode).toBe(415);
      }
    }
  });

  it('leave ordinary requests alone', async () => {
    const built = await build();
    const res = await built.inject({ method: 'POST', url: '/form', payload: { a: 1 } });
    expect(res.statusCode).toBe(200);
  });
});
