/**
 * Pure helpers deciding what counts as an auditable admin mutation (KUR-104).
 * Every state-changing call under /admin on a successful response is logged —
 * the rule is here (and unit-tested) so "no exemptions" is verifiable, not a
 * property of scattered per-route code.
 */

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** A successful, state-changing admin request that must be audited. */
export function isAuditableAdminMutation(method: string, url: string, statusCode: number): boolean {
  return MUTATING.has(method.toUpperCase()) && url.startsWith('/admin/') && statusCode < 400;
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
  if (routeUrl.startsWith('/admin/users/:id')) return 'user';
  return null;
}

/**
 * Stable action label from the HTTP method + route template. A dry run (a
 * moderation decision's `preview`) is logged too — nothing is exempt — but
 * under its own name, so a case's history never shows a preview as a decision.
 */
export function auditActionName(method: string, routeUrl: string, body?: unknown): string {
  const preview = typeof body === 'object' && body !== null && (body as { preview?: unknown }).preview === true;
  return `${method.toUpperCase()} ${routeUrl}${preview ? ' (preview)' : ''}`;
}
