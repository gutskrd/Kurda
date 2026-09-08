import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HISTORY_DEPTH, useHistory } from './useHistory';

describe('useHistory', () => {
  it('starts with nothing to undo or redo', () => {
    const { result } = renderHook(() => useHistory('a'));
    expect(result.current.present).toBe('a');
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('walks back and forward through discrete changes', () => {
    const { result } = renderHook(() => useHistory('a'));
    act(() => result.current.set('b'));
    act(() => result.current.set('c'));
    expect(result.current.present).toBe('c');

    act(() => result.current.undo());
    expect(result.current.present).toBe('b');
    act(() => result.current.undo());
    expect(result.current.present).toBe('a');
    expect(result.current.canUndo).toBe(false);

    act(() => result.current.redo());
    act(() => result.current.redo());
    expect(result.current.present).toBe('c');
    expect(result.current.canRedo).toBe(false);
  });

  /**
   * The reason this hook exists. A drag emits a state per pointer event; if each
   * became a step, putting a sticker back would take two hundred presses.
   */
  it('records a whole gesture as one step', () => {
    const { result } = renderHook(() => useHistory(0));
    act(() => result.current.set(1));
    act(() => {
      for (let i = 2; i <= 200; i++) result.current.preview(i);
    });
    act(() => result.current.settle());

    expect(result.current.present).toBe(200);
    act(() => result.current.undo());
    expect(result.current.present).toBe(1);
  });

  it('leaves no step for a gesture that ends where it began', () => {
    const { result } = renderHook(() => useHistory('a'));
    act(() => result.current.set('b'));
    act(() => {
      result.current.preview('c');
      result.current.preview('b');
    });
    act(() => result.current.settle());
    expect(result.current.present).toBe('b');
    // the only step is still a→b
    act(() => result.current.undo());
    expect(result.current.present).toBe('a');
    expect(result.current.canUndo).toBe(false);
  });

  it('settling without a gesture does nothing', () => {
    const { result } = renderHook(() => useHistory('a'));
    act(() => result.current.settle());
    act(() => result.current.settle());
    expect(result.current.canUndo).toBe(false);
    expect(result.current.present).toBe('a');
  });

  it('shows a preview immediately, before it is settled', () => {
    const { result } = renderHook(() => useHistory('a'));
    act(() => result.current.preview('mid-drag'));
    expect(result.current.present).toBe('mid-drag');
  });

  it('drops the redo trail once you change course', () => {
    const { result } = renderHook(() => useHistory('a'));
    act(() => result.current.set('b'));
    act(() => result.current.undo());
    expect(result.current.canRedo).toBe(true);

    act(() => result.current.set('c'));
    expect(result.current.canRedo).toBe(false);
    act(() => result.current.undo());
    expect(result.current.present).toBe('a');
  });

  it('ignores a change to the value it already holds', () => {
    const { result } = renderHook(() => useHistory('a'));
    act(() => result.current.set('a'));
    expect(result.current.canUndo).toBe(false);
  });

  it('forgets everything on reset', () => {
    const { result } = renderHook(() => useHistory('a'));
    act(() => result.current.set('b'));
    act(() => result.current.reset('fresh'));
    expect(result.current.present).toBe('fresh');
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('forgets the oldest steps rather than growing without limit', () => {
    const { result } = renderHook(() => useHistory(0));
    act(() => {
      for (let i = 1; i <= HISTORY_DEPTH + 25; i++) result.current.set(i);
    });
    act(() => {
      for (let i = 0; i < HISTORY_DEPTH + 25; i++) result.current.undo();
    });
    // the earliest reachable state is bounded by the depth, not by where we began
    expect(result.current.present).toBe(25);
    expect(result.current.canUndo).toBe(false);
  });

  /**
   * Typing into a caption is a gesture; reaching for a button is not. When the
   * second interrupts the first, both have to survive — closing the gesture
   * silently would lose whatever was typed from the history entirely.
   */
  it('closes an open gesture before recording a discrete change', () => {
    const { result } = renderHook(() => useHistory('a'));
    act(() => result.current.preview('typed'));
    act(() => result.current.set('clicked'));
    expect(result.current.present).toBe('clicked');

    act(() => result.current.undo());
    expect(result.current.present).toBe('typed');
    act(() => result.current.undo());
    expect(result.current.present).toBe('a');
    expect(result.current.canUndo).toBe(false);
  });
});
