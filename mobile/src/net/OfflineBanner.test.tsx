// @vitest-environment jsdom
import { cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { TRANSLATIONS } from '../i18n/translations';
import { OfflineBanner } from './OfflineBanner';

vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
// online throughout: the banner is at rest in its hidden place, which is where the two motions differ
vi.mock('./useNetworkStatus', () => ({ useIsOnline: () => true }));

afterEach(cleanup);

/** The style of the banner’s moving wrapper: the parent of the pill the words sit in. */
const wrapper = (): string => screen.getByText(TRANSLATIONS.en['net.offline.banner']).parentElement?.parentElement?.getAttribute('style') ?? '';

describe('the offline banner', () => {
  it('waits above its place, to drop in from there', async () => {
    patchReactNativeWeb({ reduceMotion: false });
    renderWithProviders(<OfflineBanner />);
    await waitFor(() => expect(wrapper()).toContain('translateY(-24px)'));
    expect(wrapper()).toContain('opacity: 0');
  });

  it('waits in its place under Reduce Motion, so it only fades in', async () => {
    patchReactNativeWeb({ reduceMotion: true });
    renderWithProviders(<OfflineBanner />);
    await waitFor(() => expect(wrapper()).toContain('translateY(0px)'));
    expect(wrapper()).toContain('opacity: 0');
  });
});
