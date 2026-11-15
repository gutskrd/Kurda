/**
 * The iPhone side of the App Group: reading and writing what the app and its
 * widget extension share, and asking WidgetKit to reload the widget.
 *
 * The native module is ExtensionStorage, which the @bacons/apple-targets
 * package installs with the extension's config plugin. It is reached the way
 * that package's own script reaches it — through the app's table of native
 * modules — but without its script, which assumes that table exists and so
 * cannot be loaded anywhere else (the website build, the tests). Null where
 * there is no such module: Android, the web, a build without the widget.
 */

export interface ExtensionStorageModule {
  setString(key: string, value: string, group: string): void;
  get(key: string, group: string): string | null | undefined;
  remove(key: string, group: string): void;
  reloadWidget(kind?: string): void;
}

export function extensionStorage(): ExtensionStorageModule | null {
  const modules = (globalThis as { expo?: { modules?: Record<string, unknown> } }).expo?.modules;
  const found = modules?.ExtensionStorage as ExtensionStorageModule | undefined;
  return found ?? null;
}
