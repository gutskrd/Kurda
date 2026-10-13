/**
 * react-native-web ships no types. The component tests only hand it to
 * `vi.mock('react-native', …)` as the module that stands in for React Native,
 * and the code under test is typed against React Native's own declarations.
 */
declare module 'react-native-web';
