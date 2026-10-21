import { ActionSheetIOS, Alert, Platform } from 'react-native';

export interface SheetAction {
  label: string;
  onPress: () => void;
  /** a red line: something that cannot be taken back in a tap (block, delete) */
  destructive?: boolean;
}

/**
 * A short list of things to do with something — a person, a post — the way
 * the phone itself offers them: the system's action sheet on an iPhone,
 * rising from the bottom within reach of the thumb, and the system's dialog
 * elsewhere. One way to ask, so every "⋯" and every long press in the app
 * opens the same thing.
 *
 * The destructive ones go last, above Cancel, and in red: the order the
 * platform uses, so the thing that cannot be undone is never the first under
 * the finger.
 */
export function showActions({ title, actions, cancel }: { title?: string; actions: SheetAction[]; cancel: string }): void {
  const ordered = [...actions.filter((a) => !a.destructive), ...actions.filter((a) => a.destructive)];
  if (Platform.OS === 'ios') {
    const destructive = ordered.flatMap((a, i) => (a.destructive ? [i] : []));
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        options: [...ordered.map((a) => a.label), cancel],
        cancelButtonIndex: ordered.length,
        destructiveButtonIndex: destructive.length > 0 ? destructive : undefined,
      },
      (index) => {
        if (index < ordered.length) ordered[index]?.onPress();
      },
    );
    return;
  }
  Alert.alert(title ?? '', undefined, [
    ...ordered.map((a) => ({ text: a.label, style: a.destructive ? ('destructive' as const) : ('default' as const), onPress: a.onPress })),
    { text: cancel, style: 'cancel' as const },
  ]);
}
