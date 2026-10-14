# Adversarial review of `hevalo_recommendations.md`

Reviewed 6 October 2026 against branch `claude/tender-ptolemy-1m29c7` (HEAD `43a5681`). Method: every product claim that a recommendation depends on was checked with grep/read in `/home/user/Kurda` (read-only) and against the three `hevalo_current_state_*.md` notes; every cited evidence row was checked against the matching `*_verification.md`; every topic note's "Implications for Hevalo" section was compared with the recommendation list. Paths are repo-relative. Nothing in the repo was changed.

---

## 0. The corrections that matter most

1. **Q12 as written would wipe every learner's review history on each deploy.** `api/src/content/import.ts` is not idempotent at lesson level. Every run calls `createLessonVersion` and `addExercise` for every lesson, with no change detection (`import.ts:9`, `:166-170`), so each run mints new exercise UUIDs. `review_items` is keyed on exercise UUID. Fix: hash each lesson's content and create a version only when the hash changes. Better still, land E2's stable item ids first. Add a smoke test that a re-import with no changes creates 0 versions.
2. **The document never mentions Gems, the currency that is actually sold for real money.** Gems are sold through IAP (`api/src/iap/service.ts:50-92`, `gem_packs`). They are also granted for a perfect lesson (5, capped at 50 a day), league promotion (25), tournament wins (50) and achievements (15) (`api/migrations/1751000040000_gem-rules.js:25-28`). The perfect-lesson grant fires on **replays** as well (`api/src/content/routes.ts:77`: the check `xpAwarded > 0` is true for a repeat, which pays 25% XP). With every multiple-choice answer at index 0, that makes 50 Gems a day farmable by replaying easy lessons. X1, K0, K2 and Appendix B all treat Zêr as the "if ever sold" currency. Correct this, add a P0 fix (perfect-lesson Gems on first completion only, or none), and move the parental gate and the CPC virtual-currency rules onto Gems.
3. **Child-safety facts in the short version (item 5), K0 and §6 are partly wrong.**
   - DMs are already friends-only for every account (`api/src/chat/service.ts:87-88`), and so are gifts (`api/src/shop/routes.ts:129-132`).
   - Matchmaking has no free-text chat at all.
   - Image metadata is already stripped (`api/src/media/imageProcess.ts:63,77`).
   - The real exposure is elsewhere: friend requests from strangers, `open` groups with group chat (`api/src/groups/service.ts:12,57`), `profile_visibility` defaulting to `'everyone'` (`api/migrations/1751000045000_user-search.js:11`), the public feed and comments, and minors' stored voice notes in the library.
   - `restricted_mode` is set only for under-**16s** (`api/src/gdpr/consent.ts:9`), only at email registration (`api/src/auth/service.ts:357-362`), and is never recomputed as users age. Google/Apple OAuth sign-up never sets `birth_date` (`api/src/auth/oauth.ts:160`). K0's "enforce `restricted_mode` for under-18s" therefore needs an age-band field, a recompute, and an age screen on the OAuth path.
4. **Consent design would break both the scheduler and the experiments.** `analytics_consent` defaults to false (`api/migrations/1751000010000_consent.js:16`). M1 says to "check `analytics_consent` first" for `exercise_answer`, which is also the `review_log` row. Gating the review log on analytics consent would leave non-consenting users with no FSRS data, and would bias every A/B readout toward opted-in users. Separate the two:
   - **Service data:** `review_log` and scheduler state, under a contract/necessity basis.
   - **Analytics:** events, consent-gated.
   - **Experiment assignment:** log it server-side.
   - Say in M5 that readouts cover only the consenting sample.
5. **The evidence labels break the document's own rubric.** "Weak" is defined to include "unverified", yet many unverified findings are labelled Moderate (§2, row E-1). Either relabel them or add a separate "verified?" column. Specific overstatements:
   - C1 and E7: "Confirmed: … form recall decays fastest" (only the delayed figures are confirmed);
   - S1 rated Moderate when it should be Weak;
   - E10 rated "Strong (indirect)" when it should be Moderate;
   - A7 rated Moderate, which holds only for generic feedback, not for LLM-written explanations.
