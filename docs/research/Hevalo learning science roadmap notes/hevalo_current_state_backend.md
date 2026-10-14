# Hevalo — current learning features (backend and data model)

Branch `claude/tender-ptolemy-1m29c7` (HEAD `43a5681`), read on 2026-10-06. Scope: `api/` (src, migrations, content, scripts, seeds), `shared/`, `docs/`. I checked the clients (`mobile/`, `web/`, `admin/`) only to confirm whether a backend feature is actually used. Nothing was modified.

Status labels: **BUILT** (works end to end in the API), **PARTIAL** (some of it exists: code without content, logic without wiring, or a stub), **ABSENT** (searched for and not found). "Docs-only" means a plan or comment with no code behind it.

---

## 0. TL;DR

- The **engine is good, but there is very little to learn.** The course model, server-side grading, SM-2 spaced repetition, adaptive placement, a skill map with strength and decay, offline sync, XP/streak/goal/league/gem/quest economies, analytics, A/B bucketing and GDPR are all built and tested.
- **The course content is tiny.** One Kurmanji beginner course has 3 units, 8 skills, 15 lessons, 31 exercises and about 43 distinct Kurmanji words or phrases. A Newroz mini-course adds 3 lessons and 9 exercises. That is about 2 exercises per lesson. The seed has **0 listening and 0 speaking exercises**. Content is **not loaded automatically** on deploy: it goes in only through the manual `npm run content:import … --publish`.
- **Spaced repetition is plain SM-2 per exercise, not per word.** A personalised "adaptive v2" module exists but nothing calls it outside its tests. There is no FSRS, and no review log rich enough to train one: no latency, no raw answer, no state before the review.
- **Speech:** the speaking exercise uses a stub scorer that passes every recording. There is no ASR, no runtime TTS and no LLM anywhere. The only learner audio is 110 eSpeak-NG-synthesised alphabet clips, which admins can replace with real recordings.
- **Kids and parents:** nothing exists. `birth_date` and `restricted_mode` exist, but clients never send a birth date and no code reads `restricted_mode`. There is no kids mode, no parent dashboard and no parental consent flow.
- **Analytics and experiments:** the pipeline exists, but **no client emits events** (the repo admits this in a migration comment). The one seeded experiment (`daily_goal_default`) is never applied anywhere.
- **Notifications:** only streak reminders, written in English, delivered through a **stub push provider** (no real FCM/APNs). Nothing is triggered by learning state (for example "reviews due").
- **Learning-quality defects found by reading the code:**
  1. All 15 seeded multiple-choice items have the correct answer at index 0, and options are never shuffled.
  2. Practice sessions will likely error once a saved dictionary word enters the review queue.
  3. Daily-Wordle XP is keyed globally, so only the first player each day is credited.
  4. Achievements are defined but never awarded.
  5. Skill "decay" never happens from time passing alone.

---

## 1. How lessons and exercises are modelled

**Hierarchy:** `courses → units → skills → lessons → exercises`.

- Defined in `api/migrations/1751000016000_content-schema.js`.
- `courses.dialect` is free text, default `'kurmanji'` ("sorani/zazaki later").
- Every level carries `title_ku` and `title_en` only. There are no titles in other UI languages.
- `skills.grammar_md` holds one markdown grammar note per skill (`1751000027000_grammar-notes.js`), served at `GET /skills/:id/grammar` and inside the session view.

**Lesson versioning and workflow — BUILT.**

- Published lessons and exercises are immutable, enforced by DB triggers. Editing means cloning to `version+1`.
- Statuses are `draft → in_review → published → archived`, with optimistic locking (`1751000057000_content-review-workflow.js`).
- Admin authoring (`api/src/content/admin-routes.ts`, `admin/src/pages/Content.tsx`) can edit lesson titles and exercises, but **exercises are edited as raw JSON text** (`Content.tsx` ~l.195).
- There is **no admin API for creating courses, units or skills**. Those come only from the JSON import (`api/scripts/import-content.ts`, `api/src/content/import.ts`).

**Exercise types — 6 in the DB CHECK constraint and in `api/src/content/exercises.ts`:**

