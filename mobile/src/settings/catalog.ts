import { useNavigation } from '@react-navigation/native';
import { PROVIDER } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { SUPPORT_EMAIL, contactSupport, openLegal } from '../legal/links';
import type { RootNavigation } from '../navigation/rootStack';
import { nameOf } from '../parental/api';
import { useParentalOverview } from '../parental/overview';
import { useFamily } from '../family/overview';
import type { IconName } from '../theme/Icon';
import { useSettingsAttention } from './attention';
import type { SettingsPageKey } from './SettingsPageScreen';

/**
 * What Settings holds, in one place: the kinds of setting listed on its home, and every setting inside them, which is
 * what its search looks through. A category opens its page; a setting opens its own page or screen where it has one,
 * follows its link where it is one, and otherwise opens the category page it sits on, so search never flips a switch
 * or deletes anything by itself.
 */
export type CategoryKey = 'account' | 'family' | 'parental' | 'display' | 'privacy' | 'sounds' | 'notifications' | 'safety' | 'storage' | 'help' | 'about';

export interface Category {
  key: CategoryKey;
  icon: IconName;
  title: string;
  /** What is inside, joined with " • ", or what needs doing there. */
  subtitle: string;
  attention?: boolean;
  open: () => void;
}

export interface Leaf {
  key: string;
  icon: IconName;
  title: string;
  /** The page it lives on, shown under it in search. */
  page: string;
  /** Further words it is found by: what is on the page behind it. */
  terms: string[];
  open: () => void;
}

/** The categories in the order the home lists them, each with its icon and the words for it. */
const CATEGORIES: ReadonlyArray<{ key: CategoryKey; icon: IconName; title: TranslationKey; items: TranslationKey }> = [
  { key: 'account', icon: 'person', title: 'settings.group.account', items: 'settings.cat.account.items' },
  { key: 'family', icon: 'people', title: 'family.title', items: 'settings.cat.family.items' },
  { key: 'parental', icon: 'parental', title: 'parental.title', items: 'settings.cat.parental.items' },
  { key: 'display', icon: 'palette', title: 'settings.cat.display', items: 'settings.cat.display.items' },
  { key: 'privacy', icon: 'eye', title: 'settings.cat.privacy', items: 'settings.cat.privacy.items' },
  { key: 'sounds', icon: 'speaker-high', title: 'settings.soundsVibration', items: 'settings.cat.sounds.items' },
  { key: 'notifications', icon: 'bell', title: 'notifications.title', items: 'settings.cat.notifications.items' },
  { key: 'safety', icon: 'shield', title: 'settings.cat.safety', items: 'settings.cat.safety.items' },
  { key: 'storage', icon: 'download', title: 'settings.cat.storage', items: 'settings.cat.storage.items' },
  { key: 'help', icon: 'lifebuoy', title: 'settings.cat.help', items: 'settings.cat.help.items' },
  { key: 'about', icon: 'globe', title: 'settings.cat.about', items: 'settings.cat.about.items' },
];

/** What a guest has none of: no account to change, no teen or parent, no profile, no reports or standing. */
const NOT_FOR_GUESTS: ReadonlySet<CategoryKey> = new Set(['family', 'parental', 'privacy', 'safety']);

/** Where each category lives: a Settings page, or a screen of its own. */
const PAGE_OF: Partial<Record<CategoryKey, SettingsPageKey>> = {
  account: 'account',
  family: 'family',
  parental: 'parental',
  display: 'display',
  privacy: 'privacy',
  sounds: 'sounds',
  safety: 'safety',
  storage: 'storage',
  help: 'help',
  about: 'about',
};

