// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
import { Animated, Text } from 'react-native';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { HeaderButton } from './HeaderButton';
import { LargeTitle, TitleBar, useCollapsingTitle } from './LargeTitle';

patchReactNativeWeb();
afterEach(cleanup);

function Tab({ onCompose = () => undefined }: { onCompose?: () => void }): React.JSX.Element {
  const title = useCollapsingTitle();
  return (
    <>
      <TitleBar title="Messages" collapse={title} right={<HeaderButton icon="compose" label="New message" onPress={onCompose} edge="end" />} />
      <Animated.ScrollView testID="list" onScroll={title.onScroll} scrollEventThrottle={16}>
        <LargeTitle title="Messages" collapse={title} />
        <Text>Rojda</Text>
      </Animated.ScrollView>
    </>
  );
}

/** The bar's own copy of the name: the one a screen reader is not given. */
function inlineTitle(): HTMLElement {
  const copies = screen.getAllByText('Messages');
  const inline = copies.find((el) => el.closest('[aria-hidden="true"]') !== null);
  expect(inline).toBeTruthy();
  return inline!;
}

describe('a collapsing large title', () => {
  it('is the screen header once, however many times the name is drawn', () => {
    renderWithProviders(<Tab />);
    expect(screen.getAllByRole('heading', { name: 'Messages' })).toHaveLength(1);
    expect(screen.getAllByText('Messages')).toHaveLength(2);
  });

  it('keeps the bar actions in reach', () => {
    const onCompose = vi.fn();
    renderWithProviders(<Tab onCompose={onCompose} />);
    fireEvent.click(screen.getByRole('button', { name: 'New message' }));
    expect(onCompose).toHaveBeenCalledTimes(1);
  });

  it('brings the name into the bar once the large title has scrolled under it, and takes it away at the top', async () => {
    renderWithProviders(<Tab />);
    const list = screen.getByTestId('list');
    expect(Number(inlineTitle().style.opacity)).toBe(0);

    list.scrollTop = 200;
    await act(async () => {
      fireEvent.scroll(list);
    });
    expect(Number(inlineTitle().style.opacity)).toBe(1);

    // a scroll view reports at most every 16 ms
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      list.scrollTop = 0;
      fireEvent.scroll(list);
    });
    expect(Number(inlineTitle().style.opacity)).toBe(0);
  });
});
