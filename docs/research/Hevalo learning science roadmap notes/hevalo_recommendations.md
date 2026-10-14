# Hevalo: what to change and add so people learn better, faster, and remember more

Prioritised recommendations built from the research notes in this folder. Written 6 October 2026 against branch `claude/tender-ptolemy-1m29c7` (HEAD `43a5681`). All file paths are relative to the repository root.

---

## How to read this document

**Sources.** The document draws on 11 topic notes, 11 adversarial fact-checks (`*_verification.md`) and 3 product inventories (`hevalo_current_state_*.md`). Where a fact-check refuted, softened or flagged a claim, this document follows the fact-check. In the research run nobody read a full paper. Every number comes from abstracts or search summaries, and many were never independently confirmed. Treat the numbers below as planning aids, not promises. Appendix A lists the claims that were dropped or downgraded.

**Evidence labels used in every recommendation:**

| Label | Meaning |
|---|---|
| **Strong** | Several meta-analyses or large trials agree, and the fact-checks did not undermine the core finding. |
| **Moderate** | One meta-analysis or a few experiments, or a claim the fact-check marked "overstated" whose core still holds. |
| **Weak** | Observational, vendor-reported, expert opinion, a single small study, or unverified. |
| **Speculative** | A design inference with no direct evidence. Build it only as an experiment. |
| **Defect** | Confirmed by reading Hevalo's code. No research needed. |
| **Regulatory** | Law or regulator guidance. Its binding status is stated each time. |

**Effort:** S = up to about 1 engineer-week. M = 2–6 weeks. L = more than 6 weeks, or ongoing editorial work.

**Audience:**
- **New adults**: non-Kurds, and adults starting from zero.
- **Heritage**: diaspora Kurds, plus Kurds in the region who understand or speak Kurdish but were schooled in Turkish, Arabic or Persian.
- **Kids**: children.
- **Everyone**.

**Realistic effect sizes.** In large education trials the average effect on independent tests is about 0.06 SD (`adaptive_assessment.md` §1; unverified). The fact-checks recommend planning on **0.05–0.2 SD on independent or delayed measures** for any single feature (`adaptive_assessment_verification.md` row 2). Hevalo's own in-app probes will show larger numbers, because they test exactly what was taught. Do not mistake those larger numbers for big real-world gains.

---

## The short version

Five findings shape everything that follows.

1. **The engine is good, but today almost nobody can learn on Hevalo.**
   - The web app has no lesson player.
   - The mobile app, the only client with one, is not in the stores.
   - The course has 18 lessons, 40 exercises and about 43 Kurmanji words, with **zero listening and zero speaking items**.
   - Course content is not loaded on deploy.

   (`hevalo_current_state_web.md` §0; `hevalo_current_state_backend.md` §0, §2; `hevalo_current_state_mobile_admin.md` §0.)

   The largest single learning gain available is a usable learning loop with enough content and native audio. Every other recommendation assumes it exists.
2. **Retrieval practice and spacing are the best-supported levers, and Hevalo's memory model is the weakest part of its engine.**
   - It runs SM-2 on exercises, not on words.
   - It counts same-day replays as spaced reviews.
   - Games and placement never feed it.
   - It keeps no review log a modern scheduler could learn from.
   - Course-map skills never decay with time.
3. **For the largest audience, heritage Kurds, the bottleneck is most likely reading and spelling, and Hevalo's grader accepts the very errors a literacy course must catch.**
   - It marks *e* for *ê* or *s* for *ş* as a correct "typo" (`api/src/content/exercises.ts:221-233`).
   - These letters are separate sounds that change the word: *ser* "head" vs *şer* "fight" (example from fact-checker background; editors to confirm).
4. **Gamification rewards showing up and grinding games, not learning.**
   - Zêr is paid for opening the app.
   - A daily Wordle win alone keeps the streak.
   - Game XP counts toward goals and leagues.
   - Achievements are defined but never awarded.
   - Mistakes cost hearts, which can end the lesson as a failure.
   - Reminders are loss-framed and English-only.
5. **There is nothing for children, and every account, at any age, can use DMs, the public feed and open matchmaking.**
   - Some safety work is needed **now**, not only when a kids' mode exists (K0).
   - Speech recognition for children is unreliable even in English.
   - Kurdish speech technology is usable only for narrow, adult tasks today.

### The ten changes with the best ratio of expected learning impact to effort

| # | Change | Why it matters most | Effort |
|---|---|---|---|
| 1 | Ship the learning loop on web and mobile, and load content on deploy (E1, Q12) | Nobody can learn from an engine they cannot reach | L |
| 2 | Fix the learning defects: multiple-choice answers always in position 1, practice crash for saved words, massed repeats counted as spaced reviews, broken native audio, the always-pass speaking scorer (Q1–Q3, Q5, Q6) | Each one silently teaches less, or teaches something false | S each |
| 3 | Re-ask missed items in the same lesson and show correct answers (Q4) | Feedback plus a second retrieval is the cheapest well-supported gain | S |
| 4 | A word-level memory model fed by every feature, with FSRS scheduling (E2, E3) | Spacing and retrieval have the strongest evidence of anything here | L |
| 5 | Build the Kurmanji core course to a real A1–A2 scope with native audio and tooling to author it (C1, C2, A1) | Content volume, not engine features, is now the limiting factor | L |
| 6 | A strict spelling mode and a heritage literacy track (E7, C5) | It targets the likely bottleneck of the largest audience | M |
| 7 | Onboarding and placement that ask about home language and route learners by skill (E9) | Without it, heritage speakers waste time and quit | M |
| 8 | Instrumentation, delayed-recall probes and a working experiment loop (Q11, M1–M5) | Without measurement none of this can be shown to work | M |
| 9 | Reward learning, not attendance: XP, streak, Zêr and league changes (X1–X5) | Stops the incentives from pulling against learning | M |
| 10 | Interim child protections, then a compliant kids' mode (K0, K1) | A legal and ethical precondition for any child audience | L |

### Index of all recommendations

**Priority key:** P0 = do now. P1 = next 3 months. P2 = 3–9 months. P3 = 9–12 months or later, or speculative.

| ID | Recommendation | Section | Audience | Evidence | Effort | Priority |
|---|---|---|---|---|---|---|
| Q1 | Shuffle multiple-choice options; fix the answer key | 1 | Everyone | Defect | S | P0 |
| Q2 | Fix the practice crash for saved words; give saved words a review card | 1 | Everyone | Defect | S | P0 |
| Q3 | Stop counting same-day repeats as spaced reviews | 1 | Everyone | Defect + Strong | S | P0 |
| Q4 | Re-ask missed items in the lesson; show correct answers on results | 1 | Everyone | Moderate | S | P0 |
| Q5 | Make lesson and dictionary audio and recording work on iOS and Android | 1 | Everyone | Defect | S–M | P0 |
| Q6 | Replace the always-pass speaking scorer with an honest self-check | 1 | Everyone | Defect | S | P0 |
| Q7 | Kurdish letter bar everywhere learners type; Sorani text normalisation | 1 | Everyone | Defect | S–M | P0 |
| Q8 | Close the loop after every game (meaning, audio, misses, save) | 1 | Everyone | Moderate | S | P0 |
| Q9 | Surface built-but-hidden learning features | 1 | Everyone | Defect | S | P0 |
| Q10 | Award achievements for mastery; fix daily-Wordle XP | 1 | Everyone | Defect + Moderate | S | P1 |
| Q11 | Turn on analytics and experiments with consent; add an answer-level event | 1 | Everyone | Prerequisite | S–M | P0 |
| Q12 | Load course content on every deploy | 1 | Everyone | Defect | S | P0 |
| Q13 | Accessibility fixes that also help learning | 1 | Everyone | Regulatory / Weak | S | P1 |
| E1 | Ship the learning loop on web; release mobile | 2 | Everyone | Weak (time on task) + Defect | L | P0 |
| E2 | Word-level knowledge model and full review log | 2 | Everyone | Strong (indirect) | L | P1 |
| E3 | FSRS scheduling, fitted per learner, behind an experiment | 2 | Everyone | Strong / Moderate | M–L | P1 |
| E4 | Course-map strength that decays with time | 2 | Everyone | Moderate | M | P1 |
| E5 | Lesson structure v2: teach, recall, produce, recycle | 2 | Everyone | Strong / Moderate | M–L | P1 |
| E6 | Error-specific feedback and a hint ladder | 2 | Everyone | Moderate | M | P1 |
| E7 | Strict spelling mode for literacy items | 2 | Heritage, New adults | Defect + Moderate | S–M | P1 |
| E8 | Difficulty model kept separate from timing; wheel-spinning detector | 2 | Everyone | Weak / Speculative | M–L | P2 |
| E9 | Onboarding and placement v2 | 2 | Heritage, New adults | Moderate / Weak | M | P1 |
| E10 | Games as spaced retrieval and fluency practice | 2 | Everyone | Strong (indirect) | M | P2 |
| E11 | Wire up offline lessons | 2 | Everyone (in-region) | Weak | M | P2 |
| E12 | Real push delivery and reminders based on learning state | 2 | Adults | Weak | M | P1 |
| C1 | Kurmanji core course to a real A1–A2 scope | 3 | Everyone | Strong (indirect) | L | P0–P1 |
| C2 | Authoring tools for non-engineers | 3 | (Editors) | Enabling | M–L | P0–P1 |
| C3 | Curated bilingual learner glossary | 3 | Everyone | Moderate | L | P1 |
| C4 | Graded reading and listening shelf | 3 | Adults, Heritage | Moderate | L | P2 |
| C5 | Heritage literacy track | 3 | Heritage | Weak / Moderate | M–L | P1–P2 |
| C6 | Sorani course; content model aware of dialect and script | 3 | Everyone (Sorani) | Weak | L | P2 |
| C7 | Alphabet: persist, schedule, port to mobile, lead into reading | 3 | Everyone, Kids | Moderate | M | P1 |
| C8 | Kurdish can-do statements and per-level inventories | 3 | Everyone | Weak / Moderate | M | P2 |
| C9 | Learning content in learners' own languages | 3 | Everyone | Moderate | M per language | P2 |
| C10 | Sustainable content pipeline | 3 | (Editors) | Weak | M | P2 |
| A1 | Native recordings for every teaching item | 4 | Everyone | Weak / Moderate | L | P0–P1 |
| A2 | Listening and perception drills (no ASR needed) | 4 | Everyone | Moderate | M | P1 |
| A3 | Record–compare and shadowing (no automatic scoring) | 4 | Adults, Heritage | Weak | M | P1 |
| A4 | Kurdish ASR evaluation harness, then constrained word checks | 4 | Adults | Moderate / Weak | L | P2–P3 |
| A5 | TTS only for listening volume, labelled and rated first | 4 | Adults | Weak | M | P2 |
| A6 | HevalBench: test any model on Kurdish before learners see it | 4 | (Gate) | Weak | M | P2 |
| A7 | "Why was this wrong?" explanations, grounded and cached | 4 | Adults, Teens | Moderate | M | P2 |
| A8 | AI drafts content offline; humans approve it | 4 | (Editors) | Weak | M | P2 |
| A9 | Text role-play for adults, bounded to the unit | 4 | Adults | Weak / Speculative | L | P3 |
| K0 | Child-safety must-haves (interim now; full before marketing) | 5 | Kids, Teens | Regulatory | M → L | P0 |
| K1 | Kids' mode "Hevalo Zarok" by age band | 5 | Kids | Moderate / Weak | L | P2 |
| K2 | Motivation that is safe for children | 5 | Kids | Moderate / Regulatory | M | P2 |
| K3 | Spaced recycling for children | 5 | Kids | Moderate | M | P2 |
| K4 | Parent view and weekly digest | 5 | Kids, Parents | Weak | M | P2 |
| K5 | Parent co-learning and shared-reading prompts | 5 | Kids, Parents | Weak | M | P2–P3 |
| K6 | Family circle with grandparents, audio-first | 5 | Kids, Heritage | Weak | M–L | P3 |
| K7 | Teacher and class mode | 5 | Kids, Teens | Weak | L | P2–P3 |
| S1 | The feed as a reading and writing space | 6 | Adults, Teens | Moderate | M–L | P2 |
| S2 | Moderation that grows participation and protects Kurdish users | 6 | Everyone | Weak | M | P1–P2 |
| S3 | Team and cooperative play in the existing games | 6 | Everyone | Moderate / Weak | M | P2 |
| S4 | Game modes where players produce Kurdish for each other | 6 | Adults, Teens | Speculative | M | P3 |
| S5 | Groups and buddies around shared learning goals; weekly recap | 6 | Everyone | Moderate / Weak | M | P2 |
| S6 | Fluent-speaker rooms and mentors | 6 | Adults | Weak / Speculative | L | P3 |
| X1 | Stop paying Zêr for opening the app | 7 | Everyone | Moderate | S | P0 |
| X2 | Make XP, goals, streaks and leagues reward learning | 7 | Everyone | Weak / Moderate | M | P1 |
| X3 | Forgiving streaks; no guilt messages | 7 | Everyone | Weak | M | P1 |
| X4 | Remove lesson-ending hearts; never limit review | 7 | Everyone | Moderate | S | P0 |
| X5 | Leagues that are opt-in, relative and scale-aware | 7 | Adults, Teens | Moderate | S–M | P1 |
| X6 | Fewer, kinder, fading notifications | 7 | Everyone | Weak | S–M | P1 |
| X7 | Stop telling learners things that are not true | 7 | Everyone | Defect | S | P0 |
| X8 | Things not to build | 7 | Everyone | Mixed | none | n/a |
| M1–M8 | Measurement plan | 8 | n/a | n/a | M | P0–P1 |

---
## 1. Quick wins (days to 2 weeks each)

Most of these fix defects that quietly reduce learning. Several are preconditions for the measurement plan. A defect fix needs no A/B test, so for those the "measure" line says how to confirm the fix worked.

### Q1. Shuffle multiple-choice options and fix the answer key

- **Build or change.**
  - Shuffle options per session with a seeded permutation, the same mechanism `match_pairs` already uses. Send the shuffled order to the client and map the chosen index back on the server.
  - Rebalance the 15 seeded items, which all have the correct answer at index 0.
  - Add a lint to the content import that warns when the correct-answer positions in a lesson are not spread out, and rejects duplicate options.
- **Why.** Defect. All 15 seeded multiple-choice items have `correctIndex: 0`, and options are shown in authored order (`exercises.ts:156-161`). A learner who notices this pattern stops retrieving, and retrieval is the point: testing beats restudy by about g = 0.5 (Rowland 2014; Strong; `memory_retention.md` Q1). The inflated accuracy would also corrupt any later difficulty or scheduling model.
- **Builds on.** `api/src/content/exercises.ts` (`sanitizeExercise`, `checkAnswer`); the seeded shuffle for `match_pairs`; `api/content/kurmanji-seed.json`; `api/content/events/newroz-lesson.json`; `api/src/content/import.ts`; `mobile/src/lesson/components/MultipleChoiceExercise.tsx`.
- **Audience.** Everyone. **Effort.** S. No dependencies.
- **Expected impact.** Removes a guaranteed shortcut and makes multiple-choice accuracy meaningful.
- **Risks.** Answers queued offline must use the same seed, so derive it from the session id.
- **Measure.** This is a defect fix, so no A/B test. Confirm that the chosen position no longer predicts correctness. Expect multiple-choice accuracy to drop, which shows it was inflated.

### Q2. Fix the practice crash for saved dictionary words and give saved words a review card

- **Build or change.**
  - Stop `dict:<id>` items from reaching the `uuid[]` query, both in the due list and in the weak-item padding.
  - Give saved words a real card: a server-generated meaning-recall item (Kurdish headword, audio if any, then choose or type the meaning).
  - Generate cards only for entries with a gloss the learner can read: English today, other UI languages once C3 exists. Entries with Kurdish-only definitions stay bookmarks.
- **Why.**
  - Defect, high confidence from reading the code (not executed). `PracticeService.loadExercises` casts `dict:` ids to UUID, so a learner who has saved a word probably gets a 500 error from practice (`hevalo_current_state_backend.md` §3).
  - Saving a word met in context and then retrieving it later is the bridge from incidental encounters to deliberate study. Encounters correlate with learning at only r ≈ .34, and retrieval counts more than exposure (Moderate; `memory_retention.md` Q3).
- **Builds on.** `api/src/practice/service.ts:88-93,122`; `api/src/practice/practice-select.ts`; `api/src/dictionary/saved-words-service.ts` (keep the 10-new-words-a-day cap); `web/src/pages/Dictionary.tsx` (saved words are a static list on web today).
- **Audience.** Everyone. **Effort.** S for the crash; S–M for the card. No dependencies, though C3 widens which entries qualify.
- **Expected impact.** Practice works for dictionary users, and saved words finally get spaced retrieval.
- **Risks.** Most Wîkîferheng entries have Kurdish-only definitions, which beginners cannot use. Do not turn those into cards.
- **Measure.** Practice error rate falls to zero. Track the share of saved words reviewed within 7 days, and their 30-day recall on probes (M3).

### Q3. Stop counting same-day repeats as spaced reviews

- **Build or change.**
  - In `ReviewService.record`, advance the scheduler state only when the item was due, or when at least half of its current interval has passed.
  - Otherwise log the attempt but leave the interval and repetition count unchanged.
  - Still treat a wrong answer as a lapse: forgetting is real information whenever it shows up.
  - Stop the "weak item" padding in practice from stretching intervals.
  - Align `due_at` to the learner's local day, not `now + N×24h`.
- **Why.**
  - Defect plus Strong evidence. Replaying a lesson the same day, or answering padded items that are not yet due, currently stretches intervals as if the practice had been spaced (`hevalo_current_state_backend.md` §3).
  - Spacing beats massing in L2 learning with a medium-to-large effect. The exact Kim & Webb (2022) figures are disputed between two retrievals (`memory_retention_verification.md` row 1).
  - Gaps that are too short are costlier than gaps that are too long (Cepeda; background in the same row).
  - Counting massed repeats as spaced pushes the next review too far out, so the word is forgotten before it returns.
- **Builds on.** `api/src/review/service.ts`, `api/src/review/sm2.ts`, `api/src/practice/practice-select.ts`, and the timezone handling in `api/src/streaks/streak-logic.ts`.
- **Audience.** Everyone. **Effort.** S. No dependencies.
- **Expected impact.** Fewer lapses at the first scheduled review.
- **Risks.** Learners who replay lessons will see their items stay due. That is correct behaviour, but explain it ("reviewing too soon doesn't count").
- **Measure.** Lapse rate when items come due, before and after (needs Q11). 7- and 30-day probe recall (M3).

### Q4. Re-ask missed items later in the lesson, and show correct answers at the end

- **Build or change.**
  - **During the lesson.** When an answer is wrong (or a "typo"), show the correct form with its audio. Then re-insert the item about 3 positions later, as the web alphabet practice already does (`COMEBACK = 3`, `web/src/alphabet/Practice.tsx:25`).
  - **Grading the retry.** The retry does not change the server's first-answer grade, because `session_answers` keeps the first answer. Log it as an extra retrieval through a small attempts endpoint, or in the review log once E2 exists. Cap retries at about 3 per lesson.
  - **On the results screen.**
    - Show each missed prompt with its correct answer.
    - Translate the raw `wrong`/`typo` token (`LessonResults.tsx:44`).
    - Add "Practise these now", which starts a practice session seeded with the missed items.
- **Why.**
  - Testing effects are larger with feedback (Rowland 2014; Strong).
  - Errors followed by corrective feedback support learning (Metcalfe 2017; Moderate; `memory_retention.md` Q5).
  - A later retry adds spacing within the session (Nakata & Webb 2016; Moderate).
  - Hevalo's own alphabet module already uses this pattern and writes down the rationale (`web/src/alphabet/practice.ts:17-37`). The lesson player does not: wrong items are never re-asked, and the results screen hides the correct answer (`hevalo_current_state_mobile_admin.md` §2).
