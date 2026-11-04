/**
 * @react-navigation/native for a test of a guided screen: the shared stand-in
 * (play/testing/navigation), with the navigation context the guide reads to
 * know whether its screen is in front. Nobody provides it in a test, so a
 * screen rendered on its own counts as in front, as one with no navigator
 * does in the app. Wired with
 * `vi.mock('@react-navigation/native', () => import('…/auth/guide/testing/navigation'))`.
 */
import { createContext } from 'react';

export * from '../../../play/testing/navigation';

export const NavigationContext = createContext<null>(null);
