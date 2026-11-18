/**
 * A field's direction: the text's own once there is some, and the interface's while empty, so the placeholder sits
 * where the reader looks (an empty dir=auto box is LTR).
 */
export function textDir(value: string): 'auto' | undefined {
  return value.trim() ? 'auto' : undefined;
}
