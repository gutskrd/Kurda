/**
 * Settings hub model (KUR-270). Pure builder for the Settings screen's sections
 * and rows — including the Apple-required Delete Account and Reset Onboarding
 * entries — that adapts the Account section for guests vs signed-in users. The
 * RN screen renders this structure and wires each row to its destination; the
 * shape + adaptation logic lives here so it is testable without the UI.
 */

export type SettingsRowId =
  | 'account_info'
  | 'logout'
  | 'delete_account'
  | 'create_account'
  | 'appearance'
  | 'language'
  | 'notifications'
  | 'privacy'
  | 'data_export'
  | 'reset_onboarding'
  | 'about';

export interface SettingsRow {
  id: SettingsRowId;
  /** i18n key for the row label (#184) */
  labelKey: string;
  /** styled as a destructive action (e.g. Delete Account) */
  destructive?: boolean;
  /** optional trailing value shown on the row (e.g. app version, provider) */
  value?: string;
}

export type SettingsSectionId =
  | 'account'
  | 'appearance'
  | 'language'
  | 'notifications'
  | 'privacy'
  | 'onboarding'
  | 'about';

export interface SettingsSection {
  id: SettingsSectionId;
  titleKey: string;
  rows: SettingsRow[];
}

export interface SettingsContext {
  signedIn: boolean;
  /** how the user signed in — Apple / Google / the email address */
  providerLabel?: string;
  appVersion: string;
}

/**
 * Build the ordered Settings sections for a user. Signed-in users get account
 * info + Log out + Delete Account; guests get a single Create account row (no
 * Log out / Delete). The rest of the hub is the same for everyone.
 */
export function buildSettings(ctx: SettingsContext): SettingsSection[] {
  const accountRows: SettingsRow[] = ctx.signedIn
    ? [
        { id: 'account_info', labelKey: 'settings.account.info', value: ctx.providerLabel },
        { id: 'logout', labelKey: 'settings.account.logout' },
        { id: 'delete_account', labelKey: 'settings.account.delete', destructive: true },
      ]
    : [{ id: 'create_account', labelKey: 'settings.account.create' }];

  return [
    { id: 'account', titleKey: 'settings.section.account', rows: accountRows },
    {
      id: 'appearance',
      titleKey: 'settings.section.appearance',
      rows: [{ id: 'appearance', labelKey: 'settings.appearance' }],
    },
    {
      id: 'language',
      titleKey: 'settings.section.language',
      rows: [{ id: 'language', labelKey: 'settings.language' }],
    },
    {
      id: 'notifications',
      titleKey: 'settings.section.notifications',
      rows: [{ id: 'notifications', labelKey: 'settings.notifications' }],
    },
    {
      id: 'privacy',
      titleKey: 'settings.section.privacy',
      rows: [
        { id: 'privacy', labelKey: 'settings.privacy' },
        { id: 'data_export', labelKey: 'settings.dataExport' },
      ],
    },
    {
      id: 'onboarding',
      titleKey: 'settings.section.onboarding',
      rows: [{ id: 'reset_onboarding', labelKey: 'settings.resetOnboarding' }],
    },
    {
      id: 'about',
      titleKey: 'settings.section.about',
      rows: [{ id: 'about', labelKey: 'settings.about', value: ctx.appVersion }],
    },
  ];
}

/** Flatten to row ids in display order — handy for navigation + tests. */
export function settingsRowIds(sections: SettingsSection[]): SettingsRowId[] {
  return sections.flatMap((s) => s.rows.map((r) => r.id));
}