| type | payload | answer | grading | status |
|---|---|---|---|---|
| `multiple_choice` | prompt, 2–6 options, `correctIndex` | `{choice}` | exact index | BUILT. **Options are not shuffled** (`exercises.ts:156-161`, "options stay in authored order"). |
| `translate` | prompt, `accepted[]` (≤12) | `{text}` | NFC + lowercase exact → `correct`; match after folding diacritics (ê→e, ş→s …) → `typo` (accepted with a nudge); otherwise `wrong` (`gradeText`, l.224-236) | BUILT |
| `match_pairs` | 2–8 pairs | `{matches[]}` | all pairs right or nothing (no partial credit) | BUILT; sides shuffled per session with a seed |
| `listening` | `audioUrl`, optional prompt, `accepted[]` | `{text}` | transcription graded like `translate` | BUILT in code; **0 items in content**; audio is whatever URL an author supplies |
| `speaking` | prompt, `reference` | `{audioKey}` (uploaded via `POST /media/uploads`) | `StubPronunciationScorer` **always passes** (`api/src/content/speaking-scorer.ts:27`); the real model is ticket "KUR-120", absent | PARTIAL / stub; **0 items in content**; `users.skip_speaking` opt-out |
| `writing` | prompt, `accepted[]` | `{text}` | like translate, also ignores punctuation; copying the prompt back earns no credit | BUILT |

**Feedback on an answer:**

- The answer response returns only `verdict` (`correct | typo | wrong`), `accepted` and a `correction` (the first accepted answer).
- There is no per-exercise explanation or hint, and no error-specific feedback.
- Grading is always server-side, and the answer key never reaches the client.

**Hearts:** 5 per lesson, **client-only** (`mobile/src/lesson/player.ts:4`). Not enforced on the server.

**Wrong answers are not re-queued within a lesson.** Each exercise is answered once, and the first answer wins (`session_answers` PK).

**Where lessons can be played:**

- Only the mobile app has a lesson player (`mobile/src/lesson/LessonPlayerScreen.tsx`, `mobile/src/practice/PracticeScreen.tsx`).
- The web `Learn` page (`web/src/pages/Learn.tsx`) lists courses and shows a mock lesson; it has no player.
- Offline use: the mobile app prefetches the next 5 lessons and queues offline answers, which the server re-grades on sync (`mobile/src/offline/*`, `mobile/src/lesson/queue.ts`). **BUILT (client side).**

---

## 2. How much content exists (counted)

| Source | Units | Skills | Lessons | Exercises | Notes |
|---|---|---|---|---|---|
| `api/content/kurmanji-seed.json` ("Kurmanji for Beginners") | 3 | 8 | 15 | 31 | Types: 10 MC, 11 translate, 7 match, 3 writing, **0 listening, 0 speaking**. 7/8 skills have a grammar note. About **43 distinct Kurmanji targets** (greetings, pronouns, numbers 1-10 partial, family, food, colours, time words). |
| `api/content/events/newroz-lesson.json` ("Newroz") | 1 | 2 | 3 | 9 | Cultural mini-course; 5 MC, 3 translate, 1 match. |
| **Total course content** | 4 | 10 | **18** | **40** | **All 15 MC items have `correctIndex: 0`.** Combined with no shuffling, the right answer is always the first option. |

More about the course content:

- **Seeding:** `api/seeds/` contains only a README ("First real seed content arrives with the Kurmanji course import"). `api/start.sh` runs migrations only. **Nothing loads the course on deploy**, so whether production has any lessons depends on someone having run the import by hand.
- **Prompt languages:** English or Kurmanji only. There are no Turkish, Arabic, German or other source-language versions, even though the UI has 9 locales (`shared/src/locales.ts`).
- **Exercise direction:** translate items are English → Kurmanji (production). MC items are mostly Kurmanji → English (recognition).

Other learning-adjacent content:

