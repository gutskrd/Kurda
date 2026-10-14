# Hevalo: current learning features in the web app

Branch `claude/tender-ptolemy-1m29c7`, commit `43a5681` (2026-10-06). Read-only static audit of `web/src`, `web/scripts`, and the API/mobile code the web relies on. Nothing was run in a browser. Paths are relative to `/home/user/Kurda`.

Status legend: **BUILT** = works end to end in web code · **PARTIAL** = exists but limited or stubbed · **ABSENT** = searched for and not found · **API/MOBILE ONLY** = built server-side (and in the unreleased phone app) but the web never calls it.

---

## 0. Headline findings

1. **The web has no lesson player.** `/app/learn` (`web/src/pages/Learn.tsx`, 76 lines) shows three things. It shows a link to the alphabet. It lists course titles, which cannot be clicked: the `<article className="course-card">` at lines 59-65 has no link. And it shows a static picture of a lesson (`LessonMock`, `web/src/landing/mocks.tsx:325`) captioned "In the Hevalo app · coming soon to iOS and Android" (`i18n/en.ts:1121`). The FAQ confirms this: "The iOS and Android apps are coming, with the short lessons in them, but they are not in the stores yet" (`en.ts:1244`). **So a member of the public cannot take a single lesson today, on any platform.**
2. **A full learning engine exists server-side, and the web never calls it.** The API has these modules:
   - lesson sessions with server grading (`api/src/content/`)
   - SM-2 spaced repetition (`api/src/review/sm2.ts`), plus an adaptive per-user tweak (`review/adaptive.ts`)
   - a practice session that serves due items padded with weak words (`practice/practice-select.ts`)
   - an adaptive placement test (`placement/placement.ts`) and per-skill strength scores (`placement/skill-strength.ts`)
   - daily XP goals (`goals/service.ts`)
   - word of the day (`dictionary/word-of-day.ts`)

   The only learning endpoint the web calls is `GET /courses`. A list of every API path the web calls is in §16.
3. **What the web actually teaches today:**
   - the **Alphabet** page. This is the most carefully designed module in the codebase.
   - the **Dictionary**: an in-app version for members and a static published version for everyone.
   - **6 game screens** that drill vocabulary, spelling and typing.
   - a **community wall** of stories, poems and pictures, with no reading aids.
4. **Gamification is extensive but mostly disconnected from learning.** There are XP, levels, a streak counter, weekly leagues with 10 tiers, a daily Zêr coin reward and a cosmetics shop. The daily reward is paid for showing up, not for learning. The alphabet practice awards nothing ("Nothing is saved").
5. **Missing entirely on web:**
   - onboarding and goal-setting
   - placement
   - any review of saved words
   - speech or pronunciation practice
   - an AI tutor
   - kids mode or age handling
   - a parent or teacher view
   - CEFR levels
   - offline mode / PWA

---

## 1. Route and feature map

| Route | Page file | Account needed? | Learning status |
|---|---|---|---|
| `/` | `pages/Landing.tsx` (467 lines) | no | Marketing page; describes lessons with mock screenshots |
| `/app` (Home) | `pages/Civak.tsx` | no to read | Community wall plus the daily reward card |
| `/app/learn` | `pages/Learn.tsx` | **yes** (`App.tsx` `RequireAccount`) | **PARTIAL/stub**: course titles and a mock picture only |
| `/app/alphabet` | `pages/Alphabet.tsx` (564 lines) | no | **BUILT** |
| `/app/dictionary` | `pages/Dictionary.tsx` | yes | **BUILT** (search, entry, bookmarks) |
| `/ferheng/`, `/dictionary/` | static, built by `web/scripts/build-ferheng.ts` | no | **BUILT**, but definitions are Kurmancî-only |
| `/app/games` | `pages/Games.tsx` | no | Hub for 4 game cards |
| `/app/games/wordle` | `pages/Wordle.tsx` | route open, **API requires auth** (see §15) | BUILT |
| `/app/games/rhyme` | `pages/Rhyme.tsx` | same as Wordle | BUILT |
| `/app/games/race` | `pages/Race.tsx` | same as Wordle | BUILT |
| `/app/games/quiz` | `pages/Quiz.tsx` | yes | BUILT (needs a live opponent) |
| `/app/games/wordle-battle` | `pages/WordleBattle.tsx` | yes | BUILT |
| `/app/games/rhyme-match` | `pages/RhymeMatch.tsx` | yes | BUILT |
| `/app/library/:id` | `pages/LibraryPostPage.tsx` | no | Reading a story or poem; optional audio |
| `/app/rankings` | `pages/Rankings.tsx` | no | Leaderboards and leagues |
| `/app/shop`, `/app/profile`, `/app/settings` | `pages/Shop.tsx`, `pages/Profile.tsx`, `pages/Settings.tsx` | yes | Cosmetics, stats, account |
| `/about`, `/faq` | `pages/About.tsx`, `pages/Faq.tsx` | no | Copy only |