6. **Q7, C7 and S1 propose things that already exist.** NFC normalisation is already applied in grading and Wordle. Sorani Arabic-letter folding already exists (but not in grading). The alphabet already teaches Sorani joining forms and e/ê-type minimal pairs. Library posts already have a `language` field. See §1.
7. **Prioritisation contradicts the document's own finding.** It says content is the binding constraint, then loads Phase 1 with about 45–70 engineer-weeks of engine work for 36–60 available. It schedules placement v2 for a 15-lesson course. It plans four user-level A/B readouts at month 6 that M5's own power maths says are underpowered. See §3c.
8. **Cost and funding are absent.** There is no estimate for:
   - voice talent (A1 implies thousands of clips);
   - editors;
   - legal review;
   - LLM calls (A7);
   - ASR hosting (A4);
   - native raters (A5, A6).

   There is also no revenue model, although Gems IAP and `users.premium_until` exist (`api/migrations/1751000089000_cosmetics.js:13,31`) and market_landscape.md §D covers monetisation.

---

## 1. Product accuracy (code vs document)

| Rec | What the document says | What the code shows | Required correction |
|---|---|---|---|
| **Q12** | "Run the content import idempotently"; the risk is only that the import "must create new versions, not overwrite" | The import already versions, but **every** run versions **every** lesson and publishes with new exercise UUIDs (`api/src/content/import.ts:9,152,166-170`). SRS state is keyed on exercise UUID (`api/src/review/service.ts:79-89`), so deploy-time re-import resets everyone's schedule | Add per-lesson change detection (content hash), or make E2's stable item ids a prerequisite. Add a no-op re-import test |
| **X1, K0, K2, Appendix B** | "Keep Zêr earn-only… If Zêr is ever sold"; "Children cannot buy Zêr"; "Do Zêr purchases fall under the EAA?" | Gems are the purchasable currency (`api/src/iap/service.ts:50-92`; `api/src/iap/routes.ts:21`). The shop prices in `zer` or `gems` and supports time-limited items (`availableFrom/availableTo`) and `premiumOnly` (`api/src/shop/routes.ts:14-26`). Gems are paid for perfect lessons, including replays (`api/src/content/routes.ts:74-79`) | Add a Gems row to X1/X2: perfect-lesson Gems on first completion only or removed, and league-promotion Gems off for minors. Apply the parental gate, CPC rules and EAA question to **Gems/IAP**. K2: ban time-limited shop offers for minors (the capability exists) |
| **Short version item 5, K0, §6 intro** | "every account… can use DMs, the public feed and open matchmaking"; K0 Phase A: "DMs… only with accepted friends", "private profile", "no free-text chat in public matchmaking"; Phase B: "strip EXIF" | DMs are friends-only (`api/src/chat/service.ts:87-88`). Gifts are friends-only (`api/src/shop/routes.ts:129-132`). No in-game chat exists. A profile-visibility setting exists (default `'everyone'`, `migrations/1751000045000_user-search.js:11`). EXIF is stripped (`api/src/media/imageProcess.ts:63,77`). Open groups with group chat exist (`api/src/groups/service.ts:12,57,100-105`) | Restate the exposure: stranger friend requests and suggestions, open groups and group chat, public feed and comments, default-public profiles, stored voice notes. Phase A becomes mostly default flips, so lower its effort (M → S–M). Drop the items that already hold |
| **K0** | "Under-18s. Enforce `restricted_mode`" | The flag is set only when age < 16 (`api/src/gdpr/consent.ts:9,20-26`), once at email sign-up (`api/src/auth/service.ts:357-362`), never recomputed. OAuth sign-up skips age and consent fields (`api/src/auth/oauth.ts:160`) | Store an age band or birth month, derive the minor status at request time, put the age screen on the OAuth path too, and set the threshold to 18 for engagement defaults (16/13 only for consent) |
| **Q7** | "NFC-normalise all typed input before grading and before counting Wordle letters" | Already done: `gradeText` uses `normalizeKurdish` (NFC; `shared/src/kurdish-text.ts:27-28`, `api/src/content/exercises.ts:224-226`). Wordle/rhyme normalise with NFC (`api/src/game/wordle.ts:26`; `shared/src/kurdish-text.ts:52-53`) | Remove it, or reword to "verify NFC on all *new* input paths" |
| **Q7** | "Add Sorani normalisation… map ي→ی, ك→ک, handle ه/ە/ھ"; learn from arXiv 2301.11406 | A tested folding table already exists: `web/scripts/ferheng-alphabet.ts:54-74` (`VARIANTS`/`foldLetter`: ك→ک, ي/ى→ی, ه→ھ, ۀ→ە, ı→i), evidenced against the corpus. It is used only by the static dictionary build, not by grading | Move `foldLetter` into `shared/src/kurdish-text.ts` and apply it in `gradeText`. Keep its deliberate ه→ھ choice. It already folds Turkish ı, which covers the Q7 risk. Add ZWNJ handling |
| **Q7** | A letter bar on dictionary search | Search already folds diacritics (`shared/src/kurdish-text.ts:80` `dictionaryKey`; web note §4: "not needed") | Drop dictionary search from the letter-bar list |
| **C7** | "Sorani joining. Teach the positional forms and joining explicitly"; build "listen and choose" rounds for e/ê, i/î, u/û | The web alphabet already shows 4 joining forms per letter (`web/src/alphabet/letters.ts:386` `formsOf`), a joining demo (`web/src/pages/Alphabet.tsx:296,381`) and a `form` question type (`web/src/alphabet/practice.ts:59`). It already has `hear` and `pair` minimal-pair rounds with 4 pairs and 8 clips (kur/kûr, dil/dîl, ker/kêr, şer/şêr: `letters.ts:343-348`; `practice.ts:54,57`) | Reframe as **extend**: persist results, add pairs and ڕ/ر and ڵ/ل, port to mobile. Reuse these vetted pairs instead of the "fact-checker background" pairs in the short version and E7 |
| **S1** | "A language, dialect and script field on posts (none today)" | `library_posts.language` exists (`NOT NULL DEFAULT 'kmr'`, indexed: `api/migrations/1751000072000_library-posts.js:18,32`). The API accepts it and filters on it (`api/src/library/routes.ts:18,26,98`). Only the composers don't set it (`web/src/feed/PostWords.tsx`) | Reword to "expose the existing `language` field in composers and readers; add `ckb` and script values". C4 already says the field is unused, so the two sections contradict each other |
| **Q1** | Rebalance the 15 seeded items, and shuffle via `sanitizeExercise`/`checkAnswer` | `checkAnswer` takes no seed. Three call sites must pass it: `api/src/content/sessions.ts:130,205`, `api/src/practice/service.ts:115,183`, and `api/src/placement/service.ts:91,162`. Placement uses the first exercise per level (`placement/service.ts:76-82`), so it is gameable today | Add placement and practice to "Builds on". Rebalancing stored indices is redundant once shuffling exists; keep only the lint |
| **Q4** | "When an answer is wrong… show the correct form" | The in-lesson footer already shows the correction (mobile note §2). Only the results screen hides it (`LessonResults.tsx:40-47`) | Scope the change to: audio of the correction, re-queue, and the results screen |
| **X3** | "Always show… the longest streak" | `longest_streak` is stored and returned (`api/src/streaks/service.ts:15,23,48`). No client displays it | This is display-only work (S), not new logic |
| **C2** | Courses, units, skills **and lessons** "come only from the JSON import" | Lessons can be created under a skill UUID in admin (`admin/src/pages/Content.tsx`; mobile note §9.2) | Minor wording fix |
| **Q11** | The GDPR export "contains only the profile" | It contains the profile, refresh tokens and OAuth links (`api/src/gdpr/service.ts:113-136`). It also omits posts, DMs, voice notes and images, not only learning data | Widen Q11's export fix to user-generated content and voice (Art. 15/20) |
| **K7, S3** | Private rooms, tournaments and 2v2 are "not exposed on mobile" | They are not exposed on web either (`grep joinCode\|/rooms\|tournament` over `web/src` and `mobile/src` finds nothing) | "Not exposed in any client" |
| **E11** | Offline is dead code | Correct (`mobile/src/offline/*` imported only by its test). `hevalo_current_state_backend.md` §1 and §14 wrongly say "PRESENT"; the recommendation correctly follows the mobile note | No change. Fix the backend note |

