import type { Catalogue } from './en';

/**
 * Arabic — the only right-to-left language here.
 *
 * `localeDir` in the shared list is what flips the document, so nothing in this
 * file needs to know about direction; it is text like any other catalogue.
 */
export const ar: Catalogue = {
  'nav.civak': 'Civak',
  'nav.games': 'الألعاب',
  'nav.rankings': 'الترتيب',
  'nav.learn': 'تعلّم',
  'nav.friends': 'الأصدقاء',
  'nav.messages': 'الرسائل',
  'nav.shop': 'المتجر',
  'nav.settings': 'الإعدادات',
  'nav.login': 'تسجيل الدخول',
  'nav.register': 'ابدأ الآن',
  'nav.menu': 'القائمة',
  'nav.close': 'إغلاق',
  'nav.skipToContent': 'تخطَّ إلى المحتوى',

  'common.loading': 'جارٍ التحميل…',
  'common.retry': 'حاول مرة أخرى',
  'common.cancel': 'إلغاء',
  'common.save': 'حفظ',
  'common.saved': 'تم الحفظ.',
  'common.somethingWentWrong': 'حدث خطأ ما. يرجى المحاولة مرة أخرى.',
  'common.showMore': 'عرض المزيد',
  'common.close': 'إغلاق',

  'auth.login.title': 'أهلاً بعودتك',
  'auth.login.subtitle': 'سجّل الدخول لتتابع التعلّم.',
  'auth.login.submit': 'تسجيل الدخول',
  'auth.login.submitting': 'جارٍ تسجيل الدخول…',
  'auth.login.noAccount': 'ليس لديك حساب بعد؟',
  'auth.login.forgot': 'هل نسيت كلمة المرور؟',
  'auth.register.title': 'أنشئ حسابك',
  'auth.register.subtitle': 'بضع معلومات، وتكون جاهزاً.',
  'auth.register.submit': 'إنشاء حساب',
  'auth.register.submitting': 'جارٍ الإنشاء…',
  'auth.register.haveAccount': 'لديك حساب بالفعل؟',
  'auth.email': 'البريد الإلكتروني',
  'auth.username': 'اسم المستخدم',
  'auth.password': 'كلمة المرور',
  'auth.showPassword': 'إظهار كلمة المرور',
  'auth.hidePassword': 'إخفاء كلمة المرور',

  'language.label': 'اللغة',
  'language.chooseHelp': 'يمكنك تغيير هذا في أي وقت من الإعدادات.',
  'language.settingsTitle': 'اللغة',
  'language.settingsHelp':
    'اللغة التي يخاطبك بها MyKurda. وهي مرتبطة بحسابك، لذا تبقى نفسها على كل جهاز تسجّل الدخول منه.',
  'language.saving': 'جارٍ الحفظ…',
  'language.savedTo': 'أصبح MyKurda الآن بـ{language}.',
  'language.failed': 'تعذّر حفظ هذه اللغة. يرجى المحاولة مرة أخرى.',
  'language.partial':
    'ما زالت بعض أجزاء MyKurda بالإنجليزية فقط. وستتبعها بقية الأجزاء عند ترجمتها.',

  'settings.title': 'الإعدادات',
  'settings.eyebrow': 'الحساب',
  'settings.privacy.title': 'ظهور الملف الشخصي',
  'settings.privacy.help': 'من يمكنه رؤية ملفك الشخصي.',
  'settings.sessions.title': 'الجلسات',
  'settings.sessions.help': 'سجّل الخروج من هنا، أو من جميع الأجهزة دفعة واحدة.',
  'settings.sessions.signOut': 'تسجيل الخروج',
  'settings.sessions.signOutEverywhere': 'تسجيل الخروج من كل مكان',
  'settings.data.title': 'بياناتك',
  'settings.blocked.title': 'الأشخاص المحظورون',
};
