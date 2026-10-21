import { configure } from '@testing-library/dom';

/*
 * How long a findBy… or waitFor waits for a screen to catch up. Testing
 * Library's own second is often not enough for a screen drawn through
 * react-native-web, with its art, when the whole suite runs at once on a busy
 * machine — and a test that fails only then is a test nobody can trust. A
 * passing test is no slower for it: the wait ends as soon as the screen is
 * there.
 */
configure({ asyncUtilTimeout: 4000 });