| Item | Count | Where |
|---|---|---|
| Built-in quiz-game questions | **33** (vocabulary/phrases, levels 1–3, 4 options each; correct index varies) | `api/src/game/question-bank.ts`; admin-editable copy in `quiz_questions` (`1751000098000`) |
| Seeded game word pool (Kurmanji headwords) | **79** | `api/migrations/1751000094000_seed-game-dictionary.js` |
| Dictionary | 0 seeded; import from Wîkîferheng (~447,000 Kurmanji entries; also Sorani `sor` and Zazaki `zza`) via admin panel or script | `api/scripts/import-ferheng.ts`, `shared/src/ferheng*.ts`, `api/src/dictionary/import-runner.ts`. The imported glosses are **Kurdish-only** (no English definitions, examples or audio from this source). |
| Word-of-the-day pool | 0 seeded (needs ≥90 curated by admin) | `1751000030000_word-of-day.js`, `api/src/dictionary/word-of-day*.ts` |
| Typing-race texts | 0 seeded (admin-curated) | `1751000100000_race-game.js` |
| Alphabet sounds (shared list) | **110** clips: 31 Kurmanji letters, 31 Kurmanji example words, 6 Sorani-only sounds, 34 Sorani words, 8 minimal pairs | `shared/src/alphabet-audio.ts`; **110 MP3s** in `web/public/audio/alphabet/` |
| Achievements defined | 6 | `api/src/achievements/service.ts:21-28` |

---

## 3. Spaced repetition and review

**SM-2 scheduler — BUILT.**

- Code: `api/src/review/sm2.ts`, a textbook SM-2. Interval goes 1 day → 6 days → interval × EF on a pass; a lapse resets to 1 day; EF floor is 1.3.
- Verdicts map to quality: correct=5, typo=4, wrong=2 (`sm2.ts:58-67`). There is no "hard"/"easy" self-rating and no latency signal.

**State table** `review_items(user_id, item_id, repetitions, interval_days, easiness, due_at, last_reviewed_at, created_at)`, from `1751000022000_review-items.js` and `1751000031000_saved-words.js`.

- `item_id` is an **exercise UUID**, or `dict:<entryId>` for saved dictionary words.
- **Items are not linked to words or lexemes.** The same word in two exercises is two separate items. A new lesson version (new exercise ids) starts a fresh review history.

**What feeds it:**

- Every first answer in a lesson session (`api/src/content/sessions.ts:239`) and every practice answer (`practice/service.ts`).
- Saving a dictionary word (`api/src/dictionary/saved-words-service.ts`, capped at 10 new words per local day).
- **Placement answers and game answers (quiz, Wordle, rhyme, race) do not feed it.**

**How reviews are scheduled — a quality issue.**

- `ReviewService.record` treats *any* answer as a scheduled review, whatever the elapsed time.
- Replaying a lesson the same day, or the "weak item" padding in practice (which pulls items that are not yet due), advances repetitions and stretches intervals. Massed repetitions are counted as spaced ones.
- `due_at` is `now + N×24h`, not aligned to the learner's local day.

**Review queue:** `GET /review/queue` returns up to 20 due items, most overdue first (`api/src/review/service.ts:113`).

**Practice mode — BUILT, with a likely bug.**

- `POST /practice/session` builds a 10-item session from due items; if fewer than 4 are due, it pads with the lowest-easiness items (`api/src/practice/practice-select.ts`). Completing it earns 50% of lesson XP and counts for the streak and daily goal.
- **Likely defect:** `PracticeService.loadExercises` runs `WHERE id = ANY($1::uuid[])` (`api/src/practice/service.ts:122`). The candidate list can contain `dict:<uuid>` ids, both from the due queue and from the weak-item padding query (l.88-93, which does not filter out `dict:` ids). Postgres rejects that cast with "invalid input syntax for type uuid".
- So any learner who has saved a dictionary word will probably get a 500 from practice. Saved words also have no exercise representation to be practised with.
- Confidence: high from reading the code; not executed.

**"Adaptive review v2" — PARTIAL (code only, not wired).**

- `api/src/review/adaptive.ts` holds a per-user ±20% EF modifier around 0.85 target recall, an exponential forgetting curve and an offline evaluation gate. `docs/review/adaptive-difficulty.md` describes it.
- **Nothing outside tests calls it.** The doc says wiring it into `ReviewService` behind an experiment "is the rollout step", and that step has not happened.

**Review logs — PARTIAL.**

- What is stored:
  - `session_answers` (lesson) and `practice_answers`: `(session, exercise, verdict, accepted, answered_at)`, one row per exercise per session (`1751000018000`, `1751000023000`).
  - `placement_sessions.history` as JSON `[{level, correct}]`.
  - `wordle_games.guesses`.
