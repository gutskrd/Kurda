/**
 * @react-navigation/native for a test of a guided screen: the shared stand-in (play/testing/navigation) plus the
 * navigation context the guide reads, which nobody provides in a test, so a screen counts as in front. Wired with
 * `vi.mock('@react-navigation/native', () => import('…/auth/guide/testing/navigation'))`.
 */
import { createContext } from 'react';

export * from '../../../play/testing/navigation';

export const NavigationContext = createContext<null>(null);
