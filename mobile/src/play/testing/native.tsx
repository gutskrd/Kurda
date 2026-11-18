/**
 * react-native for component tests that check what screen readers are told. react-native-web ignores
 * `accessibilityState`, so this wraps View, Pressable and Text to turn it into aria attributes (and
 * `accessibilityLanguage` into `lang`), letting a test ask for `aria-checked` as on the web. Wire it with
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

type Props = { accessibilityState?: State; accessibilityLanguage?: string; [prop: string]: unknown };

function withState(Component: ComponentType<Props>): ComponentType<Props> {
  return forwardRef<unknown, Props>(function Wrapped({ accessibilityState, accessibilityLanguage, ...rest }, ref) {
    const state = accessibilityState as State | undefined;
    const aria: Record<string, unknown> = {};
    if (state?.checked !== undefined) aria['aria-checked'] = state.checked;
    if (state?.selected !== undefined) aria['aria-selected'] = state.selected;
    if (state?.disabled !== undefined) aria['aria-disabled'] = state.disabled;
    if (state?.busy !== undefined) aria['aria-busy'] = state.busy;
    if (state?.expanded !== undefined) aria['aria-expanded'] = state.expanded;
    // The language VoiceOver reads an element in, as the web's `lang`.
    if (accessibilityLanguage) aria.lang = accessibilityLanguage;
    return createElement(Component, { ...rest, ...aria, ref });
  }) as unknown as ComponentType<Props>;
}

export const View = withState(RNW.View as ComponentType<Props>);
export const Pressable = withState(RNW.Pressable as ComponentType<Props>);
export const Text = withState(RNW.Text as ComponentType<Props>);