Navigation (`web/src/layouts/navLinks.tsx:66-88`):
- Everyone sees Home, Dictionary, Games and Rankings.
- **Learn appears only when signed in**, alongside Friends and Messages.
- **The Alphabet is not in the navigation bar.** It is reached from:
  - Learn (`pages/Learn.tsx:37`)
  - the Dictionary when no search is typed (`pages/Dictionary.tsx:111`)
  - the Landing page (`pages/Landing.tsx:320`)
  - the Footer (`components/Footer.tsx:55`)
  - the published dictionary's index page (`scripts/ferheng-pages.ts:933`)

---

## 2. A lesson session: what a learner actually does

**On web: ABSENT.** The learner sees:
- an alphabet teaser card (`Learn.tsx:37-45`)
- course cards showing a dialect chip, a title and the fixed sentence "A guided skill tree — vocabulary, grammar and listening, unlocked as you go" (`en.ts:787`)
- the `LessonMock` picture (`Learn.tsx:68-71`)

The subtitle promises "Pick a course to begin; your progress syncs with the Hevalo app" (`en.ts:803`), but there is nothing to pick.

### The lesson picture (marketing only)
`landing/mocks.tsx:325-370` draws one exercise from a skill called "Dem" (time):
- the sentence "Îro çi roj e?"
- a hint over the word *roj*
- 3 meanings to choose from
- a "Correct · Continue" footer

It is marked `role="img"` and nothing in it can be clicked.

### What a lesson would contain (API and seed content, for context)
- **Course seed** `api/content/kurmanji-seed.json`, "Kurmanji for Beginners":
  - 3 units, 8 skills (Greetings, Introductions, Numbers, Family, Food, Drinks, Colors, Time), **15 lessons, 31 exercises**
  - 14 lessons have 2 exercises; one has 3
  - exercise types used: translate 11, multiple_choice 10, match_pairs 7, writing 3
  - **0 listening and 0 speaking exercises**, no audio, no images
  - 7 of the 8 skills carry a short grammar note in Markdown (`grammarMd`)
- **Cultural mini-course** `api/content/events/newroz-lesson.json`: 1 unit, 2 skills, 3 lessons, 9 exercises (multiple_choice 5, translate 3, match_pairs 1).
- **Exercise types the API can grade** (`api/src/content/exercises.ts`): multiple_choice, translate, match_pairs, writing, listening and speaking.
  - Listening takes an `audioUrl` and an optional hint (`exercises.ts:41-43`).
  - Speaking is graded by `content/speaking-scorer.ts`. It is a **stub: "every recording passes"**, with a real model planned under ticket KUR-120.
  - There is no image-based exercise type.
- **The phone app has the lesson player.** `mobile/src/lesson/` contains `LessonPlayerScreen.tsx`, `useAudio.ts`, `useRecorder.ts` and `kurdishKeys.ts`. Onboarding, practice, goals and offline modules also exist there. Not covered in depth here.

### Feedback, hints, audio and images in lessons on web
ABSENT, because there are no lessons.

---

## 3. The Alphabet module (`/app/alphabet`): BUILT, and the strongest teaching on the web

Files:
- `web/src/pages/Alphabet.tsx` (564 lines)
- `web/src/alphabet/letters.ts` (395), `practice.ts` (243), `Practice.tsx` (338), `audio.ts` (105), `clips.ts` (113, generated), `Sound.tsx`, `Meaning.tsx`
- `web/src/styles/alphabet.css`
- Tests: `alphabet/letters.test.ts`, `practice.test.ts`, `audio.test.ts`, `pages/Alphabet.test.tsx`

### What is taught
- **Two scripts, chosen with a tab** (stored in the URL as `?script=kmr|ckb`):
  - Kurmancî Latin: **31 letters** (`letters.ts:95`)
  - Soranî Arabic script: **34 letters**, in the order Soranî primers teach them (`letters.ts:130`)
- **Letters are ordered against the reader's own language** (contrastive analysis), set up in `letters.ts:1-37` and `BANDS` at line 171.
  - For readers in en, de, nl, fr, es, tr or ar, Kurmancî letters are grouped as "Look familiar, sound different" (false friends, shown first), "New to you" and "Already yours".
  - The summary line reads "You already know {same} of these {total} letters" (`Alphabet.tsx:251-254`).
  - Readers whose interface is in Kurdish (ku or ckb) see vowels and consonants instead, bridged to the other script.
