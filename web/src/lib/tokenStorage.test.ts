import { describe, it, expect, beforeEach } from 'vitest';
import { createTokenStorage, persistTokens } from './tokenStorage';

const tokens = { accessToken: 'a', refreshToken: 'r' };

describe('token storage', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('round-trips tokens', () => {
    const s = createTokenStorage();
    s.set(tokens);
    expect(s.get()).toEqual(tokens);
  });

  it('clear() removes tokens from both stores', () => {
    persistTokens(tokens, true);
    const s = createTokenStorage();
    s.clear();
    expect(s.get()).toBeNull();
    expect(localStorage.getItem('mykurda_tokens')).toBeNull();
    expect(sessionStorage.getItem('mykurda_tokens')).toBeNull();
  });

  it('remember=false keeps tokens in sessionStorage only', () => {
    persistTokens(tokens, false);
    expect(sessionStorage.getItem('mykurda_tokens')).not.toBeNull();
    expect(localStorage.getItem('mykurda_tokens')).toBeNull();
    expect(createTokenStorage().get()).toEqual(tokens);
  });

  it('remember=true persists in localStorage', () => {
    persistTokens(tokens, true);
    expect(localStorage.getItem('mykurda_tokens')).not.toBeNull();
    expect(sessionStorage.getItem('mykurda_tokens')).toBeNull();
  });

  it('ignores malformed stored data', () => {
    localStorage.setItem('mykurda_tokens', '{not json');
    expect(createTokenStorage().get()).toBeNull();
  });
});
