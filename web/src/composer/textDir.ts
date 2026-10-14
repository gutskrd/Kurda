/**
 * A field's direction: the words' own once there are some, so Kurmancî typed
 * under a Soranî menu runs left to right; the interface's while it is empty, so
 * the placeholder sits where the reader looks (an empty dir=auto box is LTR).
 */
export function textDir(value: string): 'auto' | undefined {
  return value.trim() ? 'auto' : undefined;
}