- What is not stored: the raw answer text, response time, hint or replay use, and SM-2 state before or after the review.
- A basic per-item (timestamp, pass/fail) sequence could be rebuilt by joining the answer tables. That would be enough to bootstrap FSRS with 2-grade ratings, but the data is thin.

**FSRS, Leitner, half-life regression:** ABSENT (grepped `api/src`, `shared/src` and migrations for `fsrs`, `leitner`, `half.?life`).

---

## 4. Adaptivity, placement and progression

**Placement test — BUILT.**

- Files: `api/src/placement/placement.ts` and `service.ts`, migration `1751000028000_placement.js`.
- It is a staircase walk over **skill positions**: +1 level on a correct answer, −1 on a wrong one, at most 12 questions, stopping early after two wrongs at level 1. The learner is placed at the highest level answered correctly, and `user_course_progress.unlocked_through_position` is written only on completion.
- Limitations:
  - Each level always draws the **same single question**: the first exercise of the first published lesson of that skill (`service.ts:70-82`, `LIMIT 1`). A re-visited level repeats the identical item.
  - One correct answer at the top level is enough to unlock everything below it.
  - There is no confidence or IRT model, and it is not offered during onboarding (`mobile/src/onboarding/flow.ts` steps are language → welcome → notifications).

**Skill strength — BUILT.**

- `api/src/placement/skill-strength.ts`: strength = 0.6 × normalised EF + 0.4 × min(reps/5, 1), averaged over the skill's exercises. Endpoint: `GET /courses/:id/skill-strength`.

**Course map — BUILT.**

- Files: `api/src/coursemap/node-state.ts` and `service.ts`. Nodes are `locked / unlocked / completed / gold (≥80) / decayed (<40)`.
- The path is linear: a skill unlocks when the previous one is complete, or when placement tested out of it.
- **"Decay" never happens from time passing.** Strength is computed from EF and repetitions only, which change only when the learner answers. A completed skill left alone for months stays "gold" and never cracks. Only wrong answers lower strength.

**Difficulty adaptation inside lessons:** ABSENT. Order is fixed by position; there is no item difficulty, no branching and no remedial loop.

**Next-lesson suggestion** (empty practice): the oldest published lesson not yet completed, ordered by `created_at` rather than course order (`practice/service.ts` `nextLesson`).

**CEFR / proficiency levels:** ABSENT. No CEFR fields on content or users; the only "level" is skill ordinal, or 1–3 for game items.

---

## 5. Motivation and economy rules