export function useSettingsCatalog(): { categories: Category[]; leaves: Leaf[] } {
  const navigation = useNavigation<RootNavigation>();
  const { t } = useI18n();
  const { isGuest } = useAuth();
  const attention = useSettingsAttention();
  const { overview } = useParentalOverview(!isGuest);
  const { overview: family } = useFamily(!isGuest);
  const limited = attention.standing !== null && attention.standing !== 'good';

  const page = (key: SettingsPageKey) => () => navigation.navigate('SettingsPage', { page: key });
  const openCategory = (key: CategoryKey) => () => {
    const settingsPage = PAGE_OF[key];
    if (settingsPage) navigation.navigate('SettingsPage', { page: settingsPage });
    else navigation.navigate('Notifications');
  };

  /** The parental row says where the account stands once it is known: who it is connected to, or how many teens. */
  const parentalSubtitle = (): string => {
    if (overview?.role === 'teen' && overview.parents?.length) {
      const [first, second] = overview.parents;
      return second
        ? t('settings.cat.parental.connectedTwo', { a: nameOf(first!), b: nameOf(second) })
        : t('settings.cat.parental.connected', { name: nameOf(first!) });
    }
    const teens = overview?.role === 'parent' ? (overview.teens?.length ?? 0) : 0;
    if (teens === 1) return t('settings.cat.parental.teenOne');
    if (teens > 1) return t('settings.cat.parental.teens', { count: teens });
    return t('settings.cat.parental.items');
  };

  const categories: Category[] = CATEGORIES.filter((c) => !isGuest || !NOT_FOR_GUESTS.has(c.key)).map((c) => {
    const base: Category = { key: c.key, icon: c.icon, title: t(c.title), subtitle: t(c.items), open: openCategory(c.key) };
    switch (c.key) {
      case 'account':
        // A guest has no name, password or device list to change; the way to an account stands in their place.
        return isGuest ? { ...base, icon: 'user-plus', subtitle: t('guest.settings.create'), open: () => navigation.navigate('ClaimAccount') } : base;
      case 'parental':
        return { ...base, subtitle: parentalSubtitle() };
      case 'family':
        // Who is in it, once it is known; before a family, what one holds.
        return family?.family ? { ...base, subtitle: t('settings.cat.family.people', { count: family.family.size }) } : base;
      case 'notifications':
        // Notifications blocked by the phone is the one thing here to act on.
        return attention.pushOff ? { ...base, subtitle: t('settings.cat.notifications.off'), attention: true } : base;
      case 'safety':
        // Said in words, not only in colour, before it is opened.
        return limited ? { ...base, icon: 'alert', subtitle: t(`standing.status.${attention.standing!}` as const), attention: true } : base;
      case 'storage':
        return isGuest ? { ...base, subtitle: t('storage.clear') } : base;
      default:
        return base;
    }
  });

  const named = (key: CategoryKey): string => t(CATEGORIES.find((c) => c.key === key)!.title);
  const on = (key: CategoryKey, leaves: Array<Omit<Leaf, 'page'>>): Leaf[] =>
    isGuest && NOT_FOR_GUESTS.has(key) ? [] : leaves.map((leaf) => ({ ...leaf, page: named(key) }));
  const at = openCategory;

  const leaves: Leaf[] = [
    ...(isGuest
      ? [
          {
            key: 'claim',
            icon: 'user-plus' as const,
            title: t('guest.settings.create'),
            page: named('account'),
            terms: [t('guest.settings.createHint')],
            open: () => navigation.navigate('ClaimAccount'),
          },
        ]
      : on('account', [
          { key: 'username', icon: 'person', title: t('auth.username'), terms: [], open: () => navigation.navigate('ChangeUsername') },
          { key: 'birthMonth', icon: 'calendar', title: t('age.label'), terms: [], open: page('birthMonth') },
          {
            key: 'password',
            icon: 'lock',
            title: t('auth.password'),
            terms: [t('security.password.title'), t('settings.group.security')],
            open: () => navigation.navigate('ChangePassword'),
          },
          { key: 'devices', icon: 'devices', title: t('security.devices.title'), terms: [t('settings.group.security')], open: () => navigation.navigate('Devices') },
          { key: 'everywhere', icon: 'devices', title: t('settings.sessions.signOutEverywhere'), terms: [t('settings.sessions.help')], open: at('account') },
          { key: 'delete', icon: 'trash', title: t('settings.delete.title'), terms: [], open: at('account') },
        ])),
    ...on('family', [
      {
        key: 'family',
        icon: 'people',
        title: t('family.title'),
        terms: [t('family.addChild'), t('family.invite'), t('family.board'), t('family.pin.label'), t('settings.cat.family.items')],
        open: at('family'),
      },
    ]),
    ...on('parental', [
      {
        key: 'parental',
        icon: 'parental',
        title: t('parental.title'),
        terms: [t('parental.dailyLimit'), t('parental.bedtime'), t('parental.teen.connect'), t('parental.addTeen'), t('settings.cat.parental.items')],
        open: at('parental'),
      },
    ]),
    ...on('display', [
      { key: 'language', icon: 'translate', title: t('settings.language'), terms: [], open: page('language') },
      {
        key: 'theme',
        icon: 'palette',
        title: t('appearance.theme'),
        terms: [t('appearance.preference.light'), t('appearance.preference.dark'), t('settings.eventThemes')],
        open: page('theme'),
      },
      {
        key: 'keyboard',
        icon: 'keyboard',
        title: t('keyboard.settings.title'),
        terms: [t('keyboard.accent.title'), t('keyboard.keyBar.title'), t('keyboard.backtick.title'), t('keyboard.wordle.title'), t('keyboard.help')],
        open: page('keyboard'),
      },
    ]),
    ...on('privacy', [
      { key: 'visibility', icon: 'eye', title: t('settings.privacy.title'), terms: [], open: page('visibility') },
      // The only way to undo a block: a blocked person is a 404 to you, so no other screen can offer it.
      { key: 'blocked', icon: 'block', title: t('settings.blocked.title'), terms: [], open: () => navigation.navigate('BlockedUsers') },
      { key: 'giftLimit', icon: 'gift', title: t('settings.giftLimit.title'), terms: [t('settings.giftLimit.lead')], open: page('giftLimit') },
      { key: 'leagues', icon: 'trophy', title: t('settings.leagues.title'), terms: [], open: page('leagues') },
    ]),
    ...on('sounds', [
      { key: 'sounds', icon: 'speaker', title: t('settings.sounds'), terms: [t('settings.sounds.hint')], open: at('sounds') },
      { key: 'vibration', icon: 'vibrate', title: t('settings.vibration'), terms: [t('settings.vibration.hint')], open: at('sounds') },
      { key: 'autoplay', icon: 'speaker-high', title: t('settings.sounds.autoplay'), terms: [t('settings.sounds.autoplayHint')], open: at('sounds') },
      { key: 'voices', icon: 'chat', title: t('settings.sounds.characterVoices'), terms: [t('settings.sounds.characterVoicesHint')], open: at('sounds') },
    ]),
    ...on('notifications', [
      {
        key: 'notifications',
        icon: 'bell',
        title: t('notifications.title'),
        terms: [t('settings.notifications'), t('notifications.categories'), t('notifications.quietHours'), t('settings.cat.notifications.items')],
        open: at('notifications'),
      },
    ]),
    ...on('safety', [
      { key: 'reports', icon: 'flag', title: t('reports.title'), terms: [], open: () => navigation.navigate('MyReports') },
      { key: 'standing', icon: 'shield', title: t('standing.title'), terms: [], open: () => navigation.navigate('AccountStanding') },
    ]),
    ...on('storage', [
      { key: 'cache', icon: 'trash', title: t('storage.clear'), terms: [t('storage.cache'), t('storage.device')], open: at('storage') },
      ...(isGuest
        ? []
        : [
            {
              key: 'export',
              icon: 'download' as const,
              title: t('settings.data.download'),
              terms: [t('settings.data.title'), t('storage.dataHint')],
              open: at('storage'),
            },
          ]),
    ]),
    ...on('help', [
      // Feedback opens its form from the page it sits on.
      { key: 'feedback', icon: 'chat', title: t('appFeedback.sendRow'), terms: [t('appFeedback.rateRow')], open: at('help') },
      { key: 'faq', icon: 'question', title: t('settings.faq'), terms: [], open: () => openLegal('faq') },
      { key: 'support', icon: 'mail', title: t('settings.support'), terms: [SUPPORT_EMAIL], open: () => void contactSupport(t) },
    ]),
    ...on('about', [
      // Each legal and about page opens on hevalo.app, so there is one copy of each.
      { key: 'teaching', icon: 'book', title: t('settings.teaching'), terms: [], open: () => openLegal('teaching') },
      { key: 'aboutPage', icon: 'globe', title: t('settings.about'), terms: [], open: () => openLegal('about') },
      { key: 'terms', icon: 'rules', title: t('auth.legal.terms'), terms: [], open: () => openLegal('terms') },
      { key: 'privacyPolicy', icon: 'lock', title: t('auth.legal.privacy'), terms: [], open: () => openLegal('privacy') },
      { key: 'copyright', icon: 'quotes', title: t('settings.copyright.title'), terms: [t('settings.copyright.hint')], open: () => openLegal('copyright') },
      { key: 'credits', icon: 'heart', title: t('settings.credits.title'), terms: [], open: page('credits') },
      { key: 'kvk', icon: 'place-work', title: t('settings.kvk'), terms: [PROVIDER.kvk], open: at('about') },
    ]),
  ];

  return { categories, leaves };
}
