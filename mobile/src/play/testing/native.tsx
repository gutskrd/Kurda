/**
 * react-native for component tests that check what a screen reader is told.
 *
 * The app marks a radio's choice, a selected option or a disabled button with
 * `accessibilityState`, which a phone hands to VoiceOver and TalkBack.
 * react-native-web no longer reads that prop, so through the plain harness a
 * checked radio and an unchecked one look the same in the DOM. This is
 * react-native-web with View, Pressable and Text turning `accessibilityState`
 * into the aria attributes it stands for, so a test can ask for
 * `aria-checked` the way it would on the web. Wired with
 * `vi.mock('react-native', () => import('…/play/testing/native'))`.
 */
import { createElement, forwardRef, type ComponentType } from 'react';
import * as RNW from 'react-native-web';

export * from 'react-native-web';

interface State {
  checked?: boolean | 'mixed';
  selected?: boolean;
  disabled?: boolean;
  busy?: boolean;
  expanded?: boolean;
}

type Props = { accessibilityState?: State; [prop: string]: unknown };

function withState(Component: ComponentType<Props>): ComponentType<Props> {
  return forwardRef<unknown, Props>(function Wrapped({ accessibilityState, ...rest }, ref) {
    const state = accessibilityState as State | undefined;
    const aria: Record<string, unknown> = {};
    if (state?.checked !== undefined) aria['aria-checked'] = state.checked;
    if (state?.selected !== undefined) aria['aria-selected'] = state.selected;
    if (state?.disabled !== undefined) aria['aria-disabled'] = state.disabled;
    if (state?.busy !== undefined) aria['aria-busy'] = state.busy;
    if (state?.expanded !== undefined) aria['aria-expanded'] = state.expanded;
    return createElement(Component, { ...rest, ...aria, ref });
  }) as unknown as ComponentType<Props>;
}

export const View = withState(RNW.View as ComponentType<Props>);
export const Pressable = withState(RNW.Pressable as ComponentType<Props>);
export const Text = withState(RNW.Text as ComponentType<Props>);
