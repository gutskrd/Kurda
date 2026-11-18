import { ActionSheetIOS, Alert, Platform } from 'react-native';

export interface SheetAction {
  label: string;
  onPress: () => void;
  /** Shown in red: something that cannot be undone in a tap (block, delete). */
  destructive?: boolean;
}

/** What a "⋯" asks for: its title, its actions, and the label for going back without one. */
export interface ActionRequest {
  title?: string;
  actions: SheetAction[];
  cancel: string;
}

/**
 * A short list of actions on something (a person, a post) rising from the bottom, the one way every "⋯" and long
 * press asks. On iOS it is the system action sheet; elsewhere the app's own (ActionSheetHost, mounted once at the
 * root), since Android's system dialog shows at most three buttons. The system dialog is only a fallback while no
 * sheet is mounted. Destructive actions go last, in red, as the platform orders them.
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
    // Dismissed by a tap outside or the back button, as the app's own sheet is.
    { cancelable: true },
  );
}

/** The destructive actions after the others, each group in its given order. */
export function orderActions(actions: readonly SheetAction[]): SheetAction[] {
  return [...actions.filter((a) => !a.destructive), ...actions.filter((a) => a.destructive)];
}

type Host = (request: ActionRequest) => void;

/** The app's sheet while mounted, which `showActions` uses on Android and the web. */
let host: Host | null = null;

/** Mounts the app's sheet as the place actions are shown; returns an unmount. */
export function hostActions(next: Host): () => void {
  host = next;
  return () => {
    if (host === next) host = null;
  };
}
