/**
 * Content editing workflow (KUR-100). Lessons move draft → in_review →
 * published, with archive as the retire path. Each transition names the
 * capability it needs, so the API can authorize it server-side. Editing a
 * lesson's body is only allowed while it's a draft; once in review it's frozen
 * pending an approve/reject, and once published it's immutable (a DB trigger
 * enforces that — edits happen by cloning a new draft version).
 */
import type { Capability } from '../admin/roles.js';

export type ContentStatus = 'draft' | 'in_review' | 'published' | 'archived';
export const CONTENT_STATUSES: readonly ContentStatus[] = ['draft', 'in_review', 'published', 'archived'];

export interface Transition {
  from: ContentStatus;
  to: ContentStatus;
  capability: Capability;
}

const TRANSITIONS: readonly Transition[] = [
  { from: 'draft', to: 'in_review', capability: 'content.edit' }, // submit for review
  { from: 'in_review', to: 'draft', capability: 'content.edit' }, // reject / withdraw
  { from: 'in_review', to: 'published', capability: 'content.publish' }, // approve + publish
  { from: 'published', to: 'archived', capability: 'content.publish' }, // retire a version
];

/** The transition rule for from→to, or null if it isn't allowed. */
export function allowedTransition(from: ContentStatus, to: ContentStatus): Transition | null {
  return TRANSITIONS.find((t) => t.from === from && t.to === to) ?? null;
}

export function canTransition(from: ContentStatus, to: ContentStatus): boolean {
  return allowedTransition(from, to) !== null;
}

/** A lesson's body (titles + exercises) may only be edited while it's a draft. */
export function isEditable(status: ContentStatus): boolean {
  return status === 'draft';
}
