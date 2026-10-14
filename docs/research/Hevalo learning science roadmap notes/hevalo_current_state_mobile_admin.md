# Hevalo: current learning features in the mobile app and the admin panel

Branch `claude/tender-ptolemy-1m29c7` (HEAD `43a5681`), read on 2026-10-06. Nothing was modified.

**Scope:**
- `mobile/`: the Expo / React Native app (`app.hevalo.mobile`).
- `admin/`: the Vite admin SPA.
- `docs/`, `README.md` and `DEPLOY.md`.
- The GitHub tracker `gutskrd/Kurda`: 18 open issues and 145 closed ones.

I read `api/` only to confirm whether a client feature has a backend behind it. Two sibling notes cover the rest in depth: `hevalo_current_state_backend.md` and `hevalo_current_state_web.md`. I do not repeat their content counts here except where needed.

**Status labels:**
- **BUILT**: works end to end in the client.
- **PARTIAL**: some of it works, or it works on only some platforms.
- **STUB / DEAD CODE**: the code exists but is never called, or returns nothing.
- **ABSENT**: I searched for it and did not find it.
- **DOCS/ISSUE-ONLY**: planned in a document or ticket, with no code.

---

## 0. TL;DR

1. **The mobile app is the only client with a lesson player, and it is not shipped yet.**
   - `mobile/src/lesson/` has a complete player: 6 exercise renderers, hearts, server grading, a grammar sheet and a results screen.
   - Neither the web app nor the admin panel can play a lesson.
   - The app is not in the stores (open epic #279, "App Store submission readiness"). The FAQ on the web says the apps are "coming".
   - CI only lints, typechecks and tests the mobile package. No workflow builds it. `eas.json` defines internal and production profiles that are run by hand.
2. **Listening, speaking and dictionary audio work only when the app runs in a browser.**
   - `useAudio` needs a DOM `Audio` constructor (`mobile/src/lesson/useAudio.ts:24,35`).
   - `useRecorder` needs `MediaRecorder` and `getUserMedia` (`mobile/src/lesson/useRecorder.ts:19,42`).
   - On iOS and Android both report `supported = false`. The listening exercise greys out its Play buttons (`ListeningExercise.tsx:27`). The speaking exercise shows "unavailable" (`SpeakingExercise.tsx:73`). The dictionary hides its audio button (`dictionary/EntryDetail.tsx:64`).
   - `expo-audio` is installed and works natively, but only the community Library uses it (`library/AudioPlayer.tsx`, `library/VoiceRecorder.tsx`).
   - In practice this is hidden for now, because the seed course has 0 listening and 0 speaking items.
3. **Offline lesson mode is dead code.**
   - `mobile/src/offline/` contains `LessonCache` (an LRU capped at about 100 MB), `selectPrefetch` (the next 5 lessons) and `OfflineCompletionQueue`. Only `offline.test.ts` imports them. No screen does.
   - Issue #42 is closed as "completed" by PR #201, titled "…— core".
   - What the app actually does offline: it keeps one unsent answer in memory and offers a "retry" banner (`LessonPlayerScreen.tsx:213-235`). A lesson cannot be started without a connection.
4. **Push notifications are a stub on the device.**
   - `getPushToken()` returns `null` behind a `TODO(KUR-094 follow-up)` (`mobile/src/push/tokenSource.ts:20-22`).
   - `expo-notifications` is not a dependency.
   - The server provider is `StubPushProvider` (`api/src/push/provider.ts:35`).
   - The in-app notification centre and the preferences screen are built.
   - Onboarding promises "A Kurdish story every day … One a day" (`i18n/translations.ts:1001-1002`). No job sends a daily story.
5. **Onboarding has no learning setup.**
   - It has 3 slides: Language, Welcome (rotating value propositions) and Notifications (informational only) (`onboarding/flow.ts:14`).
   - It asks for no goal, no level, no placement test, no dialect, no age and no reason for learning.
   - The placement API exists (`POST /courses/:id/placement`, `api/src/placement/routes.ts:15-38`) and issue #39 is closed. No client calls it.
   - There is no guest mode; open issue #274 plans one.
6. **Learn shows only one course.**
   - `LearnScreen` takes `courses[0]` (`screens/LearnScreen.tsx:60`), and the API sorts courses by slug (`api/src/coursemap/service.ts:48`).
   - `kurmanji-basics` sorts before `newroz-culture`, so the Newroz cultural mini-course can never be reached on mobile.
   - Course, unit and skill titles are always `title_en`, whatever the UI language (one of 9).
7. **Built but never called by any client:**
   - the analytics tracker (`mobile/src/analytics/tracker.ts`)
   - the A/B client (`mobile/src/experiments/client.ts`)

   So the admin Analytics dashboards (DAU, funnels, retention) and the Experiments page sit on an empty event stream.
8. **The admin panel's authoring is strong for games and weak for lessons.**
   - **Games content** has proper editors: a word pool, Wordle coverage, a Rhyme editor with per-pair verdicts, quiz questions, race texts and a resumable Wîkîferheng import.
   - **Alphabet audio** has a full in-browser record, trim and normalise studio (110 clips).
   - **Lessons** are edited as a raw JSON textarea, opened by pasting a lesson UUID (`admin/src/pages/Content.tsx:195,214`). There is:
     - no course, unit or skill CRUD
     - no grammar-note editor
     - no audio or image upload for exercises
     - no preview (`admin/src/preview.ts` exists but nothing imports it)
     - no word-of-the-day curation; `addToWotdPool` has no caller outside tests
     - no learner-progress view
     - no item-difficulty analytics
9. **"AI moderation" is a heuristic spam classifier** (`heuristic-spam-v1`). It is wired into chat, library posts and comments, and image comments, and the admin can uphold or overturn its flags. **There is no generative AI anywhere.** The roadmap holds two AI learning tickets, both open: #120 (pronunciation scoring) and #122 (AI conversation tutor).

---

## 1. Mobile app: map of learning surfaces

The navigation has 5 tabs: Home (the Civak wall), Search, Play, Inbox and Profile (`navigation/tabs.ts`). Learn and Dictionary are pushed screens opened from the top of Play (`screens/PlayScreen.tsx:116-117`). `App.tsx` registers 40 named stack screens.

| Surface | Status | Files | Notes |
|---|---|---|---|
| Course map (skill tree) | **BUILT** | `screens/LearnScreen.tsx`, `coursemap/*` | Units with skill nodes in 5 states (`locked / unlocked / completed / gold / decayed`). Each node shows strength % and a "rusty" hint when decayed (`coursemap/node.ts`). Tapping opens the first incomplete lesson. Only `courses[0]` is shown. There is no course or dialect switcher. |
| Daily goal ring + picker | **BUILT** | `goals/GoalPicker.tsx`, `goals/ProgressRing.tsx`, `goals/format.ts:3` | Choices are 10/20/30/50 XP. Learn is the only screen that shows it. |
| Practice (review) | **BUILT** (client) | `practice/PracticeScreen.tsx` | `POST /practice/session` serves the server's SM-2 queue. When nothing is due it suggests the next lesson. The Learn screen does not show how many reviews are due. |
| Lesson player | **BUILT** | `lesson/LessonPlayerScreen.tsx` (384 lines), `lesson/player.ts`, `lesson/components/*` (10 files) | See §2. |
| Grammar tips | **BUILT** | `grammar/GrammarTips.tsx`, `grammar/MarkdownView.tsx` | A lightbulb in the lesson header opens the skill's markdown in a modal. It cannot be opened from the course map, although `hasGrammar` is sent to the client. |
| Word of the day card | **PARTIAL** | `dictionary/WordOfDayCard.tsx` | Calls `GET /dictionary/word-of-day`. The server pool is empty and nothing can fill it (§9.3). |
| Daily reward card | BUILT (motivation, not learning) | `rewards/DailyRewardCard.tsx` | Pays Zêr for showing up. |
| Event banner and quests | BUILT | `events/EventBanner.tsx`, `events/EventQuestsScreen.tsx`, `events/quests.ts` | 3 quest types: `earn_xp`, `win_games`, `complete_lessons`. Quests do not link to the event's mini-course. |
| Dictionary | **BUILT** (no audio on native) | `screens/DictionaryScreen.tsx`, `dictionary/*` | Debounced search, recent searches, entry pages (senses, collapsible examples, cross-references) and bookmarks. Saved words are listed. |
| Games (6) | **BUILT** | `screens/PlayScreen.tsx`, `game/*`, `wordle/*`, `rhyme/*`, `race/*` | See §6. |
| Community library | **BUILT** | `library/*` | User and admin stories and poems with optional **native** audio (`expo-audio`), plus threaded text or voice comments. There are no reading aids. |
| Civak wall (Home) | BUILT (social) | `feed/*` | Sayings, stories, poems, photos and memes. |
| Leagues and leaderboards | BUILT (motivation) | `leagues/LeagueScreen.tsx` | Weekly tiers with promotion and demotion zones. |
| Profile stats | BUILT | `screens/ProfileScreen.tsx:250-265`, `profile/ProfileActivity.tsx` | Level, XP, streak, friends. There is no "words learned", no skill or accuracy history and no time studied. |
| Alphabet module | **ABSENT on mobile** | — | `grep -i alphabet mobile/src` finds no screen and no catalogue key. It exists on web only (`web/src/pages/Alphabet.tsx`). |
| Onboarding | **BUILT (3 slides, no learning setup)** | `onboarding/*` | See §4. |

---

## 2. The lesson player in detail (`mobile/src/lesson/`)

**Flow:**
1. `GET /lessons/:id/session` loads the session.
2. Each answer is posted with `POST /sessions/:id/answers` and graded on the server.
3. `POST /sessions/:id/complete` returns the results.

The same `SessionPlayer` drives practice, through `/practice/sessions/:id/...`. The pure reducer is `player.ts`. Tests cover the player, answers, match, queue, recording and the Kurdish keys.

| Exercise type | Renderer | What the learner does | Platform notes |
|---|---|---|---|
| `multiple_choice` | `MultipleChoiceExercise.tsx` | Taps one option, shown as a radio button. | Options appear **in authored order**. All 15 seed MC items have `correctIndex: 0` (backend note §2), so the right answer is always first. |
| `translate` | `TranslateExercise.tsx` | Types a translation. | **No Kurdish character bar**, although seed translate items run English → Kurmanji. The server accepts missing diacritics as a `typo`. |
| `match_pairs` | `MatchPairsExercise.tsx`, `match.ts` | Taps a left item, then a right item. | Graded all-or-nothing on the server. |
| `listening` | `ListeningExercise.tsx`, `useAudio.ts` | Plays the clip at 1× or 0.75×, then types what was heard. | **Web only.** On native, Play is disabled. The auto-skip (`:29`) fires only on `audio.error`, not when audio is unsupported, so a native learner must type blind or tap "can't listen now". |
| `speaking` | `SpeakingExercise.tsx`, `useRecorder.ts`, `recording.ts`, `upload.ts` | Records (at least 1 s and 800 bytes), uploads to `/media/uploads`, then submits the key. | **Web only** (MediaRecorder). On native it shows "unavailable" and the learner can only skip. The server scorer is a stub that always passes. If the microphone is denied, `skipSpeaking` is set for the whole course (`LessonPlayerScreen.tsx:128-145,190-194`). There is no other setting to turn it back on. |
| `writing` | `WritingExercise.tsx`, `kurdishKeys.ts:4` | Free text, with a key bar of `ê î û ç ş`. | This is the only exercise with the Kurdish key bar. |

**Feedback** (`components/FeedbackFooter.tsx`):
- A green or red banner reading "Correct", "Almost (typo)" or "Not quite".
- On a miss it shows a single correction string (the first accepted answer).
- There is **no explanation, no hint, no "why", no audio of the correct answer and no image**. The `Exercise` type has no `hint`, `image` or `explanation` field (`lesson/types.ts`).

**Hearts:**
- 5 per lesson (`player.ts:4`), counted on the client only.
- When they run out, the lesson ends as failed.
- They do not carry over between lessons. Nothing refills them and nothing sells them.

**Mistakes are not re-queued.** `CONTINUE` always moves forward (`player.ts:81-92`). A wrong item is not repeated later in the lesson. `SKIP` defers an item without counting it wrong, but never returns to it.

**Results screen** (`components/LessonResults.tsx`):
- Shows XP, accuracy, correct out of total, and the streak badge.
- Under "Review" it lists each missed prompt with its verdict. The verdict is the raw token (`wrong` / `typo`), not translated (`:44`), and **the correct answer is not shown**.
- It offers no "practise these now" button.

**Missing from the lesson flow:**
- a teaching phase or new-word introduction before the exercises
- images, TTS for prompts, slow replay of the prompt, or tap-to-gloss
- haptics or sound effects (no `expo-haptics`)
- a lesson intro or estimated duration
- per-exercise timing; the client sends no latency

---

## 3. Audio and speech on mobile

| Capability | Status | Evidence |
|---|---|---|
| Lesson audio playback | **PARTIAL, web only** | `lesson/useAudio.ts` uses `globalThis.Audio`. The comment says "on a host without it, `supported` is false". |
| Dictionary audio playback | **PARTIAL, web only** | Uses the same `useAudio` (`dictionary/EntryDetail.tsx:28,64`). The imported Wîkîferheng data has no audio anyway. |
| Learner voice recording for speaking exercises | **PARTIAL, web only** | `lesson/useRecorder.ts`. Its header says "native capture will bind to an Expo audio package alongside the real scorer (KUR-120)". |
| Voice notes in the Library (record, preview, upload, play) | **BUILT, native** | `library/VoiceRecorder.tsx`: `expo-audio` with the `HIGH_QUALITY` preset, auto-stop at 120 s, playback through `library/AudioPlayer.tsx`. This is the one place native audio works. |
| Alphabet audio (110 clips) | **ABSENT on mobile** | Played on web only. |
| Pronunciation scoring / ASR | **ABSENT** (server stub) | `api/src/content/speaking-scorer.ts`. Open issue #120. |
| TTS | **ABSENT** | No `expo-speech`. `docs/app-store/privacy.md:21` says no speech-recognition permission is ever requested. |
| Microphone permission string | present | `app.json` plugin `expo-audio`: "…record a voice note or complete a speaking exercise". |

---

## 4. Onboarding, goals, placement

- **Onboarding: BUILT, 3 slides** (`onboarding/flow.ts:14`, `onboarding/OnboardingScreen.tsx`):
  1. **Language.** Choose one of 9 UI languages with a live preview. The choice is saved as the account language.
  2. **Welcome.** Brand, tagline and rotating value propositions.
  3. **Notifications.** A "soft ask" with **no operating-system prompt**. The comment says "the actual permission lives in Profile → Notification settings" (`OnboardingScreen.tsx:231-233`). Since there is no push token, there is nothing to grant.

  Persistence uses AsyncStorage on native and localStorage on web. The "Reset onboarding" option mentioned in a comment (`storage.ts:31`) has **no UI** in `screens/SettingsScreen.tsx`.
- **Goal setting during onboarding: ABSENT.** The daily goal can be set only on the Learn screen.
- **Placement test: ABSENT in clients.**
  - The API is built: `POST /courses/:courseId/placement`, `POST /placement/:sessionId/answer` and `GET /courses/:courseId/skill-strength`.
  - Issue #39, "Optional placement test at onboarding…", is closed. Its PR #198 merged the backend.
  - The list of mobile API paths (§11) contains no `/placement`.
- **Level, dialect, age, motivation, prior knowledge and learner type questions: ABSENT.**
- **Guest mode: ABSENT.** Signed-out users see only the auth stack. Issue #274 (open) plans "Continue without an account".

---

## 5. Notifications and reminders

| Piece | Status | Evidence |
|---|---|---|
| Device push token | **STUB** | `push/tokenSource.ts:20-22` returns `null`. `PushRegistration.tsx` handles the lifecycle but has nothing to register. |
| Server push delivery | **STUB** | `StubPushProvider` (`api/src/push/provider.ts:35,53`). There is no FCM or APNs. |
| Streak reminder with smart timing (#96, closed) | Server job **BUILT**, delivery **STUB** | `api/src/notifications/streak-reminder*.ts`, `api/src/workers/notifications/streak-reminder.ts`. The backend note says the copy is English only. |
| Notification preferences | **BUILT** | `notifications/NotificationsScreen.tsx`, `notifications/prefs.ts:5`. Five categories (`streak, friends, games, events, marketing`) plus quiet hours in 30-minute steps. **There is no "learning" or "reviews due" category.** |
| In-app notification centre and inbox | **BUILT** | `notifications/NotificationCenterScreen.tsx`, `inbox/InboxScreen.tsx`, `notifications/inbox.ts`. Deep links go to EventQuests, Game, Profile or Chat. **No deep link opens a Lesson or Practice.** |
| "Reviews due", word-of-the-day or story-of-the-day notifications | **ABSENT** | No job and no category. The onboarding copy promising "a Kurdish story every day" has nothing behind it. |
| Local (on-device) scheduled reminders | **ABSENT** | No `expo-notifications`. |

---

## 6. Games on mobile, and what each trains

Play lists 6 games (`screens/PlayScreen.tsx:141-209`). Private rooms, tournaments and 2v2 / FFA exist on the server but are **not exposed on mobile** (no `joinCode`, `/rooms` or `tournament` in `mobile/src`).

| Game | Trains | Learning hook |
|---|---|---|
| Quiz 1v1 (matchmaking) | Vocabulary and phrase recognition (multiple choice) | Draws from a 33-question bank that is not linked to the course. A friend challenge is possible from a profile (`/challenges`). |
| Wordle (daily and practice, easy 4 / medium 5 / hard 6-8 letters) | Spelling and letter patterns | **The only learning loop between games and study.** After a game it looks the word up in the dictionary and offers "save to vocab" (`wordle/WordleScreen.tsx:148-219`). It has a Kurdish on-screen keyboard (`WordleKeyboard.tsx`). |
| Wordle Battle | The same, multiplayer | — |
| Rhyme training (solo, timed) | Productive vocabulary and sound awareness | Rejection reasons are shown (`not-a-word`, `no-rhyme`, …). The client hard-codes `kurmanci` (`RhymeTrainingScreen.tsx:111`). |
| Rhyme Match (1v1) | The same | — |
| Typing Race (solo, short / medium / long) | Typing Kurdish text accurately | Texts are admin-curated, and none are seeded. Timing is measured on the server. |

Game results do not feed spaced repetition or skill strength. Games do earn XP, so they count toward goals, streaks and leagues (backend note §6).

---

## 7. Analytics and experiments in the clients

- **Analytics tracker: DEAD CODE.**
  - `analytics/tracker.ts` and `buffer.ts` batch events (50 events or 30 s) and retry.
  - `grep -rn "tracker|track(|AnalyticsTracker"` over `mobile/src`, `web/src` and `App.tsx` finds no caller.
  - The server registry expects 8 event types (`screen_view`, `lesson_start`, `lesson_complete`, …), and no client emits any of them.
- **Experiment client: DEAD CODE.** `experiments/client.ts` has `getVariant`, `isVariant` and a cached `init`. No caller. `GET /experiments` is not in the list of mobile API paths.
- **Consequence:** the admin Analytics and Experiments pages (§9.5) have no data to show.

---

## 8. Localisation and accessibility (as they affect learning)

**UI languages: 9.** They are `en, de, es, fr, nl, ku, ckb, ar, tr` (`i18n/translations.ts:8803`), with 874 keys each. The RTL locales are `ar` and `ckb`. Open issue #267 covers RTL for Arabic.

**Learning content does not follow the UI language:**
- Prompts are English or Kurmanji only.
- Map titles are always `title_en`.
- Quest titles prefer `titleEn` (`events/quests.ts`).

**Dialect:**
- The course model has a `dialect` field, but the mobile app has **no dialect picker**.
- Sorani appears only in the rhyme API, which the mobile client fixes to `kurmanci`.

**Accessibility:**
- Built: reduced motion, Dynamic Type scaling, contrast helpers and 44-pt touch targets (`mobile/src/a11y/*`, `docs/accessibility.md`).
- There is no high-contrast theme, because React Native exposes no such API (`docs/accessibility.md` "Known limitation").
- Open issue #266 covers the full VoiceOver and Dynamic Type sweep.

---

## 9. Admin panel (`admin/src`)

### 9.1 Page inventory

There are 18 top-level pages (`admin/src/App.tsx:32-51`):
- **Moderation pages:** Moderation, Antibot, AI Mod, Users, Fraud, Audit, Security.
- **Content pages:** Content, Games, Alphabet audio, Tags.
- **Live-ops pages:** Config, Analytics, Experiments, Events, Economy, Ops, Shop.

Games has 5 sub-tabs (`pages/Games.tsx:153-179`):
- **Word pool**, which includes the dictionary import
- **Wordle**, which shows coverage statistics
- **Rhyme**
- **Quiz**
- **Race**

Access control:
- Roles gate the nav links cosmetically; every action is re-checked on the server (`rbac.ts`).
- TOTP two-factor is required for every `/admin` route (`pages/TwoFactorGate.tsx`).

### 9.2 Content authoring tools

| Tool | Status | What it can do | What it cannot do |
|---|---|---|---|
| **Lessons** (`pages/Content.tsx`, 352 lines) | **PARTIAL** | Open a lesson **by pasting its UUID**. Create a lesson under a skill UUID. Edit `titleKu` and `titleEn`. Edit exercises as a **raw JSON textarea** (`:195`, `JSON.parse` at `:214`). Move it through draft → in_review → published → archived with optimistic locking. "New version" clones a published lesson. | List or browse lessons. Create courses, units or skills (JSON import only, `api/scripts/import-content.ts`). Edit grammar notes. Use per-type forms. Upload audio or images for `listening` `audioUrl`. Preview what learners see: `admin/src/preview.ts` builds "the same view-model the mobile player renders" but **nothing imports it**. Validate MC answer positions or shuffle. Localise prompts beyond `ku` and `en`. |
| **Quiz questions** (`pages/QuizQuestions.tsx`) | **BUILT** | Full CRUD for the realtime quiz bank: prompt, 4 options, `correctIndex`, category (`vocabulary` / `phrases`), level, and an active toggle. | Link a question to a course skill. See per-question accuracy. Attach audio or images. Bulk import. |
| **Rhyme editor** (`pages/RhymeEditor.tsx`, 649 lines) | **BUILT** | Curate prompt words. See the derived perfect and near rhymes per word. Override verdicts per pair (`perfect` / `near` / `none` / `auto`). Rebuild the prompt set with a dry run, which flags prompts with no partners. | Handle dialects beyond what each word carries. |
| **Race texts** (`pages/RaceTexts.tsx`) | **BUILT** | CRUD for title, body, language (`kmr`), length band 1-3 and the active flag, with character and word counts. | Set a reading level. 0 texts are seeded. |
| **Word pool / Wordle** (`pages/Games.tsx`) | **BUILT** | Add words. Promote a dictionary word into the game pool. Coverage by length and difficulty. Mark rhyme prompts. 79 seeded headwords (`api/migrations/1751000094000_seed-game-dictionary.js`). `docs/admin/dictionary-import.md` says "a few hundred", which is inaccurate. | — |
| **Dictionary import** (`pages/DictionaryImport.tsx`) | **BUILT** | Starts and monitors a resumable Wîkîferheng import for `ku` (about 447k), `sor` or `zza`, with progress, ETA and cancel. Limited to admin and superadmin. Imports never enter the game pool. | Edit an entry, sense or example. Upload audio per entry (`dict_audio` is fed only by the JSON lexicon import, `api/src/dictionary/import.ts:157`). |
| **Alphabet audio** (`pages/AlphabetAudio.tsx`, 455 lines, plus `audioClip.ts`) | **BUILT** | A studio for all 110 alphabet clips (`shared/src/alphabet-audio.ts`): record in the browser or upload a file. The pipeline decodes, converts to mono, resamples to 22.05 kHz, trims silence, levels loudness, adds fades and encodes WAV (at most 4 s). It walks to the next missing clip automatically. Deleting a recording restores the eSpeak clip. | Record audio for lesson exercises or dictionary words. This is the only audio-recording tool in the admin, and its pipeline could be reused for both. |
| **Word of the day** | **ABSENT** | — | No page and no route. `DictionaryRepository.addToWotdPool` (`api/src/dictionary/repository.ts:161`) is called only by `word-of-day.integration.test.ts`, so the pool cannot be filled in production. |
| **Library / literature curation** | **ABSENT as a page** | Admins can author through the normal app (`author_role` admin) and moderate through the queue. | Feature a post, tag its level, or build reading lists. |
| **Events** (`pages/Events.tsx`, `pages/Config.tsx`) | BUILT | Create and enable events (key, name, type, priority, theme, window). Config changes with currency rewards need approval from a second admin (`docs/admin/config-approval.md`). | Edit quests in the UI. Link an event to a mini-course from the UI (that is a JSON template, `docs/events/cultural-events.md`). |

### 9.3 Moderation

- **Unified queue** (`pages/Moderation.tsx`): claim a case, resolve it as dismiss / warn / mute / ban / remove, and see the SLA median (#102).
- **AI moderation** (`pages/AiModeration.tsx`): lists text flags and image flags, each of which can be upheld (`actioned`) or overturned (`reversed`).
  - The classifier is `HeuristicSpamClassifier` (`heuristic-spam-v1`). It scores link spam, scam keywords, character floods and shouting. Toxicity, hate, sexual content and self-harm score 0 until a hosted model is plugged in (`docs/security/ai-moderation.md`).
  - It is wired into chat sends, library posts and comments (`api/src/library/*routes.ts`) and image comments (`api/src/images/interaction-routes.ts:89`).
  - The image scanner is a stub (backend note §8).
- **Antibot, Fraud, Users and Audit** pages exist, but none of them shows learning data.

### 9.4 Experiments (`pages/Experiments.tsx`)

**PARTIAL.**
- It can list, create and toggle experiments with weighted variants (`control:1, treatment:2`).
- **It has no results view:** no exposure counts, no metric per arm, no significance test.
- The one seeded experiment, `daily_goal_default`, is never read by any client (§7).
- `docs/review/adaptive-difficulty.md` plans to ship adaptive SM-2 v2 behind an `adaptive_review` experiment. That is not wired.

### 9.5 Analytics (`pages/Analytics.tsx`)

**BUILT, with no data.**
- It shows DAU, WAU and MAU, sign-ups, two reach funnels (onboarding `screen_view → lesson_start → lesson_complete`, and lesson `lesson_start → lesson_complete`) and D1 / D7 / D30 retention. Rollups are refreshed daily (`docs/analytics/dashboards.md`).
- All of these count events from `analytics_events`, which no client sends.
- There are **no learning-quality metrics**: no item difficulty, no error rate per exercise, no review retention, no time-on-task, no lesson completion by skill.

### 9.6 Learner view

**ABSENT.** `pages/Users.tsx` shows the account, sessions, bans and economy adjustments, but **no XP history, no lessons, no skills, no accuracy and no review state**. There is no teacher, parent or class view.

---

## 10. Mobile vs web: learning features side by side

The web column is summarised from `hevalo_current_state_web.md`.

| Feature | Mobile (`mobile/`) | Web (`web/`) |
|---|---|---|
| Lesson player (6 exercise types) | **BUILT** | **ABSENT** (static mock "coming soon") |
| Course map with strength and decay | BUILT (first course only) | Course titles only, not clickable |
| Practice / SRS review | BUILT | ABSENT |
| Grammar notes | BUILT (inside a lesson) | ABSENT |
| Daily goal picker and ring | BUILT | ABSENT |
| Onboarding | BUILT (language, welcome, notification info) | ABSENT |
| Placement test | ABSENT (API built) | ABSENT |
| Alphabet (Kurmanji and Sorani, 110 clips, minimal pairs, "Check yourself") | **ABSENT** | **BUILT** (the strongest teaching module) |
| Dictionary (search, entry, bookmarks) | BUILT (no audio on native) | BUILT, plus a static public dictionary |
| Word of the day | Card exists, pool empty | — |
| Games | 6 (quiz, Wordle, Wordle Battle, Rhyme, Rhyme Match, Race) | 6 (same set) |
| Library reading with audio | BUILT (native audio) | BUILT |
| Voice notes (record) | BUILT (native) | — |
| Listening / speaking exercises | Web runtime only; broken on native | — |
| Offline | Dead code, plus a single-answer retry | ABSENT (no PWA) |
| Push / reminders | Stub token | n/a |
| Analytics / A/B calls | Dead code | None |
| Kids, parent, CEFR, AI tutor | ABSENT | ABSENT |

---

## 11. API paths the mobile app calls that touch learning

`/courses`, `/courses/:id/map`, `/lessons/:id/session`, `/sessions/:id/answers`, `/sessions/:id/complete`, `/practice/session`, `/practice/sessions/:id/answers`, `/practice/sessions/:id/complete`, `/me/daily-goal` (GET and PUT), `/me` (`skipSpeaking`), `/media/uploads`, `/dictionary/search`, `/dictionary/entries/:id`, `/dictionary/entries/:id/save` (PUT and DELETE), `/me/saved-words`, `/dictionary/word-of-day`, `/wordle/*`, `/rhyme/*`, `/race`, `/race/:id/finish`, `/matchmaking/*`, `/games/:roomId/*`, `/events/active`, `/events/:key/quests`, `/rewards/daily`, `/me/league`, `/leaderboards/:type`.

**Never called:**
- `/placement…`
- `/courses/:id/skill-strength`
- `/skills/:id/grammar`
- `/experiments`
- the analytics ingest
- `/alphabet/audio`
- achievements

---

## 12. Roadmap: tickets and docs about learning features

**Open issues (18 in total). The learning-relevant ones:**
- **#120 KUR-120 AI pronunciation scoring (speaking v2).** Milestone M6, "Scaling + AI". Calls for phoneme-level Kurmanji scoring with specific feedback such as "the 'x' sound in 'xanî'", p95 latency under 3 s, and a fallback to the stub.
- **#121 KUR-121 Personalized review and adaptive difficulty v2.** The model exists in `api/src/review/adaptive.ts`, with an offline evaluation gate, as described in `docs/review/adaptive-difficulty.md`. It is not wired into `ReviewService` and the planned A/B test does not exist.
- **#122 KUR-122 AI conversation tutor.** Calls for LLM-guided Kurmanji scenarios (greetings, market, family) with vocabulary limited to the learner's level, gentle inline corrections, new words added to the review queue, and a daily message cap. Priority low. Nothing is built.
- **#274 Onboarding Slide 3: Account, including guest mode.** Open.
- **#266 Accessibility sweep** and **#267 RTL for Arabic.** Open.
- **#279 App Store submission readiness.** Open. This blocks any real learner using the lesson player.

**Closed as "completed" but not wired into a client:**
- **#39** Placement test "at onboarding": the backend only.
- **#42** Offline lesson caching: the core classes only (PR #201 "— core").
- **#94** Push infrastructure: the token source is a TODO and the provider is a stub.
- **#105 / #106** Event tracking and dashboards: no client emits events.
- **#107** A/B framework: no client reads variants.
- **#100** "Content management (courses/lessons CRUD)": the admin can edit lessons only, by UUID, as JSON.
- **#46** Word of the day: no way to curate it.

**Docs-only plans:**
- `docs/events/cultural-events.md` lists future events (Yalda, Kurdish Language Day on 15 May, harvest) "without a deploy". Only Newroz exists.
- `docs/security/ai-moderation.md` plans a hosted multilingual classifier.
- `DEPLOY.md:172-175` notes the App Store category is set to **Entertainment**, not Education, because "Education invites questions about younger users and the Kids category rules". This is a deliberate step away from a kids positioning.

---

## 13. Important learning features searched for and NOT found

Searched in `mobile/src`, `mobile/App.tsx`, `admin/src`, `docs/`, `README.md`, `DEPLOY.md` and the GitHub issues. Grep terms included `kids|child|parent|birth|cefr|placement|tts|speech|asr|transcri|tutor|llm|openai|anthropic|fsrs|spaced|flashcard|leitner|alphabet|haptic|expo-notifications|expo-speech`.

| Feature | Result |
|---|---|
| Spaced repetition **UI** (due count, review forecast, flashcards) | ABSENT. Practice runs the server queue blind. There is no flashcard mode for saved words. |
| Mistake re-queue within a lesson | ABSENT (`player.ts:81-92`). |
| Showing the correct answer for mistakes on the results screen | ABSENT (`LessonResults.tsx:40-47`). |
| Hints, explanations, tap-to-gloss, image prompts | ABSENT (`lesson/types.ts` has no such fields). |
| Teaching or introduction phase before testing | ABSENT. |
| Speech recognition / pronunciation scoring | ABSENT. The server is a stub; issue #120 is open. |
| TTS (any) | ABSENT. No `expo-speech`; no speech permission (`docs/app-store/privacy.md:21`). |
| Native audio in lessons and dictionary | ABSENT. Only Library uses `expo-audio`. |
| Alphabet / phonics on mobile | ABSENT. Web only. |
| Placement test UI | ABSENT. API built; issue #39 closed. |
| CEFR or level mapping | ABSENT. No `cefr` anywhere. Quiz `level` 1-3 and race `difficulty` 1-3 are informal. |
| Kids mode, child profiles, parental controls, parent or teacher dashboard | ABSENT. No `birth`, `restricted_mode` or `parent` in clients. Age exists only as an optional self-declared profile tag (`docs/community/tags.md:32`). |
| Guest / try-before-signup | ABSENT. Issue #274 is open. |
| Offline lessons | DEAD CODE (`mobile/src/offline/*`). |
| Push and local reminders, "reviews due" nudges | STUB / ABSENT. |
| AI tutor, chat practice, LLM explanations | ABSENT. Issue #122 is open. |
| Dialect choice (Sorani course) for learners | ABSENT. No picker; only one course is shown. |
| Prompts translated into the learner's UI language (de/tr/ar…) | ABSENT. Content is `en`/`ku` only. |
| Learner progress analytics (words known, retention, time studied) | ABSENT on profile and in admin. |
| Content-quality analytics (item p-values, distractor analysis) | ABSENT in admin. |
| Admin lesson preview, form editor, media upload, course / unit / skill CRUD, grammar editor, WOTD curation | ABSENT (`preview.ts` unused). |
| Reading aids in the library (levels, glossary, comprehension questions) | ABSENT (`docs/community/library.md` follow-ups do not mention them). |
| Haptics and sound effects for feedback | ABSENT. No `expo-haptics`; no sound assets. |
| Achievements and badges for learning milestones | No mobile UI calls achievements. The backend note §2 says they are never awarded. |

---

## 14. Counts at a glance

| Item | Count | Source |
|---|---|---|
| Mobile tabs / named stack screens | 5 / 40 | `navigation/tabs.ts`, `App.tsx` |
| Exercise renderers on mobile | 6 (all types the API grades) | `lesson/components/*` |
| Exercise types usable on native iOS/Android | 4 (MC, translate, match, writing); listening and speaking broken | §3 |
| Hearts per lesson | 5 (client only) | `player.ts:4` |
| Kurdish special keys offered | 5 (`ê î û ç ş`), in writing only | `kurdishKeys.ts:4` |
| Daily goal options | 4 (10/20/30/50 XP) | `goals/format.ts:3` |
| Onboarding slides | 3 | `onboarding/flow.ts:14` |
| Notification categories | 5, none of them for learning | `notifications/prefs.ts:5` |
| Games on mobile | 6 | `screens/PlayScreen.tsx` |
| UI locales / keys per locale | 9 / 874 | `i18n/translations.ts` |
| Mobile test files | 60 | `find mobile/src -name '*.test.ts'` |
| Courses reachable on mobile | 1 (of 2 in the content) | `LearnScreen.tsx:60` |
| Seed course content | 15 lessons, 31 exercises, 0 audio | backend note §2 |
| Built-in quiz questions | 33 | backend note §2 |
| Seeded game word pool | 79 headwords | `api/migrations/1751000094000_seed-game-dictionary.js` |
| Alphabet clips (admin recordable) | 110 (`web/public/audio/alphabet/` has 110 files) | `shared/src/alphabet-audio.ts` |
| Race texts / WOTD pool seeded | 0 / 0 | backend note §2 |
| Admin top-level pages / Games sub-tabs | 18 / 5 | `admin/src/App.tsx:32-51`, `pages/Games.tsx:153` |
| Admin pages that author **lesson** content | 1 (raw JSON) | `pages/Content.tsx` |
| Open / closed GitHub issues | 18 / 145 | `gutskrd/Kurda` |
| Open issues that are learning features | 3 (#120, #121, #122), plus #274 (guest onboarding) | GitHub |

---

## 15. Where new learning features would plug in (mobile and admin)

**Native audio:**
- Swap `lesson/useAudio.ts` and `lesson/useRecorder.ts` to `expo-audio`, reusing `library/AudioPlayer.tsx` and `library/VoiceRecorder.tsx`.
- This unlocks listening, speaking and dictionary audio on phones.

**Offline:**
- Wire `offline/LessonCache`, `selectPrefetch` and `OfflineCompletionQueue` into `LearnScreen` and `SessionPlayer`.
- Add an AsyncStorage `KvStorage` adapter. `onboarding/storage.ts` already shows the lazy-require pattern.

**Push:**
- Add `expo-notifications` and implement `getPushToken()`.
- Add a "learning / reviews due" category to `NOTIFICATION_CATEGORIES`.
- Add a `Practice` and `Lesson` target to `resolveDeepLink`.

**Onboarding:**
- Add slides to `ONBOARDING_STEPS`: goal, level, placement, dialect, reason, age. The reducer is pure and tested.
- Call the existing placement API.

**Lesson player:**
- Extend `Exercise` with `hint`, `image` and `explanation`.
- Re-queue wrong items in `player.ts`.
- Show `correction` on `LessonResults`.
- Add the Kurdish key bar to `TranslateExercise` and `ListeningExercise`.
- Shuffle MC options, client-side or (better) on the server.

**Instrumentation:**
- Instantiate `AnalyticsTracker` and `ExperimentClient` once in `App.tsx`.
- Emit the 8 registered events. This makes the admin funnels and A/B testing real.

**Admin:**
- Turn `preview.ts` into a live preview inside `Content.tsx`.
- Add per-type forms and a lesson, course and skill browser.
- Reuse the `AlphabetAudio` and `audioClip.ts` recording pipeline for exercise and dictionary audio.
- Add WOTD curation, which needs a route over `addToWotdPool`.
- Add item-difficulty reports.
- Add an Experiments results panel.
