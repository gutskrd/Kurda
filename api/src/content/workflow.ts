/**
 * Lesson editing workflow: draft → in_review → published, with archive as the retire path. Each transition names the
 * capability it needs so the API authorizes it server-side. Only drafts are editable; a lesson in review is frozen
 * pending approval, and a published one is immutable (a DB trigger enforces it; edits clone a new draft version).
 */
import type { Capability } from '../admin/roles.js';

export type ContentStatus = 'draft' | 'in_review' | 'published' | 'archived';

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

/** A lesson's body (titles + exercises) may only be edited while it's a draft. */
export function isEditable(status: ContentStatus): boolean {
  return status === 'draft';
}
