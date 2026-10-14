/**
 * Pure helpers deciding what counts as an auditable admin mutation (KUR-104).
 * Every state-changing call under /admin on a successful response is logged —
 * the rule is here (and unit-tested) so "no exemptions" is verifiable, not a
 * property of scattered per-route code.
 */

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * A successful, state-changing admin request that must be audited: anything
 * under /admin, and any other route whose guard asks for a staff role
 * (`staffRoute`) — the shop's catalogue writes live at /shop/items, and
 * pricing the shop went unrecorded because of where its URL happened to be.
 */
export function isAuditableAdminMutation(method: string, url: string, statusCode: number, staffRoute = false): boolean {
  return MUTATING.has(method.toUpperCase()) && (url.startsWith('/admin/') || staffRoute) && statusCode < 400;
}

/**
 * The thing a route acts on, from its path parameters: most routes name it
 * `:id`, but a user's bot score is `:userId`, a tag, rule, flag or event its
 * `:key`, and a shop item its `:sku` — and an audit row with no target cannot be
 * found by the thing it changed.
 */
export function auditTargetId(params: unknown): string | null {
  if (typeof params !== 'object' || params === null) return null;
  const p = params as Record<string, unknown>;
  for (const name of ['id', 'userId', 'key', 'sku']) {
    if (typeof p[name] === 'string' && p[name]) return p[name] as string;
  }
  return null;
}

/**
 * What kind of thing a route's `:id` names, so an audit row says what its
 * target is: a moderation case's history in the case view is read by case id,
 * and a user's by user id. Null for routes whose id is something else.
 */
export function auditTargetType(routeUrl: string): string | null {
  if (routeUrl.startsWith('/admin/moderation/cases/:id')) return 'moderation_case';
  if (routeUrl.startsWith('/admin/moderation/approvals/:id') || routeUrl.startsWith('/admin/sanctions/:id')) return 'sanction';
  if (routeUrl.startsWith('/admin/moderation/escalations/:id')) return 'escalation';
  if (routeUrl.startsWith('/admin/appeals/:id')) return 'appeal';
  if (routeUrl.startsWith('/admin/users/:id') || routeUrl.startsWith('/admin/antibot/:userId')) return 'user';
  if (routeUrl.startsWith('/shop/items/:sku')) return 'shop_item';
  if (routeUrl.startsWith('/admin/tags/:key')) return 'tag';
  if (routeUrl.startsWith('/admin/gem-rules/:key')) return 'gem_rule';
  if (routeUrl.startsWith('/admin/events/:key')) return 'event';
  if (routeUrl.startsWith('/admin/experiments/:key')) return 'experiment';
  if (routeUrl.startsWith('/admin/content/lessons/:id')) return 'lesson';
  if (routeUrl.startsWith('/admin/stories/:id')) return 'story';
  return null;
}

/**
 * Stable action label from the HTTP method + route template. A dry run (a
 * moderation decision's `preview`, a rhyme rebuild's `dryRun`) is logged too —
 * nothing is exempt — but under its own name, so a case's history never shows
 * a preview as a decision and the trail never shows a look as a change.
 */
export function auditActionName(method: string, routeUrl: string, body?: unknown): string {
  const b = typeof body === 'object' && body !== null ? (body as { preview?: unknown; dryRun?: unknown }) : {};
  const suffix = b.preview === true ? ' (preview)' : b.dryRun === true ? ' (dry run)' : '';
  return `${method.toUpperCase()} ${routeUrl}${suffix}`;
}
