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

/** Stable action label from the HTTP method + route template. */
export function auditActionName(method: string, routeUrl: string): string {
  return `${method.toUpperCase()} ${routeUrl}`;
}