- **Each letter card shows:**
  - the glyph and its IPA
  - a "Sounds like" comparison in the reader's language with the sound highlighted (`LIKE` table, `letters.ts:196`; 7 comparison languages)
  - a mnemonic word to remember it by, with the letter highlighted in the word (`Alphabet.tsx:92-103`)
  - the word's meaning in all 9 interface languages (`MEANINGS`, `letters.ts:281`)
  - the partner letter in the other script
  - notes on long vowels ("A hat makes it long") and on the rolled r
  - for Soranî letters: the **4 joining forms** (alone, start, middle, end), drawn by the font using zero-width joiners (`formsOf`, `letters.ts:~247`), plus a note for letters that never join
  - for Arabic readers: a "Not in the Arabic alphabet" badge on Kurdish-only letters
- **Two short rules sit above the grid:**
  - `HatRule`: i→î, u→û (`Alphabet.tsx:359`)
  - `JoinDemo`: ک و ر د ی → کوردی (`Alphabet.tsx:381`)
- **Navigation:** next/previous arrows. On wide screens the card sits beside the grid; on phones it opens in a modal sheet (`Alphabet.tsx:346-353`).

### Audio
- Tapping a letter **plays its sound immediately** (`Alphabet.tsx:183-189`). The word and the sound each have their own speaker button (`Sound.tsx`).
- **110 MP3 clips** (732 KB) live in `web/public/audio/alphabet/`, mapped in `alphabet/clips.ts`:

  | Clip set | Count |
  |---|---|
  | Kurmancî letter sounds | 31 |
  | Kurmancî example words | 31 |
  | Soranî-only sounds | 6 |
  | Soranî example words | 34 |
  | Minimal-pair words | 8 |

- The clips are **synthesised with eSpeak NG**. Each one is checked against its expected IPA (`web/scripts/alphabet-audio/generate.py`), and a sound that cannot be made accurately gets no clip and no play button.
- The page says so where it applies: "Computer voice — a guide, not a native speaker" (`en.ts:1322`, shown via `isSynthesised`).
- **Native recordings can replace the synthesised clips one at a time:**
  - The admin panel records or uploads audio (`admin/src/pages/AlphabetAudio.tsx`, using `MediaRecorder`).
  - The API stores it (`api/src/alphabet/routes.ts`, `PUT /admin/alphabet/audio`).
  - The page fetches `GET /alphabet/audio` and prefers a recording over the clip (`alphabet/audio.ts:16-40`).
  - How many real recordings exist in production cannot be seen from the code.
- There is no slow-playback control.

### "Check yourself" practice: BUILT
Logic is in `alphabet/practice.ts`, UI in `Practice.tsx`. The design is grounded in the testing effect, interleaving, desirable difficulty, feedback and successive relearning, and the rationale is written in the code at `practice.ts:17-37`.
- **8 questions per round** (`ROUND = 8`, `practice.ts:61`), drawn **from the 6 question types below** in a fixed alternating pattern:
  - `hear`: hear a sound, pick the letter
  - `like`: read the "sounds like" comparison, pick the letter
  - `spell`: hear a word, pick the correct spelling out of 3
  - `pair`: minimal pairs; **4 pairs**: kur/kûr, dil/dîl, ker/kêr, şer/şêr (`letters.ts:343`)
  - `script`: match a letter to its partner in the other script
  - `form`: identify a Soranî letter from its in-word shape
- **Wrong options are deliberately confusable:**
  - Latin: the `CONFUSE` map, e.g. c vs ç vs j (`practice.ts:64`)
  - Soranî: the `SHAPES` families that differ only by dots, e.g. ب/پ/ت (`practice.ts:73`)
- **Questions focus on what is hard for this reader:** false friends and new letters come first (`hardLatin`).
- **Feedback is immediate:** "Right." or "Not quite: it's X", followed by an **explanation** (`Explain`, `Practice.tsx:274`). The explanation gives the letter, its sound, a comparison, an example word with audio and its meaning. For minimal pairs it says "One mark changes the vowel, and with it the word."
- **A miss comes back 3 questions later** in the same round (`COMEBACK = 3`, `Practice.tsx:25`) and is marked "Another try".
- **End of round:**
  - a score for answers right on the first try
  - "Worth another look:" tiles that open the letters that were missed
  - "Practise just these", which starts a round of only the missed letters
  - a small confetti burst for a perfect round (`Practice.tsx:230`)
- **Keyboard:** keys 1-3 answer and Enter moves on (`Practice.tsx:112-125`).
- **Nothing is persisted:** no XP, no history, no spaced repetition across visits. The copy says so: "Eight quick questions. A miss comes back once. Nothing is saved." (`en.ts:1300`)

### Progress
"{n} of {total} explored" uses a progress bar with `aria-live` (`Alphabet.tsx:198-210`). Opened letters are remembered **in localStorage only** (`SEEN_KEY = 'hevalo_alphabet_seen'`, `Alphabet.tsx:120`). They are not synced to the account and earn no XP.

