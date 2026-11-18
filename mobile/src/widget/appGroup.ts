/**
 * The iPhone side of the App Group: reading and writing what the app and its widget extension share, and asking
 * WidgetKit to reload. The native module is ExtensionStorage, installed by @bacons/apple-targets with the
 * extension's config plugin. It is reached through the app's native module table, as that package's script does,
 * but without the script, which assumes the table exists and so cannot load elsewhere (web build, tests). Null
 * where there is no such module: Android, the web, a build without the widget.
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