| System | Rules | Status / file |
|---|---|---|
| **XP** | Lesson = 10 + round(10 × accuracy), so 10–20. A repeat of an already-completed lesson pays 25% (min 1). Practice pays 50% of lesson XP. Quiz game: 15, +15 for 1st place. Wordle daily win: 100/80/60/50/40/30 by guess count; loss 10; practice games 50%. Rhyme training: 5 per rhyme, capped at 30. Race: 5 plus a share of the score. All awards go through the append-only `xp_ledger`, idempotent on `(source, ref_id)`. | BUILT — `api/src/xp/service.ts`, `api/src/game/game-rewards.ts`, `wordle-daily.ts:77-91`, `rhyme-service.ts:17-18`, `race.ts:106` |
| **XP bug** | Daily Wordle uses `refId = daily:<dayIndex>` (`wordle-service.ts:245`), but the unique key is `(source, ref_id)` **across all users** (`1751000019000_xp.js`). Only the first user to finish the daily Wordle each day gets ledger XP; everyone else silently gets 0, while the UI is still told XP was awarded. | Likely defect (read, not executed) |
| **Streak** | One per local calendar day (user timezone, DST-safe). Extended by **any** lesson or practice completion, or a **daily Wordle win**. Not tied to meeting the daily goal, despite comments saying "goal-meeting activity". Max 1 stored freeze, which auto-covers a single missed day. Timezone change limited to once a week. | BUILT — `api/src/streaks/streak-logic.ts`, `service.ts`. **No way to earn a freeze:** `StreakService.grantFreeze` has no caller. A `freeze` shop category exists in the schema (`shop/routes.ts:14`), but nothing grants a freeze from a purchase. |
| **Daily goal** | 10/20/30/50 XP per day (default 20). Judged against the lowest goal in force that day. Counts XP from **all** sources, games included. The Zêr reward for meeting it is off (`GOAL_REWARDS_ENABLED = false`, `goals/service.ts:13`). | BUILT (goal); reward PARTIAL |
| **Leagues** | Weekly (Monday–Sunday UTC). Learners join a 30-person cohort lazily on any XP gain. 10 tiers (Bronze → Diamond). Top 10 promote, bottom 5 demote, and nobody demotes if the cohort has fewer than 10. Promotion pays 25 Gems. Weekly XP includes game XP. | BUILT — `api/src/leagues/league-logic.ts`, `service.ts` |
| **Leaderboards** | `rating` (Elo from quiz games) and `weekly_xp`; scopes are global, friends and country (Redis, rebuilt every 5 min). | BUILT — `api/src/leaderboards/` |
| **Seasons** | Quarterly soft rating reset (halves the distance from 1000); end-of-season Gems by peak tier. | BUILT — `api/src/seasons/` |
| **Currencies** | **Zêr** (soft): daily login claim on a 7-day escalating cycle 10/15/20/25/30/40/100 that resets after a missed day (`rewards/daily-cycle.ts`), plus event quests. **Gems** (premium): config-driven `gem_rules` — perfect_lesson 5 (cap 50/day), league_promotion 25, tournament_win 50, achievement_milestone 15 (cap 100) (`1751000040000_gem-rules.js`). Wallet ledger is append-only. Shop, IAP and fraud detection exist. | BUILT. The daily Zêr claim is not tied to learning (claiming alone counts). |
| **Achievements** | 6 defined: streak-30, first-perfect, words-1000, first-game-win, tournament-win, newroz-2026. | **PARTIAL — never awarded.** `AchievementsService.award` has no caller in `api/src` (only list/unseen/seen routes). |
| **Event quests** | `earn_xp / win_games / complete_lessons` over an event window, with a 72h claim grace period. Newroz template at `api/content/events/newroz.json` (seeded by hand via `events:seed`). | BUILT — `api/src/events/quest-*.ts` |
| **Economy monitoring** | Daily faucet/sink rollups with drift alerting. | BUILT — `api/src/economy/` |

---

## 6. Games (learning-relevant view)

**Modes — all BUILT, server-authoritative and anti-cheat checked:**

- Realtime quiz: 1v1, 2v2, free-for-all up to 8; ranked Elo; private rooms; rematch; friend challenges; tournaments.
- Wordle: daily and practice, easy (4 letters), medium (5), hard (6–8).
- Wordle Battle (multiplayer).
- Rhyme training (solo) and Rhyme Match (1v1/FFA), with Kurmanji and **Sorani** dialects.
- Typing race (solo time trial).
- Code: `api/src/game/*`, `api/src/tournament/`, `api/src/ranking/elo.ts`.

**How the games relate to learning:**

- Quiz questions are **not linked to the course or to what the learner knows**. The 33-question bank is chosen by a deterministic hash; the only filter is a category or level picked by a private-room host. The code comment says course-linked selection "eventually", via KUR-026/041.
- **Game results do not feed spaced repetition or skill strength.**
- Games do earn XP, which counts toward the daily goal and leagues. A daily Wordle win also extends the streak. So a learner can keep their streak and league position without doing any lessons.

---

## 7. Dictionary, reading, alphabet

**Dictionary — BUILT** (`api/src/dictionary/*`; migrations `1751000029000`, `…113000`–`…118000`).

- Entries → senses (part of speech, `definition_en` and/or `definition_ku`) → examples, plus audio URLs and cross-references.
- Full-text and diacritic-folded prefix search, rhyme key, letter count.
- Import runs are tracked and resumable from the admin panel.
- `dict_audio` exists, but the Wîkîferheng source supplies none, so no dictionary audio is seeded.

**Saved words → SM-2:** BUILT, but see the practice bug in §3. The `dict:` items have no exercise to be practised with.

**Word of the day:** BUILT; the pool is empty until an admin curates it.

**Community library** (stories, poems, "gotin" short posts; optional voice audio; comments, likes, reposts) — BUILT (`api/src/library/*`, `1751000072000`, `1751000104000`).

- This is user-generated Kurdish reading material.
- **No level or difficulty tag, no tap-to-gloss, no comprehension questions, and no link to known vocabulary.**

