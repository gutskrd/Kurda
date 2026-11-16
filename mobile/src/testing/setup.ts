import { vi } from 'vitest';
import { configure } from '@testing-library/dom';

/*
 * Tests never reach the network: the app's address is the live API, so a
 * request a test has not stubbed would otherwise go to the real server. Every
 * test that talks to the API stubs fetch itself; anything else fails here,
 * offline, as a network error.
 */
globalThis.fetch = (() => Promise.reject(new TypeError('tests do not reach the network'))) as typeof fetch;

/*
 * How long a findBy… or waitFor waits for a screen to catch up. Testing
 * Library's own second is often not enough for a screen drawn through
 * react-native-web, with its art, when the whole suite runs at once on a busy
 * machine — and a test that fails only then is a test nobody can trust. A
 * passing test is no slower for it: the wait ends as soon as the screen is
 * there.
 */
configure({ asyncUtilTimeout: 4000 });

/*
 * The clipboard is a native module, which needs the app's runtime to load at
 * all. Every test gets the stand-in, which keeps what was copied
 * (reports/testing/stubs.ts `clipboardStub`) so a test can check it.
 */
vi.mock('expo-clipboard', () => import('../reports/testing/stubs'));