### What happens next
The "Now use them" links go to the Dictionary and to Wordle (`Alphabet.tsx:331-343`).

### Absent from the alphabet
- **Tracing or handwriting** (searched for `trac|handwrit|stroke|canvas` in `alphabet/`, `Alphabet.tsx` and `alphabet.css`)
- **Speaking or recording by the learner**
- **Images or illustrations** for the mnemonic words
- **Letter names and songs**
- **Mastery stored on the server**

---

## 4. In-app Dictionary (`/app/dictionary`, signed-in only): BUILT

Files: `pages/Dictionary.tsx`, `dictionary/EntryView.tsx`, `dictionary/types.ts`, `dictionary/recents.ts`.
- **Search** runs as you type, with a 250 ms debounce, against `GET /dictionary/search`.
  - The server searches both directions (Kurdish headwords and definition text), folds diacritics, and falls back to fuzzy matches. When it does, the page says "no exact match" (`api/src/dictionary/search-service.ts`, `routes.ts:37`).
- **An entry** (`EntryView.tsx`) shows:
  - the headword and a dialect badge
  - senses, each with part of speech and definitions: English first, then Kurdish, or Kurdish alone if that is all there is
  - example sentences in Kurdish, with English where available
  - a **pronunciation button for each audio file the entry has** (`EntryView.tsx:82-92`). This depends on the data, and the seed data has no dictionary audio.
  - cross-references (related words)
- **Bookmarks (saved words):** a save/unsave toggle that updates instantly (`PUT/DELETE /dictionary/entries/:id/save`). When the search box is empty, saved words are listed with a button to remove each.
- **Recent searches** last for the session only, by design, so no history of what someone did not know is kept (`Dictionary.tsx:14-23`).
- **ABSENT:**
  - any review, flashcards or quiz built from saved words. Saved words are a static list only.
  - word of the day, though the API has it (`api/src/dictionary/word-of-day*.ts`)
  - an on-screen Kurdish keyboard (not needed, since search folds diacritics)
  - inflection or conjugation tables
  - images
- **Content size** depends on what has been imported into the database:
  - The migration `api/migrations/1751000094000_seed-game-dictionary.js` seeds **79 Kurmancî words** for the games.
  - `docs/admin/dictionary-import.md` describes importing about 8,200 Kurmancî and 1,700 Soranî senses with English glosses (from kaikki.org), plus the full Wîkîferheng.

## 5. Published static dictionary (`/ferheng/` and `/dictionary/`): BUILT, but not friendly to learners

Built by `web/scripts/build-ferheng.ts` (262 lines) together with `ferheng-pages.ts`, `ferheng-search.ts`, `ferheng-entries.ts`, `ferheng-copy.ts`, `ferheng-chrome.ts` and `ferheng-alphabet.ts`.

- **Source:** the Wîkîferheng (Kurdish Wiktionary) extraction. The in-code comments give word counts between **377,942 and 447,139** across corpus versions (`build-ferheng.ts:34`, `ferheng-search.ts:6`, `ferheng-pages.ts:96`). About 3,360 HTML files are generated per language.
- **Definitions are Kurmancî explained in Kurmancî**: "This is Kurmancî explained in Kurmancî, not a bilingual dictionary" (`shared/src/ferheng.ts:9`).
  - 55% of entries are inflected forms, labelled with the source's own part-of-speech title (`ferheng-entries.ts:17-24`).
  - Entries also show Soranî and Arabic equivalents and synonyms as links (`ferheng-pages.ts:500-552`).
  - **A beginner who does not read Kurmancî cannot use these definitions.**
- **The page chrome** comes in only two languages, Kurmancî at `/ferheng/` and English at `/dictionary/`, because of the file limit (`ferheng-copy.ts:1-35`). The words and definitions stay Kurmancî in both.
- **Search runs without a server.** The script loads one shard file by prefix and folds ê, î, û, ç and ş, so "sev" finds sêv. Suggestions show the correct spelling, "so the reader learns the spelling by finding the word" (`ferheng-search.ts:25-31`).
- **ABSENT:**
  - audio and IPA
  - example sentences (the source rows have only `glosses`, `synonyms`, `sorani_equivalents` and `arabic_equivalents`; see `ferheng-entries.ts:38-46`)
  - English glosses
  - a save or bookmark button (the pages have no JavaScript except the chrome and search scripts)
  - any way into practice

---

## 6. Games: what each one trains

Hub: `pages/Games.tsx`, with 4 cards (Wordle, Rhyme, Race, Quiz). Games with both a solo and an online mode open a chooser. All scoring happens on the server.

