// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { caseEvidenceImagePath } from './apiImage';

describe('caseEvidenceImagePath', () => {
  it('asks the API for a picture attached to the case, with both ids escaped', () => {
    expect(caseEvidenceImagePath('c 1', 'image-post/ab+c.webp')).toBe('/admin/moderation/cases/c%201/media?key=image-post%2Fab%2Bc.webp');
  });
});
