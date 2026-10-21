import { describe, expect, it } from 'vitest';
import { sessionName, sessionNameFromAgent } from './session-name.js';

describe('the name a session is listed under', () => {
  it('reads a browser from its user agent', () => {
    expect(
      sessionNameFromAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'),
    ).toBe('Safari on Mac');
  });

  it("says which system the phone app's own networking runs on", () => {
    expect(sessionNameFromAgent('okhttp/4.12.0')).toBe('Hevalo app on Android');
    expect(sessionNameFromAgent('Hevalo/42 CFNetwork/1568.100.1 Darwin/24.0.0')).toBe('Hevalo app on iOS');
  });

  it('says nothing when the agent names nothing, or is missing', () => {
    expect(sessionNameFromAgent('curl/8.4.0')).toBeUndefined();
    expect(sessionNameFromAgent('')).toBeUndefined();
    expect(sessionNameFromAgent(undefined)).toBeUndefined();
    expect(sessionNameFromAgent(['Chrome/1'])).toBeUndefined();
  });

  it("prefers the app's own name, and a blank one is no name", () => {
    expect(sessionName('iPhone', 'okhttp/4.12.0')).toBe('iPhone');
    expect(sessionName('   ', 'okhttp/4.12.0')).toBe('Hevalo app on Android');
    expect(sessionName(undefined, 'curl/8.4.0')).toBeUndefined();
  });
});