**Alphabet page** (Kurmanji + Sorani, minimal pairs, "Check yourself" quiz) — BUILT on the **web frontend** (`web/src/alphabet/*`, `web/src/pages/Alphabet.tsx`).

- Backend: `GET /alphabet/audio` plus admin `PUT/DELETE /admin/alphabet/audio` to replace synthesised clips with recordings (`api/src/alphabet/routes.ts`, `1751000119000_alphabet-audio.js`).
- Quiz results are not stored server-side.

---

## 8. Audio, TTS, ASR, AI

| Capability | Status | Evidence |
|---|---|---|
| Pre-recorded or synthesised audio | **PARTIAL.** 110 alphabet MP3s generated offline with **eSpeak NG**, IPA-verified (`web/scripts/alphabet-audio/generate.py`), replaceable by admin recordings. **0 audio in course content.** | `web/public/audio/alphabet/` (110 files) |
| Runtime TTS | **ABSENT** | No TTS SDK in `api/`, `mobile/`, `web/`, `admin/` (grepped `tts`, `speechSynthesis`, `expo-speech`, `polly`, `elevenlabs`, `azure`). The generator header notes "No browser ships a Kurdish voice". |
| Speech recognition / pronunciation scoring | **ABSENT (stub).** `StubPronunciationScorer` always returns `pass: true` (`api/src/content/speaking-scorer.ts:27`). Recordings are uploaded and stored but never analysed. | Real model = "KUR-120" (ticket only) |
| Voice recording | BUILT (speaking exercises; library voice notes via `expo-audio`) | `mobile/src/lesson/useRecorder.ts`, `api/src/media/voice-routes.ts` |
| LLM / generative AI | **ABSENT** | No `openai`, `anthropic`, `gemini` or `llm` dependency or call anywhere. "AI moderation" (`api/src/moderation/ai-service.ts`) is a pluggable **heuristic** spam/scam classifier; image scanning is a stub that returns clean. |
| AI tutor, chat practice, conversation partner, explanation generation | **ABSENT** | — |

---

## 9. Analytics and experimentation

**Event pipeline — BUILT on the server, UNUSED by clients.**

- Server: `POST` ingest with schema registry (`api/src/analytics/registry.ts`) validates 8 event types: `screen_view, lesson_start, lesson_complete, practice_complete, game_start, game_finish, purchase, experiment_exposure`. Events are deduplicated by client event id and partitioned by day.
- Clients: `mobile/src/analytics/tracker.ts` exists, but **no screen calls it**.
- `1751000095000_user-activity-days.js` says it directly: "no client emits them, so the activity dashboard could never show anything".
- **The event schema has no per-answer or per-exercise events.**
- **`analytics_consent`** (default false, intended to gate EU analytics) is stored but **not checked** by `AnalyticsService.ingest`.

**Dashboards — BUILT** (`api/src/analytics/dashboard-service.ts`, `docs/analytics/dashboards.md`).

- DAU/WAU/MAU come from presence-heartbeat `user_activity_days`, so they work.
- D1/D7/D30 retention and the `onboarding`/`lesson` funnels come from `analytics_events`, so they are effectively empty.
- There are no learning-outcome metrics (retention of material, accuracy over time, time to mastery).

**A/B experiments — PARTIAL.**

- Built: deterministic SHA-256 bucketing per (user, key), weighted variants, kill switch, exposure logging, admin page (`api/src/experiments/*`, `admin/src/pages/Experiments.tsx`).
- One seeded experiment, `daily_goal_default` (20 vs 30), is enabled at 50/50, but **no code reads it**: new users always get the DB default of 20.
- `mobile/src/experiments/client.ts` exists with no call sites.
- There is no metric or analysis layer (no significance testing, no guardrails).

---

## 10. Notifications

**Streak reminders — BUILT logic, STUB delivery** (`api/src/notifications/streak-reminder*.ts`).

- Runs hourly. Each user is reminded at the mode of their historical XP hour in local time (fallback 19:00), plus a "last chance" nudge at 22:00 for streaks of 7 or more.
- It fires only if the streak is ≥1 and the user has not practised today. Sends are logged so each one goes out once.
- Copy is **hard-coded English** and loss-framed ("Don't lose your streak! 🔥").