Checked and accurate: Q1 (15/15 multiple-choice items at index 0), Q2 (`dict:` ids reach `::uuid[]`, `api/src/practice/service.ts:88-93,122`), Q3, Q5, Q6, Q9 (`courses[0]`; `addToWotdPool` has no caller), Q10 (`xp_ledger_source_ref_uniq` on `(source, ref_id)`; `wordle-service.ts:245`; no `AchievementsService.award` caller), Q13, E1 endpoints, E4, E9 (`LIMIT 1`), E12, X1 cycle values, X4, X5, X6, X7 copy lines.

---

## 2. Evidence accuracy (document vs `*_verification.md`)

| # | Rec(s) | Problem | Source | Correction |
|---|---|---|---|---|
| E-1 | Global (label key) | "Weak = … or unverified", yet these unverified findings carry **Moderate**: Nakata production→reception (E2, Q7; `memory_retention_verification` row 4: unverified); Li 2010 and Van der Kleij (E6; sla row 10 / background); Lee & Macaro (C9, written "unverified, Moderate"); "pronunciation instruction d≈0.8" (A3; no verification row); Lichtman 2016 (K1; no row); Kim et al. 2021 (C7, K1; `children_verification` row 4 unverified vs `adaptive_assessment_verification` spot check confirmed) | Listed rows | Add a separate "verified / snippet / unverified" flag next to the strength label, or relabel these Weak |
| E-2 | C1, E7 | "**Confirmed**: deliberate study fades / form recall decays fastest" | `sla_theory_verification` row 5 confirms the **delayed** figures only; the immediate 60.1/58.5 are unverified. Row 6 says pooled immediate-vs-delayed means come from different studies and overstate within-learner decay | "Delayed form recall (25.1%) is below meaning recall (39.4%) (snippet-level)." Drop "decays fastest" |
| E-3 | S1 | Overall "Moderate" | The peer-correction core (Huisman, Sato & Lyster) is all [PK] unverified higher-education classroom evidence (`social_collaborative_verification` row 5). Only glossing is confirmed | Weak (correction features); Moderate only for the glossing sub-feature |
| E-4 | E10 | "Strong (indirect)" | Whether game-format retrievals deserve flashcard-equivalent scheduling is unknown (`memory_retention_verification` omitted 11, Kim & Webb 2023). Timed, competitive play confounds it | Moderate |
| E-5 | A7 | "Moderate"; "the guarded tutor only removed the harm; it did not add learning" stated as fact | Elaborated-feedback support is background, unverified (sla row 10). The "did not add learning" detail is [background, unverified] (`ai_llm_tutoring_verification` row 3). There is no evidence on LLM-written explanations in Kurdish contexts | "Moderate (feedback type) / Weak (LLM delivery)". Mark the Bastani detail as unverified |
| E-6 | A4 | "Confirmed core: g = 0.69 (CI 0.31–1.08), explicit 0.86 vs 0.50" | `speech_audio_tech_verification` row 1 verdict is **overstated**: the CI and segmental split rest on one snippet, and subgroup differences have no significance test | "Core g confirmed; CI and moderator splits single-snippet" |
| E-7 | Short version item 3, top-ten #6, C5 | "For the largest audience, heritage Kurds, the bottleneck is most likely reading and spelling" | Rests on an unverified US college survey (`heritage_minority_kurdish_verification` row 1). Omitted item 5 says many young Kurds may be receptive-only. "Largest audience" has no source and Hevalo has no analytics | Present it as a hypothesis. Gate C5's size on E9 onboarding self-reports and placement data |
| E-8 | C3, C4 | Glossing "confirmed" | `sla_theory_verification` row 7 says unverified; `social_collaborative_verification` row 8 says confirmed via logged summary (conflict not disclosed). Row 8 also notes that tap-to-gloss is a "hyperlinked" gloss that ranked **3rd**, and that learners skip optional look-ups. C4 relies on tap-to-gloss | Note the conflict. Default to the inline "guess-first" or marginal gloss for pre-taught words; treat tap-to-gloss as secondary |
| E-9 | E12, X6 | "+3.9 points per tailored prompt" | `multimedia_ux_verification` row 9: "3.9% more likely", which could be percentage points or relative | "about 3.9% (unit unclear)" |
| E-10 | X6 | "(Stawarz 2015; background; omitted item 7)" | Stawarz is `motivation_gamification_verification` omitted item 1. Multimedia omitted item 7 is a different, snippet-only paper | Fix the citation |
| E-11 | A2 | Keyword-only captions "(… `multimedia_ux_verification.md` omitted item 8)" | That point is `speech_audio_tech_verification` omitted item 8 | Fix the citation |
| E-12 | E5 | "But 5 and 7 did not differ" (stated as fact) | [background, unverified] (`memory_retention_verification` row 4, `multimedia_ux_verification` row 7) | Mark it as unverified |
| E-13 | K1 | "The deficit from pre-recorded video fades by about age 3" (stated as fact) | [background, unverified] (`children_verification` row 1) | Mark it as unverified |
| E-14 | E9 | Al-Hoorie r = .61 / .20, "Moderate" | `motivation_gamification_verification` (other claims) says unverified; `heritage_minority_kurdish_verification` omitted 2 calls it an independent retrieval | Note the conflict. The ≈.10 bias-corrected figure supports "barely predicts" more strongly |
| E-15 | K0 | COPPA "facts are consistent across several law-firm sources" | `children_verification` row 9: rule facts are unverified independently (one agent's chain); `market_landscape_verification` row 9 confirms | "Consistent across one agent's law-firm snippets; counsel to confirm" |
| E-16 | Top-ten table | Titled "best ratio of expected learning impact to effort", but it contains four L-effort items (#1, 4, 5, 10) and two weak-evidence items (#6, 7) | Internal | Retitle "highest-priority changes", or re-rank by ratio: Q1, Q3, Q4, X4, X1, Q6 and Q8 are the true best ratios |

Accurate uses (no change): E3 benchmark numbers and FSRS-7 (memory rows 6–10); E9 SE arithmetic (adaptive row 9); M3 probe sampling (adaptive omitted 3); M5 power arithmetic; K5 Dowdall/Noble; K3 Goossens rebalanced; X3 Milkman downgrade; Appendix A.

---

## 3. Completeness

### 3a. Evidence-backed opportunities raised in the notes and dropped

| Opportunity | Note | Why it matters | Suggested handling |
|---|---|---|---|
| **Credit meaning-focused input in XP, streaks and goals** (Nation's four strands; track strand balance) | sla_theory impl. 25 | X2 lets the streak and goal count only "graded retrievals". Reading a C4 story or listening without a quiz would therefore earn nothing, which pushes learners toward drills: the opposite of C1's "≤25% deliberate study" | Count a completed graded-reader or listening session (with its comprehension check) as learning activity. Add a weekly strand-balance nudge |
| **Keyword mnemonics and gesture/TPR for adults** | multimedia impl. B12–14 | Cheap content fields. The keyword method has a long evidence record (unverified this run); gesture enrichment is cited (U) | A P2 optional "memory hook" field, curated per UI language (not community-voted; multimedia omitted 8), shown after two misses. Label it Weak |
| **Learning by teaching** ("explain it to a friend", child-teaches-parent quests) | social impl. 9, 18 | Fits the family and heritage strategy at near-zero cost | Add to K5/S5 as a Weak, A/B-tested option |
| **Audio-only, hands-free "Pimsleur-style" mode** for commuters and semi-speaker parents | market impl. 10 | Reuses A1 audio and E3 scheduling. Serves low-literacy adults | Speculative, P3 |
| **Make stopping cheap**: save and resume mid-lesson, exit without loss | multimedia impl. 18 | Directly supports X3 and in-region connectivity | Fold into E11 or E1 |
| **Corpus frequency lists** as an explicit work item; dictionary quality pass (flag core 2–5k, hide inflected forms) | sla impl. 8; heritage impl. 10 | C1 sequencing, E8 priors and C8 bands all depend on it. It currently appears only as a question in Appendix B | Add a C-item: build Kurmanji frequency bands from Pewan, OSCAR and the community corpus, with editor weighting |
| **Break nudges for minors** (ICO-endorsed) | motivation impl. 17 | Cheap, and a positive regulatory signal | Add to K2 |
| **Zêr sinks tied to learning or culture** (bonus readings, dialect audio) | motivation impl. 14 | Gives earn-only Zêr a learning purpose | Add to X1 |
| **Monetisation that does not tax learning**, and patronage | market impl. 19–21 | The roadmap needs paid editors and voice talent and has no funding line, while Gems IAP and `premium_until` already exist | Add a section, or at least a risk entry |
| **AI cost architecture** (caching, per-user AI budgets, small models after validation) | ai_llm impl. 11 | A7–A9 have no cost ceiling | Add to A7/A9 |
| **Zazakî**: 8,563 Turkish elective selections; `zza` dictionary import is already supported | heritage impl. 4; market verification row 11 | An explicit decision is missing | One line in C6: out of scope, with a reason, or tag-only |

### 3b. Risks the document does not address

- **Children's privacy and safety**
  - OAuth sign-up bypasses any age screen (`api/src/auth/oauth.ts:160`).
  - `restricted_mode` is a static flag with a 16 threshold.
  - Open groups give strangers group chat.
  - Minors' **stored voice notes and voice comments** in the library exist today. These are COPPA personal information needing consent (`social_collaborative_verification` row 11f), yet the document treats stored child voice only as a future K6 issue.
  - Sentry on the API (`api/package.json:30`) may capture minors' request data. K0's "no third-party SDKs" is written only for clients.
- **AI quality for Kurdish**
  - A7 writes explanations "in the learner's UI language". For `ku`/`ckb` UI users that means LLM-generated **Kurdish** prose, the highest-risk case HevalBench exists to catch. Restrict A7 to non-Kurdish UI languages until HevalBench passes for Kurdish output.
  - HevalBench, A5 and S2 all need native raters and moderators per variety, with no budget or recruiting plan.
  - The moderation classifier scores toxicity as 0 (`docs/security/ai-moderation.md`), so the public feed has no automated abuse detection today. That raises K0 Phase A's urgency.
- **Cost:** no figures anywhere (see §0.8). A1 implies 3–5 voices × about 1,500 A2 lemmas plus sentences, i.e. thousands of clips. Price that before Phase 1's gate ("≥30 lessons with 100% native audio").
- **Consent and measurement bias:** see §0.4.
- **Data re-import:** see §0.1.
- **Distribution and political:**
  - The fa locale (C9) ignores app-store and payment sanctions for Iranian users (`heritage_minority_kurdish_verification` row 10).
  - The Zarok TV partnership (C4) carries Turkish political exposure (heritage omitted 8).
  - K7's Turkey classroom pack involves minors in state schools, and the document only flags ministry approval.
- **Licence:** the kaikki/English Wiktionary seed for C3 is CC BY-SA, like Wîkîferheng, so the share-alike duty covers both sources.

### 3c. Is the prioritisation defensible?

- **Phase 0 is mostly right:** cheap defect fixes with strong rationale, plus K0 Phase A. Add the Gems farming fix and the restricted-mode/OAuth age fix, both S. Q13 is P1 in the index but sits in Phase 0 of the roadmap; pick one. Q7's Sorani part can wait until before C6, since there is no Sorani content.
- **Phase 1 is overloaded and contradicts the "content is the long pole" finding.**
  - It holds E1 (L), mobile release, E2 (L), E3 shadow, E5 (M–L), E6 (M), E7, E9 (M), E12 (M), X2 (M), X3 (M), X5, X6, Q10, C7 (M), M1–M3 and M5, alongside C1, C2 and A1.
  - That is roughly 45–70 engineer-weeks against 36–60 available (3–5 engineers × 12 weeks).
  - **Defer:**
    - E9 placement v2, to P2: there is nothing to place into in a 15-lesson course. Keep only the onboarding questions, goal and age screen.
    - E5 and E6 beyond "new units are authored to the v2 structure".
    - X5 beyond a one-tap opt-out.
  - **Protect** C2, A1 and C1 capacity.
- **The experiment gates are not credible at launch scale.**
  - Month 6 expects four concurrent user-level readouts (`lesson_v2`, `scheduler_fsrs`, `streak_forgiving`, `daily_reward_learning`). M5 says about 393 learners per arm are needed for d = 0.2, and the arms interact.
  - Run item-level tests first (Q4, E6, A2, C4) and user-level tests one at a time, or label them as monitoring, not decisions.
  - The FSRS gate "calibration beats SM-2" is weak: SM-2 has no native probability (the benchmark assumes p = 0.9^(t/ivl); `memory_retention_verification` row 7b). Gate against the moving-average baseline, with a minimum review count.
- **Evidence vs placement:** the weak-evidence items (C5 Weak/Moderate, E9 Moderate/Weak) sit in the top ten while A2 (perception and listening drills, Moderate, no ASR needed, M) does not. A2 and A1 are better value than E9 for every audience. Promote A2 into the top ten, and move E9's routing behind C1 scope.
- **What is defensible:** keeping AI (A7–A9) and ASR scoring (A4) late and gated; FSRS behind E2 and shadow mode; K1 behind K0 Phase B; the measurement plan's north-star metric (delayed unassisted recall).
