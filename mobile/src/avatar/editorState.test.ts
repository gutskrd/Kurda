import { describe, expect, it } from 'vitest';
import { DEFAULT_AVATAR } from '@kurda/shared';
import { cancel, initEditor, isDirty, markSaved, select, SLOT_LABELS, SLOT_ORDER } from './editorState';

describe('avatar editor state', () => {
  it('covers all six slots with Kurdish labels', () => {
    expect(SLOT_ORDER).toHaveLength(6);
    for (const slot of SLOT_ORDER) {
      expect(SLOT_LABELS[slot].ku.length).toBeGreaterThan(1);
    }
  });

  it('selecting an owned item updates the preview and marks dirty', () => {
    let state = initEditor(DEFAULT_AVATAR);
    expect(isDirty(state)).toBe(false);
    state = select(state, 'outfit', 'outfit-kiras-fistan', true);
    expect(state.config.outfit).toBe('outfit-kiras-fistan');
    expect(isDirty(state)).toBe(true);
    expect(state.saved.outfit).toBe(DEFAULT_AVATAR.outfit);
  });

  it('selecting a locked item is a no-op', () => {
    const state = initEditor(DEFAULT_AVATAR);
    const next = select(state, 'headwear', 'head-kofi', false);
    expect(next).toBe(state);
  });

  it('cancel reverts to the saved config', () => {
    let state = initEditor(DEFAULT_AVATAR);
    state = select(state, 'background', 'bg-ciya', true);
    state = cancel(state);
    expect(state.config).toEqual(DEFAULT_AVATAR);
    expect(isDirty(state)).toBe(false);
  });

  it('markSaved commits the preview as the new baseline', () => {
    let state = initEditor(DEFAULT_AVATAR);
    state = select(state, 'hairStyle', 'hair-guli', true);
    state = markSaved(state);
    expect(isDirty(state)).toBe(false);
    expect(state.saved.hairStyle).toBe('hair-guli');
  });
});