| Game | File | What it trains | Feedback | Learning gaps |
|---|---|---|---|---|
| **Kurdish Wordle** (solo) | `pages/Wordle.tsx` (176 lines); API `api/src/game/wordle*.ts` | Kurmancî spelling and letter patterns, including ç ê î ş û; recognising word shape | Green, yellow and grey tiles plus keyboard colouring; refusal messages "Not a word in the dictionary", "Wrong length"; **6 tries** (`wordle.ts:13`); Daily or Practice; easy (4 letters), medium (5) and hard (6-8) | **Only the bare word is shown when you lose** ("The word was {word}", `Wordle.tsx:161`). When you win, not even that. **No meaning, audio or dictionary link** (`WordleGame` type, `lib/types.ts:308-320`, has no gloss field). No hints. |
| **Wordle Battle** (online) | `pages/WordleBattle.tsx` (368 lines) | Same as Wordle, with time pressure against a friend | Opponent progress shown as letter counts, a ranking, the answer at the end | Same: no meaning shown (`WordleBattle.tsx:280`) |
| **Rhyming Words** (solo) | `pages/Rhyme.tsx` (218 lines); API `rhyme*.ts` | Producing vocabulary from memory, and sound awareness (word endings); **Kurmancî or Soranî** | A **60 s** timer (`rhyme-service.ts:15`); each word marked perfect or near with points; reasons a word is refused (not a word, the prompt itself, already used, doesn't rhyme, profane); pasting blocked | **No list at the end of rhymes you missed**, no meanings for the words found, no audio |
| **Rhyme Match** (online) | `pages/RhymeMatch.tsx` (334 lines) | Same as Rhyme, head to head | Ranking; "the prompt was …" | Same as Rhyme |
| **Typing Race** (solo) | `pages/Race.tsx` (276 lines); API `race*.ts` | Typing Kurdish text accurately, including the diacritics; incidental reading | Each character turns green or red as you type (`Race.tsx:192-201`); words per minute, accuracy, time, XP; three lengths; texts are written by admins (`race_texts`, no seed) | **No translation, audio or glossary for the text.** No on-screen ç/ê/î/ş/û keys, so desktop users without a Kurdish keyboard layout get those characters marked wrong. |
| **Ranked Quiz** (online, 1-v-1) | `pages/Quiz.tsx` (379 lines); API `game/question-bank.ts`, `engine.ts` | Recognising word meanings (Kurmancî prompt, English options) | Timed questions; the correct option is shown after each; points and rating | **A live opponent is required**: no bot and no solo mode; "No opponent found right now" (`en.ts` `games.quiz.noOpponent`). Fallback bank of **33 questions** (31 vocabulary, 2 phrases). No explanations. |

Other game notes:
- **What feeds the games:** a curated word pool (`in_games`) of **79 seeded words** plus words admins promote, and curated rhyme prompts (`api/migrations/1751000096000_rhyme-prompts.js`).
- **Not connected to learning:** the games are not linked to course content or the learner's level. The comment in `question-bank.ts` says choosing questions by course level is planned, not built.
- **XP:** Wordle, Rhyme and Race all award XP, which the results screen shows. The Wordle service also updates the streak (`wordle-service.ts:93-94`).

---

## 7. Community wall and library: reading aids

- **The wall** (`pages/Civak.tsx`, `feed/FeedCard.tsx`, `feed/postKinds.ts`) holds two kinds of content:
  - **Gotin** (writing): sayings, stories and poems
  - **Dîmen** (pictures): photos and memes

  It can be filtered by kind, and there are likes, comments, saves and reposts.
- **Reading a post** (`pages/LibraryPostPage.tsx`):
  - title, author, view count
  - an **`<audio controls>` player when the post has an `audioUrl`** (shown with an "Audio" badge, `en.ts:942`)
  - the body as plain pre-wrapped text, then comments
- **Reading aids: ABSENT.**
  - no tap-to-translate and no glosses, word popups or dictionary lookup from the text
  - no translation toggle
  - no difficulty or level label (`LibraryPost.language` exists in `lib/types.ts:461` but is not shown)
  - no comprehension questions
  - no audio highlighted in sync with the text, and no speed control
  - the body `<div className="post-body">` has **no `lang` attribute**, so screen readers and hyphenation treat Kurdish text as the interface language
- **Posting** (`feed/PostWords.tsx`, `feed/SharePost.tsx`) has no audio upload and no language or dialect field, so read-aloud audio must come from elsewhere (mobile or admin).

---

## 8. Onboarding and goal-setting: ABSENT on web

- **Register** (`pages/Register.tsx`) asks for email, username, password and the interface language (`LanguagePicker`, lines 91-95). It does **not** ask about:
  - which dialect to learn, current level, motivation or reason, or daily goal
  - age
- After sign-up and email verification, the user goes straight to `/app` (`pages/VerifyEmail.tsx:62,74,93`), which is the community wall. They are not taken to a first lesson, a placement test or the alphabet.
- The hero button "Start learning Kurdish" leads to `/register` (`Landing.tsx:227`). The path is: register, then the wall.
- **Settings** (`pages/Settings.tsx`) has:
  - interface language
  - profile visibility
  - blocked people
  - notification preferences (`notifications/prefs.ts`: streak, friends, games, events, marketing)
  - sessions, data export, delete account

  It has **no learning settings**: no daily goal, target dialect, sound effects, text size or motion toggle.
- **On the API and mobile only:**
  - placement test: `POST /courses/:courseId/placement` and `/placement/:sessionId/answer` (`api/src/placement/`)
  - daily goal: `GET/PUT /me/daily-goal` (`api/src/goals/`)
  - phone onboarding: `mobile/src/onboarding/OnboardingScreen.tsx`
  - phone goal picker: `mobile/src/goals/GoalPicker.tsx`

---

## 9. What learners can see of their progress

| Shown on web | Where | What it means for learning |
|---|---|---|
| Level ring around the avatar plus the level number | `components/TopNav.tsx:198-224`, `profile/LevelRing.tsx` | XP-based level, built mostly from game XP |
| Level, XP, streak (days), Zêr, ranked position | `pages/Profile.tsx:86-140`, `profile/FullProfile.tsx:124` | The streak is only a number here; the `FlameIcon` exists (`components/icons.tsx:111`) but is used nowhere in the UI |
| Profile activity (posts, games, likes, reposts, saved) | `profile/ProfileActivity.tsx` | Social and game activity, not learning |
| Achievements count (other people's profiles only) | `pages/UserProfile.tsx:103`, `profile/ProfileModal.tsx:171` | A count only; **no achievements or badge gallery** |
| Alphabet "n of N explored" | `Alphabet.tsx:198-210` | localStorage only |
| Weekly XP and rating leaderboards; league panel | `pages/Rankings.tsx`, `leagues/LeaguePanel.tsx` | Comparison with others |

**ABSENT:**
- words learned or known
- skills or course completion
- accuracy over time
- weak areas, and words due for review
- time spent
- CEFR or can-do level
- a learning calendar or heatmap
- a progress report or email

The API can compute per-skill strength (`/courses/:courseId/skill-strength`), but the web never shows it.

---

## 10. How gamification is presented

- **XP** appears on game result screens ("+N XP") and feeds the level and the weekly leagues.
- **Weekly leagues** have **10 tiers**: bronze, silver, gold, sapphire, ruby, emerald, amethyst, pearl, obsidian, diamond (`leagues/format.ts:22-33`).
  - Promotion and demotion zones apply; cohorts under 10 people demote nobody (`MIN_FOR_DEMOTION`).
  - Leaderboards can be weekly XP or rating, and global, friends or country (`Rankings.tsx:31-54`).
- **The daily Zêr reward** (`components/DailyReward.tsx`) sits on the home wall: one "Claim daily Zêr" button with a 7-day cycle ("The seventh day pays the most", `en.ts:1146`). **No learning activity is needed to claim it.**
- **The shop** (`pages/Shop.tsx`) sells profile backgrounds and icons for Zêr or gems. Gifts to friends are supported. There are no streak freezes on web (`StreakSummary.freezes` exists in `lib/types.ts:51` but is not shown).
- **Profile tags and badges** (`tags/TagsCard.tsx`) are identity tags, not learning achievements.
- **Celebration** is modest: a 🎉 on solving Wordle, and a 10-particle burst for a perfect alphabet round.
- **Overall:** rewards are tied to *playing games* and *showing up*. They are not tied to *learning outcomes*, because lessons and review do not exist on web.

---

## 11. Accessibility, right-to-left text and typing Kurdish

- **Right-to-left layout:**
  - `<html dir>` and `lang` follow the interface language, with RTL for ckb and ar (`i18n/I18nProvider.tsx:163-165`, `shared/src/locales.ts:29-37`).
  - Kurdish text is marked `lang="ku"` or `lang="ckb"` and `dir` throughout the Alphabet, and Soranî grids are set `dir="rtl"` (`Alphabet.tsx:303`).
  - The published dictionary marks Arabic-script values `dir="rtl"` (`ferheng-pages.ts:206-218`).
  - Vazirmatn is bundled for the Arabic script.
- **Interface languages:** 9 (ku, ckb, en, nl, de, es, fr, tr, ar). The catalogues are effectively complete: about 1,217-1,218 keys each in `web/src/i18n/*.ts`.
- **Typing Kurdish:**
  - **Wordle has an on-screen Kurmancî keyboard** with the extra letters in their positions: `KURMANCI_KEYS` has a 13-key top row with ê, û, î, and the bottom row includes ç (`components/WordleBoard.tsx:9-44`). The physical keyboard regex also accepts `a-z ê î û ç ş`.
  - The alphabet practice works from the keyboard (1-3, Enter).
  - **Race and Rhyme have no character helper.** The Rhyme API keeps diacritics when normalising words (`api/src/game/rhyme.ts:25`), so "ser" ≠ "şêr". Search in both dictionaries folds diacritics.
  - **There is no Soranî on-screen keyboard anywhere.**
- **Screen readers:**
  - The alphabet card is announced with `aria-live="polite"` and answers go to `role="status"`.
  - Landing mocks are a single `role="img"` with a label each.
  - **Wordle tiles announce only the letter, not whether it was right, misplaced or absent** (`WordleBoard.tsx:84`, `aria-label={letter || …}`). This contradicts the repo's own checklist ("Wordle tiles announce 's, correct'"), which is written for mobile (`docs/accessibility-checklist.md`).
- **Reduced motion:** `prefers-reduced-motion` rules exist in 10 stylesheets, 3 of them in `alphabet.css`.
- **No user controls** for text size, dyslexia-friendly fonts or audio speed.

---

## 12. Suitability for children

- **ABSENT:**
  - kids mode
  - any age question at sign-up, or a minimum age in the Terms (searched `en.ts` terms and privacy strings)
  - parental consent, parent dashboard, teacher or classroom features
  - picture-based exercises
  - a mascot-led tutorial
  - read-to-me for the interface
- **What makes it child-friendly:**
  - the deer avatar set (16 default avatars in `web/public/cosmetics/avatars/`)
  - the bright game tiles
  - a profanity filter in Rhyme
  - the alphabet's gentle, low-stakes tone
- **Safety concerns for children:** the open community wall (memes included), direct messages and friend requests, ranked matchmaking with strangers, and a shop with a premium currency (gems). Users can block people and limit profile visibility (`settings/BlockedUsers.tsx`, `pages/Settings.tsx`), but nothing is designed around children.

---

## 13. Important learning features searched for and not found on web

| Feature | Web status | Where I looked / evidence |
|---|---|---|
| Spaced repetition / review queue | ABSENT on web; API/MOBILE ONLY | No `/review` or `/practice` call in `web/src` (endpoint list in §16); API has `review/sm2.ts`, `review/adaptive.ts`, `practice/practice-select.ts` |
| Lesson player / exercises | ABSENT on web; mobile only | `pages/Learn.tsx`; `mobile/src/lesson/LessonPlayerScreen.tsx` |
| Placement test | ABSENT on web; API/MOBILE ONLY | `api/src/placement/`; no web call |
| Daily goal setting | ABSENT on web; API/MOBILE ONLY | `api/src/goals/`; `mobile/src/goals/GoalPicker.tsx`; no `goal` in `web/src` |
| Onboarding questionnaire | ABSENT on web | `pages/Register.tsx`, `pages/VerifyEmail.tsx`; mobile has `mobile/src/onboarding/` |
| Speech recognition / pronunciation scoring | ABSENT everywhere for learners | No `SpeechRecognition`, `getUserMedia` or `MediaRecorder` in `web/src` (only in `admin/src/pages/AlphabetAudio.tsx` for recording reference audio); API scorer is a stub (`content/speaking-scorer.ts`) |
| Text-to-speech | Deliberately ABSENT | Comment in `letters.ts:28-30` (no browser has a Kurdish voice); offline eSpeak clips used instead |
| AI tutor / chatbot / LLM feedback | ABSENT | Searched `tutor`, `openai`, `anthropic`, `llm` in `web/src`: 0 hits |
| CEFR or level mapping | ABSENT | Searched `cefr`: 0 hits; difficulty exists only as game tiers (easy/medium/hard; race lengths 1-3; quiz level 1-3) |
| Kids mode / parent dashboard / classroom | ABSENT | Searched `kids`, `parent`, `age`, `teacher` in pages and i18n |
| Offline mode / PWA | ABSENT on web | No service worker or web manifest in `web/public` or `index.html`; mobile has `mobile/src/offline/` |
| Review of saved words (flashcards) | ABSENT | `pages/Dictionary.tsx` lists saved words only |
| Word of the day | ABSENT on web; API only | `api/src/dictionary/word-of-day*.ts`; no web reference |
| Tap-to-translate / glosses in community posts | ABSENT | `pages/LibraryPostPage.tsx`, `feed/FeedCard.tsx` |
| Graded readers / levelled stories | ABSENT | Feed has no level field shown |
| Grammar explanations | ABSENT on web; API has `/skills/:id/grammar` and seed `grammarMd` | Not rendered anywhere in `web/src` |
| Letter tracing / handwriting | ABSENT | `alphabet/`, `alphabet.css` |
| Images in vocabulary teaching | ABSENT | No image fields in exercises (`api/src/content/exercises.ts`); alphabet has no pictures |
| Streak reminders / notifications | PARTIAL | Only a preference toggle (`notifications/prefs.ts:15`); web has no push or reminder UI |
| Achievements / badge gallery | ABSENT (count only) | `UserProfile.tsx:103` |
| Learning analytics for the user | ABSENT | Profile shows level, XP, streak and Zêr only |
| Sentence-level audio in learning content | ABSENT | Only the 110 alphabet clips, plus optional post audio and dictionary audio when the data has it |
| Soranî course | ABSENT | FAQ: "Kurmanji first… courses in more Kurdish varieties will follow" (`en.ts:1238`); Soranî appears in the Alphabet and Rhyme only |

---

## 14. Marketing claims compared with the web as built

These are all from `web/src/i18n/en.ts`:

| Claim | Reality |
|---|---|
| "Six kinds of exercise — choose, match, translate, write, listen and speak" (1124) | The API supports all 6, but **the seed course uses 4 (no listen, no speak)**, and the web has no exercises. The landing page does say lessons are "in the Hevalo app, coming soon" (1121, 1139). |
| "Practice brings words back just before you would forget them" (1126) | SM-2 exists in the API; it is not reachable on web, and the app is not released. |
| "Lessons play recordings you can slow down" (1134); the `SpeakVisual` mock shows a 0.75× chip (`mocks.tsx:376+`) | No lesson audio in the seed course; no slow control anywhere on web. |
| "Speaking exercises have you say the word out loud and record yourself" (1136) | Mobile only; the API scorer accepts any recording. |
| "Anyone can … play the solo games" without an account (FAQ 1240; Games hub marks solo modes "Playable" for guests, `Games.tsx:104-116`) | **Contradicted by the API.** `/wordle/*`, `/rhyme/training*` and `/race*` all have `preHandler: requireAuth` (`api/src/game/wordle-routes.ts:30,44,61,84`, `rhyme-routes.ts:26,43,62`, `race-routes.ts:40,55`). There is no guest session (`api/src/plugins/auth.ts:9`: "no Authorization header → anonymous"). A guest who opens a solo game would most likely get an error state. Not verified in a browser. |
| "Pick a course to begin; your progress syncs with the Hevalo app" (803) | Course cards are not clickable. |

---

## 15. Counts at a glance

| Item | Count |
|---|---|
| Web routes under `/app` | 26, including 4 redirects (`App.tsx`) |
| Learning or practice surfaces on web | Alphabet, in-app dictionary, published dictionary, 6 game screens (4 game types × solo/online), community reading |
| Game screens | 6: Wordle, Wordle Battle, Rhyme, Rhyme Match, Race, Quiz |
| Alphabet letters | 31 Kurmancî + 34 Soranî = 65 |
| Alphabet audio clips | 110 MP3s (732 KB), synthesised; admin recordings can override them |
| Alphabet practice | 6 question types, 8 per round, 4 minimal pairs, 7 languages for sound comparisons, word meanings in 9 languages |
| Seed course | 3 units, 8 skills, 15 lessons, 31 exercises (4 types) |
| Newroz mini-course | 1 unit, 2 skills, 3 lessons, 9 exercises |
| Exercise types the API supports | 6 |
| Seeded game words | 79 |
| Fallback quiz questions | 33 |
| Published dictionary headwords | roughly 380k-450k, per in-code comments |
| League tiers | 10 |
| Interface languages | 9, about 1,218 keys each |
| Default avatars | 16 |

---

## 16. API paths the web calls that touch learning

From a search over `web/src`, excluding tests:
- `/courses`
- `/dictionary/search`
- `/dictionary/entries/:id`
- `/dictionary/entries/:id/save`
- `/me/saved-words`
- `/alphabet/audio` (via `API_URL` in `alphabet/audio.ts`)
- `/wordle/{daily|practice}` and `/wordle/games/:id/guesses`
- `/wordle/battles…`
- `/rhyme/training…` and `/rhyme/matches…`
- `/race` and `/race/:id/finish`
- `/matchmaking/queue` and `/games/:roomId/state` (quiz)
- `/rewards/daily…`
- `/leaderboards/:type`
- `/me/league`

**Never called by web:**
- `/courses/:id/map`
- `/lessons/:id/session`
- `/sessions/:id/answers` and `/sessions/:id/complete`
- `/skills/:id/grammar`
- `/courses/:courseId/placement` and `/placement/:sessionId/answer`
- `/courses/:courseId/skill-strength`
- `/practice/session` and `/practice/sessions/:id/{answers,complete}`
- `/review/queue`
- `/me/daily-goal`
- word of the day
