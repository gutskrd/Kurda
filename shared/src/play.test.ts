import { describe, expect, it } from 'vitest';
import { isMissingRoute, ROUTE_NOT_FOUND_MESSAGE } from './play.js';

describe('isMissingRoute', () => {
  it('is the API’s not-found handler, and no game’s own NOT_FOUND', () => {
    expect(isMissingRoute({ code: 'NOT_FOUND', message: ROUTE_NOT_FOUND_MESSAGE })).toBe(true);
    expect(isMissingRoute({ code: 'NOT_FOUND', message: 'no such battle' })).toBe(false);
    expect(isMissingRoute({ code: 'GAME_NOT_FOUND', message: ROUTE_NOT_FOUND_MESSAGE })).toBe(false);
    expect(isMissingRoute({ message: ROUTE_NOT_FOUND_MESSAGE })).toBe(false);
  });
});
