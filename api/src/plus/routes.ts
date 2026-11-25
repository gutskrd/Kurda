import type { FastifyInstance } from 'fastify';
import { requireAccount } from '../plugins/auth.js';
import { MembersBoxService } from './members-box.js';
import { WalletService } from '../wallet/service.js';

/** A member's box: this month's, given on the first look of the month, and that it has been seen. */
export function registerMembersBoxRoutes(app: FastifyInstance): MembersBoxService {
  const boxes = new MembersBoxService(app.db, new WalletService(app.db), (key) => (app.storage ? app.storage.publicUrl(key) : null));

  app.get('/me/members-box', { preHandler: requireAccount }, async (req) => boxes.view(req.user!.id));

  app.post('/me/members-box/seen', { config: { skipValidation: true }, preHandler: requireAccount }, async (req) => {
    await boxes.markSeen(req.user!.id);
    return { ok: true };
  });

  return boxes;
}
