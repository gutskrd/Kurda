// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('expo-secure-store', () => import('./testing/stubs'));
import { directionFor } from './direction';

describe('directionFor', () => {
  it('mirrors rows for Soranî and Arabic while the platform does not', () => {
    expect(directionFor(true, false)).toMatchObject({ row: 'row-reverse', text: { writingDirection: 'rtl', textAlign: 'right' } });
    expect(directionFor(false, false)).toMatchObject({ row: 'row', flip: null });
  });

  it('lets words someone else wrote keep their own direction, lined up with the screen', () => {
    expect(directionFor(true, false).free).toEqual({ writingDirection: 'auto', textAlign: 'right' });
    expect(directionFor(false, false).free).toEqual({ writingDirection: 'auto' });
  });

  it('steps aside once the platform mirrors everything itself', () => {
    expect(directionFor(true, true)).toMatchObject({ row: 'row', text: { writingDirection: 'rtl', textAlign: 'left' } });
  });
});
