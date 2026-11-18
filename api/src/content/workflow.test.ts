import { describe, expect, it } from 'vitest';
import { allowedTransition, isEditable } from './workflow.js';

const canTransition = (from: Parameters<typeof allowedTransition>[0], to: Parameters<typeof allowedTransition>[1]) => allowedTransition(from, to) !== null;

describe('content workflow transitions', () => {
  it('allows the draft → in_review → published path', () => {
    expect(canTransition('draft', 'in_review')).toBe(true);
    expect(canTransition('in_review', 'published')).toBe(true);
    expect(canTransition('in_review', 'draft')).toBe(true); // reject
    expect(canTransition('published', 'archived')).toBe(true);
  });

  it('forbids skipping review and reviving published content', () => {
    expect(canTransition('draft', 'published')).toBe(false); // must go through review
    expect(canTransition('published', 'draft')).toBe(false);
    expect(canTransition('archived', 'draft')).toBe(false);
  });

  it('names the capability each transition needs', () => {
    expect(allowedTransition('draft', 'in_review')?.capability).toBe('content.edit');
    expect(allowedTransition('in_review', 'published')?.capability).toBe('content.publish');
  });

  it('only drafts are body-editable', () => {
    expect(isEditable('draft')).toBe(true);
    expect(isEditable('in_review')).toBe(false);
    expect(isEditable('published')).toBe(false);
  });
});
