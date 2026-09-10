/**
 * English — the language the interface is written in.
 *
 * This file is the source of truth twice over: it defines the key set every
 * other language is typed against, and it is what an untranslated string falls
 * back to. Nothing here may be missing, which is why it alone is a complete
 * `Record` while the others are partial.
 *
 * Keys read as `area.thing`, and the English text is the key's documentation —
 * a translator working from `settings.language.help` alone would guess wrong,
 * so the value must be a full sentence rather than a fragment to be assembled.
 * Nothing is built by concatenation for the same reason: word order is not the
 * same in eight languages.
 */
export const en = {
  // ---- the shell -----------------------------------------------------------
  'nav.civak': 'Community',
  'nav.games': 'Games',
  'nav.rankings': 'Rankings',
  'nav.learn': 'Learn',
  'nav.friends': 'Friends',
  'nav.messages': 'Messages',
  'nav.shop': 'Shop',
  'nav.settings': 'Settings',
  'nav.login': 'Log in',
  'nav.register': 'Get started',
  'nav.menu': 'Menu',
  'nav.close': 'Close',
  'nav.skipToContent': 'Skip to content',

  // ---- things every screen uses -------------------------------------------
  'common.loading': 'Loading…',
  'common.retry': 'Try again',
  'common.cancel': 'Cancel',
  'common.save': 'Save',
  'common.saved': 'Saved.',
  'common.somethingWentWrong': 'Something went wrong. Please try again.',
  'common.showMore': 'Show more',
  'common.close': 'Close',

  // ---- signing in and up ---------------------------------------------------
  'auth.login.title': 'Welcome back',
  'auth.login.subtitle': 'Sign in to keep learning.',
  'auth.login.submit': 'Log in',
  'auth.login.submitting': 'Signing in…',
  'auth.login.noAccount': 'No account yet?',
  'auth.login.forgot': 'Forgotten your password?',
  'auth.register.title': 'Create your account',
  'auth.register.subtitle': 'A few details, and you are in.',
  'auth.register.submit': 'Create account',
  'auth.register.submitting': 'Creating…',
  'auth.register.haveAccount': 'Already have an account?',
  'auth.email': 'Email',
  'auth.username': 'Username',
  'auth.password': 'Password',
  'auth.showPassword': 'Show password',
  'auth.hidePassword': 'Hide password',

  // ---- choosing a language -------------------------------------------------
  'language.label': 'Language',
  'language.chooseHelp': 'You can change this at any time in Settings.',
  'language.settingsTitle': 'Language',
  'language.settingsHelp':
    'What language MyKurda speaks to you in. It follows your account, so it is the same on every device you sign in on.',
  'language.saving': 'Saving…',
  'language.savedTo': 'MyKurda is now in {language}.',
  'language.failed': 'That language could not be saved. Please try again.',
  'language.partial':
    'Some parts of MyKurda are still only in English. They will follow as they are translated.',

  // ---- settings ------------------------------------------------------------
  'settings.title': 'Settings',
  'settings.eyebrow': 'Account',
  'settings.privacy.title': 'Profile visibility',
  'settings.privacy.help': 'Who can see your profile.',
  'settings.sessions.title': 'Sessions',
  'settings.sessions.help': 'Sign out here, or on every device at once.',
  'settings.sessions.signOut': 'Sign out',
  'settings.sessions.signOutEverywhere': 'Log out everywhere',
  'settings.data.title': 'Your data',
  'settings.blocked.title': 'Blocked people',

  // ---- the wall ------------------------------------------------------------
  /*
   * Civak, Gotin, Dîmen, Çîrok, Helbest, Wêne and Mîm are Kurdish words, and
   * they are translated like any other. Somebody reading the app in Spanish
   * chose Spanish; leaving the section names in a language they do not read
   * makes the app harder to use, not more authentic. Kurmancî keeps the
   * original words, because in Kurmancî they ARE the translation.
   *
   * One consequence worth knowing: in Kurdish, the "Gotin" section contains a
   * "Gotin" kind, which reads as the same word twice. Every other language gets
   * the distinction for free — "Writing" containing "Saying" — so the awkward
   * pair only survives where it is the community's own vocabulary.
   */
  'civak.title': 'Community',
  'civak.subtitle': 'Stories, poems and pictures from everyone.',
  'civak.loading': 'Loading the wall…',
  'civak.empty': 'Nothing here yet.',
  'civak.filter.show': 'Show',
  'civak.filter.narrow': 'Narrow',
  'civak.filter.everything': 'Everything',
  'civak.filter.allKinds': 'All',
  'civak.filter.showSection': 'Show {section}',
  'civak.filter.onlyKind': 'Only {kind}',
  'civak.filter.onlyEverything': 'Everything in this section',

  /* the two halves of the wall */
  'civak.section.writing': 'Writing',
  'civak.section.pictures': 'Pictures',
  /* what a post is, used both as a filter and as the badge on a card */
  'civak.kind.saying': 'Saying',
  'civak.kind.story': 'Story',
  'civak.kind.poem': 'Poem',
  'civak.kind.photo': 'Photo',
  'civak.kind.meme': 'Meme',

  'feed.picture': 'A picture',
  'feed.comments': '{count} comments',
  'feed.like': 'Like',
  'feed.unlike': 'Unlike',
  'feed.signInToLike': 'Sign in to like',
  'feed.save': 'Save',
  'feed.removeFromSaved': 'Remove from saved',
  'feed.signInToSave': 'Sign in to save',
  'feed.delete': 'Delete this post',
  'feed.deleteConfirm': 'Delete?',
  'feed.today': 'Today',
  'feed.yesterday': 'Yesterday',

  // ---- posting -------------------------------------------------------------
  'post.open': 'Post something',
  'post.button': 'Post',
  'post.what': 'What are you posting?',
  'post.words.sub': 'A saying, a story or a poem',
  'post.picture.sub': 'A picture or a meme',
  'post.words.title': 'Write something',
  'post.kind': 'Kind',
  'post.title': 'Title',
  'post.titlePlaceholder': 'Give it a title',
  'post.body': 'Words',
  'post.bodyPrompt': 'What do you want to say?',
  'post.bodyPlaceholder': 'Write it here…',
  'post.submit': 'Post',
  'post.submitting': 'Posting…',
  'post.picture.open': 'Post a picture',
  'post.caption': 'Caption',
  'post.captionPlaceholder': 'Say something about it (optional)…',

  // ---- games ---------------------------------------------------------------
  'games.title': 'Games',
  'games.eyebrow': 'Learn by playing',
  'games.subtitle':
    'Practice that doesn’t feel like practice. Every game is scored on the server, so the leaderboards stay fair.',
  'games.playable': 'Playable',
  'games.signInToPlay': 'Sign in to play',
  'games.chooseMode': 'Choose a mode',
  'games.howToPlay': 'How do you want to play?',
  'games.playAndScore': 'Play, and keep score',

  'games.wordle.name': 'Kurdish Wordle',
  'games.wordle.body': 'Guess the Kurdish word in six tries — on your own, or racing a friend.',
  'games.wordle.solo': 'Today’s daily puzzle, plus unlimited practice rounds across three difficulties.',
  'games.wordle.online': 'Create a battle, share the invite link, and race a friend to the same word.',

  'games.rhyme.name': 'Rhyming Words',
  'games.rhyme.body': 'Find as many Kurdish words as you can that rhyme with the prompt.',
  'games.rhyme.solo': 'A timed solo round against the clock — good for building vocabulary fast.',
  'games.rhyme.online': 'Head-to-head: share an invite link and out-rhyme a friend in one shared window.',

  'games.race.name': 'Typing Race',
  'games.race.body': 'Type a Kurdish text as fast and as accurately as you can — speed is measured server-side.',
  'games.race.mode': 'Race the clock',
  'games.race.blurb': 'Pick a length, type the text, and get your words per minute and accuracy.',

  'games.quiz.name': 'Ranked Quiz',
  'games.quiz.body': 'Fast 1-v-1 matches: answer Kurdish questions quicker and more accurately than your opponent.',
  'games.quiz.online': 'Get matched with an opponent. Server-scored and rated — your rating moves.',

  'games.mode.solo': 'Play solo',
  'games.mode.online': 'Play online',
  'games.mode.needsAccount': 'needs an account',
  'games.play': 'Play',
} as const;

export type MessageKey = keyof typeof en;

/** Every other language fills in what it can; the rest falls back to English. */
export type Catalogue = Partial<Record<MessageKey, string>>;
