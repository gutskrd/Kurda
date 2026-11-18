/**
 * react-native-web ships no types. The tests only hand it to `vi.mock('react-native', …)`, and the code under test is
 * typed against React Native's own declarations.
 */
declare module 'react-native-web';