**Push delivery:** `createPushProvider` always returns `StubPushProvider` (`api/src/push/provider.ts:52`), so **no real FCM/APNs pushes are sent**. Notifications still land in the in-app inbox (`api/src/notifications/inbox-service.ts`).

**Preferences — BUILT:** categories streak/friends/games/events/marketing (marketing opt-in) plus quiet hours (`notifications/prefs.ts`).

**Absent:**

- Reviews-due or forgetting-based nudges.
- Re-engagement for lapsed users: streak-0 users are never contacted.
- Weekly progress or learning-summary push and email. Email templates are auth and deletion only (`api/src/email/templates.ts:7-14`; locales `en`, `ku`).
- Goal-reached and friend-activity learning nudges.

---

## 11. Age, child accounts, consent, privacy

- **Age gate — PARTIAL, effectively ABSENT.**
  - `users.birth_date` and `users.restricted_mode` exist (`1751000010000_consent.js`).
  - Registration accepts an optional `birthDate` (`api/src/auth/routes.ts:44`) and sets `restricted_mode` if the user is under 16 (`api/src/gdpr/consent.ts`, `auth/service.ts:355-362`).
  - But **no client sends `birthDate`** (no match in `mobile/src`, `web/src`), and **nothing reads `restricted_mode`** to restrict chat, DMs, profile visibility or feeds (grep across `api/src` and the clients finds only the column in the `/me` DTO).
- **Child accounts, kids mode, parental consent (COPPA/GDPR-K), parent or teacher dashboards, classroom or family plans:** ABSENT (grepped for `parent|guardian|coppa|child|kids|classroom|teacher|family`).
- **Exposure:** the open social features (DMs, group chat, public feed, image and meme posts, comments) are available to every account. Safety relies on the wordlist filter, the heuristic classifier, trust levels, reports and the moderation queue (`api/src/moderation/*`, `api/src/trust/`).
- **GDPR — BUILT.** Versioned consent; 14-day deletion grace then anonymisation; data export.
  - The export (`api/src/gdpr/service.ts:113-130`) includes the profile, refresh tokens and OAuth links only.
  - **Learning data is excluded from the export:** review state, sessions, XP, streaks.

---

## 12. Kurmanji vs Sorani

| Area | Kurmanji | Sorani |
|---|---|---|
| Courses / lessons | 2 courses, 18 lessons | **0.** `courses.dialect` supports it; no content. |
| Answer normalisation | Latin diacritic folding (`shared/src/kurdish-text.ts`) | **None.** No Arabic-script normalisation (ي/ی, ك/ک, ه/ە, ZWNJ, etc.), so Sorani answers would need exact matches. |
| Dictionary | Wîkîferheng `ku` import | Wîkîferheng `sor` import supported (`FERHENG_LANGS`) |
| Games | Wordle (79-word seed), quiz, rhyme, race (`language` default `kmr`) | Rhyme training and match support `sorani`; no Sorani Wordle or quiz content |
| Alphabet | 31 letters + 31 words | 6 Sorani-only sounds + 34 words; minimal pairs |
| UI locale | `ku` | `ckb` (RTL) — one of 9 UI locales |
| Learner chooses which dialect to learn | — | ABSENT (no `target_dialect` or similar on `users`) |

---

## 13. Social (brief)

All BUILT: friends with requests and expiry; 1:1 DMs; groups/clubs with group chat and group weekly XP; activity feed (achievements and league promotions — note that achievements never fire); community feed of library, image and meme posts; tags and badges; presence; reports; moderation queue.

- **Learning-specific social features are ABSENT:** friend streaks, friend quests, co-op lessons, peer correction, and tutor/learner matching.
- Friend challenges exist only for quiz games.

---

## 14. Important learning features searched for and NOT found

Searched `api/src`, `api/migrations`, `shared/src`, `docs/` (plus client confirmation greps):