- **Builds on.** `mobile/src/lesson/player.ts:81-92`; `components/FeedbackFooter.tsx`; `components/LessonResults.tsx:40-47`; `api/src/content/sessions.ts`; the practice API.
- **Audience.** Everyone. **Effort.** S. No hard dependencies; logging is better after Q11 and E2.
- **Expected impact.** Every error gets one more retrieval with feedback.
- **Risks.** Lessons get slightly longer. The interaction with hearts goes away with X4.
- **Measure.** This is an ideal **within-learner, item-level experiment** (M5). Randomly re-queue half of the missed items. Compare those items' recall at the next scheduled review and at the 7-day probe.

### Q5. Make lesson and dictionary audio, and recording, work on iOS and Android

- **Build or change.**
  - Rebuild `mobile/src/lesson/useAudio.ts` and `useRecorder.ts` on `expo-audio`. It is already installed and works natively in `library/AudioPlayer.tsx` and `library/VoiceRecorder.tsx`.
  - Make the listening exercise skip cleanly when audio is unsupported, not only on `audio.error` (`ListeningExercise.tsx:29`).
  - Use the same hook for the dictionary audio button (`dictionary/EntryDetail.tsx:64`).
  - Keep the existing 0.75× speed option.
- **Why.**
  - Defect. Both hooks depend on browser APIs. On phones, listening Play buttons are disabled and speaking shows "unavailable" (`hevalo_current_state_mobile_admin.md` §0 item 2). This stays hidden only because the course has no listening items yet.
  - Every audio recommendation (A1–A3, C7) depends on this fix.
  - Listening is a legitimate vocabulary source: incidental gains from listening are similar to those from reading, across studies (Moderate; `speech_audio_tech_verification.md` row 12).
- **Audience.** Everyone. **Effort.** S–M. No dependencies.
- **Expected impact.** Unblocks all listening and speaking content on phones.
- **Risks.** Low. Test on low-RAM Android.
- **Measure.** Defect fix. Confirm that audio play events now arrive from native clients.

### Q6. Replace the always-pass speaking scorer with an honest self-check

- **Build or change.**
  - Retire `StubPronunciationScorer`, which always returns pass (`api/src/content/speaking-scorer.ts:27`).
  - Speaking items become **record, then play back your clip next to the native model, then tap "close" or "not yet"**.
  - Store the result as a low-weight self-rating, not "correct". Never award full XP or streak credit for it.
  - Add a settings switch so a learner can turn speaking back on. Today a denied microphone sets `skipSpeaking` for the whole course with no way back (`LessonPlayerScreen.tsx:128-145,190-194`).
  - Keep the `PronunciationScorer` interface for A4.
- **Why.** Defect. The app currently tells learners every recording is correct. Feedback helps only when it carries information (`memory_retention.md` Q5). The speech fact-check calls replacing the stub "not a starting point but a correction" (`speech_audio_tech_verification.md` omitted item 5).
- **Builds on.** `api/src/content/exercises.ts` (`checkSpeaking`); `mobile/src/lesson/components/SpeakingExercise.tsx`; `users.skip_speaking`.
- **Audience.** Everyone. **Effort.** S. Depends on Q5 for phones.
- **Expected impact.** Ends false "correct" feedback, and gives learners real comparison practice (see A3).
- **Risks.** Some learners will skip speaking more often. That is acceptable.
- **Measure.** Self-rating distribution. Once A4 exists, compare self-ratings with a sample scored by native raters.

### Q7. Kurdish letters wherever learners type, plus Sorani text normalisation

- **Build or change.**
  - **Letter bar.** Add a persistent bar with **ê î û ç ş**, plus a hint ("hold *e* for *ê*"), to every typed input:
    - translate and listening exercises (today only writing has one, `mobile/src/lesson/kurdishKeys.ts:4`);
    - Race and Rhyme on web;
    - dictionary search;
    - the feed composer.
  - **Normalisation.**
    - NFC-normalise all typed input before grading and before counting Wordle letters.
    - Add Sorani Arabic-script normalisation to `shared/src/kurdish-text.ts`: map Arabic ي to ی and ك to ک, and handle ه, ە, ھ and the zero-width non-joiner consistently.
    - An open Kurdish normaliser exists to learn from (arXiv 2301.11406, cited in `heritage_minority_kurdish.md`).
  - **Sorani letter bar.** Once Sorani content exists, add one with ڕ ڵ ێ ۆ ڤ ە.
- **Why.**
  - Defects.
    - Desktop users without a Kurdish keyboard get ç ê î ş û marked wrong in the typing race (`hevalo_current_state_web.md` §6).
    - Translate items run English→Kurmanji with no key bar (`hevalo_current_state_mobile_admin.md` §2).
    - Sorani answers currently need an exact character match (`hevalo_current_state_backend.md` §12).
  - Typing the Kurdish form is productive retrieval, the direction with the most transfer to receptive knowledge (Nakata; Moderate; `memory_retention_verification.md` row 4).
- **Audience.** Everyone. **Effort.** S–M. The Sorani part must land before C6.
- **Expected impact.** Typed production stops being punished for keyboard limits.
- **Risks.** Low. Turkish-keyboard users may type ı for i; handle it as a known confusion with feedback.
- **Measure.** The share of answers marked wrong only because of a missing special letter should fall to near zero.

### Q8. Close the loop after every game

- **Build or change.**
  - **Web Wordle.** Show the word's meaning (in the UI language where C3 has it), its audio, a dictionary link and "save to review". The web version shows only "The word was {word}" (`web/src/pages/Wordle.tsx:161`). Mobile Wordle already looks up the word and offers save (`mobile/src/wordle/WordleScreen.tsx:148-219`).
  - **Rhyme and Rhyme Match.** List the valid rhymes the player missed, with meanings.
  - **Quiz.** Recap the missed questions with their correct answers.
  - **Review queue.** Once E2/E10 exist, missed items go into the player's review queue.
- **Why.** Retrieval works better with feedback (Strong; `memory_retention.md` Q1), and both `memory_retention.md` (Implications 6) and `social_collaborative.md` (A4) recommend this recap. Today the games test without teaching.
- **Builds on.** `web/src/pages/Wordle.tsx`, `WordleBattle.tsx`, `Rhyme.tsx`, `RhymeMatch.tsx`; the `WordleGame` type in `web/src/lib/types.ts` (no gloss field); `api/src/game/*`.
- **Audience.** Everyone. **Effort.** S.
- **Expected impact.** Each game round becomes feedback-rich retrieval.
- **Risks.** None of note.
- **Measure.** Track the save-to-review rate after games. Run an item-level experiment in which the recap shows a meaning for a random half of missed words, and compare 7-day recall.

### Q9. Surface the learning features that are built but hidden

- **Build or change.**
  - **Grammar notes.** Open them from the course map, not only from the in-lesson lightbulb (`hasGrammar` is already sent). Render them on web; `/skills/:id/grammar` is never called there.
  - **Reviews due.** Show the count on the Learn screen. Make "Review" the first action whenever reviews are due.
  - **Course list.** List every course. Mobile shows only `courses[0]`, which makes the Newroz course unreachable (`mobile/src/screens/LearnScreen.tsx:60`).
  - **Word of the day.** Add an admin page and route to curate it, over `addToWotdPool`, which has no production caller, so the pool is empty. Accept only words with a gloss and audio. Show it on web too.
- **Why.** Defect: the features are built but cannot be reached (`hevalo_current_state_mobile_admin.md` §1, §9.2). Making due reviews visible pushes learners toward the behaviour with the strongest evidence.
- **Builds on.** `mobile/src/grammar/GrammarTips.tsx`; `mobile/src/coursemap/*`; `mobile/src/practice/PracticeScreen.tsx`; `api/src/dictionary/repository.ts:161`; `mobile/src/dictionary/WordOfDayCard.tsx`.
- **Audience.** Everyone. **Effort.** S.
- **Expected impact.** More review sessions started.
- **Risks.** None of note.
- **Measure.** Share of sessions that begin with review, and reviews completed per active learner per week.

### Q10. Award achievements for mastery, and fix daily-Wordle XP

- **Build or change.**
  - **Achievements.** Wire `AchievementsService.award`, which today has no caller, to **mastery milestones**:
    - first perfect lesson;
    - every Hawar letter mastered;
    - 100 words still known at a 7-day check;
    - first story read without glosses.
  - **Presentation.** Present them as unexpected, informational recognition ("You can now read every Kurmancî letter"), not as advertised payment.
  - **Streak badges.** Keep streak-length badges out of minors' profiles (K2).
  - **Wordle XP.** Fix daily Wordle XP so every player is credited. The ledger reference `daily:<dayIndex>` is unique across all users, so only the first finisher each day gets XP, while every player is told they earned it (`api/src/game/wordle-service.ts:245`; `1751000019000_xp.js`).
- **Why.**
  - Positive informational feedback raised intrinsic motivation in Deci et al. (d ≈ +0.33). That effect was weaker for children, and the paper is contested.
  - Both sides of the overjustification debate agree on the practical split: rewarding mastery is safe, and paying for mere participation is the risky case (Moderate; `motivation_gamification_verification.md` row 1 and omitted item 5).
  - In one experiment, badges and performance graphs raised perceived competence (Sailer et al. 2017; background, unverified; same file, omitted item 4).
  - The XP bug is a fairness defect that misleads learners.
- **Builds on.** `api/src/achievements/service.ts:21-28`; `api/src/activity/` (the feed already shows achievements, which never fire); `api/src/xp/service.ts`.
- **Audience.** Everyone. **Effort.** S. Better after E2, because "words remembered" needs the word model.
- **Expected impact.** Learners see their competence growing. Effect on retention is unknown.
- **Risks.** A badge treadmill. Keep the set small and meaningful.
- **Measure.** User-level A/B `mastery_badges`: 8–12-week retention and 30-day probe recall. Guardrail: the share of XP from farmable repeats must not rise.

### Q11. Turn on analytics and experiments, with consent, and add an answer-level event

- **Build or change.**
  - **Mobile.** Instantiate `AnalyticsTracker` and `ExperimentClient` once in `mobile/App.tsx`.
  - **Web.** Add equivalents.
  - **Events.** Emit the 8 registered events. Add an `exercise_answer` event; its fields are listed in M1.
  - **Consent.** Enforce `analytics_consent` in `AnalyticsService.ingest`. It is stored but never checked.
  - **Prove the pipeline.** Read the seeded `daily_goal_default` experiment at registration, so the whole path is exercised end to end.
  - **Data export.** Include learning data (review state, sessions, XP, streaks) in the GDPR export, which today contains only the profile (`api/src/gdpr/service.ts:113-130`).
- **Why.** No client emits events, so the admin dashboards and experiments have no data (`hevalo_current_state_backend.md` §9; `hevalo_current_state_mobile_admin.md` §7). Every learning claim in this document needs delayed measures (M2–M3).
- **Builds on.** `mobile/src/analytics/tracker.ts`, `buffer.ts`; `api/src/analytics/registry.ts`; `mobile/src/experiments/client.ts`; `api/src/experiments/*`.
- **Audience.** Everyone. **Effort.** S–M. No dependencies.
- **Expected impact.** None on learning directly. It is what makes measuring possible.
- **Risks.** Over-collection. Keep data minimal, and keep child sessions free of third-party SDKs (K0).
- **Measure.** Event volume per active user. A sample-ratio check on `daily_goal_default`.

### Q12. Load course content on every deploy

- **Build or change.** Run the content import idempotently, or ship content as a versioned seed migration, from `api/start.sh`. Add a smoke test that `/courses` returns at least one course with published lessons.
- **Why.** Defect. `api/start.sh` runs migrations only. Whether production has any lessons depends on someone having run `npm run content:import … --publish` by hand (`hevalo_current_state_backend.md` §2).
- **Builds on.** `api/scripts/import-content.ts`; `api/src/content/import.ts`; `api/seeds/`.
- **Audience.** Everyone. **Effort.** S.
- **Expected impact.** A precondition for everything else.
- **Risks.** Published lessons are immutable (DB triggers), so the import must create new versions, not overwrite.
- **Measure.** The smoke test passes on every deploy.

### Q13. Accessibility fixes that also help learning

- **Build or change.**
  - Mark Kurdish text with `lang`/`dir` in library posts. The post body has none (`web/src/pages/LibraryPostPage.tsx`).
  - Make Wordle tiles announce their state, not only the letter (`web/src/components/WordleBoard.tsx:84`).
  - Never signal right or wrong by colour alone: add an icon, a text label and a sound or haptic cue.
  - Add an untimed or extended-time practice mode to the typing race and the quiz.
  - Give every drag interaction a tap alternative.
- **Why.**
  - **Regulatory, unverified this session.** WCAG 2.1 AA via EN 301 549 is the EU legal floor; WCAG 2.2 is best practice. Whether these rules bind Hevalo needs counsel (`multimedia_ux_verification.md` rows 11, 18).
  - **Time pressure.** It is a documented downside of Kahoot-style games (unverified; `social_collaborative.md` §1).
  - **Speed scoring.** It confounds language knowledge with typing skill (`adaptive_assessment.md` §6 rec 12).
- **Audience.** Everyone. **Effort.** S.
- **Expected impact.** Wider access. A small learning effect, if any.
- **Risks.** None of note.
- **Measure.** An accessibility audit. Completion rates in the untimed mode.

---
## 2. Core learning engine changes

### E1. Ship the learning loop on the web, and release the mobile app

