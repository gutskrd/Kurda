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

  // ---- signing in, the rest of it ------------------------------------------
  'auth.login.rememberMe': 'Remember me',
  'auth.login.createAccount': 'Create an account',
  'auth.register.freeToStart': 'Free to start. It takes under a minute.',
  'auth.register.usernameHelp': 'How others will see you',
  'auth.register.signIn': 'Sign in',

  // ---- friends -------------------------------------------------------------
  'friends.title': 'Friends',
  'friends.eyebrow': 'Community',
  'friends.subtitle': 'Find other learners, send requests, and see who you’re learning alongside.',
  'friends.searchPlaceholder': 'Search by username…',
  'friends.searchLabel': 'Search users by username',
  'friends.search': 'Search',
  'friends.searching': 'Searching…',
  'friends.results': 'Search results',
  'friends.noResults': 'No users found.',
  'friends.requests': 'Requests',
  'friends.accept': 'Accept',
  'friends.decline': 'Decline',
  'friends.sent': 'Sent',
  'friends.cancel': 'Cancel',
  'friends.cancelRequest': 'Cancel your request to {name}',
  'friends.suggestions': 'People you may know',
  'friends.mutual': '{count} mutual friends',
  'friends.add': 'Add',
  'friends.requested': 'Requested',
  'friends.yours': 'Your friends',
  'friends.noneTitle': 'No friends yet',
  'friends.noneBody': 'Search for a username above to send your first friend request.',
  'friends.remove': 'Remove',
  'friends.removeWho': 'Remove {name} as a friend',
  'friends.block': 'Block',
  'friends.blockWho': 'Block {name}',

  // ---- saved ---------------------------------------------------------------
  'saved.title': 'Saved',
  'saved.subtitle': 'Posts you kept to come back to. Only you can see this.',
  'saved.loading': 'Loading your saved posts…',
  'saved.emptyLink': 'Community',

  // ---- rankings ------------------------------------------------------------
  'rankings.title': 'Rankings',
  'rankings.eyebrow': 'Where you stand',

  // ---- games: words every game uses ----------------------------------
  'games.back': 'Back to games',
  'games.emptyPool': 'No words available for play yet — check back soon.',
  'games.you': 'You',
  'games.opponent': 'Opponent',
  'games.inviteLink': 'Invite link',
  'games.copyLink': 'Copy link',
  'games.copied': 'Copied!',
  'games.copyFailed': 'Couldn’t copy — long-press the link to share it.',
  'games.joining': 'Joining…',
  'games.creating': 'Creating…',
  'games.starting': 'Starting…',
  'games.waitingForPlayer': 'Waiting for a second player…',
  'games.waitingForHost': 'Waiting for the host to start…',
  'games.lobbyWaiting': 'Waiting in the lobby — players joined: {count}',
  'games.youWon': '🏆 You won!',
  'games.timeLeft': 'Time left',
  'games.dialect': 'Dialect',
  'games.difficulty': 'Difficulty',
  'games.difficulty.easy': 'Easy',
  'games.difficulty.medium': 'Medium',
  'games.difficulty.hard': 'Hard',
  'games.playAgain': 'Play again',
  'games.submit': 'Submit',
  'games.options': 'Game options',
  'games.invite.eyebrow': 'Game invite',
  'games.invite.join': 'Join a {game} game',
  'games.invite.preview': '{game} invite',

  // ---- games: rhyming words, solo and head-to-head -------------------
  'games.rhyme.rhymeWith': 'Rhyme with',
  'games.rhyme.score': 'Score',
  'games.rhyme.scoreLine': '{score} pts · {count} found',
  'games.rhyme.placeholder': 'A word that rhymes with “{word}”…',
  'games.rhyme.yourRhyme': 'Your rhyme',
  'games.rhyme.foundList': 'Rhymes you found',
  'games.rhyme.endRound': 'End round',
  'games.rhyme.roundOver': 'Round over — {score} points from {count} rhymes.',
  'games.rhyme.timeUpRound': 'Time’s up for this round.',
  'games.rhyme.noPasting': 'No pasting — think of one.',
  'games.rhyme.reject.notAWord': 'Not a word in the dictionary.',
  'games.rhyme.reject.isPrompt': 'That’s the prompt itself — find a different word.',
  'games.rhyme.reject.isPromptShort': 'That’s the prompt itself.',
  'games.rhyme.reject.alreadyUsed': 'You already used that one.',
  'games.rhyme.reject.noRhyme': 'Doesn’t rhyme — try another.',
  'games.rhyme.reject.profane': 'Let’s keep it clean.',
  'games.rhyme.reject.other': 'Not accepted — try another.',
  'games.rhymeMatch.name': 'Rhyme Match',
  'games.rhymeMatch.intro': 'Create a match, share the invite link, and race a friend to find the most rhymes for one prompt before the clock runs out.',
  'games.rhymeMatch.create': 'Create match',
  'games.rhymeMatch.join': 'Join match',
  'games.rhymeMatch.start': 'Start match',
  'games.rhymeMatch.new': 'New match',
  'games.rhymeMatch.over': 'Match over.',
  'games.rhymeMatch.promptWas': 'The prompt was {word}.',
  'games.rhymeMatch.timeUpFinishing': 'Time’s up — finishing the match…',
  'games.rhymeMatch.timeUpMatch': 'Time’s up for this match.',
  'games.rhymeMatch.playerScore': '{score} pts · {count} rhymes',

  // ---- games: wordle, solo and head-to-head --------------------------
  'games.wordle.mode': 'Mode',
  'games.wordle.daily': 'Daily',
  'games.wordle.practice': 'Practice',
  'games.wordle.emptyDifficulty': 'No puzzles available yet for this difficulty — check back soon.',
  'games.wordle.solved': '🎉 Solved it!',
  'games.wordle.outOfTries': 'Out of tries.',
  'games.wordle.theWordWas': 'The word was {word}.',
  'games.wordle.comeBackTomorrow': 'Come back tomorrow for a new daily word — or switch to Practice for unlimited rounds.',
  'games.wordle.wrongLength': 'That guess is the wrong length.',
  'games.wordle.notAWord': 'Not a word in the dictionary — try another.',
  'games.wordle.alreadyFinished': 'This game is already finished.',
  'games.wordle.enterLetters': 'Enter {count} letters.',
  'games.wordle.guesses': 'Guesses',
  'games.wordle.enter': 'Enter',
  'games.wordle.backspace': 'Backspace',
  'games.battle.name': 'Wordle Battle',
  'games.battle.intro': 'Create a battle, share the invite link with a friend, and race to guess the same Kurdish word first.',
  'games.battle.create': 'Create battle',
  'games.battle.join': 'Join battle',
  'games.battle.start': 'Start battle',
  'games.battle.new': 'New battle',
  'games.battle.over': 'Battle over.',
  'games.battle.solvedIt': 'Solved it!',
  'games.battle.youSolvedWaiting': '🎉 You solved it! Waiting for the others…',
  'games.battle.noTriesWaiting': 'No tries left — waiting for the battle to finish…',
  'games.battle.opponentProgress': 'Opponent progress',
  'games.battle.opponentNumbered': 'Opponent {n}',
  'games.battle.opponentSolved': '✓ solved',
  'games.battle.opponentDone': 'done',
  'games.battle.opponentGuesses': '{count} guesses',
  'games.battle.solvedIn': 'solved in {count}',
  'games.battle.lettersProgress': '{done}/{total} letters',

  // ---- games: quiz, typing race, and the sign-up prompt --------------
  'games.quiz.intro': 'A fast 1-v-1: answer Kurdish questions quicker and more accurately than your opponent. Every match is scored on the server and moves your rating.',
  'games.quiz.find': 'Find a match',
  'games.quiz.finding': 'Finding…',
  'games.quiz.searching': 'Searching for an opponent…',
  'games.quiz.noOpponent': 'No opponent found right now — try again in a moment.',
  'games.quiz.goodGame': 'Good game.',
  'games.quiz.matchOver': 'Match over.',
  'games.quiz.backToMatchmaking': 'Back to matchmaking',
  'games.quiz.go': 'Go!',
  'games.quiz.answerLocked': 'Answer locked — waiting for the reveal…',
  'games.quiz.questionOf': 'Question {index} of {total}',
  'games.quiz.playerScore': '{points} pts · {correct} correct',
  'games.quiz.matchFound': 'Match found. Getting ready…',
  'games.quiz.matchFoundAgainst': 'Match found against {name}. Getting ready…',
  'games.quiz.vs': 'vs',
  'games.race.intro': 'Type the Kurdish text as fast and as accurately as you can. Your speed is measured by the server from the moment the text appears.',
  'games.race.length': 'Length',
  'games.race.short': 'Short',
  'games.race.medium': 'Medium',
  'games.race.long': 'Long',
  'games.race.start': 'Start race',
  'games.race.typeTheText': 'Type the text',
  'games.race.tapToType': 'Tap here to type',
  'games.race.scoring': 'Scoring…',
  'games.race.giveUp': 'Give up and score',
  'games.race.notScored': 'Not scored',
  'games.race.perfect': 'Perfect run!',
  'games.race.finished': 'Race finished',
  'games.race.refused': 'That is faster than anyone types, so this run does not count towards your XP or the rankings.',
  'games.race.wpm': 'WPM',
  'games.race.accuracy': 'Accuracy',
  'games.race.time': 'Time',
  'games.race.again': 'Race again',
  'games.race.noPasting': 'No pasting — this one you type.',
  'games.cta.body': 'Create a free account to play, earn Zêr and climb the rankings across MyKurda.',
  'games.wordle.emptyCell': 'empty',
  'games.invite.blurb.battle': 'Race to guess the Kurdish word first.',
  'games.invite.blurb.rhymeMatch': 'Go head-to-head finding rhymes.',
} as const;

export type MessageKey = keyof typeof en;

/** Every other language fills in what it can; the rest falls back to English. */
export type Catalogue = Partial<Record<MessageKey, string>>;