| Feature | Status | Where I looked / notes |
|---|---|---|
| Modern SR (FSRS, half-life regression) | ABSENT | `api/src/review` has SM-2 only; `adaptive.ts` is not wired |
| Word or lexeme-level knowledge model | ABSENT | `review_items.item_id` = exercise id; `dict:` ids unused by practice |
| Rich review log (latency, answer text, prior state) | ABSENT | `session_answers`, `practice_answers` schemas |
| In-lesson mistake re-queue / mastery loop | ABSENT | `content/sessions.ts` (one answer per exercise), `mobile/src/lesson/player.ts` |
| Explanations / hints / error-specific feedback | ABSENT | `CheckResult` = verdict + correction only |
| MC distractor shuffling | ABSENT (and all seeded keys are index 0) | `exercises.ts:156-161`; no `shuffle` in `mobile/src` |
| Item difficulty / IRT / calibrated placement | ABSENT | `placement/*` (one fixed item per level) |
| CEFR mapping / can-do statements | ABSENT | grep `cefr`, `A1`, `B1` |
| Listening and speaking content | ABSENT (types exist, 0 items) | seed JSON counts |
| Pronunciation scoring / ASR | ABSENT (stub always passes) | `speaking-scorer.ts` |
| Runtime TTS / audio for every lesson item | ABSENT | no TTS dependency; `listening.audioUrl` author-supplied |
| AI tutor / LLM conversation / generated exercises | ABSENT | no LLM dependency or calls |
| Stories / graded readers with comprehension | ABSENT (library is free-form UGC, no levels) | `library_posts` schema |
| Kids mode / age-appropriate path | ABSENT | — |
| Parent / teacher dashboard, classroom | ABSENT | — |
| Enforced minor protections | ABSENT (flag stored, never read) | `restricted_mode` grep |
| Learner goal or motivation onboarding (why learning, heritage vs new) | ABSENT | `mobile/src/onboarding/flow.ts`; no `users` columns |
| Native/source-language-specific courses (TR/AR/DE→KU) | ABSENT | content has `*_ku`/`*_en` only |
| Sorani course content | ABSENT | — |
| Time-based skill decay | ABSENT (decay only on wrong answers) | `placement/skill-strength.ts`, `coursemap/node-state.ts` |
| Review-due / re-engagement notifications | ABSENT | `notifications/*` (streak only) |
| Real push delivery | ABSENT (stub provider) | `push/provider.ts:52` |
| Client analytics emission / learning-outcome metrics | ABSENT | `mobile/src/analytics/tracker.ts` has no callers |
| Experiment actually driving behaviour | ABSENT | `daily_goal_default` never read |
| Achievement triggers | ABSENT | no `AchievementsService.award` caller |
| Streak-freeze earn/purchase path | ABSENT | `grantFreeze` has no caller |
| Offline mode | **PRESENT** (mobile prefetch + offline answer queue, re-graded on sync) | `mobile/src/offline/*`, `mobile/src/lesson/queue.ts` |
| Placement test | **PRESENT** (simple staircase) | `api/src/placement/*` |

---

## 15. Extension seams (where new learning features would plug in)

- **New exercise type:** widen the CHECK constraint (pattern: `1751000024000`–`…26000`), add a schema, answer schema, `sanitizeExercise` and `checkAnswer` case in `api/src/content/exercises.ts`, then add a mobile component under `mobile/src/lesson/components/`.
- **Pronunciation or ASR:** implement `PronunciationScorer` (`api/src/content/speaking-scorer.ts`) and swap `defaultScorer`. Recordings are already uploaded with their storage key.
- **Better SR:** `ReviewService.record` (`api/src/review/service.ts`) is the single write path for lessons and practice; `adaptive.ts` and the experiment service are ready for a gated rollout. Add a `review_log` table (rating, elapsed days, latency, state before and after) to enable FSRS fitting.
- **Experiments:** `ExperimentService.variant(userId, key)` exists; it only needs call sites (for example, a daily-goal default at registration).
- **Analytics:** add event types to `EVENT_SCHEMAS` (`api/src/analytics/registry.ts`) and call `tracker.track` in the mobile screens. Answer-level events would also enable learning dashboards.
- **Notifications:** `StreakReminderService` is the pattern for an hourly, local-time, idempotent job. A "reviews due" job can reuse `ReviewService.queue(...).dueCount`. Real delivery needs `createPushProvider` wired to FCM/APNs or Expo.
- **Content scale:** the JSON import format (`api/content/kurmanji-seed.json`, `api/src/content/import.ts`) is the bulk-authoring path. The admin UI is raw JSON, so a form-based editor would help non-technical authors.
- **Kids:** `birth_date` and `restricted_mode` are the hooks. They need collection in the clients, enforcement in chat, social and feed routes, and a guardian model.