- **Build or change.**
  - **Shared player.** Move the pure session reducer (`mobile/src/lesson/player.ts`, plus its answer and match helpers) into `shared/`.
  - **Web learning loop.** Build a web lesson player, course map, practice screen and placement flow against the endpoints that already exist: `/courses/:id/map`, `/lessons/:id/session`, `/sessions/:id/answers`, `/sessions/:id/complete`, `/practice/*`, `/review/queue`, `/courses/:id/placement`, `/me/daily-goal`.
  - **Learn page.** Replace the static `LessonMock` on `/app/learn` and make the course cards clickable.
  - **After sign-up.** Send new users to onboarding and placement (E9), or straight to their first lesson. Today they land on the community wall (`web/src/pages/VerifyEmail.tsx:62,74,93`).
  - **Mobile release.** Unblock the store release (issue #279).
- **Why.**
  - "A member of the public cannot take a single lesson today, on any platform" (`hevalo_current_state_web.md` §0).
  - In app studies, hours of use predicted gains (Babbel, Loewen 2020; Duolingo, Smith 2024). Both are observational and vendor-linked: Weak, and confounded by motivation.
  - The retrieval and spacing benefits behind every other recommendation require learners to reach the lesson loop at all.
- **Builds on.** The whole API learning engine (`api/src/content/`, `review/`, `practice/`, `placement/`, `coursemap/`, `goals/`); the mobile player in `mobile/src/lesson/`; `web/src/pages/Learn.tsx`; `web/src/landing/mocks.tsx:325`.
- **Audience.** Everyone. **Effort.** L.
- **Depends on.** Q1–Q5 and Q12. C1 must supply enough content to be worth shipping.
- **Expected impact.** Enabling. Without it, nothing else reaches learners.
- **Risks.** Launching with 15 lessons means learners finish the course in a day. Ship together with the first C1 units.
- **Measure.** The `lesson_start → lesson_complete` funnel and D7/D30 retention. Collect delayed-probe recall (M3) from the first cohort: it is the baseline for every later experiment.

### E2. A word-level knowledge model and a full review log

- **Build or change.**
  - **Tag items.** Tag every exercise with what it tests:
    - lexemes (lemma id plus variety and script);
    - chunks;
    - grammar points, such as `kmr.ezafe.feminine`, `kmr.past.ergative`, `ckb.past.clitic-agent`;
    - letters and graphemes.
  - **Record the skill exercised.** One of:
    - meaning recall (Kurdish → meaning);
    - form recall or production (meaning → Kurdish, typed or spoken);
    - listening (audio → meaning);
    - spelling or dictation;
    - reading in the script.
  - **Memory state.** Replace `review_items` (keyed on an exercise UUID) with a memory-state table keyed on user × item × skill. A word then stays the same item across lesson versions and across features.
  - **Review log.** Add an append-only `review_log`, partitioned by month. Fields:
    - user, item, skill;
    - source feature: lesson, practice, alphabet, Wordle, race, quiz, rhyme, reader, placement or probe;
    - timestamp in ms;
    - pass/fail and grade;
    - latency in ms;
    - format and number of options;
    - hint used, attempt number;
    - days since the last review;
    - scheduler state before and after.
  - **Exposures.** Log passive exposures (a word seen in a story, a dictionary look-up) separately. They are not reviews.
  - **Admin.** Add a learner view showing per-item states. The admin Users page shows no learning data today.
- **Why.**
  - **Strong, indirect.** Retrieval practice (testing vs restudy about g = 0.5) and spaced retrieval are the best-supported levers (`memory_retention.md` Q1).
  - **Separate skills.** Production practice transfers to recognition more than the reverse (Nakata; Moderate; `memory_retention_verification.md` row 4), so production and recognition need separate states.
  - **Precedent.** Duolingo trained its word model on word-level traces from ordinary lesson exercises (Settles & Meeder 2016; vendor, peer-reviewed).
  - **Schedulers need logs.** Modern schedulers learn from a per-review log (fsrs-optimizer docs).
  - **Today.** The same word in two exercises counts as two items. A new lesson version restarts its history. Nothing stores latency, the raw answer or the prior state (`hevalo_current_state_backend.md` §3).
- **Builds on.** `api/src/review/*`; migrations `1751000022000_review-items.js`, `1751000031000_saved-words.js`, `1751000018000`, `1751000023000`; the import format in `api/content/*.json` (add tags); `admin/src/pages/Users.tsx`.
- **Audience.** Everyone. **Effort.** L (schema, tagging existing content, and a write path from every feature).
- **Depends on.** Q11. Tagging at scale needs C2.
- **Expected impact.** The foundation for E3, E4, E8, E10, C4 levelling and M2–M3.
- **Risks.**
  - Tagging debt.
  - Logging the same event twice from two code paths.
  - Storage growth.
  - Mis-specified grammar tags, which learning curves will reveal (M2).
- **Measure.** Share of answers carrying item tags (target: all). Monthly learning curves per knowledge component.

### E3. Replace SM-2 with FSRS, fitted per learner, behind an experiment

- **Build or change.**
  - **Choose the version on Hevalo's own logs.** Benchmark FSRS-6 against FSRS-7 before choosing.
    - FSRS-7 (September 2026 benchmark) is the first version that models same-day reviews well.
    - Hevalo will produce many same-day retrievals (in-lesson recycling, several games a day).
    - Check whether the TypeScript library ships FSRS-7.
  - **Parameters.**
    - Start with default parameters.
    - Fit per learner early: pretrain from about 8 reviews, full optimisation from about 64.
    - Keep per-cohort parameters for children, heritage learners and new adults.
  - **Grades.** Pass/fail is enough. Optionally treat a correct multiple-choice answer as weaker evidence than a correct typed answer.
  - **Desired retention.**
    - About 0.90 for adults.
    - For children, test 0.85 against 0.90. A lower target means more failed reviews per session, which can frustrate rather than relieve.
  - **Review debt.** When it grows, cap *new* items per day. Never cap reviews.
  - **Rollout.**
    - Run the new scheduler in shadow mode first (predict, don't schedule) to check calibration.
    - Then ship it behind experiment `scheduler_fsrs`.
    - Fold in or retire the unwired `adaptive.ts` (issue #121).
- **Why.**
  - **Benchmark: confirmed** by reading the benchmark repository (10,000 Anki users, about 727 million reviews).
    - FSRS-6 log loss is 0.3460, the benchmark's 3-parameter HLR 0.4694, and an SM-2-like Anki default 0.6258.
    - FSRS-7 reaches 0.3401.
    - On same-day reviews FSRS-6 does worse than a constant predictor.
    - Fitting per user beats default parameters: FSRS-6 scores 0.3664 with defaults vs 0.3460 fitted.
    - Sources: `memory_retention_verification.md` rows 6–10.
  - **Caveats.**
    - A zero-parameter moving average of the user's recent success beats FSRS-6 on log loss. Check calibration against trivial baselines, not just against SM-2.
    - Prediction accuracy is not learning.
    - The benchmark users are self-grading adults.
  - **Causal evidence is thin.**
    - Duolingo's scheduler A/B test measured engagement only.
    - Lindsey et al. (2014) found personalised review gave about +10% over generic spacing in 8th-grade Spanish one month after the course. That figure is unverified and possibly relative, not percentage points.
  - **Overall.** Strong evidence for spacing as such. Moderate evidence for this particular scheduler.
- **Builds on.** `api/src/review/sm2.ts`, `service.ts`, `adaptive.ts`; `docs/review/adaptive-difficulty.md`; `api/src/experiments/*`.
- **Audience.** Everyone. **Effort.** M–L.
- **Depends on.** E2, Q3 and Q11.
- **Expected impact.** Less review time for the same retention, or more retention for the same time. Expect small effects on delayed recall (0.05–0.2 SD).
- **Risks.**
  - Miscalibration on auto-graded game answers.
  - Double-counting a lapse together with E8.
  - Review pile-ups for returning learners (handle with X3's comeback lesson).
- **Measure.**
  - Offline: log loss and calibration against the moving-average baseline on held-out reviews.
  - Online: A/B `scheduler_fsrs`. Primary metric: 30-day probe recall per minute studied. Secondary: review minutes per day, lapse rate. Guardrail: D30 retention.

### E4. Course-map strength that decays with time

- **Build or change.**
  - **Compute strength from predicted recall.** Base each skill's strength on the predicted recall (from E3) of its items, instead of on ease factor and repetition count.
  - **Show decay.** A skill cracks visibly when predicted recall falls.
  - **Tap behaviour.** Tapping a "rusty" skill starts a short review of its due items, not the first incomplete lesson.
  - **Gold.** Award gold only when the skill's items were recalled correctly at a delayed check.
- **Why.**
  - Defect plus Moderate evidence. Strength today is 0.6 × ease + 0.4 × repetitions, so it falls only after wrong answers. A skill left alone for months stays gold (`hevalo_current_state_backend.md` §4).
  - Forgetting curves replicate (Murre & Dros 2015; `memory_retention.md` Q4).
  - The map should show real forgetting and send learners to spaced retrieval.
- **Builds on.** `api/src/placement/skill-strength.ts`; `api/src/coursemap/node-state.ts`; `mobile/src/coursemap/node.ts`.
- **Audience.** Everyone. **Effort.** M.
- **Depends on.** E2 and E3.
- **Expected impact.** More reviews done at the right time.
- **Risks.** Decaying skills can discourage learners. Frame decay as "ready to refresh", not as failure.
- **Measure.** Share of taps on decayed skills that end in a completed review. Recall of those items at the next probe.

### E5. Lesson structure v2: teach, recall, produce, recycle

- **Build or change.** A lesson holds 3–5 new items mixed with due reviews and runs in five steps.
  1. **Introduce.**
     - Native audio plus written Kurdish plus a gloss in the UI language.
     - A picture for concrete nouns and verbs.
     - "Guess first" only when the item is guessable: a cognate, a picture, or known morphology.
  2. **Recognise with feedback.** Multiple choice, or listen and pick.
  3. **Produce.**
     - First a word bank: a new `build_sentence` exercise type with tap-to-place, which also meets the accessibility rule for drag alternatives.
     - Then typed recall with the letter bar (Q7).
     - Practise chunks as whole units.
  4. **Recycle.** Retrieve each new item about 3–5 times across the session, never back to back, with other items in between. Re-queue misses (Q4).
  5. **Close.** Revisit the learner's own errors. The first review is scheduled for the next day (E3).

  **Also:**
  - **Grammar notes.** Where a unit introduces a pattern, add a short explicit note: at most 3 cards, each followed by a practice item. Pair it with comprehension items ("Who saw whom?" for the ergative past) as well as production items.
  - **Interleaving.** Interleave confusable forms in review: e/ê, i/î, u/û; ezafe *-ê/-a/-ên*; present vs past agreement. Do not force interleaving of brand-new, unrelated words.
  - **Fading scaffolds.** Remove pictures, word banks and translations as an item's strength rises.
- **Why.**
  - **Strong.** Retrieval plus spacing.
  - **Moderate: retrieval count.** 5 or 7 retrievals in a session beat 1 or 3 (Nakata 2017). But 5 and 7 did not differ, and spreading retrievals across days matters more (`memory_retention_verification.md` row 4, omitted item 10). So cap at about 3–5 per session.
  - **Lesson length.** "3–5 items × 5–7 retrievals" would be 15–35 retrievals, far longer than the "12–20" claimed in one note (`multimedia_ux_verification.md` row 7).
  - **Moderate: grammar.** Explicit instruction gives larger immediate effects and also helps free production. Pair it with meaningful practice. Plan for comprehension *and* production, not comprehension before production (`sla_theory_verification.md` row 9, omitted item 8).
  - **Guess first.** The pretesting benefit comes mainly from guessable items (`memory_retention_verification.md` omitted item 7).
  - **Interleaving.** g = 0.42 overall, but the "word materials" result comes from category learning, so it is extrapolation for L2 word pairs. Plausible for confusable forms only (row 3).
  - **Fading.** Supports that help novices can hurt more advanced learners ("expertise reversal"; background, `multimedia_ux.md`).
- **Builds on.** `api/src/content/exercises.ts` (add the new type and widen the CHECK constraint, following migrations `1751000024000`–`…26000`); `mobile/src/lesson/components/*`; `player.ts`; `skills.grammar_md`.
- **Audience.** Everyone. **Effort.** M–L.
- **Depends on.** C1 and C2, so content is written to this structure; E2 tags.
- **Expected impact.** Probably the largest per-lesson gain among the engine changes. Still expect small effects on independent measures.
- **Risks.**
  - Desirable difficulties lower accuracy during the lesson, and learners feel they learn less (Soderstrom & Bjork; Deslauriers 2019; background). Never tune difficulty on in-lesson accuracy.
  - Longer lessons.
- **Measure.**
  - User-level A/B `lesson_v2`. Primary metric: 7- and 30-day probe recall of lesson items, using production where possible. Secondary: lesson completion and time.
  - Item-level experiments on new items per lesson and on retrievals per item.

### E6. Error-specific feedback and a hint ladder

- **Build or change.**
  - **Schema.** Add `hint`, `explanation` (short, per UI language), `image`, and prompt and answer `audioUrl` fields to the exercise schema. `mobile/src/lesson/types.ts` has none today.
  - **Diagnose typed errors and name the type.** Missing diacritic ("ê, not e"), wrong letter, wrong ending (ezafe, case, agreement), word order, and Sorani letter confusions (dots; ە vs ه).
  - **Show the difference.** Place the learner's answer directly above the model answer, with the differing letters highlighted.
  - **Hint ladder, typed and spoken items only.**
    1. A clue: "check the verb ending: past tense, transitive verb".
    2. A partial form.
    3. The answer with an explanation.

    Using a hint lowers the scheduler grade. It does not cost XP or hearts. No hint-then-retry on multiple choice, where it turns into elimination guessing.
  - **Fading.** Give fuller, explicit explanations on new forms and lighter feedback (highlight only) on forms seen many times.
- **Why.**
  - **Corrective feedback.** Overall d ≈ 0.61–0.64, and durable (Li 2010; unverified). Explicit feedback wins in the short term; implicit feedback is better maintained.
  - **Prompts vs recasts.** "Prompts beat recasts" is contested and comes from classroom speech studies (`sla_theory_verification.md` row 10). Treat a prompt-first design as an A/B test, not a rule.
  - **Elaborated feedback.** In computer-based learning, it beats showing only the correct answer (Van der Kleij et al. 2015; background, unverified).
  - **Today.** Feedback is a verdict plus the first accepted answer (`hevalo_current_state_backend.md` §1).
  - **Overall.** Moderate.
- **Builds on.** `api/src/content/exercises.ts` (`gradeText`, `CheckResult`); `mobile/src/lesson/components/FeedbackFooter.tsx`; `shared/src/kurdish-text.ts`.
- **Audience.** Everyone. **Effort.** M.
- **Depends on.** Explanations need authors (C2). A7 scales them later.
- **Expected impact.** Fewer repeat errors on the same pattern.
- **Risks.** Wrong or over-long explanations. Keep them short and editor-reviewed.
- **Measure.** Item-level experiment `feedback_elaborated`: explanation vs correction only, and hint ladder vs immediate answer. Primary metric: recall at the next due review and the repeat-error rate on the same knowledge component.

### E7. A strict spelling mode for literacy items

- **Build or change.**
  - **Per-item and per-level leniency.** Make diacritic leniency a setting on each item and level.
    - **Beginner lessons.** An answer missing diacritics counts as "almost": partial credit, with the letter shown.
    - **Literacy, dictation and spelling items.** It is not accepted. The feedback names the letter: "ê, not e: *sê* 'three' vs *se* 'dog'" (examples from fact-checker background; editors to confirm).
  - **Scoring by skill (needs E2).** Such near-misses fail the spelling skill but pass the meaning skill.
  - **Regional variants.** Editors list attested regional variants. These are accepted, with a "standard vs common spoken" note.
- **Why.**
  - **Defect.** Answers that match only after folding ê→e, ş→s and so on are accepted as correct "typos" (`exercises.ts:221-233`). These letters distinguish words (`heritage_minority_kurdish_verification.md` omitted item 1).
  - **Confirmed: form recall decays fastest.** Delayed form recall was 25.1% against 39.4% for meaning recall (`sla_theory_verification.md` row 5). A lenient grader stops training exactly that skill.
  - **Weak: heritage literacy.** The heritage literacy bottleneck rests on an unverified survey of US heritage learners (Carreira & Kagan).
- **Builds on.** `api/src/content/exercises.ts`; `shared/src/kurdish-text.ts`.
- **Audience.** Heritage, New adults. **Effort.** S–M. The strict flag can ship before E2.
- **Expected impact.** Spelling is learned rather than waved through.
- **Risks.** Frustration for beginners. That is why strictness depends on level and track.
- **Measure.** Dictation accuracy at 7 and 30 days. A/B strictness levels within the heritage literacy track (C5).

### E8. A difficulty model kept separate from timing, and a wheel-spinning detector

- **Build or change.**
  - **The model.** Elo/Rasch-style learner ability per variety × skill, plus a difficulty per item.
    - Add a guessing floor of 1/k for multiple-choice and tap formats.
    - Make the size of each update depend on how uncertain the estimate is.
  - **Picking items.** Use it to choose formats, and new items near a target success rate:
    - start at about 80–85% for adults;
    - about 85–90% for children, beginners' first two weeks, and the heritage literacy track;
    - correct for guessing;
    - make the target a server parameter so it can be tested.
  - **Division of labour.** **FSRS decides when; this model decides which format and how hard.** A single lapse must not be penalised by both.
  - **Starting difficulty for new items**, from features:
    - corpus frequency rank;
    - word length;
    - special letters (ê î û ç ş; ڕ ڵ ۆ ێ ە);
    - cognate status with the UI language;
    - format.
  - **Wheel-spinning detector.** After about 8–10 opportunities on one knowledge component without a delayed success, stop repeating the same drill. Switch to a short explanation, another modality (audio, picture) or a prerequisite.
- **Why.**
  - **Weak to Moderate: simple models suffice.** Simple Elo and logistic models predict about as well as deep knowledge tracing at small scale. Pelánek and Gervet are unverified, but the benchmark baselines point the same way (`adaptive_assessment_verification.md` row 4).
  - **Speculative: target success rates.** The "85% rule" is theory. The Math Garden study is maths with children, and its benefit came from more practice (row 5).
  - **Thin corpora.** Kurmanji corpora are small (Pewan about 4M words against about 188M for Sorani in AsoSoft), so frequency-based starting difficulties are weak for Kurmanji. Weight editor judgement there (omitted item 12).
  - **Double-counting** with FSRS is a known risk (omitted item 7).
  - **"10 opportunities"** is a definition taken from maths tutors, to be tuned on Hevalo's own learning curves (omitted item 9).
- **Builds on.** `api/src/placement/*`; `api/src/practice/practice-select.ts`. `api/src/ranking/elo.ts` is the game rating, a different job; don't reuse it as is.
- **Audience.** Everyone. **Effort.** M–L.
- **Depends on.** E2, E3.
- **Expected impact.** Fewer too-easy and too-hard items, and less time stuck. Unknown size.
- **Risks.** Over-engineering at small data scale. Keep it simple.
- **Measure.**
  - Calibration of predicted success.
  - A user-level A/B of the 80% vs 90% target, judged on 30-day recall and churn. It must run for a long time.

### E9. Onboarding and placement v2

- **Build or change.**
  - **Onboarding questions** (mobile `ONBOARDING_STEPS`, and on web after email verification):
    - which variety to learn, Kurmancî or Soranî (store a new `target_dialect`);
    - who speaks Kurdish around you, and which variety (ask about languages, not ethnicity);
    - self-rated understand, speak, read and write;
    - why you are learning: family, identity, reading, partner, travel, work, school;
    - a daily anchor for an if-then plan ("After ___ I will do one Hevalo session"), which also sets the reminder time;
    - the neutral age screen (K0);
    - the daily goal.
  - **Use the answers as a starting estimate for placement, not as the result.**
  - **Placement.** Offered at onboarding, and skippable.
    - **Item types.** Use items that don't require rule knowledge:
      - listening (audio → picture or meaning);
      - reading in the script;
      - short dictation scored by edit distance;
      - optionally, a yes/no word-recognition block with pseudo-words.
    - **The yes/no block** is a new, unvalidated instrument. Screen its pseudo-words against all dialects and score it with false-alarm correction.
    - **Item selection.** Draw several random items per level. Today each level always uses the same single item (`api/src/placement/service.ts:70-82`, `LIMIT 1`).
    - **Results.** Report one overall level with a visibly wide band, and let per-skill estimates build up from practice.
  - **Routing.**
    - Literate heritage speakers go to the standard path with test-out.
    - Oral heritage speakers with weak literacy go to "Read and write what you already speak" (C5).
    - Receptive-only learners go to an oral track first.
    - True beginners go to the alphabet and unit 1.
  - **Test-out.** Allow it on every unit.
  - **Re-placement.** Re-place every 8–12 weeks. Report growth only at cohort level.
  - **Framing.** Present it without shame: "let's find your starting point".
  - **Privacy.** Heritage questions can reveal ethnic origin, a special category under GDPR Art. 9 (background). Keep them optional and minimal, and store languages, not ethnicity. The risk is higher for users in Turkey, Iran and Syria.
- **Why.**
  - **Weak: heritage profile.** Heritage learners usually have strong listening and weak literacy (Carreira & Kagan; unverified). But proficiency is a continuum, and many young Kurds may be receptive-only (`heritage_minority_kurdish_verification.md` omitted item 5).
  - **Moderate: avoid rule-based questions.** Heritage speakers do worse than L2 learners on explicit, metalinguistic tasks (Bowles 2011 via Montrul), so rule-question placement under-places them.
  - **Computed: per-skill precision is impossible in 20 items.** At most 20 items, split across three skills, leave each skill with a standard error of about 0.76–1.26 logits. That is far too wide for a per-skill profile at placement (`adaptive_assessment_verification.md` row 9).
  - **Weak: if-then plans.** The older meta-analysis gave d = 0.65; a newer one is probably smaller (about 0.27; unverified). It is a cheap prompt with small absolute gains.
  - **Moderate: identity motivation.** It predicts intended effort (r = .61) but barely predicts achievement (r ≈ .20), so pair it with plans and progress tracking (`motivation_gamification.md` §5).
- **Builds on.** `api/src/placement/placement.ts`, `service.ts`, `routes.ts` (built, never called; issue #39); `mobile/src/onboarding/flow.ts`, `OnboardingScreen.tsx`; `web/src/pages/Register.tsx`; `mobile/src/goals/GoalPicker.tsx`.
- **Audience.** Heritage, New adults. **Effort.** M.
- **Depends on.** Tracks to route into (C1, C5). Q11.
- **Expected impact.** Heritage learners skip what they already know, and fewer quit early.
- **Risks.**
  - Over-trusting a short test.
  - Mis-routing. Make it easy to switch tracks.
- **Measure.**
  - Calibration: placed level against first-week accuracy.
  - Early churn by segment.
  - 30-day probe recall by track.
  - A/B `if_then_onboarding` on active days over 30 days.

### E10. Games as spaced retrieval and fluency practice

- **Build or change.**
  - **Seed the solo games from what the learner needs.** Single-player quiz, practice Wordle and solo race draw from the learner's due and nearly due items and from their course stage. Course-linked selection is planned but not built (KUR-026/041).
  - **Log every game answer in the review log**, weighted by format:
    - a multiple-choice quiz answer counts as weaker evidence;
    - Wordle and race answers count as production and spelling;
    - rhyme answers count as sound and form.
  - **Solo or bot quiz.** Add one, so the quiz no longer needs a live opponent.
  - **Fluency mode.** Race and timed quiz use only well-known items, at rising speed.
  - **Race texts.** Seed them from graded-reader sentences the learner already knows almost entirely (about 98% of words).
  - **Multiplayer pools.** Rooms draw from the players' shared stage.
- **Why.**
  - **Strong.** Retrieval practice with feedback works across formats.
  - **Expert opinion.** Fluency practice uses only familiar material (Nation).
  - **Today.** The games use a 33-question bank and a 79-word pool unrelated to the course, and never feed scheduling (`hevalo_current_state_backend.md` §6).
  - **Caveat.** Game scores also measure typing and keyboard skill. Use speed only relative to the learner's own baseline, and leave children's timed scores out of ability estimates (`adaptive_assessment.md` §6 rec 12; verification omitted item 10).
- **Builds on.** `api/src/game/question-bank.ts`; `quiz_questions` (`1751000098000`); race texts (`1751000100000`); `wordle-service.ts`; `rhyme-service.ts`; `game-rewards.ts`.
- **Audience.** Everyone. **Effort.** M.
- **Depends on.** E2, E3, C1.
- **Expected impact.** Game time becomes review time.
- **Risks.** Games feel like homework. Keep the fun mechanics and change only what gets asked.
- **Measure.** Item-level comparison: items delivered in games vs in normal review, recall at the next due date. Also track the share of total review done through games.

### E11. Wire up offline lessons

- **Build or change.**
  - Connect `LessonCache`, `selectPrefetch` and `OfflineCompletionQueue` to `LearnScreen` and the session player, with an AsyncStorage adapter. These classes are dead code; only tests import them.
  - Queue review-log entries for later sync.
  - Offer downloadable unit packs with low-bitrate audio.
  - On web, add a service worker later.
- **Why.** Weak. In-region learners face connectivity costs and government internet shutdowns (unverified; `multimedia_ux.md` §5). Issue #42 was closed as done, but the code was never wired in.
- **Builds on.** `mobile/src/offline/*`; `mobile/src/lesson/queue.ts`; `mobile/src/onboarding/storage.ts` (lazy-require pattern).
- **Audience.** Everyone, especially in the region. **Effort.** M. **Depends on.** E2 for logging.
- **Expected impact.** Practice continues through outages.
- **Risks.** Sync conflicts. The server already re-grades on sync.
- **Measure.** Share of sessions completed offline. Sync error rate.

### E12. Real push delivery, and reminders based on what the learner needs to review

- **Build or change.**
  - **Delivery.** Implement `getPushToken()` with `expo-notifications`, and connect `createPushProvider` to a real provider (FCM/APNs or Expo).
  - **A "learning" category.** Add one.
  - **Reviews-due job.** Model it on `StreakReminderService` (hourly, local time, idempotent) and drive it from the review queue's due count.
  - **Deep links.** Add Lesson and Practice targets to `resolveDeepLink`, which has neither today.
  - **Permission timing.** Ask after the first completed lesson, not at install.
  - **What and how often.** That is set in X6.
- **Why.** Weak.
  - Per-message effects are small: about +3.9 points per tailored prompt in a mental-health app. Duolingo's bandit gained +0.5% DAU, but from better wording, not from sending reminders (`multimedia_ux_verification.md` row 9).
  - Still, due reviews only work if learners come back.
  - Delivery is a stub today (`hevalo_current_state_mobile_admin.md` §5).
- **Builds on.** `api/src/push/provider.ts:52`; `mobile/src/push/tokenSource.ts:20-22`; `api/src/notifications/*`; `notifications/prefs.ts`.
- **Audience.** Adults (children: off by default, see K0). **Effort.** M.
- **Expected impact.** More due reviews done on time.
- **Risks.**
  - Notification fatigue.
  - Learners coming to depend on reminders (X6).
- **Measure.** A/B `reviews_due_nudge` against streak-only reminders. Primary metric: share of due reviews done within 48 hours. Secondary: 30-day probe recall. Guardrail: opt-out rate.

---

## 3. Content and curriculum

Content is now the binding constraint: about 43 Kurmanji words, no Sorani course, no listening or speaking items. Every engine improvement multiplies whatever content exists.

### C1. Build the Kurmanji core course to a real A1–A2 scope

- **Build or change.**
  - **Scope.**
    - **Size (planning estimate, not from the notes).** A1 within about 6 months and A2 by about 12. That means roughly 600–800 lemmas and chunks for A1, and about 1,500 by the end of A2.
    - **Sequencing.** By frequency where corpus data exists, weighted by editor judgement, because Kurmanji corpora are small. And by learners' real needs: family, home, food, greetings, Newroz, introductions.
  - **Every item** has native audio (A1), a gloss in the UI language, variety and script tags, and lexeme tags (E2).
  - **Exercise types.**
    - Use all six types.
    - Put listening and speaking items in every unit; there are none today.
    - Add the new sentence-building type (E5).
  - **Chunks** are taught as wholes: greetings, fixed phrases, and light-verb constructions such as *dest pê kirin* "to begin" (editors to choose the set).
  - **Grammar units.** Each has a short explicit note, then comprehension and production practice:
    - ezafe (*-ê*, *-a*, *-ên*, and *-yê*/*-ya* after vowels);
    - oblique case;
    - gender (teach nouns with their ezafe or demonstrative form, because bare nouns don't show gender);
    - present tense;
    - past-tense ergative alignment (*Ez çûm* "I went" vs *Min ew dît* "I saw him/her");
    - possession.

    Accept attested regional variants with a note.
  - **Contrastive translation items.** Keep some, for collocations and light verbs.
  - **Unit endings.** Each unit ends in a can-do statement (C8) and a small meaning-focused task: introduce your family, or leave a voice message for a relative.
- **Why.**
  - **Confirmed: deliberate study fades.** It gives fast gains but decays: delayed form recall 25.1%, meaning recall 39.4%. It needs spaced retrieval and repeated encounters.
  - **Moderate or unverified: chunks.** Learning them whole works better than word by word (Boers).
  - **Moderate: grammar.** Explicit grammar plus practice (`sla_theory.md` Q2–Q3).
  - **Expert opinion: balance.** No more than about 25% of learning time on deliberate item study (Nation's four strands). The rest goes to reading and listening (C4), output (A3, S1) and fluency (E10).
  - **Weak: translation.** It has some direct support (Laufer & Girsai 2008; background), so do not purge contrastive translation items.
  - **Today.** 15 lessons, 31 exercises, about 43 words (`hevalo_current_state_backend.md` §2).
- **Builds on.** `api/content/kurmanji-seed.json` format; `api/src/content/import.ts`; `skills.grammar_md`.
- **Audience.** Everyone. **Effort.** L, ongoing. It needs Kurdish editors and voice talent.
- **Depends on.** C2 and A1. C3 for glosses.
- **Expected impact.** Without it, engine gains have nothing to act on.
- **Risks.**
  - Rushed or AI-generated content of poor quality (A8 rules apply).
  - Dialect bias toward one region.
- **Measure.**
  - Coverage dashboard: share of items with audio, gloss and tags.
  - Per-unit 7- and 30-day probe recall.
  - Learning curves to flag bad items (M2).
  - Can-do checkpoint pass rates.

### C2. Authoring tools that non-engineers can use

- **Build or change.**
  - **Structure.** A browser for courses, units, skills and lessons, with create, edit and delete. Today these come only from the JSON import.
  - **Editing.** A form per exercise type, replacing the raw JSON textarea (`admin/src/pages/Content.tsx:195,214`).
  - **Preview.** A live preview, by wiring in `admin/src/preview.ts`, which builds the mobile view-model but is unused.
  - **Grammar notes.** A grammar-note editor.
  - **Media.** Audio and image upload for exercises and dictionary entries, reusing the alphabet studio's in-browser record, trim and loudness pipeline (`admin/src/pages/AlphabetAudio.tsx`, `admin/src/audioClip.ts`).
  - **Lint checks.**
    - spread of answer positions;
    - accepted answers with and without diacritics;
    - Hawar and Sorani script validators;
    - missing audio, gloss or tags.
  - **Item statistics.** p-value, distractor choice rates, median latency, and a learning curve per knowledge component.
  - **Localisation fields** for prompts, hints and explanations.
- **Why.** Enabling. Content volume is the bottleneck, and the editors who can write Kurdish are not engineers (`hevalo_current_state_mobile_admin.md` §9.2).
- **Builds on.** `api/src/content/admin-routes.ts`; `admin/src/pages/Content.tsx`; `admin/src/preview.ts`; `admin/src/pages/AlphabetAudio.tsx`.
- **Audience.** Editors, and through them everyone. **Effort.** M–L.
- **Depends on.** E2 for tags and item statistics (can follow later).
- **Expected impact.** More, better items per editor-week.
- **Risks.** Tool scope creep. Ship forms and preview first.
- **Measure.** Items authored per editor-week. Share of items passing lint.

### C3. A curated bilingual learner glossary

- **Build or change.**
  - **Scope.** A curated core lexicon: Kurmanji first, Sorani after. Start with the course vocabulary and the most frequent words, and grow toward 5–10k lemmas over time.
  - **Each entry has:**
    - lemma, part of speech, gender;
    - ezafe forms and key inflections;
    - glosses in **en, tr, de and ar** first, then fr, es and nl;
    - an example sentence with audio;
    - frequency rank;
    - variety and script tags, and dialect variants;
    - a "cousin word" link to the other variety (the KurdishBLARK Sorani–Kurmanji–English parallel corpus can seed this);
    - an editor-reviewed flag;
    - a child-safe flag.
  - **Lemmatiser.** Map inflected forms in texts to lemmas (KLPT can seed this).
  - **Starting material.**
    - The ~8,200 Kurmanji and ~1,700 Sorani English-glossed senses from the kaikki import.
    - Wîkîferheng, for Kurdish definitions and inflections. It is CC BY-SA, so derived data must be shared alike.
- **Why.**
  - **Glosses.** Glossed reading nearly doubles incidental word learning: 45.3% vs 26.6% immediately (confirmed; `social_collaborative_verification.md` row 8).
  - **First-language glosses.** They beat Kurdish-language glosses by about 4 points (unverified).
  - **The existing dictionary cannot do this job, and three fact-checks refute the premise that it can.** Its roughly 400k entries:
    - have Kurdish-only definitions;
    - ship empty (0 entries seeded);
    - are mostly inflected forms and proper nouns.

    It cannot supply glosses in learners' languages, ground explanations, or level texts (`ai_llm_tutoring_verification.md` row 12; `market_landscape_verification.md` row 12; `social_collaborative_verification.md` row 12).
  - **A prerequisite.** The glossary is needed for C4, S1, A7, Q2 cards, C4 levelling and the kids' dictionary filter (K0).
- **Builds on.** `api/src/dictionary/*` (entries → senses with `definition_en`/`definition_ku`, examples, `dict_audio`); `shared/src/ferheng.ts`; `api/src/dictionary/import-runner.ts`; `docs/admin/dictionary-import.md`.
- **Audience.** Everyone. **Effort.** L, ongoing.
- **Depends on.** C2 for editing.
- **Expected impact.** Unlocks the reading, explanation and saved-word features.
- **Risks.**
  - Licence obligations.
  - Uneven quality between UI languages.
  - Dialect bias.
- **Measure.**
  - Share of course and reader tokens covered by glossed lemmas.
  - The funnel from look-up to save to 30-day recall.

### C4. A graded reading and listening shelf

- **Build or change.** A curated, levelled shelf inside the existing library.
  - **Texts.** Short narratives written or adapted for learners: folk tales, family life, Newroz, diaspora life. Every text is editor-corrected and has native audio.
  - **Reading support.**
    - Karaoke-style word highlighting driven by the audio, with self-paced reading also available (A/B).
    - Tap-to-gloss from C3 in the UI language, with an optional "guess first" mode (choose the meaning from 2–3 options).
    - One-tap save to review, keeping the sentence as context.
    - A pre-teach of 3–5 key words before a story.
  - **Checking understanding.** 2–4 comprehension questions per text.
  - **Levelling.**
    - A "readable for you" label computed from the learner's known lemmas: start at about 95% known words for glossed reading and about 98% for fluency reading. These are defaults to test, not gates.
    - Decodable mini-stories after the alphabet (C7).
  - **Listening support.** Captions and transcripts on by default for beginners, fading to none, with uncaptioned listening checks.
  - **Seeding the shelf.**
    - Licensed material: *Hano* magazine, bilingual picture books, and Zarok TV's own productions. Dubbed cartoons are probably not licensable; check rights.
    - Editor-selected community posts, credited to their authors (S1).
- **Why.**
  - **Extensive reading.** d ≈ 0.46–0.57 against controls. That is small by L2 benchmarks, and the notes' "medium" label is overstated (`sla_theory_verification.md` row 1).
  - **Glossing.** Confirmed (row 8 above).
  - **Text type.** Narrative texts, and texts written for learners, beat expository and native texts (Moderate).
  - **Reading while listening.** It beat reading alone only when the audio set the pace (g = 0.41 vs 0.06). But the citation is misattributed and the outcome was comprehension (`multimedia_ux_verification.md` row 2). So karaoke is a design to A/B-test, not an established effect.
  - **Captions.** g = 0.56, which is only 3–4.5 percentage points more words learned (row 1).
  - **Coverage thresholds.** They come from English unassisted reading. Comprehension rises gradually with coverage, with no cliff, and Kurdish needs a lemmatiser before any coverage figure means anything (`sla_theory_verification.md` row 3).
  - **The "beginner trap".** Apps produce starters, not independent users (revitalisation case studies; Weak). Graded input is the bridge.
- **Builds on.** `api/src/library/*` (`library_posts`; its `language` field is unused); `web/src/pages/LibraryPostPage.tsx`; `mobile/src/library/AudioPlayer.tsx`.
- **Audience.** Adults, Heritage, Teens. For young children see K1: no pop-up glosses inside narrated stories.
- **Effort.** L. **Depends on.** C3, A1, E2.
- **Expected impact.** Meaning-focused input, the strand gamified apps under-supply.
- **Risks.**
  - Thin supply of texts.
  - Licensing.
  - Glosses becoming a crutch (fade them).
- **Measure.**
  - 30-day recall of words met in readers and saved.
  - Comprehension accuracy by level.
  - Item-level A/B on gloss type (guess-first vs direct) and on karaoke vs self-paced. Primary metric: delayed recall of glossed words.

### C5. Heritage literacy track: "Read and write what you already speak"

- **Build or change.** A track with adult themes for learners who understand or speak Kurdish but cannot read or write it.
  - **Sound-to-spelling mapping.**
    - Hawar: ê/î/û vs e/i/u, ç, ş, x and q.
    - Sorani: vowel letters و ۆ ێ ی, plus ڕ and ڵ.
  - **Writing.** Dictation in strict mode (E7), and spelling of words the learner already says.
  - **Reading.** Read-aloud alongside native audio, then short texts on familiar topics.
  - **"You already say this" grammar notes.** These are guided noticing: familiar example sentences first, then the rule, then practice. Cover ezafe, the ergative past and gender.
  - **Variants.** "Standard vs common spoken" notes, and attested variants are never marked wrong.
  - **Contrastive tips per UI language** (examples to be validated by native editors):
    - **Turkish speakers.** ç and ş are as in Turkish; ê, î and û are new; Turkish ı is not Kurmanji i.
    - **German, Dutch and English speakers.** ş ≈ "sch"/"sh", ç ≈ "tsch"/"ch", c ≈ "dsch"/"j", x ≈ "ch" in *Bach*.
    - **Arabic and Persian readers learning Sorani.** Vowels are written, there are extra letters, and ە ≠ ه.
  - **Scaffolds fade quickly.**
- **Why.**
  - **Weak.** The heritage profile (strong listening, weak literacy) comes from an unverified US survey.
  - **Moderate.** Heritage speakers do worse on explicit, metalinguistic tasks, so explain through examples they already know (`heritage_minority_kurdish_verification.md` row 2).
  - **NGO source.** Persian-only schooling in Iran is linked to low Kurdish literacy. Turkish- and Arabic-schooled Kurds bring transferable script knowledge.
  - **Overall.** There is no Kurdish outcome evidence. This is a strong design hypothesis.
- **Builds on.** The web alphabet module (contrastive `LIKE` tables in 7 languages, `web/src/alphabet/letters.ts`); E7; E9 routing.
- **Audience.** Heritage. **Effort.** M–L. **Depends on.** E7, E9, A1, C7.
- **Expected impact.** Targets the likely bottleneck of the largest audience.
- **Risks.**
  - Some heritage learners are weak speakers too. Route them to an oral track (E9).
- **Measure.**
  - Dictation accuracy at 7 and 30 days.
  - Reading speed and comprehension on decodable texts.
  - Retention in the heritage segment.

### C6. A Sorani course, and a content model aware of dialect and script

- **Build or change.**
  - **Data model and routing.**
    - Add `target_dialect` on users, and a course switcher.
    - Keep separate item banks and ability scales for Kurmancî and Soranî.
  - **Sorani A1 course.** Build it from day one with:
    - Arabic-script normalisation (Q7);
    - native audio;
    - units on Sorani-specific grammar:
      - pronoun clitics;
      - definiteness (*-eke*);
      - ezafe;
      - the past-transitive clitic agent, Sorani's own ergative pattern, which needs units just as Kurmanji's does.
  - **Other varieties.** A "how does your family say it?" variant-submission flow. Badînî and other varieties as tags, later.
  - **Copy.** Stay neutral in the language-vs-dialect debate.
  - **Script transliteration (Latin ↔ Arabic).** Offer it only as an opt-in aid, and only after measuring its error rate. Sorani script does not write short /ɪ/, and و and ی can each be a vowel or a consonant.
- **Why.**
  - **Today.** Sorani has 0 courses and no answer normalisation (`hevalo_current_state_backend.md` §12).
  - **Sorani ergative.** Sorani also has ergative-like past-transitive marking (background; `heritage_minority_kurdish_verification.md` row 7).
  - **Transliteration.** Its accuracy is unmeasured (row 12).
  - **Dialect mismatch.** It is the most likely Kurdish-specific complaint (market inference; Weak).
- **Builds on.** `courses.dialect`; the Wîkîferheng `sor` import; the Sorani alphabet (34 letters); Sorani support in the rhyme game.
- **Audience.** Sorani learners, Iraqi and Iranian Kurds and their diaspora. **Effort.** L.
- **Depends on.** Q7, C2, A1, C3 (Sorani glosses).
- **Expected impact.** Opens Hevalo to a large audience it cannot serve today.
- **Risks.** Splitting a small editorial team. Sequence Sorani after the Kurmanji pipeline works.
- **Measure.** The same probe metrics, split by variety, plus DIF by variety.

### C7. Alphabet: persist it, schedule it, bring it to mobile, lead it into reading

- **Build or change.**
  - **Persist and schedule.** Store "Check yourself" results on the server. Letters and sounds become items in E2, with spaced rounds across days. The "Nothing is saved" copy goes.
  - **Mobile.** Port the module to mobile.
  - **Native audio.**
    - Replace the eSpeak clips with native recordings through the existing admin studio.
    - Record more voices.
  - **"Listen and choose" perception rounds.**
    - For contrasts the script marks: e/ê, i/î, u/û; Sorani ڕ/ر and ڵ/ل.
    - For contrasts Hawar does not mark (aspirated vs unaspirated p, t, k, ç), only after Kurdish linguists confirm them and rank them by importance. Accept speakers whose dialect lacks the contrast.
  - **Sorani joining.** Teach the positional forms and joining explicitly.
  - **Handwriting.** An optional stage for Sorani, and for children, labelled experimental.
  - **Into reading.** After about 6–10 letters, unlock decodable mini-stories with audio (C4).
- **Why.**
  - **Moderate: letters suit apps.** App effects are largest for constrained skills such as letters and phonics: +0.31 SD overall in rigorous studies, but from first-language literacy apps (Kim et al. 2021; `children_verification.md` row 4).
  - **Perception training.** It gives large gains in perception (g about 0.7–1.0; unverified). Variety of talkers may not be what matters (`speech_audio_tech_verification.md` row 2). Perception practice with feedback is the solid part.
  - **Handwriting.** It beat typing for adults learning Arabic letters, but with pen on paper (Wiley & Rapp 2021; unverified). The touchscreen version is untested.
  - **Aspiration contrast.** The source is reference-level, and its importance is unknown (row 4, omitted item 6).
- **Builds on.** `web/src/alphabet/*` (`practice.ts`, `Practice.tsx`, `letters.ts`); `shared/src/alphabet-audio.ts`; `api/src/alphabet/routes.ts`; `admin/src/pages/AlphabetAudio.tsx`.
- **Audience.** Everyone; it is the core of kids' mode for ages 6–8. **Effort.** M. **Depends on.** E2, Q5.
- **Expected impact.** Durable letter–sound knowledge, and a fast route into reading.
- **Risks.** Marking dialect speakers wrong on contrasts that their dialect lacks.
- **Measure.** Letter–sound accuracy at 7 and 30 days. Transfer to dictation of new words.

### C8. Kurdish can-do statements and per-level inventories

- **Build or change.**
  - **Statements.** Per-unit "I can…" statements in learners' UI languages, adapted from the CEFR Companion Volume and its young-learner descriptors. Examples: "I can introduce my family in Kurmancî"; "I can read street signs in Soranî script".
  - **Can-do map.** A map beside the course map. A can-do is ticked only after delayed, unassisted success, not on the same day.
  - **Self-checks.** Periodic self-checks, with any gap between self-rating and measured performance shown as information.
  - **Inventories.** Per-level vocabulary bands and grammar points, written with Kurdish teachers.
  - **Wording.** Say "aligned to CEFR descriptors", never "certified".
  - **Existing curricula.** Acknowledge the official Kurmancî elective curriculum in Turkey and the KRG's curricula.
  - **Later.** A standard-setting workshop with teachers from German heritage-language classes (HSU), Swedish mother-tongue teaching and KRG diaspora schools.
- **Why.**
  - **Competence feedback.** Informational feedback about competence supports motivation (Moderate, contested).
  - **Progress monitoring.** d = 0.40, larger when progress is recorded or reported (Harkin 2016; confirmed at snippet level; mostly health studies).
  - **Self-assessment.** Against can-do statements it raised self-efficacy in one small study (Weak). Children's self-ratings need checking against performance.
  - **"First Kurdish CEFR framework".** No Kurdish CEFR framework was confirmed, but the search failed. Claim "first openly published one we know of" only after checking (`adaptive_assessment_verification.md` row 10).
- **Builds on.** The course map (`api/src/coursemap/*`); achievements (Q10).
- **Audience.** Everyone. **Effort.** M.
- **Expected impact.** Learners see real competence growing. A credibility asset with schools.
- **Risks.** Implying certification.
- **Measure.** Can-do pass rates. Correlation between self-ratings and probe performance.

### C9. Learning content in learners' own languages

- **Build or change.**
  - **What to translate.** Prompts, hints, explanations, grammar notes, and course, unit and skill titles. Titles are `title_en` everywhere today.
  - **Order.** **tr, de and ar** first: the Turkey-origin diaspora, in-region Kurds, and Arabic-literate Sorani learners. Then fr, es and nl.
  - **Fallback.** A fallback chain for missing translations, plus the contrastive tips from C5.
  - **New UI locales.**
    - **Persian (fa)** for Iranian Kurds. It is arguably more urgent than Swedish.
    - **Swedish (sv)** mainly for children and parents in Sweden.
- **Why.**
  - **Explanations.** Explanations in the learner's first language beat target-language-only explanations for vocabulary, especially for young learners (Lee & Macaro 2013; unverified, Moderate).
  - **Glosses.** First-language glosses beat Kurdish glosses.
  - **Caveat.** A diaspora child's strongest language may be the school language (de, sv), not the parents' language (tr, ar) (`sla_theory_verification.md` row 7). Let families choose.
  - **Persian before Swedish.** That ordering comes from `heritage_minority_kurdish_verification.md` row 10.
- **Builds on.** `title_ku`/`title_en` fields; `shared/src/locales.ts`; the i18n catalogues (874 keys on mobile, about 1,218 on web).
- **Audience.** Everyone. **Effort.** M per language.
- **Depends on.** C2 localisation fields.
- **Expected impact.** Learners understand explanations in their own language.
- **Risks.** Translation quality. Use native reviewers.
- **Measure.** Completion and probe recall by UI language. DIF checks.

### C10. A sustainable content pipeline

- **Build or change.**
  - **Editors.** A paid core team for Kurmancî and Soranî.
  - **Community contributions.** Moderated contributions of sentences, variant forms, recordings and story narration, credited to the contributor.
  - **Validation.** Recordings are validated by two votes, Common Voice style.
  - **Consent and licensing.**
    - Explicit consent and a licence per contribution.
    - Adults only.
    - A separate, explicit opt-in for any open licence (which is irreversible) or for use in speech-model training.
    - Never openly license children's voices.
    - Grandparents and other relatives give their own consent.
  - **Provenance badges.** "Recorded by a native speaker"; "reviewed by a Kurdish editor".
- **Why.**
  - **Weak.** Duolingo ended its volunteer course-builder programme in 2021 and paused Welsh development in 2023 (details unverified). Volunteer-only and platform-dependent models are fragile.
  - **Personal data.** Voice recordings are personal data (GDPR; COPPA for children).
- **Builds on.** The community library and the admin audio pipeline.
- **Audience.** Editors and contributors. **Effort.** M.
- **Expected impact.** Content keeps growing after launch.
- **Risks.** Volunteer burnout, and quality drift.
- **Measure.** Accepted contributions per month, and editor acceptance rate.

---
## 4. Speech, audio and AI: what is realistic for Kurdish today

### What Kurdish speech and language technology can and cannot do (October 2026)

Sources for this table: `speech_audio_tech.md` and its verification, and `ai_llm_tutoring.md` and its verification. All accuracy figures come from single papers or vendor claims; none were measured on Hevalo's own users.

| Capability | Kurmanji | Sorani | Verdict for Hevalo |
|---|---|---|---|
| Native recorded audio | Human recording | Human recording | **Do now.** This is the gold standard. |
| Perception drills ("which did you hear?") | Needs only recordings | Needs only recordings | **Do now.** |
| Record-and-compare, shadowing | Needs only recordings and a microphone | Same | **Do now** (after Q5). |
| Speech recognition of read speech, adults, known target text | Fine-tuned Whisper about 10.5% WER in-domain, about 28% WER on the FLEURS-Kobani benchmark. Whisper has no Kurdish out of the box. Meta's Omnilingual ASR lists kmr_Latn, but a published evaluation on Badini (a Kurmanji variety) was negative. | XLS-R about 10–12% WER. Hosted options: Google Chirp 3 ckb-IQ (preview); ElevenLabs Scribe (vendor claim). | **Pilot only.** Use it to check whether an adult said a known target word, scored leniently, and only after an in-house evaluation. In-domain accuracy is similar for the two varieties. |
| Scoring pronunciation sound by sound | No labelled learner data and no published method | Same | **Not feasible yet.** Collect data first. |
| Detecting the aspiration contrast (p/pʰ, t/tʰ, k/kʰ, ç/çʰ) | Not written in Hawar; varies by dialect | n/a | **Research project only.** |
| Children's speech | English child speech already gives several times the adult error rate; there is no Kurdish child data | Same | **No automatic scoring for children.** |
| Text-to-speech | Thin. The only confirmed MMS Kurmanji model is in Arabic script, and its licence is probably non-commercial. Small vendors' claims are unverified. | Research F5 models report MOS 3.9–4.7, from single teams; one public release leaked test data into training. ElevenLabs lists Sorani (vendor claim). | **Listening volume only**, labelled, after native raters check it. Never the pronunciation model for teaching items. |
| Large language models writing Kurdish | No benchmark. The only test is an informal one: 5 Sorani prompts, 3 models. Risk of Arabic, Turkish and Persian words slipping in, and of script errors. | Same | **Offline drafting with human review only.** Explanations written in the UI language, quoting only vetted Kurdish. |
| Real-time AI voice conversation | Not supported by mainstream APIs (unresolved for Gemini Live) | Unresolved | **Not now.** |

### A1. Native recordings for every teaching item

- **Build or change.**
  - **Recording drive.** Record every course word, chunk and sentence with native speakers.
  - **Several voices for core items.** Use 3–5 or more per core item: mixed gender and age, and several regional varieties:
    - Kurmanji: Serhed, Botan, Badînî.
    - Sorani: Silêmanî, Hewlêr and others.
  - **Metadata per clip.** Speaker, variety, region, consent and licence.
  - **"Slow, careful" native takes** for key sentences, instead of time-stretching audio.
  - **Recording tool.** Reuse the alphabet studio's in-browser pipeline (C2).
  - **Aspiration check.** For items used to teach the aspiration contrast, verify that the speaker's dialect actually has it.
- **Why.**
  - **Weak: the market bar.** "Every word recorded by a native speaker" is what the Kurdish competitors (Dialect, uTalk) advertise (vendor).
  - **Many voices.** Justify them by dialect coverage and natural input, not by the training-research literature. A meta-analysis found no gain beyond a few talkers, and a large replication found no advantage for high-variability training (`speech_audio_tech_verification.md` row 2, omitted item 1).
  - **TTS.** The claim that TTS *cannot* model unwritten contrasts is overstated: end-to-end TTS learns word-specific pronunciations. But Kurmanji TTS is unproven, so native audio stays the default for teaching items (row 4).
- **Builds on.** `admin/src/pages/AlphabetAudio.tsx` and `admin/src/audioClip.ts`; `dict_audio`; exercise `audioUrl`.
- **Audience.** Everyone. **Effort.** L, ongoing. Budget for voice talent.
- **Depends on.** C2 upload, Q5 playback.
- **Expected impact.** Unlocks listening, speaking, perception drills and child mode.
- **Risks.** Volume. Prioritise by frequency band.
- **Measure.** Share of teaching items with native audio (target 100%). Accuracy on listening items. Rater spot checks.

### A2. Listening and perception drills (no speech recognition needed)

- **Build or change.**
  - **Listening items in every unit.** The listening exercise type exists but has zero items.
  - **Audio-first steps.** Listen, then choose the picture or meaning, before seeing any text.
  - **"Listen and choose" minimal pairs.**
    - Contrasts taken from C7.
    - Immediate feedback and replay.
    - Rotating voices, with some voices held back as a "new voices" generalisation check.
  - **Dictation.** "Wordle by ear" and race dictation, always paired with a meaning question.
  - **Captions and transcripts.** On by default for beginners, fading to none, with uncaptioned listening checks. Skip a keyword-only caption stage; it has no support.
  - **Speed.** Keep 0.75× as a comfort option.
- **Why.**
  - **Unverified: perception training.** It gives large gains in perception (g about 1.0, about 0.7 after correcting for publication bias), but only modest transfer to pronunciation (`speech_audio_tech_verification.md` rows 2–3).
  - **Mixed: dictation.** It improved sound recognition but not overall listening.
  - **Slower speech** is a comfort feature with mixed benefit for comprehension.
  - **Moderate: listening input.** Vocabulary gains from listening are comparable to reading, across studies (row 12).
  - **Keyword-only captions** were no better than full captions (background; `multimedia_ux_verification.md` omitted item 8).
- **Builds on.** `mobile/src/lesson/components/ListeningExercise.tsx` (0.75× exists); the `listening` type in `exercises.ts`; Wordle and race.
- **Audience.** Everyone. **Effort.** M. **Depends on.** Q5, A1.
- **Expected impact.** More listening practice. The skill is under-supplied today.
- **Risks.** Captions becoming a crutch, so the uncaptioned checks are required.
- **Measure.** Item-level experiment comparing audio-first and text-first introduction of new words. Measure listening and meaning recall at 7 days, and perception accuracy on the held-out voices.

### A3. Speaking practice without automatic scoring: record-and-compare, and shadowing

- **Build or change.**
  - **Speaking items.** Speaking has zero items today. Build them as record-and-compare: the learner's own clip next to the native model, with an optional waveform or pitch overlay.
  - **Shadowing mode.** The learner speaks along with native audio for sentences and dialogues.
  - **Self-rating.** Use the Q6 self-rating.
  - **"Say it to a family member."** For heritage learners: the family member confirms.
  - **Ordering.** Always follow a perception block with a "now you say it" step.
  - **Unit-end speaking task.** For example, a voice message introducing your family, optionally shared with a friend or the family circle (S5, K6).
- **Why.**
  - **Moderate.** Pronunciation instruction works, especially with feedback and on controlled tasks (d about 0.8; older meta-analysis).
  - **Weak.** Shadowing tentatively helps comprehensibility and fluency (systematic review).
  - **Weaker in free speech.** Effects are smaller in spontaneous speech (`speech_audio_tech_verification.md` omitted item 2).
  - **The case for speaking modes** rests on giving learners time to speak, not on the claim that apps uniquely fail at speaking. That claim is not established (`market_landscape_verification.md` row 5).
- **Builds on.** Q5, Q6; `mobile/src/library/VoiceRecorder.tsx`.
- **Audience.** Adults, Heritage. **Effort.** M. **Depends on.** Q5, Q6, A1.
- **Expected impact.** More speaking practice, with an honest model to compare against.
- **Risks.** Low uptake in public places. Keep "skip speaking" available.
- **Measure.** Native raters score how intelligible a sample of recordings is, at baseline and after 8 weeks (cohort level). Speaking-task completion.

### A4. Evaluate Kurdish speech recognition first, then add narrow word checks

- **Build or change.** Four steps, in order.
  1. **Evaluation set.**
     - About 1–2 hours per variety.
     - Every speaker appears in only one split.
     - Speakers are consenting adults: native speakers, adult learners and heritage speakers, tagged by dialect.
     - Include deliberately mispronounced tokens recorded by native speakers.
     - Normalise script before computing error rates.
     - No children's audio.
  2. **Candidate models.**
     - Meta's Omnilingual ASR 300M (Apache 2.0; lists Kurmanji and Sorani; note the negative Badini result).
     - XLS-R or Whisper fine-tuned on Common Voice Kurmanji (about 68 h) and FLEURS-Kobani (CC BY 4.0).
     - Hosted Sorani services (Google Chirp 3 preview, ElevenLabs Scribe).
     - Check every licence: MMS weights are probably non-commercial.
     - Prefer CTC models without a strong built-in language model. Whisper-style models tend to "auto-correct" a learner toward the expected word.
  3. **Measure the right thing.** Measure false accepts and false rejects on the mispronounced tokens, not word error rate on native speech.
  4. **Only if those rates are acceptable**, implement `PronunciationScorer` as a narrow check:
     - "did you say the target word", with forced alignment and per-letter confidence;
     - show which letter was weak;
     - score leniently;
     - never withhold XP, streak, Zêr or progress because of a speech-recognition verdict;
     - adults only;
     - run on the server first, and on the device later for privacy (`react-native-sherpa-onnx` through an Expo development build).
- **Why.**
  - **Confirmed core.** Speech-recognition feedback on pronunciation gives g = 0.69 (CI 0.31–1.08), and explicit feedback 0.86 vs 0.50 for indirect feedback. These are ESL adults on controlled tasks (`speech_audio_tech_verification.md` row 1).
  - **Kurdish error rates come from single papers.** About 10–12% WER in-domain for both varieties, and 28% out of domain for Kurmanji (row 5).
  - **Unproven, not just untested.** No Kurdish paper on detecting mispronunciations exists, and no labelled learner dataset.
  - **Language-model audio scoring.** Zero-shot LLM audio models score poorly even in English (r ≈ .45 vs .81 for specialised models; unverified). Don't use them until they beat a baseline on Hevalo's evaluation set (row 10).
  - **Overall.** Moderate for the feedback type; Weak for Kurdish feasibility.
- **Builds on.** `api/src/content/speaking-scorer.ts` (`PronunciationScorer` interface); uploads in `api/src/media/voice-routes.ts`.
- **Audience.** Adults. **Effort.** L. The harness is P2; scoring is P3.
- **Depends on.** A1, A3, adult consent flows (C10).
- **Expected impact.** Pronunciation feedback that is specific, for adults, if the models prove good enough.
- **Risks.**
  - False rejects for accented but intelligible speech, which demotivate learners.
  - False accepts, which hide real errors.
  - Dialect bias.
- **Measure.**
  - False-accept and false-reject rates on the evaluation set.
  - Agreement with native raters.
  - Then an item-level A/B: scored feedback vs record-and-compare, judged on native-rated intelligibility at 4–8 weeks.

### A5. Text-to-speech only for listening volume, labelled, after native raters check it

- **Build or change.**
  - **Where.** Use TTS only where recording is impossible:
    - long-tail dictionary entries;
    - read-aloud of community posts;
    - extra listening sentences.
  - **Labelling.** Mark it "computer voice", as the alphabet page already does.
  - **Sorani candidates.** The JSALT 2025 research F5 models, and ElevenLabs v4 (vendor claim).
  - **Kurmanji options.**
    - MMS, after checking the licence.
    - Small Kurdish vendors.
    - Fine-tuning an open TTS on consented voice-actor recordings.
  - **Native-rater gate.** Before release, about 10 native raters per variety score it blind:
    - naturalness (MOS);
    - word intelligibility;
    - a minimal-pair check for contrasts Hawar does not write.
  - **Perception drills.** Multi-voice TTS may add voice variety only for contrasts the script marks (background, `speech_audio_tech_verification.md` omitted item 7).
- **Why.**
  - **Weak: English TTS.** Learners rated English TTS close to human voices (older, small studies).
  - **No Kurdish evidence.** There are no independent quality ratings for Kurdish TTS.
  - **Data hygiene.** One public Sorani TTS release had test data leaked into its training data (audit, arXiv 2609.11246).
- **Builds on.** The "computer voice" labelling pattern (`web/src/alphabet/audio.ts`; `isSynthesised`).
- **Audience.** Adults. **Effort.** M. **Depends on.** A1 (rater pool).
- **Expected impact.** More listening input where recordings cannot reach.
- **Risks.** Learners copying wrong pronunciations; licence breaches.
- **Measure.** Rater thresholds. Item-level comparison of listening accuracy on TTS items vs native items.

### A6. HevalBench: test any language model on Kurdish before learners see its output

- **Build or change.**
  - **Size.** 200–400 test items per variety.
  - **What it tests.**
    - accuracy of grammar explanations, written in the UI languages;
    - **precision of error diagnosis** on real learner answers, including heritage and dialect forms that are correct;
    - sentence generation within a word list;
    - translation, against machine-translation baselines (Google Translate; NLLB, whose licence is non-commercial);
    - dialect purity;
    - lexical purity (no Arabic, Turkish or Persian substitutes where a Kurdish word exists);
    - script fidelity (Hawar without Turkish ı/ğ; Sorani with ی ک ە, not ي ك ة).
  - **Raters.** Separate native raters for each variety.
  - **When to run it.** On every model release. Choose a model per variety and per task.
  - **Provider terms.** Check each provider's terms on minors before choosing. The Gemini API's terms reportedly restrict services likely to be used by under-18s (unverified).
- **Why.** Weak; there is almost no evidence.
  - **No usable benchmark.** The only Kurdish model test is informal: 5 Sorani prompts across 3 models. It is a signal, not a ranking (`ai_llm_tutoring_verification.md` row 8).
  - **Over-correction.** Language models tend to "over-correct" learner text (background; omitted item 5).
  - **Known risks.** Words leaking in from other languages, dialect mixing, script errors, and invented rules about ergativity and ezafe.
- **Builds on.** Nothing; this is new. It is the gate for A7–A9.
- **Audience.** None directly; it is a quality gate. **Effort.** M. **Depends on.** Native raters (C10).
- **Expected impact.** Prevents shipping wrong Kurdish.
- **Risks.** The benchmark goes stale; re-run it on every model release.
- **Measure.** Benchmark scores per task and variety.

### A7. "Why was this wrong?" explanations: grounded, cached, reviewed

- **Build or change.**
  - **Correctness.** The exercise engine decides it. The model never does.
  - **The explanation.** On a wrong typed answer, the model writes an explanation in the learner's UI language. Its inputs:
    - the item and its accepted answers;
    - the learner's answer;
    - the unit's vetted grammar note;
    - glossary entries from C3 (not raw Wîkîferheng).
  - **Guards.** Kurdish is quoted only from those inputs, and script and lexicon validators run on every output.
  - **Cache.** One cache entry per item and normalised wrong answer.
  - **Review.** Native editors review the most frequent explanations. At launch, show only reviewed ones.
  - **Feedback.** Learners can mark an explanation "helpful" or "wrong".
  - **Who gets it.** Adults and teens. Children's free input is never sent.
  - **Price.** Do not paywall basic explanations. Cached explanations are cheap, and the corrective-feedback evidence supports them; the claim that Duolingo made its version free is unverified.
- **Why.**
  - **Moderate: elaborated feedback** helps (E6).
  - **Bastani et al. 2025:**
    - unguarded AI raised practice scores by 48% but lowered exam scores by 17%;
    - the guarded tutor only removed the harm; it did not add learning (`ai_llm_tutoring_verification.md` row 3).
    - So the explanation comes after the learner's attempt and never gives the answer in advance.
  - **Grounding.** The dictionary is not a vetted source to ground explanations in (row 12; refuted premise).
- **Builds on.** E6's `explanation` field; C3; A6.
- **Audience.** Adults, Teens. **Effort.** M. **Depends on.** C3, A6, E6.
- **Expected impact.** Faster correction of misunderstood patterns.
- **Risks.** Wrong explanations. Mitigate with review-before-show, a report button and native-editor audits.
- **Measure.** Item-level A/B, explanation vs correction only. Primary metric: recall at the next due review and repeat errors on the same pattern. Also track error reports per 1,000 explanations shown.

### A8. AI drafts content offline; humans approve it

- **Build or change.**
  - **Batch drafting.** Generate drafts in batches of:
    - example sentences for glossary lemmas;
    - distractors;
    - story drafts within a known-word list;
    - rhyme sets;
    - quiz items.
  - **Checks.** Run validators on every draft: script, glossary coverage (a coarse filter only) and a dialect lexicon. Then native editors review it.
  - **Release.** Publish only approved items, with provenance labels.
  - **No live generation.** Learners never see live Kurdish generation in this phase.
- **Why.** Weak.
  - **Analogy.** AI that helps human experts works: Tutor CoPilot gave +4 percentage points in topic mastery, but with human tutors and in maths (`ai_llm_tutoring_verification.md` row 4).
  - **Trust.** Duolingo's 2025 "AI-first" backlash (model knowledge) shows that trust in AI-made content is fragile.
  - **Quality.** Kurdish model quality is unknown.
- **Builds on.** C2 review workflow (`draft → in_review → published`).
- **Audience.** Editors. **Effort.** M. **Depends on.** A6, C2.
- **Expected impact.** Faster content growth.
- **Risks.** Subtle errors that editors miss. Track item statistics separately by origin.
- **Measure.** Editor acceptance rate. Item statistics (p-values, learning curves) for AI-drafted vs human-written items.

### A9. Text role-play for adults, bounded to the unit (later)

- **Build or change.** Build this only in months 9–12, and only if HevalBench passes.
  - **Scope.** Text conversations limited to a scenario and to the current unit's vocabulary, for example "order tea" or "introduce yourself to a grandparent". 6–10 turns each.
  - **Feedback** comes after the conversation: accuracy, plus one better phrasing. Every correction is checked against the editors' list of attested variants.
  - **Code-switching.** Accept it from heritage learners: reply in Kurdish, recasting the switched word with a gloss.
  - **Limits.** No persona memory, a clear AI disclosure, adults only at first, and a daily cap.
  - **Voice.** Only after speech recognition and TTS have been validated.
  - **Positioning.** Present it as rehearsal before talking to people (S6).
- **Why.** Weak, and speculative for Kurdish.
  - **Small effects.** Chatbot and dialogue-system meta-analyses give g ≈ 0.58–0.61, small to medium.
  - **Inflated evidence.** Short studies inflate the effects. Samples are mostly English-as-a-foreign-language university students, and older, pre-LLM systems are included.
  - **Anxiety.** Reduced anxiety rests on a handful of small, self-report studies.
  - **No durable gain.** No cited trial shows a lasting gain from AI tutoring (`ai_llm_tutoring_verification.md` rows 5 and 3, omitted item 3).
  - **California SB 243** has no education exemption. A named character may fall under it, so get counsel (row 11).
- **Builds on.** C1 units; A6; S6.
- **Audience.** Adults. **Effort.** L. **Depends on.** A6, C3, C1.
- **Expected impact.** Unknown.
- **Risks.**
  - Over-correcting dialect forms.
  - Wrong Kurdish.
  - Companion-chatbot law.
  - Cost.
- **Measure.** User-level A/B judged on a delayed speaking or writing task done without AI and rated by native speakers. Learners' self-reported confidence is not a primary outcome.

---

## 5. Kids and families

### K0. Child-safety must-haves: some now, the rest before any marketing to children

- **Build or change.**
  - **Phase A: now, even though Hevalo does not target children.**
    - **Neutral age screen** at sign-up on web and mobile: birth month and year, no default value, and no hint that older users get more. The API already accepts `birthDate` (`api/src/auth/routes.ts:44`), but no client sends it.
    - **Under-13s,** or anyone below their country's digital-consent age where consent is the legal basis:
      - no self-service account until parent-managed profiles exist;
      - show a polite stop page and a parent waitlist;
      - keep the country age table as data (DE/NL/IE 16, FR 15, ES/AT 14, SE 13; verify the rest).
    - **Under-18s.** Enforce `restricted_mode` on the server. It is stored but never read anywhere. Defaults:
      - DMs and group chat only with accepted friends, or off;
      - no friend suggestions;
      - private profile;
      - no free-text chat in public matchmaking;
      - public posting pre-moderated or off;
      - streaks and push notifications off unless the user opts in;
      - no loss-framed reminders;
      - a parental gate before any real-money purchase.
    - **Terms.** State the minimum age and the retention periods.
    - **SDKs.** No third-party SDKs in minors' sessions.
  - **Phase B: before marketing to children or launching kids' mode.**
    - **Accounts.**
      - Parent-owned family accounts.
      - Child profiles with a nickname and a preset avatar: no email, photo, full name or school.
      - Verifiable parental consent by an FTC-accepted method. Text message plus a confirmation step is allowed only when no child data is disclosed to third parties.
      - Stored recordings of a child's voice need that consent.
    - **Children's social features.**
      - Only the family circle and teacher classes.
      - Private game rooms joined by code.
      - Auto-generated Kurdish nicknames (for example "Şêrê Şîn"); emotes and preset phrases only, no free text.
      - No public feed.
      - A child-filtered dictionary, since a Wiktionary-derived list contains vulgar entries.
      - Images stripped of EXIF and location data; no selfies.
    - **Purchases and links.** A parental gate before the shop, purchases and external links. Children cannot buy Zêr.
    - **Data.**
      - A written information-security programme and retention schedule. The amended COPPA rule's compliance date was 22 April 2026.
      - Children's voice processed on the device or deleted promptly.
      - No language model ever receives a child's free text or voice.
      - A DPIA.
      - A UK Children's Code best-interests assessment.
      - An Ofcom children's risk assessment if UK children can reach any user-to-user feature.
      - Check the Texas and Utah app-store age-signal laws, and EU AI Act Art. 5 (no exploiting age-related vulnerabilities).
    - **App store.** Keep the main app out of Apple's Kids Category; `DEPLOY.md:172-175` already lists it as Entertainment. Build kids' mode to Kids Category standards anyway.
    - **Get legal advice on:**
      - whether the DSA's small-enterprise exemption (Art. 19) covers Hevalo;
      - the UK Online Safety Act's scope for the feed and DMs;
      - COPPA and stored voice;
      - the full EU consent-age table;
      - California SB 243;
      - any use in Turkish state classrooms.
- **Why.**
  - **Today.** Every account, at any age, can use DMs, group chat, the public feed and open matchmaking. No age is collected, and `restricted_mode` is never read (`hevalo_current_state_backend.md` §11).
  - **COPPA (amended).** In force. Its facts are consistent across several law-firm sources (`children_verification.md` row 9).
    - "Mixed audience" status requires a service *directed* to children. Launching kids' mode makes Hevalo child-directed.
    - Mere child usage already triggers COPPA once Hevalo knows a user is under 13.
  - **EU DSA Art. 28 guidelines.** Accounts private by default; messaging streaks and push notifications off by default for minors (confirmed). But they are a non-binding benchmark, they apply to under-18s, and Hevalo is probably exempt while small (`motivation_gamification_verification.md` row 11). Treat them as good practice.
  - **UK.** The ICO Children's Code is statutory. Its high-privacy defaults and Standard 11 (monitoring transparency) apply. Its final Standard 13 concerns privacy nudges, not streaks as such (row 12). Ofcom's codes say adult strangers must not be able to contact children by default.
  - **Manipulative design.** Present in 80% of apps used by 3–5-year-olds (Radesky 2022; confirmed).
  - **Overall.** Regulatory.
- **Builds on.** `users.birth_date`, `users.restricted_mode` (`api/migrations/1751000010000_consent.js`); `api/src/gdpr/consent.ts`; `api/src/auth/service.ts:355-362`; `api/src/moderation/*`; `api/src/trust/`; `notifications/prefs.ts`; server-side private rooms (`api/src/game/*`).
- **Audience.** Kids, Teens. **Effort.** Phase A M; Phase B L.
- **Depends on.** Legal review.
- **Expected impact.** A legal and ethical precondition, not a learning gain.
- **Risks.** Friction at sign-up. The age screen must be neutral, or people will lie.
- **Measure.** Compliance checklist complete. Share of accounts with an age band. Safety incident rates.

### K1. Kids' mode "Hevalo Zarok", by age band

- **Build or change.**
  - **Ages 3–5 (pre-readers).** Audio first.
    - Every instruction spoken in Kurdish, with an optional spoken prompt in the parent's language.
    - Picture choices and big tap targets.
    - No typing and no Wordle.
    - Songs and lullabies (*lorî*).
    - Action games: a character says *Destên xwe bilind bike!* ("raise your hands"), the child copies, a parent confirms.
    - Narrated, animated stories with matching sound, and no hotspots, mini-games or dictionary pop-ups inside the story.
  - **Ages 6–8.** The alphabet and phonics are the core (C7).
    - Hawar first, then Sorani letters with their positional forms.
    - Narration assembled from audio pieces, e.g. "*Tîpa* ş *dibêje* /ʃ/".
    - Native audio for every letter and word, because Hawar does not write every sound.
    - Decodable mini-stories; simple keystrokes.
  - **Ages 9–12.** The existing games in private rooms; very short explicit grammar tips, each followed by practice; captions.
  - **Every session:** ends on a "done for today" screen with an offline mission: "Ask Dayê what this is called"; "Sing the song at bedtime".
  - **Speaking:** listen, record and compare, or the parent judges. No automatic pass/fail.
  - **Before release:** score every activity on the Four Pillars: active, engaged, meaningful, socially interactive.
  - **Session length:** no evidence exists. Start with 3–7-minute units for ages 3–6 and A/B-test retention, not time in the app.
- **Why.**
  - **Educational apps** average +0.31 SD in rigorous studies, more for preschoolers and for letters and phonics. These are first-language literacy and maths apps (Moderate; `children_verification.md` row 4).
  - **Story features.** Multimedia in stories helps; interactive features distract, especially disadvantaged children (Takacs 2015; unverified; row 3).
  - **Pre-recorded video.** The deficit from pre-recorded video fades by about age 3, so narrated stories suit preschoolers. Live interaction matters mainly for under-3s (row 1).
  - **Explicit tips** help from about age 8 (Lichtman 2016; Moderate).
  - **Songs and action games:** the evidence is weak; use them for exposure and engagement.
  - **Children's speech recognition** is unreliable (confirmed; row 11).
  - **Hawar** is not fully phonemic: aspiration is unwritten (row 5).
- **Builds on.** The alphabet module; library audio; the deer avatar set; private rooms.
- **Audience.** Kids. **Effort.** L.
- **Depends on.** K0 Phase B, C7, A1.
- **Expected impact.** Measurable gains on letters and early vocabulary are plausible. Broader skills will need family input (K5, K6).
- **Risks.** Thin content. Licensing children's media.
- **Measure.** Letter–sound accuracy and picture naming of target words one week later. Parent-reported Kurdish use at home. **No time-in-app optimisation on children.**

### K2. Motivation that is safe for children

- **Build or change.**
  - **Remove for children:**
    - streak-loss messages;
    - leagues;
    - daily-login rewards;
    - countdowns and limited-time offers;
    - characters pleading for more play;
    - loot boxes;
    - hearts.
  - **Cosmetics** are earned only through learning milestones, and presented as surprise, informational celebrations: "You learned 5 animal words!"
  - **Cooperative goals:** family or class goals, plus personal bests.
  - **Streaks:** off by default. If any streak-like mechanic is offered, use weekly goals with built-in rest days.
- **Why.**
  - **Rewards.** Tangible rewards undermined children's motivation more than adults' in Deci et al., and praise boosted children's motivation less. Unexpected rewards did not undermine motivation (background). The debate is contested; overall Moderate (`children_verification.md` row 7).
  - **Lures.** Radesky's coding counts stickers, trophies and accumulating daily rewards as "lures", and pleading characters as "parasocial pressure" (confirmed; `market_landscape_verification.md` row 8).
  - **Gamification still helps.** Its motivational effect on primary pupils is small but *positive* (g = 0.31), so reshape the mechanics rather than strip them out.
- **Builds on.** `api/src/rewards/daily-cycle.ts`; `api/src/streaks/*`; `api/src/leagues/*`; `api/src/shop/*`; `api/src/achievements/*`.
- **Audience.** Kids. **Effort.** M. **Depends on.** K0, K1.
- **Expected impact.** Motivation that does not depend on loss aversion.
- **Risks.** Lower engagement numbers. That is acceptable for children.
- **Measure.** Learning metrics only (K1). No engagement-maximising experiments.

### K3. Spaced recycling for children

- **Build or change.**
  - **Pre-readers:** target words come back across songs, stories and games over several days, on a schedule the app controls. No flashcards.
  - **Ages 7 and up:** short, low-stakes spaced-review games with immediate feedback.
  - **Success targets:** test the success-target and retention settings (E3, E8) for children.
- **Why.**
  - **Mixed evidence.** One classroom study in grades 2–6 found no benefit (Goossens; unverified). A review of classroom retrieval practice found medium or large benefits in 57% of effects, and child experiments are positive (Karpicke 2016; Vlach). So "don't use spaced retrieval with children" is overstated (`children_verification.md` row 6).
  - **Children don't space practice on their own** (Vlach 2019; title only), so the app must do the scheduling.
  - **Overall.** Moderate.
- **Builds on.** E2, E3.
- **Audience.** Kids. **Effort.** M. **Depends on.** E2, E3, K1.
- **Expected impact.** Better retention of words met in kids' content.
- **Risks.** Repetitive content bores young children; vary the context.
- **Measure.** Picture naming and meaning at 1 week and 1 month. Item-level experiments (normal educational practice), with no engagement optimisation.

### K4. Parent view and weekly digest

- **Build or change.**
  - **Parent dashboard,** in the parent's UI language. It shows **what was learned**, not just minutes:
    - letters mastered;
    - words still known at the 7-day check;
    - stories finished;
    - songs learned.
  - **Weekly suggestions:** one offline activity and three phrases to use at home.
  - **Weekly digest:** by email or in the parent's app, instead of push notifications to the child.
  - **Transparency:** the child sees a clear "your parent can see your progress" sign.
- **Why.**
  - **Monitoring progress** improves goal attainment (d = 0.40), more when it is recorded or reported. Confirmed at snippet level, but mostly from health studies: Weak for this use.
  - **UK Children's Code Standard 11** requires the child to be told when they are being monitored (Regulatory).
  - **No evidence** exists on parent dashboards in language apps.
- **Builds on.** E2 learning data; `api/src/email/templates.ts` (auth and deletion only today).
- **Audience.** Kids and parents. **Effort.** M. **Depends on.** K0 Phase B, E2.
- **Expected impact.** Parents stay involved and see real progress.
- **Risks.** Parents turning the dashboard into pressure on the child. Show progress, not rankings.
- **Measure.** Digest open rate. Parent-reported Kurdish use at home.

### K5. Parent co-learning and shared-reading prompts

- **Build or change.**
  - **"Kurdish to say to your child" mini-course,** for parents who only partly speak Kurdish. It covers routines (meals, bath, bedtime, praise, questions), with audio.
  - **Shared-reading prompts.** While parent and child read a story together, show the parent 2–3 prompts per page, e.g. *Ev çi ye?* ("What is this?") and *Paşê çi dibe?* ("What happens next?").
  - **Measurement inputs.** Track how much prompted reading happens (dosage). Ask parents to self-report "Kurdish minutes at home".
- **Why.**
  - **Caregiver book-sharing training.**
    - Effects on children's language are small: expressive d = 0.41, receptive 0.26. The authors themselves call these "small".
    - The large d = 1.01 effect is on caregiver skill, after in-person training.
  - **Against active controls** the shared-reading effect is close to zero (Noble 2019).
  - **Home language input.** Parents' language patterns correlate with whether children speak the minority language. This is correlational, not causal (De Houwer 2007).
  - **Expect** small, dose-dependent effects. Weak (`children_verification.md` rows 2, 12).
- **Builds on.** C4 stories; K4.
- **Audience.** Kids and parents. **Effort.** M.
- **Depends on.** C4, K1.
- **Expected impact.** Small, and only with enough use.
- **Risks.** Parents who feel judged.
- **Measure.** A/B: prompts vs an unprompted read-along, judged on the child's picture naming and on parent-reported home use.

### K6. Family circle with grandparents, audio first

- **Build or change.**
  - **The circle.** A parent creates it and invites relatives by code.
  - **"Ask Dapîr/Bapîr" voice cards.** The child or learner records a question in Kurdish, and the grandparent replies by voice note. No reading or typing is needed.
  - **Family voice library.** Private, in the family's own dialect.
  - **Cooperative family goals.**
  - **Later: "read together".** The same picture-book page appears on two devices during a call.
  - **Consent and safety.**
    - Each adult who is recorded gives consent.
    - Children's voices need parental consent.
    - Retention controls.
    - Private by default.
    - No dialect shaming.
- **Why.** Weak.
  - **Age limit of the evidence.** Learning from live video interaction was shown only for children aged 9–30 months in small lab studies. For older children this is a family-bonding and engagement feature, not a proven learning multiplier (`children_verification.md` row 1).
  - **Case studies only.** Grandparent and digital-media studies are case studies.
  - **Heritage motivation.** It centres on family and identity (unverified survey).
- **Builds on.** Library voice notes (`mobile/src/library/VoiceRecorder.tsx`); groups.
- **Audience.** Kids, Heritage. **Effort.** M–L.
- **Depends on.** K0 Phase B.
- **Expected impact.** Unknown. Possibly strong for motivation and identity.
- **Risks.** Consent, family conflict over dialect, data retention.
- **Measure.** Parent-reported home use. Children's picture naming on words practised in the family.

### K7. Teacher and class mode

- **Build or change.**
  - **Teacher accounts and classes.**
    - Verified teacher accounts.
    - Class codes.
    - Classes tagged by variety and script.
  - **Assignments and progress.**
    - Teachers assign course units, alphabet sets and shelf stories, with due dates.
    - Item-level class progress, e.g. "12 of 18 still confuse ê and î".
  - **In the classroom.**
    - A private host mode for the quiz, with projector-legible Hawar and Sorani text and auto-generated nicknames.
    - A story wall visible only to the class.
    - Printable worksheets and offline packs.
    - Instructions in the pupils' school language.
  - **Ready-made class packs.** Align them to:
    - German heritage-language classes (HSU);
    - Swedish mother-tongue teaching;
    - the KRG diaspora online schools;
    - Turkey's official Kurmancî elective. About 51k Kurmancî course selections for 2025–26; these are selections, not enrolments, and classroom use likely needs ministry approval.
  - **Pilot:** start with 2–3 diaspora weekend schools.
- **Why.** Weak.
  - **Safe peer interaction.** Classes are where it is solvable for children.
  - **Classroom use.** Pronunciation software showed larger effects in classrooms, but this is a between-study moderator.
  - **Demand.** The figures are news-level and overstated (`social_collaborative_verification.md` row 10).
  - **Reach.** "The largest reach channel" is a hypothesis to test.
- **Builds on.** Server-side private rooms, tournaments and quiz 2v2 (`api/src/game/modes.ts`, `api/src/tournament/`), none of them exposed on mobile yet; groups (`api/src/groups/service.ts`).
- **Audience.** Kids, Teens. **Effort.** L.
- **Depends on.** K0 Phase B, C1, C7.
- **Expected impact.** Reach, and safe social learning for children.
- **Risks.** Teacher workload; school procurement; politics in Turkey.
- **Measure.** Class-level delayed recall of assigned items. Teacher retention.

---
## 6. Social and community

Hevalo already has the social plumbing most learning apps lack: friends, DMs, groups with group weekly XP, a community feed, real-time multiplayer and leagues. The research says the gains come from how that plumbing is structured. Three constraints apply to every item below:
- **Small user base.** Hevalo's user base is small and split by variety, level, time zone and age. Prefer asynchronous formats, which do not need many people online at once (`social_collaborative_verification.md` omitted item 2).
- **Children.** For minors, all of this sits behind K0.
- **Evidence.** None of it has been tested with Kurdish learners.

### S1. Make the feed a place to read and write Kurdish (adults and teens)

- **Build or change.**
  - **Reading.**
    - Tap-to-gloss on feed posts, from C3.
    - A language, dialect and script field on posts (none today).
  - **"Correct my Kurdish."**
    - An opt-in flag on a post.
    - Corrections are structured: select a span, propose an edit, add a short reason.
    - The author accepts or rejects. Accepted corrections link to a glossary or grammar entry.
  - **Who may correct.** Correcting unlocks after a 2-minute "How to help a heval" lesson:
    - give a hint before giving the answer;
    - be kind;
    - no dialect shaming;
    - respect attested variants.
  - **Writing prompts** tied to the current unit, e.g. "3 sentences about your weekend using the past tense".
  - **Author tools:** the letter bar and glossary-based spelling hints.
  - **Graded reading.** Only posts that editors or fluent speakers have checked go into the graded shelf (C4) and the review pipeline.
  - **Recognition.** Reward contributions with a "featured story", "used in a lesson" or read counts. Never with Zêr per post.
- **Why.**
  - **Peer feedback.** In higher-education writing it was about as good as teacher feedback (Huisman 2019; unverified).
  - **Trained peers.** Peers trained to give corrections raised accuracy (Sato & Lyster 2012; unverified).
  - **Untrained peers.** Learners give fewer corrections, sometimes wrong ones, and distrust corrections that lack legitimacy (background).
  - **Spelling norms.** Kurdish spelling is not standardised in practice, so corrections must be anchored to curated references. The current dictionary cannot serve as one (`social_collaborative_verification.md` rows 5, 12, omitted items 3–4).
  - **Glossing.** Confirmed (row 8).
  - **Overall.** Moderate.
- **Builds on.**
  - API: `api/src/library/*`.
  - Web: `web/src/feed/PostWords.tsx`, `SharePost.tsx`.
  - Existing comments and moderation.
- **Audience.** Adults, Teens.
- **Effort.** M–L.
- **Depends on.** C3, S2.
- **Expected impact.** Practice in producing meaningful written Kurdish, with feedback.
- **Risks.** Wrong corrections; dialect shaming; learners' errors spreading.
- **Measure.**
  - On the error types a learner was corrected on, accuracy in their later posts.
  - Participation in writing prompts.
  - The share of corrections that authors accept.

### S2. Moderation that grows participation and protects Kurdish users

- **Build or change.**
  - **Rules before posting.** Show 4–5 short rules in the UI language before a first post:
    - respect every dialect;
    - no attacks over politics;
    - be kind to beginners;
    - no personal data.
  - **A welcoming first experience.**
    - Pre-moderate a new account's first few posts.
    - Answer the first accepted post with a human welcome.
    - Explain every rejection and offer a fix-and-resubmit path.
  - **Takedown.** Keep instant takedown for safety violations.
  - **Moderators.** Recruit moderators for Kurmancî, Soranî and the main comment languages (tr, ar, de, fa).
  - **Automated classifiers.** Use them only to triage, until they are validated on Kurdish. This applies to the current heuristic and to any future language model.
  - **Political content policy.** Write a policy on political symbols, reviewed by counsel for Germany, Turkey, Iraq and the EU.
  - **Protect users in Turkey, Iran and Syria:**
    - no real names required;
    - location off;
    - easy deletion.
- **Why.** Weak.
  - **Rules shown up front.** Showing the rules raised newcomer compliance by 8 points and newcomer participation by 70% in one large community experiment (Matias 2019; unverified).
  - **Harsh rejection.** It drove good-faith newcomers away from Wikipedia (Halfaker 2013; unverified).
  - **Use them as design heuristics, not forecasts** (`social_collaborative_verification.md` row 6).
  - **Heritage speakers.** They fear judgement from "real" speakers (Sevinç & Dewaele 2018; unverified).
  - **No Kurdish benchmark.** No Kurdish moderation benchmark exists.
  - **Legal risk.** Users in some countries face real-world legal risk from what they post (omitted item 12).
- **Builds on.** `api/src/moderation/*`; `api/src/moderation/ai-service.ts` (`heuristic-spam-v1`, which scores toxicity as 0); `api/src/trust/`; admin `Moderation` and `AiModeration` pages.
- **Audience.** Everyone. **Effort.** M.
- **Expected impact.** More newcomers keep posting, and posting is safer.
- **Risks.** Moderator workload; political pressure on moderators.
- **Measure.** Newcomers' second-post rate, report rates, moderation response time.

### S3. Team and cooperative play in the existing games

- **Build or change.**
  - **Expose on mobile what the server already has:**
    - **Quiz 2v2.** The team score adds up each member's own points, which already gives each player individual accountability (`api/src/game/modes.ts`).
    - **Private rooms by code, and tournaments.**
  - **New team modes** for Wordle Battle and Rhyme Match.
  - **Room settings and end screens.**
    - A relaxed-timer option.
    - No elimination.
    - End screens show the top 3 and each player's personal improvement, never the bottom ranks.
    - Auto-generated nicknames in rooms.
  - **Classroom.** A host or projector mode (with K7).
  - **What gets asked.** Question pools come from the players' due items (E10), and every game ends with a "what we missed" recap (Q8).
  - **Small user base.** Prefer turn-based team play to matchmaking that needs many players online. Use the quiz bot (E10) when no opponent is available.
- **Why.**
  - **Moderate: team vs team.** Competition combined with collaboration was a significant moderator for *behavioural* outcomes only (k = 9). It was not shown for learning (`motivation_gamification_verification.md` row 4).
  - **Moderate: leaderboards.** Their harm falls on low-ranked players.
  - **Weak: team competition.** Collaborative team competition beat single-player competitive games (Clark et al. 2016; background).
  - **Weak: Kahoot-style games.** Their downsides are time pressure and fear of losing (Wang & Tahir; unverified).
- **Builds on.** `api/src/game/*`; `api/src/tournament/`; `mobile/src/game/*` (no `joinCode`, `/rooms` or tournament support yet).
- **Audience.** Everyone. Children only in class or family rooms.
- **Effort.** M.
- **Depends on.** E10 for due-item pools.
- **Expected impact.** More practice with less anxiety for low-ranked players.
- **Risks.** Rooms that never fill. Hence turn-based modes and the bot.
- **Measure.** User-level A/B, team vs solo as the default, on 8–12-week retention and delayed recall of the items the games delivered. Guardrail: churn among low-ranked players.

### S4. Game modes where players must produce Kurdish for each other (speculative)

- **Build or change.** Asynchronous versions first, for adults and teens.
  - **Describe-and-guess.** One player describes a picture in Kurdish, in text (later voice notes); the other guesses.
  - **Split-clue Wordle.** Each player sees different hints and must communicate them.
  - **Co-written story.** Players take turns adding sentences, then vote on corrections at the end.
  - **Children.** Only in class or family rooms, using preset phrases.
- **Why.** Speculative for app peers.
  - **Interaction with feedback** supports acquisition. But the studies mostly used native-speaker or researcher partners in lab settings, and immediate vs delayed effects came from different studies (Mackey & Goo 2007; overstated; `social_collaborative_verification.md` row 1).
  - **Collaborative writing** made the jointly written text more accurate. Transfer to each writer's own later writing was weaker (Elabdali 2021; unverified).
- **Builds on.** The real-time game engine (`api/src/game/*`, `api/src/realtime/`).
- **Audience.** Adults, Teens. **Effort.** M. **Depends on.** S2 norms; K0 for teens.
- **Expected impact.** Unknown.
- **Risks.** Inappropriate free text. Moderate it, and use preset phrases for younger users.
- **Measure.** A/B against the standard quiz on delayed recall of the round's target words. Self-reports are not the primary outcome.

### S5. Groups and buddies around shared learning goals, plus a shareable weekly recap

- **Build or change.**
  - **Groups.** They currently sum their members' XP. Replace that with cooperative learning goals, e.g. "our group remembered 200 words this month", counted from probe-checked items. Rank by average improvement per member, so small and large groups compete fairly.
  - **Study buddies (optional).**
    - Pairs share a weekly goal, e.g. 4 of 7 days each.
    - Each can see the other's progress.
    - One preset supportive nudge a day; no guilt templates.
    - A missed goal can be repaired with extra review.
  - **Weekly recap.** A learner can share it with one chosen person: a parent, teacher, mentor or buddy. It shows completed progress, not plans:
    - can-do ticks;
    - words remembered;
    - minutes of listening.
  - **Friend challenges.** Extend them beyond the quiz, e.g. review challenges.
  - **Friend streaks.** Opt-in for adults only; never for minors.
- **Why.**
  - **Moderate: progress monitoring.** It improves goal attainment (d = 0.40), more when progress is reported or public (Harkin; confirmed; mostly health studies).
  - **Weak: announcing plans can backfire.** Announcing intentions can reduce later effort (Gollwitzer 2009; background), so share completed progress, not plans.
  - **Weak: friend streaks.** Duolingo's data are engagement figures only (vendor).
  - **Weak: isolation.** Social isolation is a documented reason learners leave language apps (thesis).
  - **Untested.** Weekly vs daily goals.
- **Builds on.** `api/src/groups/service.ts` (group weekly XP); `api/src/friends/`; `api/src/activity/`.
- **Audience.** Everyone. Minors only inside family or class.
- **Effort.** M. **Depends on.** E2 and M3 for "words remembered".
- **Expected impact.** Accountability without loss aversion.
- **Risks.** Social pressure; buddies who drop out.
- **Measure.** Randomised rollout, judged on 8–12-week retention and delayed recall. Guardrail: stress pulse survey.

### S6. Rooms and mentors with fluent speakers (adults, later, speculative)

- **Build or change.**
  - **Rooms.** Verified adult volunteers host scheduled small-group voice rooms by variety and level:
    - 15–20 minutes;
    - a topic card from the current unit;
    - a turn timer so learners speak half the time.
  - **Host preparation.** A code of conduct and 10 minutes of training: hint rather than ridicule, no "you're not a real Kurd", respect every dialect.
  - **Skill swaps.** E.g. a heritage speaker practises oral Kurdish with an in-region speaker who wants help with German or English, or with Kurdish spelling.
  - **Safeguards.**
    - Not recorded by default.
    - Adults only.
    - Never one-to-one between unrelated adults and minors.
  - **Hosts are recognised, not paid Zêr per session.**
- **Why.** Weak and speculative.
  - **Online interaction.** It produces gains comparable to face-to-face interaction (Ziegler 2016; unverified).
  - **The "beginner trap".** Minority-language apps produce many beginners but few independent speakers (Māori and Welsh experience; Weak).
  - **Unstructured exchanges** rarely focus on form (background).
  - **Heritage anxiety.**
  - **Volunteer burnout and safeguarding** (`social_collaborative_verification.md` omitted items 10–11).
  - **Scale.** Rooms need enough people online at the same time.
- **Builds on.** Groups, chat, presence (`api/src/realtime/`).
- **Audience.** Adults. **Effort.** L.
- **Depends on.** S2; K0; a voice-room technology choice.
- **Expected impact.** The bridge from app learner to speaker, if it can be staffed.
- **Risks.** Harassment; no-shows; volunteer burnout.
- **Measure.** Randomised invitations, since self-selection biases any comparison. Measure speaking tasks rated by native speakers at 8–12 weeks.

---

## 7. Things to change, reduce or stop

### X1. Stop paying Zêr for opening the app

- **Change.**
  - **The daily claim today.** It pays Zêr on a 7-day escalating cycle (10, 15, 20, 25, 30, 40, 100), resets after a missed day, and needs no learning (`api/src/rewards/daily-cycle.ts`; `web/src/components/DailyReward.tsx`; `mobile/src/rewards/DailyRewardCard.tsx`).
  - **Tie it to learning.** Require one completed review session or lesson, and remove the reset that turns a missed day into a loss.
  - **What Zêr never pays for:**
    - posts, likes or messages;
    - streak protection. The shop schema has a `freeze` category (`api/src/shop/routes.ts:14`); freezes must be earned by learning only.
  - **Goal rewards.** Turn on Zêr goal rewards (`GOAL_REWARDS_ENABLED = false`) only for goals based on learning activity.
  - **Earn-only and fair.**
    - Keep Zêr earn-only.
    - Never add randomised paid rewards.
    - If Zêr is ever sold, follow the EU consumer authorities' (CPC Network) virtual-currency principles: show the real price, and no pressure on minors.
- **Why.**
  - **Moderate.** In the overjustification research, rewards for mere participation are the risky kind. Both sides of the debate agree that rewarding mastery is safe.
  - **Confirmed.** Accumulating daily rewards are coded as "lures" in children's apps (Radesky).
  - **Regulatory, unverified.** The EU Digital Fairness Act is expected to target virtual currencies and variable rewards, but the proposal's timing and content are unverified (`motivation_gamification_verification.md` rows 1, 11; omitted item 5).
- **Audience.** Everyone. **Effort.** S.
- **Expected impact.** Daily visits come with real practice.
- **Risks.** Fewer daily opens. That is the point.
- **Measure.** A/B `daily_reward_learning`. Primary metric: share of days that include a completed review. Guardrail: D30 retention.

### X2. Make XP, goals, streaks and leagues reward learning, not grinding

- **Change.**
  - **XP for evidence of learning.**
    - Diminishing XP for repeating items the learner already knows well. Lesson replays already pay 25%; extend this to practice padding and games.
    - A bonus for correct recall on due reviews.
    - More XP for typed or spoken production than for multiple choice.
  - **Games.**
    - Cap daily game XP toward goals and leagues.
    - Game answers count once they write graded retrievals to the review log (E10).
  - **Daily goal.** Counts learning XP.
  - **Streak.** Kept by any activity that writes graded retrievals: a lesson, a review, an alphabet round, or a game round that feeds the log. A daily Wordle win alone no longer counts.
  - **Leagues.** Computed on learning-weighted XP, with velocity checks against farming.
- **Why.**
  - **Weak: Goodhart's law in practice.** Learners fixate on XP and streaks and farm them (Mogavi 2022; qualitative).
  - **In-session success vs learning.** They diverge (Soderstrom & Bjork; Bastani).
  - **Weak: leaderboards.** In one quasi-experiment, leaderboards lowered exam scores.
  - **No evidence on XP for reviews.** Duolingo's scheduler A/B (+12% activity) is **not** evidence for giving reviews equal XP (`memory_retention_verification.md` row 5). The case is incentive alignment, not an effect size.
- **Builds on.** `api/src/xp/service.ts`; `api/src/game/game-rewards.ts`; `api/src/goals/service.ts`; `api/src/streaks/service.ts` (`wordle-service.ts:254` extends the streak on a daily win); `api/src/leagues/league-logic.ts`.
- **Audience.** Everyone. **Effort.** M.
- **Depends on.** E2 and E10 to define "graded retrievals".
- **Expected impact.** Incentives that line up with learning.
- **Risks.** Complaints from players who grind. Explain the rules openly.
- **Measure.**
  - Guardrail: share of XP from farmable repeats.
  - Reviews completed per active day.
  - Delayed recall per minute studied.

### X3. Make streaks forgiving, and stop the guilt messages

- **Change.**
  - **Freezes.** Earn them by learning, e.g. one per five review sessions. `StreakService.grantFreeze` exists but has no caller.
  - **Repair.** A 48-hour repair window, by doing extra reviews.
  - **Total days.** Always show total days learned and the longest streak next to the current streak.
  - **Coming back.** After a gap, a "welcome back" review lesson, with no shame, and a small comeback bonus (A/B test it).
  - **Weekly mode.** An optional weekly-goal mode, e.g. 4 of 7 days.
  - **Copy.** Rewrite "Don't lose your streak!" (with a flame emoji).
  - **Minors.** Off by default.
  - **Revival event.** A yearly opt-in streak revival, e.g. at Newroz, only as an experiment.
- **Why.** Weak.
  - **Broken streaks.** They lower later engagement, less so when the streak can be repaired (Silverman & Barasch 2023; unverified).
  - **Comeback bonus.** The +27% figure was the best of 54 arms in a gym megastudy, used cash-convertible points, and faded after the programme (`motivation_gamification_verification.md` row 7). Treat it as a cheap A/B test.
  - **Vendor data.** Duolingo's figures on looser streaks are engagement numbers.
  - **Pausing is normal.** Persistent learners pause and come back (survival analysis; Weak).
  - **Missing a day.** One missed day did not materially harm habit formation (Lally 2010; unverified).
- **Builds on.** `api/src/streaks/streak-logic.ts`, `service.ts`; `api/src/notifications/streak-reminder*.ts`; `web/src/lib/types.ts` (`StreakSummary.freezes`, not shown).
- **Audience.** Everyone. **Effort.** M.
- **Expected impact.** Fewer lapsed learners lost for good.
- **Risks.** A streak too easy to keep stops meaning anything.
- **Measure.** A/B `streak_forgiving` on 8–12-week retention and delayed recall. Guardrail: stress pulse survey.

### X4. Remove lesson-ending hearts, and never limit review

- **Change.**
  - **Hearts today.** Mobile lessons start with 5 hearts and end in failure when they run out. They are counted on the client only (`mobile/src/lesson/player.ts:4`, `HeartsBar.tsx`).
  - **Instead.** Show mistakes as feedback only, and never end a lesson early because of errors.
  - **No limiters.** Never introduce hearts or energy as a paywall.
  - **If a free tier ever needs a limit,** cap new units per day. Never limit review or alphabet practice.
- **Why.**
  - **Moderate: errors help.** Errors followed by feedback support learning (`memory_retention.md` Q5).
  - **Inference: who gets pushed out.** Error-based limits push out first the learners who make the most mistakes (`market_landscape.md` §4).
  - **Consistent with scheduling.** Capping new items, not reviews, is what scheduling research recommends anyway.
  - **Hearts are already in Hevalo** (`market_landscape_verification.md` omitted item 1).
- **Audience.** Everyone. **Effort.** S.
- **Expected impact.** Struggling learners can finish lessons and learn from their errors.
- **Risks.** None of note.
- **Measure.** Lesson completion for low-accuracy learners, and their delayed recall.

### X5. Leagues that are opt-in, relative and scale-aware

- **Change.**
  - **Today.** Learners are auto-joined to 30-person weekly cohorts on any XP, with the top 10 promoted and the bottom 5 demoted (`api/src/leagues/league-logic.ts`).
  - **Joining.** Make it opt-in, or at least a one-tap opt-out.
  - **What learners see.**
    - Only nearby ranks, plus a personal-best line.
    - Bottom ranks and relegation hidden in the lower tiers.
  - **Minors.** Off for under-18s by default; teens can opt in.
  - **Scale.** When too few learners are active, don't form leagues. Offer a personal-best mode instead, not bots.
  - **XP.** Computed on learning-weighted XP (X2).
- **Why.** Moderate.
  - **Who gets hurt.** Low-ranked learners lose motivation and feel stress.
  - **Relative rankings.** Showing only nearby ranks reduces the harm.
  - **Cohort size.** The "about 30 people" figure has no source.
  - **Concurrency.** Matched leagues need many learners active at the same time (`market_landscape_verification.md` row 4, omitted item 7).
- **Audience.** Adults, Teens. **Effort.** S–M.
- **Expected impact.** Competition for those who want it, without harming the rest.
- **Risks.** Lower engagement among competitive users.
- **Measure.** A/B opt-in vs automatic joining, on delayed recall and retention. Guardrail: churn among low-ranked learners.

### X6. Fewer, kinder notifications that fade over time

- **Change.**
  - **How many.** At most one learning reminder a day, at the time the learner planned (E9).
  - **Templates.** Rotate them.
  - **Content.** Informational or social:
    - "5 words are ready for review";
    - "Rojîn posted a poem using 3 words you know".

    Never guilt or fake urgency.
  - **Languages.** All 9 UI languages; today reminders are English only.
  - **Back off when ignored.** Tune the threshold; the "7 ignored reminders" figure has no source.
  - **Fade reminders over months,** and test what happens when they stop.
  - **Social notifications** get separate toggles.
  - **Minors.** Off by default; parents get a weekly digest instead.
- **Why.** Weak.
  - **Small effects.** A tailored prompt raised engagement about 3.9 points in a mental-health app.
  - **Duolingo's +0.5% DAU** came from better *wording*, not from reminders as such (`multimedia_ux_verification.md` row 9).
  - **Dependence.** Reminders can prop behaviour up without building a habit (Stawarz 2015; background; omitted item 7).
- **Builds on.** `api/src/notifications/*`; `notifications/prefs.ts`; E12.
- **Audience.** Everyone. **Effort.** S–M. **Depends on.** E12.
- **Expected impact.** Reminders that bring learners back to due reviews without fatigue.
- **Risks.** Fewer sessions in the short term.
- **Measure.**
  - A/B on the share of due reviews done within 48 hours.
  - Opt-out rate.
  - Behaviour after reminders stop.

### X7. Stop telling learners things that are not true

- **Change.** Fix the product or the copy for each of these:
  - **The speaking scorer** marks every recording correct (Q6).
  - **Web course cards** cannot be clicked, yet the page says "Pick a course to begin" (`web/src/i18n/en.ts:803`).
  - **Marketing claims:**
    - "Lessons play recordings you can slow down" (`en.ts:1134`);
    - six exercise types, "listen and speak" included (`en.ts:1124`);
    - solo games playable without an account, which the API rejects (`en.ts:1240`).
  - **Onboarding** promises "a Kurdish story every day" with no job behind it (`mobile/src/i18n/translations.ts:1001-1002`).
- **Why.**
  - **Defects** (`hevalo_current_state_web.md` §14).
  - **Trust.** It is a core asset for a mission-driven minority-language product (market inference; Weak).
- **Audience.** Everyone. **Effort.** S.
- **Expected impact.** Trust.
- **Risks.** None of note.
- **Measure.** Copy audit passes.

### X8. Do not build these

- **A "learning styles" setting.** There is no evidence that matching instruction to visual or auditory styles helps (Pashler 2008; background).
- **A native-likeness or accent score.** Global ratings are unreliable to automate; feedback on specific sounds works better (`speech_audio_tech.md` §F).
- **Language-model audio as a pronunciation scorer,** unless one beats a baseline on Hevalo's evaluation set (A4).
- **Open-ended AI chat for children,** or any child free text or voice sent to an AI vendor (A7, K0).
- **Loot boxes or other randomised paid rewards** (X1).
- **A "dyslexia font" presented as the fix.** Offer spacing and size settings instead (unverified; `multimedia_ux_verification.md` row 17).
- **Experiments on child accounts that optimise time in the app** (M5).
- **Hearts or energy limits on review** (X4).
- **Unlabelled synthetic voices presented as correct pronunciation** (A5).
- **An open marketplace for language exchange with strangers.** It conflicts with child safety, and there are too few fluent speakers for the number of learners (S6).

---

## 8. Measurement plan: show that learning improved, not just engagement

### M1. Instrumentation (Q11, E2)

`exercise_answer` event, and the matching `review_log` row. Record these fields:

| Field | Why |
|---|---|
| user, item (lexeme / chunk / grammar point / grapheme), skill (meaning, form, listening, spelling, reading) | The unit of learning |
| variety (kmr / ckb), script | Separate scales; fairness checks |
| source (lesson, practice, alphabet, Wordle, race, quiz, rhyme, reader, placement, probe) | Credit features fairly |
| format, number of options k | Correct for guessing; grade by format |
| correct, partial credit (edit distance), verdict (correct / almost / wrong) | Outcome |
| latency in ms, hints used, attempt number | Grading and difficulty |
| days since last review, scheduler state before and after | Fitting FSRS and checking calibration |
| UI language, platform, keyboard type, age band | Segments; confounds |

Also record: `review_due_count`, placement steps, probe events, and exposures (story views, look-ups) kept separate from reviews. Check `analytics_consent` first. No third-party SDKs in minors' sessions.

### M2. Primary learning metrics: the north star and its supports

1. **Delayed unassisted recall** on probe items at 7 and 30 days, with no hints and no audio replay, and production wherever possible. This is the north star. Report it per cohort, per segment and per feature.
2. **Items still known per hour studied**, i.e. efficiency.
3. **Can-do checkpoint pass rates** on delayed checks (C8).
4. **Placement re-test growth**, reported **only as cohort averages**. Individual re-placement error is too wide: a learner's measured difference is noise unless it exceeds about 1.3–2.1 logits (`adaptive_assessment_verification.md` omitted item 2).
5. **For children:** letter–sound accuracy, and naming pictures of target words after one week. Parent-reported Kurdish use at home.
6. **For speaking:** a sample of recordings rated for intelligibility by native listeners.
7. **For model quality:** scheduler log loss and calibration, against a moving-average baseline, on held-out reviews.
8. **For content quality:**
   - monthly learning curves per knowledge component (flat or rising curves flag bad items or badly defined skills);
   - item p-values and distractor choice rates;
   - position bias in multiple-choice items.

### M3. Probe design

The design below corrects a flaw the fact-checks found in the original proposal.
- **What to sample.** Draw probe items at random from **all** learned items, whether or not they are scheduled, at times the scheduler did not choose. A probe drawn only from items withheld from review would measure forgetting *without* review, not the retention Hevalo actually achieves (`adaptive_assessment_verification.md` omitted item 3).
- **Log probes as reviews.** A probe is itself a retrieval and affects later memory.
- **A small held-out share,** at most about 5%, may be withheld from review to estimate forgetting curves. Disclose this in the "how we improve Hevalo" notice.
- **Blend probes into review sessions** unmarked, and keep them **out of XP and leagues** so they cannot be farmed.

### M4. Guardrail and wellbeing metrics

- **Engagement guardrails.** DAU, WAU and MAU; D1, D7 and D30 retention; minutes; streak counts. These are guardrails, not goals.
- **Wellbeing guardrails.**
  - late-night sessions by minors;
  - share of XP from farmable repeats;
  - league opt-out rate;
  - notification opt-out rate;
  - a short in-app pulse survey on streak stress.
- **Rule.** A mechanic that raises engagement but worsens these does not ship.

### M5. Experiment practice with the existing module

- **Results panel.** Add one to `admin/src/pages/Experiments.tsx`. It shows exposures, the metric per arm, confidence intervals and a sample-ratio check.
- **Variance reduction.** Apply CUPED, using placement level and prior-month activity as covariates.
- **Pre-registration.** Before each experiment, record **one primary learning metric** and its guardrails.
- **Duration.** Run motivation mechanics for **8–12 weeks**. This is a sensible minimum, not an evidence-based window (`adaptive_assessment_verification.md`, other checks).
- **Power.**
  - About **393 learners per arm for d = 0.2**, and about **1,570 for d = 0.1** (arithmetic confirmed). Most user-level tests at Hevalo's scale will be underpowered.
  - So use **within-learner, item-level randomisation** wherever a feature acts on single items: re-queueing (Q4), feedback type (E6), gloss type (C4), audio-first introduction (A2), scheduling (E3).
  - Randomise at **user level** for streaks, XP, leagues, notifications and session length. These change behaviour across all items, so item-level tests would be contaminated (omitted item 6).
  - Use bandits only where estimating the effect is not the goal.
- **Ethics.**
  - A plain-language "how we improve Hevalo" notice.
  - Test only variants that are acceptable teaching on their own.
  - Never manipulate mood or wellbeing.
  - **No time-in-app optimisation on child accounts.**
  - Inform parents about learning experiments.
  - A DPIA.
  - An ethics board (IRB) partner if results will be published.

### M6. Segmentation and fairness

- **Segments.** Report every metric by:
  - learner type: heritage diaspora, in-region schooled in another language, new adult, child;
  - variety and script;
  - UI language;
  - age band.
- **Differential item functioning (DIF).** Check placement and checkpoint items for DIF across those groups. Groups will be small, so pool items by feature for these checks (e.g. "items containing ڕ").

### M7. External validation and publication

- **External validation.**
  - Have 50–100 consenting adults rated by Kurdish teachers, with at least two raters and a reported inter-rater reliability, and correlate the ratings with in-app placement.
  - Do this before making any public claims about proficiency levels.
- **Publication.**
  - Publish the first outcome data for any Kurdish app: pre/post placement and delayed recall by segment.
  - Partner with Kurdish linguists (for example the KLPT and KurdishBLARK teams) or a university.

### M8. Dashboards

- **Admin learner view.** Item states and delayed recall per learner. Today `admin/src/pages/Users.tsx` shows no learning data.
- **Item-quality report** (C2).
- **Learning metrics alongside engagement metrics** in `admin/src/pages/Analytics.tsx`.

### How each major change is judged

| Change | Primary learning metric | Design |
|---|---|---|
| Q4 re-ask misses | Recall of missed items at next due / 7-day probe | Item-level |
| E3 FSRS | 30-day probe recall per minute; calibration vs baseline | User-level `scheduler_fsrs` (after shadow mode) |
| E5 lesson v2 | 7/30-day probe recall of lesson items | User-level `lesson_v2`; item-level on lesson size |
| E6 / A7 explanations | Recall at next due; repeat-error rate on the knowledge component | Item-level |
| E7 strictness | Dictation accuracy at 7/30 days | User-level within the C5 track |
| E9 if-then onboarding | Active days in 30; 30-day probe recall | User-level |
| C4 glosses / karaoke | Delayed recall of glossed words; comprehension | Item-level |
| A2 audio-first | 7-day listening and meaning recall | Item-level |
| X1 daily reward, X3 streak, X5 leagues | Share of days with review; delayed recall; guardrails | User-level, 8–12 weeks |
| S3 team default | Delayed recall of game items; low-rank churn | User-level |
| K1 kids' mode | Letter–sound accuracy; picture naming at 1 week | Cohort pre/post plus item-level; no engagement optimisation |

---

## 9. Sequenced roadmap, October 2026 to October 2027

**Assumptions** (not from the notes). Roughly 3–5 engineers and 2–4 Kurdish editors, plus a budget for voice talent and a legal adviser. Scale the dates to the team you actually have.

**The long pole is content, not code.** C1 (course), C2 (tools), C3 (glossary) and A1 (recordings) start in month 0 and run throughout. The engine work runs alongside them.

### Phase 0: weeks 0–4 (October to early November 2026). Stop the leaks, start the pipelines.

- **Defect fixes:** Q1–Q3, Q5–Q9, Q12, Q13 and X7.
- **Measurement:** Q11 instrumentation and consent; turn on the `daily_goal_default` experiment.
- **Incentive fixes:** X1 (daily reward needs learning) and X4 (no lesson-ending hearts).
- **Re-ask misses:** Q4.
- **Safety:** K0 Phase A, with neutral age screen and minors' defaults enforced on the server. Kick off the legal review.
- **Content:** start the C2 form editor and preview; start the A1 recording drive (voice talent, consent forms); start the C3 glossary (Kurmanji course vocabulary, en/tr/de/ar).

**Exit check.** Events flow from both clients. Practice runs without errors. No multiple-choice position bias. Audio plays on phones. Speaking no longer auto-passes.

### Phase 1: months 1–3 (November 2026 to January 2027). A real learning loop, measured.

- **Ship:**
  - E1: the web learning loop.
  - The mobile store release (issue #279).
- **Memory model:**
  - E2: review log and lexeme tagging of all existing content.
  - E3: FSRS in **shadow mode**. Compute predictions alongside SM-2 and check calibration against the moving-average baseline.
- **Lessons and feedback:**
  - E5: lesson v2 for all new and rebuilt units.
  - E6 v1: authored hints and explanations.
  - E7: strict spelling mode.
- **Onboarding:** E9 onboarding and placement v2, including routing.
- **Reminders and incentives:**
  - E12: real push delivery.
  - X6: notification policy.
  - X2, X3, X5: learning-weighted XP, forgiving streaks, opt-in leagues.
  - Q10: achievements.
- **Content:**
  - C1: rebuild units 1–6 with native audio, plus listening and speaking items (A2, A3).
  - C7: alphabet persisted and on mobile.
- **Measurement:** M1–M3; M5 results panel.

**Gate at month 3.**
- Baseline delayed-recall numbers per segment exist.
- FSRS calibration beats SM-2 and is at least comparable to the moving-average baseline. Then start the `scheduler_fsrs` A/B.
- At least 30 lessons with 100% native audio.

### Phase 2: months 3–6 (February to April 2027). Input, literacy, social structure.

- **Reading and literacy:**
  - C4: graded shelf v1 (Kurmanji, glosses en/tr/de/ar, karaoke A/B).
  - C5: heritage literacy track.
  - C9: course content in tr/de/ar.
  - C8: can-do map.
- **Engine:**
  - E4: time-based decay on the course map.
  - E10: games feed the review log, plus a quiz bot.
- **Social:**
  - S2: moderation norms.
  - S3: expose team play and private rooms on mobile.
  - S5: groups built around learning goals; weekly recap.
- **Children:** K0 Phase B build (family accounts, parental consent, social restricted to known circles).
- **Speech and AI groundwork:**
  - A6: HevalBench.
  - A4: start collecting the speech evaluation set.

**Gate at month 6.**
- First readouts of `lesson_v2`, `scheduler_fsrs`, `streak_forgiving` and `daily_reward_learning`, judged on delayed recall, not engagement.
- External validation pilot designed (M7).

### Phase 3: months 6–9 (May to July 2027). Kids, classes, Sorani, careful AI.

- **Kids:**
  - K1: kids' mode beta for ages 6–8 (alphabet, phonics, narrated decodable stories), with K2, K3 and K4.
  - Release only after the K0 Phase B compliance package is signed off.
- **Classes:** K7 pilot with 2–3 diaspora weekend schools.
- **Sorani:** C6 A1 v1 (normalisation, native audio, clitic-past units).
- **AI and speech:**
  - A7: explanations for adults, reviewed before showing, if HevalBench passes.
  - A8: offline drafting with editor approval.
  - A5: native-rater checks for Sorani TTS.
- **Engine and feed:**
  - E8: difficulty model.
  - E11: offline lessons.
  - S1: correction requests and writing prompts in the feed.

**Gate at month 9.** Kids' cohort results on letter–sound accuracy and picture naming. Sorani A1 probe recall. Explanation error-report rate below the threshold set in A7.

### Phase 4: months 9–12 (August to October 2027). Speaking and people.

- **Kids and families:**
  - K1 for ages 3–5 (audio-first).
  - K5: parent co-learning.
  - K6: family circle with "Ask Dapîr".
- **People:** S6, a fluent-speaker room pilot for adults.
- **Speech and AI pilots:**
  - A4: a constrained word-check pilot for adults, if the evaluation set shows acceptable false-accept and false-reject rates.
  - A9: a text role-play pilot for adults, if HevalBench passes and counsel clears SB 243.
- **Validation and publication:**
  - M7: external validation study.
  - Publish the first Kurdish learning-outcome report and the can-do framework (C8).
  - Teacher standard-setting workshop.
- **Locales:** decide on fa and sv (C9).
- **Content:** C1 reaches the end of A2 scope (planning estimate).

### Dependencies at a glance

```
Q11 instrumentation ──► M1–M5 measurement ──► every A/B below
Q12 + C2 tools ──► C1 content ──► E1 web loop / mobile release
E2 review log ──► E3 FSRS ──► E4 decay, E10 games→review, M3 probes
                     └──► E8 difficulty model
C3 glossary ──► Q2 cards, C4 graded shelf, S1 feed glosses, A7 explanations, K0 kid-safe dictionary
Q5 native audio + A1 recordings ──► A2 listening, A3 speaking, C7 alphabet, K1 kids' mode
Q7 Sorani normalisation + C3 Sorani glosses ──► C6 Sorani course
K0 Phase A (now) ──► K0 Phase B ──► K1–K7
A6 HevalBench ──► A7 explanations, A8 drafting, A9 role-play
A4 eval set ──► any automatic pronunciation scoring
```

---

## Appendix A. Claims from the notes that this document does not use, or uses only with a downgrade

| Claim in a topic note | What the fact-check found | How it is used here |
|---|---|---|
| FSRS-6 is "best in class"; per-user fitting only after about 1,000 reviews | FSRS-7 exists and scores better. FSRS-6 is worse than a constant predictor on same-day reviews. Fitting from about 8–64 reviews is best (`memory_retention_verification.md` rows 8, 10) | E3: benchmark FSRS-6 vs FSRS-7, and fit early |
| Benchmark dataset of 20k users / 1.7B reviews | Refuted: 10k users, about 727M reviews (row 6) | Not quoted |
| Kim & Webb spacing g = 0.76/1.15 (or 0.58/0.80) | The two retrievals conflict (row 1) | "Medium-to-large", no exact g |
| 5–7 retrievals per new word in a session | 5 and 7 did not differ; returns diminish; "12–20 interactions" was an arithmetic error (`multimedia_ux_verification.md` row 7) | 3–5 per session, spread across days |
| Lower desired retention (0.80) for children reduces frustration | A lower target doubles the failure rate per review (`memory_retention_verification.md` row 11) | E3: A/B 0.85 vs 0.90 for children |
| Sleep helps children more than adults | The meta-analysis covered adults only; the child claim rests on one study of 30 children (row 12) | Next-day first review justified by spacing |
| Don't use spaced retrieval with young children (Goossens) | One null result against positive classroom reviews (`children_verification.md` row 6) | K3: recycling for pre-readers, spaced retrieval from about age 7 |
| Glosses from the 400k-word dictionary in the learner's language | Refuted: the definitions are Kurdish-only; the dictionary ships empty and is mostly inflected forms (three fact-checks) | C3: build a curated bilingual glossary first |
| Reading-while-listening g = 0.41 when audio-paced (*Language Teaching*) | Citation misattributed; the outcome was comprehension, not vocabulary (`multimedia_ux_verification.md` row 2) | Karaoke is an A/B-tested design choice |
| Peer ASR practice "doubles" the benefit (g 0.89 vs 0.44) | A between-study moderator with garbled subgroup counts (`social_collaborative_verification.md` row 2) | Not used as a reason |
| Team vs team is the most effective configuration | Significant for behavioural outcomes only, not learning (`motivation_gamification_verification.md` row 4) | S3: offered as a bet, measured |
| Prompts beat recasts (d 1.14 vs 0.70) | Contested; classroom speech; no simple mapping to typed app feedback (`sla_theory_verification.md` row 10) | E6: prompt-first only as an A/B, typed and spoken items only |
| Interaction effects "grow over time" (Mackey & Goo) | Immediate and delayed effects came from different subsets of studies (`social_collaborative_verification.md` row 1) | "Helps, and held at delay where measured" |
| Comeback bonus +27% (Milkman) | Best of 54 arms; cash-convertible points; faded after the programme (`motivation_gamification_verification.md` row 7) | X3: cheap A/B, no expected size |
| Implementation intentions d = 0.65 | A newer meta-analysis probably reports less (unverified) (row 6) | E9: cheap prompt, small expected gain |
| DSA requires learning streaks and push off for minors | Non-binding guidelines; they name messaging streaks; Hevalo is probably exempt while small (`children_verification.md` row 8) | K0: good practice for under-18s |
| ICO Code bans streaks | That wording was in the 2019 draft; the final Standard 13 is about privacy nudges (`motivation_gamification_verification.md` row 12) | Cited as being in the Code's spirit only |
| A placement standard error below 0.4 per skill within 20 items | Refuted by computation (`adaptive_assessment_verification.md` row 9) | E9: one overall level, wide band |
| A probe hold-out measures retention under the scheduler | It measures forgetting without review (omitted item 3) | M3: sample probes from all items |
| AI tutors give large learning gains (Kestin "2×", Nigeria "+0.31 SD = 1.5–2 years") | Immediate outcomes only; the confounds are not AI-specific; no durable gain shown (`ai_llm_tutoring_verification.md` rows 1–2) | A9 last, gated; delayed AI-free tests |
| Gemini is "the best Kurdish model" | 5 prompts, Sorani only, one closed model tested (row 8) | A6: run HevalBench |
| Kurmanji TTS "cannot" produce unwritten contrasts | The mechanism is overstated; a risk mainly for rare words (`speech_audio_tech_verification.md` row 4) | A5: test with raters; native audio stays the default |
| Omnilingual ASR "untested for Kurdish" | A negative Badini result was cited in the same note (row 6) | A4: evaluate in-house first |
| Turkey: 59,372 Kurmancî pupils | Course selections, of which 8,563 Zazakî (`market_landscape_verification.md` row 11) | K7: about 51k Kurmancî selections; ministry approval |
| KRG–diaspora "formal subject" news | It is an opinion column (`heritage_minority_kurdish_verification.md` row 9) | Not used |
| Duolingo made Explain My Answer free in 2026 | A single blog source (`market_landscape_verification.md` row 1) | Not used as a justification |
| League cohorts of "about 30"; +17% learning time | Cohort size has no source; the +17% is engagement (row 4) | X5: opt-in, relative, scale-aware |
| Apps uniquely fail at speaking and listening | Listening lags reading for all learners; Smith 2024 found speaking gains (row 5) | A3: justified by speaking time, not by an app deficit |
| Hevalo "unmatched" thanks to its 400k dictionary | Refuted; a competitor quotes the same source (row 12) | Not claimed |
| Hevalo has no hearts | It does: 5 per lesson, client-side (omitted item 1) | X4 |

## Appendix B. Open questions and who should answer them

**For Kurdish linguists and editors**
- Which Kurmanji contrasts matter most, ranked by functional load and stability across dialects, younger speakers and the diaspora: aspirated vs unaspirated p/t/k/ç; e/ê, i/î, u/û; x vs other fricatives? And which matter for Sorani: ڕ/ر, ڵ/ل, vowel letters?
- A list of attested regional variants (ergative marking, ezafe, vocabulary) to accept as correct, with notes.
- Whether the minimal-pair examples used in this document are correct (*se*/*sê*, *ser*/*şer*), and the contrastive tips per UI language.
- Frequency bands for Kurmanji, given the thin corpora.

**For counsel**
- Does the DSA Art. 19 small-enterprise exemption cover Hevalo?
- Is the feed or the DM system in scope of the UK Online Safety Act?
- What does COPPA require for stored child voice recordings, and is an AI vendor "integral" to the service?
- The full table of EU consent ages, including Spain's pending change.
- Does California SB 243 cover a role-play tutor?
- Would use in Turkish state classrooms need approval?
- Do Zêr purchases fall under the European Accessibility Act's e-commerce scope?
- What do the provider terms say about minors for any AI model chosen?

**Research re-checks (search budget was exhausted in the research run)**
- The Kim & Webb (2022) headline effect sizes.
- Lindsey et al. (2014): relative or absolute gains, and the sample size.
- The identity of the reading-while-listening meta-analysis.
- Omnilingual ASR's per-language results for Kurdish.
- Whether FSRS-7 ships in ts-fsrs.
- The Kurokawa caption subgroup sizes.
- The status of the Digital Fairness Act (COM(2026) 681?).
- Whether Kurdish CEFR materials exist (Turkey's MEB curriculum, INALCO, KRG) and Kurdish DLPT/OPI availability.
