import { ActionSheetIOS, Alert, Platform } from 'react-native';

export interface SheetAction {
  label: string;
  onPress: () => void;
  /** a red line: something that cannot be taken back in a tap (block, delete) */
  destructive?: boolean;
}

/** What a "⋯" asks for: its title, its actions, and the word for going back without one. */
export interface ActionRequest {
  title?: string;
  actions: SheetAction[];
  cancel: string;
}

/**
 * A short list of things to do with something — a person, a post — rising
 * from the bottom within reach of the thumb. One way to ask, so every "⋯"
 * and every long press in the app opens the same thing.
 *
 * On an iPhone it is the system's own action sheet. Elsewhere it is the
 * app's (ActionSheetHost, mounted once at the root), because the system's
 * dialog on Android shows three buttons at most: a friend's profile menu
 * lost Block and Cancel there, and could not be put away without choosing
 * something. The system's dialog is only the stand-in for a moment when no
 * sheet is mounted (a test of one screen, or the app's first frame).
 *
 * The destructive ones go last, and in red: the order the platform uses, so
 * the thing that cannot be undone is never the first under the finger.
 */
export function showActions({ title, actions, cancel }: ActionRequest): void {
  const ordered = orderActions(actions);
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
  if (host) {
    host({ title, actions: ordered, cancel });
    return;
  }
  Alert.alert(
    title ?? '',
    undefined,
    [
      ...ordered.map((a) => ({ text: a.label, style: a.destructive ? ('destructive' as const) : ('default' as const), onPress: a.onPress })),
      { text: cancel, style: 'cancel' as const },
    ],
    // put away by a tap outside or the back button, as the app's own sheet is
    { cancelable: true },
  );
}

/** The destructive actions after the others, each group in the order it was given. */
export function orderActions(actions: readonly SheetAction[]): SheetAction[] {
  return [...actions.filter((a) => !a.destructive), ...actions.filter((a) => a.destructive)];
}

type Host = (request: ActionRequest) => void;

/** The app's sheet, while it is mounted: where `showActions` hands a list on Android and the web. */
let host: Host | null = null;

/** Mount the app's sheet as where actions are shown; the returned function takes it away again. */
export function hostActions(next: Host): () => void {
  host = next;
  return () => {
    if (host === next) host = null;
  };
}
