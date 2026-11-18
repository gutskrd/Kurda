/**
 * What counts as an auditable admin mutation. Every successful state-changing admin call is logged; the rule lives
 * here, unit-tested, so "no exemptions" is verifiable.
 */

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * A successful, state-changing admin request that must be audited: anything under /admin, plus any route whose guard
 * asks for a staff role (`staffRoute`), such as the shop's catalogue writes at /shop/items.
 */
export function isAuditableAdminMutation(method: string, url: string, statusCode: number, staffRoute = false): boolean {
  return MUTATING.has(method.toUpperCase()) && (url.startsWith('/admin/') || staffRoute) && statusCode < 400;
}

/**
 * The thing a route acts on, from its path parameters: usually `:id`, but `:userId` for a bot score, `:key` for a tag,
 * rule, flag or event, `:sku` for a shop item and `:slug` for a story category. An audit row without a target cannot be
 * found by what it changed.
 */
export function auditTargetId(params: unknown): string | null {
  if (typeof params !== 'object' || params === null) return null;
  const p = params as Record<string, unknown>;
  for (const name of ['id', 'userId', 'key', 'sku', 'slot', 'slug']) {
    if (typeof p[name] === 'string' && p[name]) return p[name] as string;
  }
  return null;
}

/**
 * What kind of thing a route's `:id` names, so an audit row says what its target is (case history is read by case id, a
 * user's by user id). Null for routes whose id is something else.
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
  if (routeUrl.startsWith('/admin/story-categories/:slug')) return 'story_category';
  if (routeUrl.startsWith('/admin/art/:slot')) return 'picture';
  return null;
}

/**
 * Stable action label from the HTTP method and route template. Dry runs (a moderation decision's `preview`, a rhyme
 * rebuild's `dryRun`) are logged too, under their own name, so a preview never reads as a decision.
 */
export function auditActionName(method: string, routeUrl: string, body?: unknown): string {
  const b = typeof body === 'object' && body !== null ? (body as { preview?: unknown; dryRun?: unknown }) : {};
  const suffix = b.preview === true ? ' (preview)' : b.dryRun === true ? ' (dry run)' : '';
  return `${method.toUpperCase()} ${routeUrl}${suffix}`;
}
