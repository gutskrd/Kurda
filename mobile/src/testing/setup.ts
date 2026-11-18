import { vi } from 'vitest';
import { configure } from '@testing-library/dom';

/* Tests never reach the network: any fetch a test has not stubbed fails here as a network error. */
globalThis.fetch = (() => Promise.reject(new TypeError('tests do not reach the network'))) as typeof fetch;

/*
 * A longer wait for findBy… and waitFor: react-native-web screens with art can take more than a second to draw
 * when the whole suite runs on a busy machine. Passing tests are no slower, since the wait ends early.
 */
configure({ asyncUtilTimeout: 4000 });

/* The clipboard is a native module; every test gets the stand-in, which records what was copied. */
vi.mock('expo-clipboard', () => import('../reports/testing/stubs'));
