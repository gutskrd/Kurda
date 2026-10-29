// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { memoryStore } from '../keyboard/deviceStore';
import { rememberCourseDialect, resetCourseDialect, useCourseDialect } from './courseDialect';

afterEach(() => {
  cleanup();
  resetCourseDialect();
});

describe('the learner’s Kurdish', () => {
  it('is Kurmancî until Learn says otherwise', () => {
    expect(renderHook(() => useCourseDialect(memoryStore())).result.current).toBe('kmr');
  });

  it('is the variety of the course Learn shows, kept on this device for next time', async () => {
    const store = memoryStore();
    rememberCourseDialect('sorani', store);
    expect(store.data.get('hevalo.course-dialect.v1')).toBe('ckb');
    expect(renderHook(() => useCourseDialect(store)).result.current).toBe('ckb');
    rememberCourseDialect('kurmanji', store);
    expect(store.data.get('hevalo.course-dialect.v1')).toBe('kmr');

    // a fresh start reads what was kept
    resetCourseDialect();
    const kept = memoryStore({ 'hevalo.course-dialect.v1': 'ckb' });
    const { result } = renderHook(() => useCourseDialect(kept));
    await waitFor(() => expect(result.current).toBe('ckb'));
  });
});
