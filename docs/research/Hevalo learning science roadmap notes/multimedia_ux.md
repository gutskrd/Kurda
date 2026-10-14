# Cognitive load, multimedia learning, mnemonics, microlearning and accessibility in learning-app UX

**How these notes were produced (please read before using them):**

- This turn's web-search budget was used up by other agents before any of my searches ran. All six of my first searches came back "not performed", and WebFetch is blocked by the egress proxy (a test fetch of w3.org/TR/WCAG22 failed with `EGRESS_BLOCKED`). So **I could not retrieve any new source myself.**
- **"Cited Findings"** below reuse sources that sibling researchers in this project retrieved and cited in their notes, in the same folder (`memory_retention.md`, `sla_theory.md`, `speech_audio_tech.md`, `children.md`, `motivation_gamification.md`, `heritage_minority_kurdish.md`). Each is tagged "(via *file*)". Those researchers also worked only from search snippets, with no full-text reads.
- Everything that comes only from my background knowledge (training data to mid-2026) is in the **Gaps** sections, marked **UNVERIFIED**. It carries an evidence grade and a bibliographic pointer, but no URL, so it can be checked. I have not made up URLs. The report writer should treat UNVERIFIED items as well-known leads to confirm, not as cited facts.
- More searches can be run if the user sends a follow-up message, or if the per-session search limit (`CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION`) is raised.

**Evidence grades:** [MA] meta-analysis or systematic review · [RCT/EXP] randomised or controlled experiment · [QE] quasi-experiment · [OBS] observational or correlational · [EXP-OP] expert opinion, guideline or framework · [STD] standard or regulation · [VENDOR] company claim · [DOCS] platform documentation. "OLDER" marks findings from before about 2016 that are still cited but may be partly superseded.

---

## 1. Mayer's multimedia principles and cognitive load theory applied to language learning (pictures vs translations, redundancy with audio + text, signaling, segmenting)

### Takeaway
The classic redundancy principle says not to add on-screen text to narration. **It does not carry over to second-language (L2) learning in its simple form.** For L2 learners, adding written text to audio (captions) reliably helps vocabulary and listening (captions g = 0.56; g = 1.36 for primary-school children). Reading while listening helps only when the audio sets the pace (g = 0.41, against g = 0.06 for self-paced reading). For word meaning, pictures, L1 text and audio glosses do about equally well (no significant difference in a 42-study meta-analysis). L1 glosses beat L2 glosses, and "pick-the-meaning" glosses work best. Other cognitive-load principles do hold up in general research and plausibly transfer: signaling, segmenting, pre-training, coherence (cutting seductive details) and expertise reversal. However, the L2-specific evidence for them is thin, and I could not verify it this session (see Gaps).

### Cited Findings
- **[MA] Captioned viewing (Kurokawa et al. 2025, *Language Learning*; 49 studies, 89 effect sizes).**
  - Captioned vs uncaptioned video gave **g = 0.56**, which is 3.11–4.55% more target words learned.
  - Videos made for L2 learners: **g = 1.04**. Videos made for native speakers: **g = 0.46**.
  - Primary-school learners: **g = 1.36**. Secondary and university learners: g = 0.44.
  - This supersedes Montero Perez et al. (2013) as the main caption synthesis.
  - — [Wiley](https://onlinelibrary.wiley.com/doi/10.1111/lang.12697); [author copy](https://takumiuchihara.weebly.com/uploads/1/2/3/7/123756989/kurokawa_et_al.__2024_.pdf) (via sla_theory.md)
- **[MA] Reading-while-listening vs reading only (30 studies, N = 1,945, 62 effect sizes, *Language Teaching*).**
  - Overall **g = 0.18**.
  - The benefit appeared only when the **experimenter or the audio set the pace (g = 0.41)**. Self-paced reading gave **g = 0.06**.
  - — [Cambridge](https://www.cambridge.org/core/services/aop-cambridge-core/content/view/S0261444822000507) (via speech_audio_tech.md)
- **[MA, older] Montero Perez, Van Den Noortgate & Desmet (2013)** found captions help L2 listening and vocabulary. Later reviews say the benefit is **largest at low proficiency**. The 2013 effect sizes were not retrieved. — [Frontiers 2022 review](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2022.904523/pdf); [ERIC](https://files.eric.ed.gov/fulltext/EJ1125240.pdf) (via speech_audio_tech.md)
- **[MA] Glossing (Yanagisawa, Webb & Uchihara 2020, *SSLA*; 42 studies, 359 effect sizes, N = 3,802).**
  - Words learned, immediate/delayed: glossed reading **45.3% / 33.4%**; unglossed reading **26.6% / 19.8%**.
  - **Multiple-choice glosses were the most effective type.**
  - **L1 glosses beat L2 glosses by about 4 percentage points.**
  - **There was no significant difference between textual, pictorial and auditory glosses.**
  - — [ERIC EJ1251024](https://eric.ed.gov/?id=EJ1251024); [author preprint](https://takumiuchihara.weebly.com/uploads/1/2/3/7/123756989/yanagisawa-webb-uchihara-2019-glossing_meta-analysis.pdf) (via sla_theory.md)
- **[MA] Incidental vocabulary by mode (24 studies, N = 2,771).** Gains (immediate/delayed) were similar for reading (17% / 15%), listening (15% / 13%) and reading-while-listening (13% / 17%). Viewing gave 7% / 5%. **Audio-only input teaches vocabulary about as well as text.** — [Cambridge Core](https://www.cambridge.org/core/journals/language-teaching/article/how-effective-is-second-language-incidental-vocabulary-learning-a-metaanalysis/E38E3468FD2090B1FA3051051DE8E70C) (via sla_theory.md, speech_audio_tech.md)
- **[MA, correlational] Uchihara, Webb & Yanagisawa (2019, *Language Learning*; 26 studies, N = 1,918).** The number of encounters correlates with vocabulary learning at **r = .34**. **Visual support**, spacing and engagement moderate the effect. — [Wiley](https://onlinelibrary.wiley.com/doi/abs/10.1111/lang.12343) (via sla_theory.md)
- **[MA, OLDER-2015] Technology-enhanced storybooks (Takacs, Swart & Bus 2015; 43 studies, 2,147 children).**
  - Story comprehension **g = 0.17**; expressive vocabulary **g = 0.20**.
  - **Multimedia features (animated pictures, music, sound effects) helped.**
  - **Interactive features (hotspots, games, dictionaries) distracted.**
  - Children from less stimulating homes gained most from multimedia and were hurt most by interactive add-ons.
  - This is a child-level form of the coherence / seductive-details principle.
  - — [SAGE PDF](https://journals.sagepub.com/doi/pdf/10.3102/0034654314566989); [Leiden](https://scholarlypublications.universiteitleiden.nl/access/item:2872126/view) (via children.md)
- **[MA] Interleaving (Brunmair & Richter 2019; 59 studies).**
  - Overall **g = 0.42**.
  - **For word materials, blocking beat interleaving (g = −0.39).**
  - Interleaving helps most when categories are highly similar.
  - This bears on cognitive load: mixing *new* words raises element interactivity with no benefit, while mixing *confusable* letters and forms helps.
  - — [Würzburg PDF](https://www.psychologie.uni-wuerzburg.de/fileadmin/06020400/2019/Brunmair_Richter_in_press__2019_META-ANALYSIS_OF_INTERLEAVED_LEARNING.pdf) (via memory_retention.md)

### Inferences
- **Audio plus written Kurdish is the right default for Hevalo's lesson items, not a redundancy error.** The learner is decoding an unfamiliar spoken and written code, so the written form is not truly redundant with the audio. Caption and gloss meta-analyses confirm this. The classic redundancy concern applies more to long *UI-language explanations* that are narrated and also printed word for word.
- **"Picture vs translation" is the wrong choice to make.** Gloss modality does not matter on average (Yanagisawa 2020). What matters is that the learner (a) is made to *retrieve* the meaning, which is why multiple-choice glosses win, and (b) gets the meaning in their **L1 / UI language**. Pictures earn their place for concrete nouns and verbs, for children and pre-readers, and for avoiding L1 dependence. Translations are faster and clearer for abstract words.
- **Audio-paced highlighting ("karaoke") is the evidence-backed form of combining text and audio.** Free self-paced reading next to an audio file adds almost nothing (g = 0.06).
- Children are hurt by interactive distractions inside stories (Takacs). Hevalo's stories for kids should keep pictures, narration and sound, but keep games and dictionary pop-ups *outside* the reading flow.

### Gaps
- **Mayer's principles, not retrieved, UNVERIFIED [EXP-OP / lab RCTs, mostly older].**
  - Mayer, *Multimedia Learning* (3rd ed., Cambridge UP, 2020/2021), and Mayer & Fiorella (eds.), *Cambridge Handbook of Multimedia Learning* (3rd ed., 2022), group about 15 principles into three sets:
    - **reducing extraneous processing:** coherence, signaling, redundancy, spatial contiguity, temporal contiguity;
    - **managing essential processing:** segmenting, pre-training, modality;
    - **fostering generative processing:** multimedia, personalization, voice, embodiment, generative activity. The "image principle" (adding the speaker's face) shows little or no benefit.
  - From memory, Mayer reports median effect sizes mostly between about d = 0.4 and 1.4. These come largely from his own lab's short STEM-explanation experiments, not from L2 learning, and independent meta-analyses usually find smaller effects. **Exact per-principle values need checking.**
- **Redundancy boundary conditions, UNVERIFIED.**
  - I recall Mayer listing conditions under which on-screen text plus narration does *not* hurt: no graphics, very short on-screen text (key words), learner-controlled pacing, and possibly non-native listeners.
  - **[MA] Adesope & Nesbit (2012, *J. Educ. Psych.*), verbal redundancy:** spoken+written beat spoken-only by a small amount (I recall g ≈ 0.15), with no advantage over written-only. The benefit was larger for low-prior-knowledge learners and shrank when pictures or animations were present. Numbers are from memory.
- **Modality and contiguity, UNVERIFIED [MA, older].** Ginns (2005, *Learning and Instruction*) reported a modality effect of about d = 0.72, larger for system-paced material. Ginns (2006) reported spatial and temporal contiguity effects of about d = 0.7–0.8. Later work (e.g., Reinwein 2012) suggests the modality effect shrinks or vanishes when learners control the pace.
- **Signaling, UNVERIFIED [MA].**
  - Richter, Scheiter & Eitel (2016, *Educational Research Review*): signaling text–picture relations gives a small effect (I recall r ≈ .17), **mainly for low-prior-knowledge learners**.
  - Schneider et al. (2018, *ERR*) and Alpizar, Adesope & Wong (2020, *ETR&D*) report small-to-moderate positive effects (roughly g ≈ 0.3–0.5).
  - I found no L2-specific signaling meta-analysis. Input-enhancement research in SLA (bolding or colouring target forms) is the closest analogue and was not retrieved.
- **Segmenting, UNVERIFIED [MA].** Rey et al. (2019, *Educational Psychology Review*): segmenting gives small-to-moderate gains in retention and transfer (about d = 0.3–0.4 from memory) and lowers reported cognitive load, but **increases learning time**.
- **Seductive details, UNVERIFIED [MA].** Rey (2012, *ERR*) and Sundararajan & Adesope (2020, *EPR*) found that interesting but irrelevant additions **hurt** retention and transfer (about g = −0.3 in the 2020 synthesis, from memory). This bears on decorative mascots, background music and animations shown *during* exercises.
- **Emotional design, UNVERIFIED [MA].** Brom, Stárková & D'Mello (2018, *ERR*) and Wong & Adesope (2021, *EPR*) found that positive-emotion design (warm colours, anthropomorphic faces) gives small gains in retention, motivation and liking (about g = 0.2–0.4). A friendly mascot is therefore defensible *if it does not add motion or content during the task*.
- **Expertise reversal, UNVERIFIED [EXP-OP / RCTs].** Kalyuga (2007, *EPR*) and Sweller, van Merriënboer & Paas (2019, *EPR*, "20 years later"): supports that help novices (worked examples, integrated pictures, glosses) become redundant and can **hurt** more advanced learners. This matters for heritage learners.
- **Pictures vs translations, UNVERIFIED [RCT/EXP, older].**
  - Carpenter & Olson (2012, *JEP:LMC*): pictures were *not* better than L1 translations for learning Swahili words, because learners were overconfident with pictures and studied them less. The picture advantage appeared once that overconfidence was reduced.
  - Lotto & de Groot (1998, *Language Learning*): word–word (L1 translation) learning beat picture–word learning on recall.
  - Plass, Chun, Mayer & Leutner (1998, *J. Educ. Psych.*) and Chun & Plass (1996, *MLJ*): words annotated with **both** a visual and a verbal annotation were recalled best (dual-coding support; older).
  - Boers and colleagues' idiom work suggests pictures help meaning recall but can pull attention away from the written form (details unverified).
  - The 2020 gloss meta-analysis (cited above) partly supersedes these single studies: on average, gloss modality makes no difference.
- **L2-specific multimedia studies, UNVERIFIED.** Plass & Jones (2005), a chapter in the *Cambridge Handbook of Multimedia Learning*. Mayer, Lee & Peebles (2014) and Lee & Mayer (2015) in *Applied Cognitive Psychology*: adding video to an audio lecture helped non-native listeners. I do not reliably remember the subtitle results.
- **Learning styles, UNVERIFIED [EXP-OP / review, older but still current].** Pashler, McDaniel, Rohrer & Bjork (2008, *Psychological Science in the Public Interest*) found no adequate evidence that matching instruction to "visual / auditory learner" styles improves learning. **A "learning-style" setting should not be built.**

---

## 2. Dual coding and imagery for vocabulary; mnemonic techniques (keyword method), effect sizes and durability; gesture and embodiment

### Takeaway
Combining verbal and non-verbal codes (picture, gesture, sound) helps vocabulary, but no single modality is magic. Verified meta-analytic evidence here shows visual support moderates learning (Uchihara 2019) and that gloss modality does not matter on average (Yanagisawa 2020). The keyword mnemonic has large *immediate* effects. My background knowledge says its long-term advantage is doubtful, that Dunlosky et al. rated it "low utility", and that it should be used selectively and always paired with spaced retrieval (UNVERIFIED). Self-performed iconic gestures have good experimental support, including **6-month durability in children**. Classroom TPR and song studies with children are positive but weak (UNVERIFIED for gestures; cited for TPR and songs).

### Cited Findings
- **[MA] Visual support moderates repetition effects** on vocabulary learning (Uchihara et al. 2019). — [Wiley](https://onlinelibrary.wiley.com/doi/abs/10.1111/lang.12343) (via sla_theory.md)
- **[MA] Gloss modality:** no significant difference between textual, pictorial and auditory glosses. L1 > L2 glosses by about 4 points. Multiple-choice glosses work best. — [ERIC EJ1251024](https://eric.ed.gov/?id=EJ1251024) (via sla_theory.md)
- **[MA] Intentional (deliberate) vocabulary learning (Webb, Yanagisawa & Uchihara 2020, *MLJ*; 22 studies, 100 effect sizes; flashcards, word lists, writing, fill-in-the-blanks).**
  - Immediate gains: **60.1%** meaning recall, **58.5%** form recall.
  - Delayed gains: **39.4%** and **25.1%**.
  - Gains vary widely by activity: **18.4–77.0%** immediate.
  - This is the baseline any mnemonic must beat, and it shows how steeply **form recall** decays.
  - — [Wiley](https://onlinelibrary.wiley.com/doi/abs/10.1111/modl.12671); [ResearchGate](https://www.researchgate.net/publication/346001854_How_Effective_Are_Intentional_Vocabulary-Learning_Activities_A_Meta-Analysis) (via sla_theory.md, memory_retention.md)
- **[RCT/EXP] Retrieval direction (Nakata's flashcard research).** Productive retrieval (L1→L2) builds both productive and receptive knowledge. Receptive retrieval (L2→L1) builds mainly receptive knowledge. — [Nakata 2020 chapter](https://howtoeigo.net/research/wp-content/uploads/2021/03/Nakata-2020-The-Routledge-Handbook-of-Vocabulary-Studies_Part2.pdf) (via memory_retention.md)
- **[QE] TPR and songs with preschoolers.** 72 Thai children aged 4–5 learned 12 words over 6 weeks. TPR and songs both helped, and the combination worked best. — [ERIC EJ1304648](https://files.eric.ed.gov/fulltext/EJ1304648.pdf) (via children.md)
- **[SR] Songs.** A 2024 *System* review of 60 intervention studies found the evidence "not substantial or reliable enough" for strong causal claims about singing and vocabulary. — [ScienceDirect](https://www.sciencedirect.com/science/article/pii/S0346251X24001325) (via children.md)
- **[EXP-OP] The children's researcher proposes TPR-style action games for pre-readers**, where a character models "Destên xwe bilind bike!" and the child copies it (children.md, implication 14). This is consistent with the embodiment evidence below but is a design proposal, not a finding.

### Inferences
- The keyword method links an L2 *sound* to an L1 word and an image. That supports **receptive** recall (Kurdish→meaning), while the meta-analytic evidence says **form recall** is the weak point. So keyword mnemonics address the less critical direction and should be a booster for hard, non-cognate, concrete words, not a core method.
- Keywords depend on the learner's language: a German speaker's keyword for *dar* ("tree") differs from a Turkish speaker's. Any mnemonic feature must be **per UI language**, and ideally **learner-generated or community-voted**. Hevalo has nine UI languages and a community feed.
- Gesture enrichment suits verbs, actions, emotions and spatial words, and it suits children. In an app it can be done as "watch a native speaker do it, then do it yourself while saying the word". Camera verification is possible but not needed for the benefit (inference; see Gaps).

### Gaps
- **Dual coding, UNVERIFIED [theory + EXP, OLDER].** Paivio (1971; 1986, *Mental Representations*): concrete words are remembered better because they get both verbal and imagery codes. De Groot & Keijzer (2000, *Language Learning*): **concrete and cognate L2 words are learned faster and forgotten less** than abstract and non-cognate words. Word frequency had a smaller effect.
- **Keyword method, UNVERIFIED.**
  - Atkinson & Raugh (1975) [EXP, OLDER]: large immediate gains for Russian vocabulary.
  - Wang, Thomas & Ouellette (1992, *AERJ*) and Wang & Thomas (1995, *J. Educ. Psych.*) [EXP]: the keyword advantage on immediate tests often **disappeared or reversed after a delay (about a week)**, with keyword learners forgetting faster.
  - Dunlosky, Rawson, Marsh, Nathan & Willingham (2013, *PSPI*) [EXP-OP review] rated the keyword mnemonic **"low utility"**: effects are limited to keyword-friendly material and are short-lived in some studies.
  - Sagarra & Alba (2006, *MLJ*) [EXP]: for beginning learners of Spanish, the keyword method beat rote memorisation and semantic mapping on retention. This is a positive counterpoint.
  - Mastropieri & Scruggs's syntheses of mnemonic instruction for students with learning disabilities report very large short-term effects (d > 1, from memory).
  - **I could not check whether a 2020s meta-analysis of mnemonics in L2 vocabulary exists, or what effect sizes it reports. This is the biggest gap in this section.**
- **Gesture and embodiment, UNVERIFIED [EXP].**
  - Macedonia & Knösche (2011, *Mind, Brain, and Education*) and Macedonia, Müller & Friederici (2011, *Human Brain Mapping*): self-performed **iconic** gestures improved recall of foreign words over reading or listening alone, and over meaningless gestures.
  - Mayer, Yildiz, Macedonia & von Kriegstein (2015, *Current Biology*): both picture enrichment and gesture enrichment improved adults' translation of foreign words. Gesture benefits seemed more durable at 2 and 6 months.
  - Andrä, Mathias, Schwager, Macedonia & von Kriegstein (2020, *Educational Psychology Review*): about 8-year-old children learning English words in school benefited from both gestures and pictures over verbal-only learning, with **effects persisting to about 6 months**.
  - A systematic review and meta-analysis of the **enactment effect** (subject-performed tasks) exists, which I believe is Roberts et al. 2022 in *Neuroscience & Biobehavioral Reviews*. Effect sizes were not retrieved.
  - Whether *watching* a gesture is as good as *performing* one is mixed in my recollection.
- No evidence found or recalled on mnemonics or gestures specifically for Kurdish, or for script letters, such as letter-shape mnemonics for Sorani or Arabic letters. Letter-picture mnemonics ("embedded picture mnemonics") have some support in English early-literacy research (e.g., Ehri and colleagues), but this is unverified.

---

## 3. Microlearning and session design: optimal lesson length, notification timing and frequency, push-notification fatigue

### Takeaway
**There is no good evidence for an "optimal lesson length" in minutes**: three sibling researchers looked independently and found none. What is well supported is **structure across and within sessions**:
- many short, distributed sessions beat few massed ones (spaced vs massed g ≈ 0.76 immediate and 1.15 delayed, from a snippet);
- a night's sleep consolidates new words (g = 0.50);
- each new word should be retrieved 5–7 times within a session, spaced out (beats 1–3 retrievals).

Notifications are a small lever: about +3.9 percentage points in engagement per tailored prompt in mHealth, and +0.5% DAU from Duolingo's whole optimisation. Their effect **wears off with repetition and recovers with rest**. For minors, EU guidance now says push notifications and streaks should be **off by default**.

### Cited Findings
- **[MA] Spacing (Kim & Webb 2022, *Language Learning*; 48 experiments, 98 effect sizes, 3,411 learners).** Spaced practice was significantly more effective than massed practice. The snippet gives **g = 1.15 delayed and g = 0.76 immediate**; which comparison each figure belongs to was unclear in the snippet. **The number of sessions moderated the effect.** — [ResearchGate](https://www.researchgate.net/publication/358406370_The_Effects_of_Spaced_Practice_on_Second_Language_Learning_A_Meta-Analysis); [Wiley](https://onlinelibrary.wiley.com/doi/abs/10.1111/lang.12479) (via sla_theory.md, memory_retention.md)
- **[RCT/EXP] Within-session retrieval (Nakata 2017, *SSLA*).** Learners who retrieved each of 16 words **5 or 7 times** in one session beat those who retrieved them 1 or 3 times, on all posttests. — [Cambridge](https://www.cambridge.org/core/journals/studies-in-second-language-acquisition/article/abs/does-repeated-practice-make-perfect-the-effects-of-withinsession-repeated-retrieval-on-second-language-vocabulary-learning/F14BA8A576CD2563D14CEA46E35D842E) (via memory_retention.md)
- **[RCT/EXP] Set size (Nakata & Webb 2016, *SSLA*).** Larger blocks lower performance during the session but help retention through **longer within-session spacing**. — [ResearchGate](https://www.researchgate.net/publication/271207356_Does_studying_vocabulary_in_smaller_sets_increase_learning_The_effects_of_part_and_whole_learning_on_second_language_vocabulary_acquisition) (via memory_retention.md)
- **[MA] Sleep (Schimke et al. 2021; 25 studies).** For new words, sleep beat wake at **g = 0.50** (recall g = 0.57). Children may benefit more than adults. — [Springer](https://link.springer.com/article/10.3758/s13423-021-01980-3) (via memory_retention.md)
- **No meta-analysis on optimal session length in minutes for app-based L2 learning was found** (memory_retention.md). No reliable evidence was found on session length by age for children; "2–3 minutes per year of age" is an unsourced folk rule (children.md). — [NN/g children video page](https://www.nngroup.com/videos/designing-children/) says only "acknowledge short attention spans" (via children.md)
- **[OBS, survival analysis] *SSLA* 2024, non-conventional adult learners using a language app.** High app acceptance went with **more frequent pauses** but also longer active use and fewer dropouts. **Pausing is normal; returning is what matters.** — [Cambridge SSLA](https://www.cambridge.org/core/journals/studies-in-second-language-acquisition/article/acceptance-and-engagement-patterns-of-mobileassisted-language-learning-among-nonconventional-adult-l2-learners-a-survival-analysis/C1186B329F808A11DDF2C748E77FD1EE) (via motivation_gamification.md)
- **[RCT, ML deployment / VENDOR-authored] Yancey & Settles (KDD 2020), Duolingo's "sleeping, recovering" bandit for practice reminders.**
  - Template novelty **decays with repeated use and recovers with rest**.
  - Against a strong baseline it gave **+0.5% DAU** and **+2% new-user retention**, using about 200M notifications in the replication data.
  - — [Duolingo Research PDF](https://research.duolingo.com/papers/yancey.kdd20.pdf); [KDD](https://www.kdd.org/kdd2020/accepted-papers/view/a-sleeping-recovering-bandit-algorithm-for-optimizing-recurring-notificatio.html) (via motivation_gamification.md)
- **[RCT, micro-randomised, mHealth] Bidargaddi et al. (2018).** A tailored push notification raised the probability of engaging within 24 h by about **3.9 percentage points**. — [JMIR mHealth](https://doi.org/10.2196/10123) (via motivation_gamification.md)
- **[RCT, exploratory] Morrison et al. (2017, *PLOS ONE*).** Daily and "intelligent" schedules got more notification views than occasional ones. Intelligent and fixed-daily schedules did not differ. — [PLOS ONE](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0169162) (via motivation_gamification.md)
- **[STD] EU DSA Article 28 guidelines on protecting minors (14 July 2025).** Features that encourage excessive use, explicitly **streaks, push notifications, autoplay and read receipts**, should be **disabled by default for minors**. — [Hunton summary](https://www.hunton.com/privacy-and-information-security-law/european-commission-issues-guidelines-on-the-protection-of-minors); [Freshfields](https://www.freshfields.com/en/our-thinking/blogs/technology-quotient/dsa-decoded-6-the-european-commission-finalises-guidelines-on-the-protection-of-102kv4s) (via children.md)
- **[STD, pending] EU Digital Fairness Act.** A proposal is expected in Q4 2026. It is expected to target addictive design, including **streaks, variable rewards and constant notifications**. (via motivation_gamification.md; source cited there)

### Inferences
- Lesson length should come from **item structure, not minutes**. A lesson should introduce a small set of new items and retrieve each one about 5–7 times with other items in between. With 3–5 new words plus review, that comes to roughly 12–20 interactions, which is a few minutes at typical app pace. Lesson length is then something to A/B-test against *delayed retention*, not engagement.
- A "next-day review" should be built in by default, because of sleep consolidation.
- Notifications: **one reminder a day, at most, at the learner's own time, with rotated wording, and backing off when ignored.** The bandit result shows the wording must vary. The modest effect sizes show notifications cannot carry retention on their own.
- Kids and teenagers in the EU: notification and streak defaults are now a compliance issue, not only a design choice.

### Gaps
- **Microlearning as a construct, UNVERIFIED.** From background knowledge, the microlearning literature is mostly descriptive and corporate-training oriented, with loose definitions (e.g., scoping reviews in *ETR&D* and *Journal of Work-Applied Management*, about 2021–2022). Effect-size claims in that literature come from small, heterogeneous studies. **I could not verify any microlearning meta-analysis or its effect size.** The spacing, retrieval and segmenting evidence above is a better basis than "microlearning" itself.
- **Video length, UNVERIFIED [OBS, OLDER-2014].** Guo, Kim & Rubin (2014, ACM Learning@Scale) analysed about 6.9M edX video sessions. Median engagement topped out at about 6 minutes whatever the video length, and shorter videos were watched more completely.
- **Habit formation, UNVERIFIED [OBS].** Lally et al. (2010, *European Journal of Social Psychology*; 96 participants) found a median of about 66 days to reach peak automaticity (range about 18–254). **Missing a single day did not materially harm habit formation.** That is a direct argument against punitive streak loss. A later systematic review (about 2024) reported similar medians with wide ranges; I do not reliably recall the details.
- **Interruption cost, UNVERIFIED [RCT/EXP].** Kushlev, Proulx & Dunn (2016, CHI) ran a within-person experiment: a week with phone notifications on produced more self-reported inattention and hyperactivity than a week with them off. Pielot and colleagues (MobileHCI 2014 and later) document heavy daily notification volumes and work on "opportune moments". Mehrotra et al. (CHI 2016) found receptivity depends on content and sender.
- **Platform facts, UNVERIFIED [DOCS].**
  - Android 13 (API 33) and later require a runtime opt-in (`POST_NOTIFICATIONS`) for notifications.
  - iOS supports "provisional" quiet notifications without a prompt.
  - Web push on iOS Safari works only for web apps added to the Home Screen (iOS 16.4+).
  - Together these mean the *moment* Hevalo asks for permission matters, e.g., after the first completed lesson rather than at install.
- **Duolingo's own reminder timing**, reportedly about a day after the last practice and at the same time of day, is a vendor detail I could not re-check.

---

## 4. Script learning: teaching a new script (Arabic-based Sorani; Latin with ê î û ç ş for Kurmanji), handwriting and tracing, keyboard input for Kurdish characters

### Takeaway
For the target audiences, script literacy is a main bottleneck: diaspora heritage speakers often understand and speak Kurdish but cannot read or spell it (cited). Kurmanji Hawar is close to phonemic, so it suits phonics-style letter–sound teaching and decodable texts. The exception is that **it does not mark the aspirated/unaspirated stop contrast**, so native audio is essential. Sorani's modified Perso-Arabic alphabet (33 letters) needs explicit teaching of positional letter forms and of Kurdish-specific letters. Turkish- or Arabic-schooled learners transfer part of this knowledge. Letter-level practice should **interleave confusable letters**. There is good experimental evidence that **handwriting letters beats typing them** for learning a new script, including adults learning Arabic letters, but I could not verify it this session. Input needs a built-in Kurdish character bar or keyboard, plus Unicode normalisation of everything the learner types.

### Cited Findings
- **[OBS/EXP] Literacy is the typical heritage-learner gap.** Heritage learners usually have "relatively strong aural and oral skills but limited literacy skills" (Carreira & Kagan 2011 survey, about 1,800 heritage learners, older). For diaspora Kurds the bottleneck is likely **literacy in Hawar or Sorani script and spelling**. — [Frontiers in Education 2020](https://www.frontiersin.org/journals/education/articles/10.3389/feduc.2020.00053/pdf) (via heritage_minority_kurdish.md)
- **[EXP-OP/reference] Scripts.**
  - Kurmanji is written mainly in the Latin **Bedirxan / Hawar** alphabet (1932), used in Turkey, Syria and Armenia.
  - Sorani uses a **modified Perso-Arabic script of 33 letters**, with a Kurdistan Region standard implemented in Unicode.
  - — [Kurdish alphabets (Wikipedia)](https://en.wikipedia.org/wiki/Kurdish_alphabets) (via heritage_minority_kurdish.md)
- **[EXP-OP/reference] Hawar does not mark Kurmanji's aspirated vs unaspirated voiceless stops** (p/pʰ, t/tʰ, k/kʰ, ç/çʰ). Only Kurdish Cyrillic marked them. So text alone, or TTS, cannot teach these contrasts. (via speech_audio_tech.md, sources cited there; heritage_minority_kurdish.md also flags that this needs verification against Thackston or Haig & Öpengin)
- **[EXP-OP] Children's researcher (children.md):** "Kurmancî's Latin (Hawar) script is highly letter–sound regular, which suits phonics", the "constrained skills" where apps show their **largest effects** (Kim et al. 2021, +0.31 SD overall, larger for letters and phonics). — [ERIC full text](https://files.eric.ed.gov/fulltext/EJ1323865.pdf); [Harvard CEPR](https://cepr.harvard.edu/resource/measures-matter-meta-analysis-effects-educational-apps-preschool-grade-3-childrens-0) (via children.md)
- **[VENDOR] Duolingo ABC builds letter narration from composited audio pieces**, e.g., "The letter team" + [letter] + [letter] + "says" + [phoneme], and speaks all instructions aloud. — [Duolingo blog](https://blog.duolingo.com/a-good-read-building-duolingo-abc-for-android/) (via children.md)
- **[MA + RCT/EXP] Interleave confusable items.** Interleaving helps most for highly similar categories (Brunmair & Richter 2019), and interleaved L2 grammar practice produced better 1-week retention despite more errors during training (Nakata & Suzuki 2019). The memory researcher applies this to e/ê, i/î, u/û and to Sorani letters that differ only by dots or vowel marks. — [Würzburg PDF](https://www.psychologie.uni-wuerzburg.de/fileadmin/06020400/2019/Brunmair_Richter_in_press__2019_META-ANALYSIS_OF_INTERLEAVED_LEARNING.pdf); [Oxford ORA](https://ora.ox.ac.uk/objects/uuid:7096acb5-f759-4fe9-a06a-d6a0e20f75d0/files/ssf268575c) (via memory_retention.md)
- **[MA] Dictation and "type what you hear"** improved phonological recognition but not overall listening in one study. It trains decoding, so it should be paired with meaning checks. — [Tsukuba](https://tsukuba.repo.nii.ac.jp/record/2007991/files/DA010616.pdf) (via speech_audio_tech.md)
- **[Tools] Perso-Arabic script normalisation software exists for Kurdish and related languages, as do rule-based Sorani Arabic↔Latin transliterators and a Latin→Perso-Arabic transliterator for Kurmanji and Sorani.** — [arXiv 2301.11406](https://arxiv.org/pdf/2301.11406); [arXiv 1811.10278](https://arxiv.org/pdf/1811.10278); [arXiv 2110.12374](https://arxiv.org/pdf/2110.12374) (via heritage_minority_kurdish.md, ai_llm_tutoring.md)
- **[OBS] Script mismatch can masquerade as total error.** In a speech-recognition evaluation, Arabic-script output scored against Latin references gave WER above 100%. Any comparison of learner input must be script- and Unicode-normalised. (via speech_audio_tech.md)
- **[EXP-OP] Children aged 3–5 cannot use keyboards; 6–8 can manage simple keystrokes; from 9, children can drag and coordinate keyboard and mouse** (NN/g age bands, via secondary summaries). — [NN/g](https://www.nngroup.com/videos/designing-children/); [UXmatters](https://www.uxmatters.com/mt/archives/2020/01/ux-design-for-kids-key-design-considerations.php) (via children.md)

### Inferences
- Treat the two scripts as **two different learning problems**:
  - **Kurmanji Hawar:** mostly a *letter–sound mapping and diacritics* problem, e.g., ê vs e, î vs i, û vs u, plus the ç, ş, x, q, j, c values unfamiliar to German or English readers.
  - **Sorani:** a *visual-form* problem (positional shapes, dots, non-joining letters, Kurdish-only letters ڵ ڕ ێ ۆ ڤ ە) on top of the letter–sound mapping.
- **Transfer depends on the UI language and schooling.** Turkish-schooled Kurds already read ç and ş. Arabic- or Persian-schooled Kurds already read most Sorani letter shapes but must learn the Kurdish letters and the fact that vowels are written. The alphabet module's tips and drills should be **contrastive per UI language** (en, de, nl, fr, es, tr, ar, ku, ckb).
- Hawar under-marks the aspiration contrast, so every alphabet and word item should carry **native recorded audio**, and some drills should be "listen and choose" with no text cue.
- Typed answers need **tolerant matching with targeted feedback**, e.g., "almost: it's *ê*, not *e*", rather than plain "wrong". Strictness can rise with level. The sibling researchers recommend the same (sla_theory.md item 16; speech_audio_tech.md item 19).

### Gaps
- **Handwriting vs typing, UNVERIFIED [RCT/EXP].**
  - Longcamp, Zerbato-Poudou & Velay (2005, *Acta Psychologica*): preschoolers who learned letters by handwriting recognised them better than those who typed them.
  - Longcamp et al. (2008, *Journal of Cognitive Neuroscience*): adults learning novel characters remembered them better after handwriting.
  - James & Engelhardt (2012, *Trends in Neuroscience and Education*): in pre-literate children, printing letters (but not typing or, in my recollection, tracing) engaged the brain's reading network.
  - **Wiley & Rapp (2021, *Psychological Science*): adults learning Arabic letters by handwriting learned them faster and generalised better to spelling and reading than typing or visual-only groups.** This is directly relevant to teaching Sorani.
  - Observational EEG work by van der Weel & van der Meer (2024, *Frontiers in Psychology*) reports wider brain connectivity during handwriting.
  - None of this was retrieved this session, and sample sizes and effect sizes need checking.
- **Tracing vs copying vs writing from memory:** I do not reliably recall comparative evidence. My understanding is that tracing is a weaker activity than producing a letter from memory, but this is unverified. Finger vs stylus on tablets for letter learning: unknown.
- **Sorani orthography facts, UNVERIFIED (background linguistics).**
  - Unlike Arabic, Sorani writes vowels as letters (ا ە و ۆ وو ی ێ). The short /ɪ/ vowel is usually unwritten, so Sorani is much more transparent than Arabic.
  - Letters have up to four positional forms, and several letters never join to the following letter.
  - The heritage researcher lists و/ۆ/ێ/ی, ڕ and ڵ as key teaching targets (heritage_minority_kurdish.md).
- **Arabic-script reading difficulty, UNVERIFIED [EXP].** Research on Arabic (e.g., Eviatar, Ibrahim and Abu-Rabia) suggests that the script's dot-based letter distinctions and connectedness raise visual load. This may matter for dyslexic learners and is relevant to font size and spacing.
- **Keyboard availability, UNVERIFIED [DOCS].**
  - My understanding is that Gboard offers Kurdish (Kurmanji, Latin) and Central Kurdish (Sorani) layouts, and Windows ships a Central Kurdish layout.
  - Standard iOS and Android Latin keyboards produce ê î û ç ş by **long-pressing** e, i, u, c, s.
  - Many learners will not know this, and many will type on keyboards set to English, German or Turkish (Turkish has ç ş but not ê or û).
  - Apple's current Sorani keyboard support was not verified.
- **Unicode handling, background technical knowledge (standard behaviour, not retrieved).**
  - ê may arrive precomposed (U+00EA) or as e + combining circumflex (U+0065 U+0302), so NFC normalisation is needed before comparing or counting letters (Wordle).
  - In Sorani, Arabic ي (U+064A) and ك (U+0643) are often typed instead of Kurdish/Persian ی (U+06CC) and ک (U+06A9).
  - ە (U+06D5) vs ه (U+0647) / ھ (U+06BE) and zero-width non-joiner (U+200C) usage also vary between keyboards.
  - The arXiv 2301.11406 normaliser cited above is the kind of tool that handles this.
- **Turkish interference, UNVERIFIED (linguistic background).** Turkish dotless ı and dotted i differ from Kurmanji i (/ɪ/) and î (/iː/). Some Turkish-schooled writers use ı informally in Kurmanji.
- No study of teaching Hawar or Sorani script in an app was found or recalled.

---

## 5. Accessibility and inclusion: WCAG 2.2, dyslexia, RTL layouts, low-bandwidth and offline use, older devices, low-literacy adults

### Takeaway
The verified evidence that bears on inclusion is this:
- **Audio-only input teaches vocabulary as well as text.** This supports audio-first paths for pre-readers and low-literacy adults.
- **Captions help most at low proficiency and in primary school.** They double as an accessibility requirement.
- **Children's needs differ sharply by age band.**
- **Manipulative design is more common in apps used by lower-income children.**
- **Persian-only schooling in Iran is linked to high illiteracy among Kurds.**

The core standards content is UNVERIFIED this session but well established:
- WCAG 2.2 (W3C Recommendation, October 2023) adds nine success criteria. Several hit language-app interactions directly: **drag-and-drop exercises need a tap alternative**, **24×24 CSS px minimum targets**, **focus not hidden by sticky feedback sheets**, and **accessible login**.
- "Dyslexia fonts" do not work; spacing and size adjustments might.
- RTL needs full layout mirroring plus bidi isolation for mixed Kurmanji/Sorani/Latin strings.
- Offline packs matter in a region with frequent internet shutdowns and costly data.

### Cited Findings
- **[MA] Audio-only input** produced vocabulary gains similar to reading (15% / 13% vs 17% / 15%, immediate/delayed). — [Cambridge Core](https://www.cambridge.org/core/journals/language-teaching/article/how-effective-is-second-language-incidental-vocabulary-learning-a-metaanalysis/E38E3468FD2090B1FA3051051DE8E70C) (via speech_audio_tech.md, sla_theory.md)
- **[MA] Captions** help vocabulary (g = 0.56; **g = 1.36 in primary school**). Older reviews say the benefit is largest at low proficiency. — [Wiley](https://onlinelibrary.wiley.com/doi/10.1111/lang.12697); [Frontiers 2022](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2022.904523/pdf) (via sla_theory.md, speech_audio_tech.md)
- **[EXP-OP] NN/g children's age bands:**
  - 3–5 (pre-readers) tap and swipe and cannot use trackpads or keyboards;
  - 6–8 can also manage simple clicks and keystrokes;
  - from 9, children can drag and scroll.
  - Pre-reader designs need large pictures, instant audio and visual feedback, tolerance of multiple simultaneous taps, and no ads.
  - — [NN/g](https://www.nngroup.com/videos/designing-children/); [Raw Studio summary](https://raw.studio/blog/designing-for-children/) (via children.md)
- **[OBS] Manipulative design (Radesky et al. 2022, *JAMA Network Open*).** **80%** of apps used by children aged 3–5 contained manipulative design, and it was **more common in apps used by lower-SES children**. — [Michigan Medicine](https://www.michiganmedicine.org/health-lab/design-tricks-commonly-used-monetize-young-childrens-app-use) (via children.md)
- **[MA] Children from less stimulating home environments** gained most from multimedia storybooks and were hurt most by interactive distractions (Takacs 2015). — [SAGE PDF](https://journals.sagepub.com/doi/pdf/10.3102/0034654314566989) (via children.md)
- **[EXP-OP/NGO] Iran:** Kurdish is barred as a medium of instruction, and Persian-only schooling is linked to "high levels of illiteracy" among Kurds. Many in-region adults are therefore literate in Persian, Arabic or Turkish script but not in Kurdish, or are low-literate. — [Respond Crisis Translation](https://respondcrisistranslation.org/en/blog/ks-histories-and-geographies-of-kurdish-suppression) (via heritage_minority_kurdish.md)
- **[DOCS] Offline speech on device:** `react-native-sherpa-onnx` offers offline speech-to-text, TTS and voice-activity detection on Android 7+ and iOS 13+. Under Expo it needs a development build. — [GitHub](https://github.com/XDcobra/react-native-sherpa-onnx) (via speech_audio_tech.md)
- **[STD] EU DSA Art. 28 minors' guidelines (July 2025):** push notifications and streaks off by default for minors. — [Hunton](https://www.hunton.com/privacy-and-information-security-law/european-commission-issues-guidelines-on-the-protection-of-minors) (via children.md)

### Inferences
- Hevalo's audiences include pre-reading children, low-literacy adults, and heritage speakers who listen well but read poorly. That makes an **audio-first path** a core inclusion feature, and the evidence says it costs nothing in vocabulary learning.
- Captions and transcripts on every audio and video item meet the accessibility requirement and the learning goal at once.
- Drag-heavy exercises (word banks, matching) exclude young children and motor-impaired users. A tap-to-place alternative is both the WCAG 2.2 rule (see Gaps) and the NN/g age-band advice.

### Gaps
- **WCAG 2.2, UNVERIFIED this session [STD].** Canonical location: https://www.w3.org/TR/WCAG22/ (fetch attempted and blocked). From background knowledge:
  - W3C Recommendation, **5 October 2023**; a minor-errata edition followed in December 2024.
  - **4.1.1 Parsing is obsolete or removed.**
  - Nine new success criteria:
    - **2.4.11 Focus Not Obscured (Minimum)** (AA);
    - 2.4.12 Focus Not Obscured (Enhanced) (AAA);
    - 2.4.13 Focus Appearance (AAA);
    - **2.5.7 Dragging Movements** (AA): any drag must have a single-pointer alternative;
    - **2.5.8 Target Size (Minimum)** (AA): **24×24 CSS px**, with spacing and other exceptions;
    - **3.2.6 Consistent Help** (A);
    - **3.3.7 Redundant Entry** (A);
    - **3.3.8 Accessible Authentication (Minimum)** (AA): no cognitive-function test such as transcribing or solving a puzzle unless an alternative or assistance (paste, password manager) exists; object or personal-content recognition is allowed at AA;
    - 3.3.9 Accessible Authentication (Enhanced) (AAA).
  - Still-relevant older criteria for a language app:
    - 1.1.1 text alternatives;
    - 1.2.x captions and transcripts;
    - 1.4.1 do not use colour alone (e.g., red/green right/wrong feedback, Wordle tiles);
    - 1.4.3 contrast 4.5:1 for text (3:1 for large text), and 1.4.11 3:1 for UI components;
    - 1.4.4 and 1.4.12 resize and text spacing;
    - **2.2.1 Timing Adjustable** (the typing race and timed quizzes need an untimed or extendable mode; real-time multiplayer may fall under the real-time-event exception);
    - 2.3.3 Animation from Interactions (AAA; `prefers-reduced-motion`);
    - **3.1.2 Language of Parts** (mark Kurdish passages with a `lang` attribute).
  - **WCAG 3.0** is still a Working Draft, not a standard (status as of October 2026 not verified).
- **European Accessibility Act, UNVERIFIED [STD].**
  - Directive (EU) 2019/882 has applied since **28 June 2025** to consumer services including **e-commerce** and e-books, with EN 301 549 (WCAG 2.1 AA-based) as the harmonised standard.
  - **Micro-enterprises** (fewer than 10 staff and no more than €2M turnover) providing services are exempt.
  - Whether Hevalo's in-app purchases (Zêr) count as "e-commerce services" within scope, and whether Hevalo is a micro-enterprise, needs legal confirmation.
- **Dyslexia, UNVERIFIED [RCT/EXP].**
  - Special "dyslexia fonts" (OpenDyslexic, Dyslexie) did **not** improve reading rate or accuracy in controlled studies: Wery & Diliberto 2017 and Kuster et al. 2018, both in *Annals of Dyslexia*. Marinus et al. (2016) attributed any Dyslexie benefit to its wider spacing.
  - **Extra letter spacing** improved reading speed and accuracy in dyslexic children in Zorzi et al. (2012, *PNAS*; Italian and French). Later replications are mixed.
  - Rello & Baeza-Yates's eye-tracking studies (about 2013–2016) favour sans-serif or roman fonts and penalise italics.
  - The British Dyslexia Association Style Guide [EXP-OP] advises: sans-serif fonts, 12–14 pt or larger, generous line and letter spacing, off-white or cream backgrounds, left-aligned text, and no italics, underlining or all-caps blocks.
  - No dyslexia-accessibility research was found or recalled for Sorani or Kurdish text.
- **RTL and bidirectional text, UNVERIFIED [DOCS / EXP-OP].**
  - Material Design's bidirectionality guidance: mirror layout and directional icons (back/forward, progress); **do not mirror** media playback icons, clocks, logos or untranslated content.
  - Use CSS logical properties (`margin-inline-start`) and `dir="auto"` / `<bdi>` (or Unicode FSI/PDI isolates) for user-generated strings such as usernames, and for Kurmanji Latin words inside the Sorani UI or vice versa.
  - React Native's `I18nManager.forceRTL` needs an app reload to take effect, and Expo has RTL support settings.
  - Central Kurdish (ckb) locale conventions may default to Eastern Arabic-Indic digits (٠١٢٣); CLDR's default numbering system for ckb was not verified. Use `Intl` formatting with the locale rather than hard-coded digits.
  - Arabic-script text is often recommended at a larger point size than Latin for equal legibility (expert advice, not verified).
  - Fonts must cover Kurdish-specific letters (ڵ ڕ ێ ۆ ڤ ە). Noto Naskh/Sans Arabic or Vazirmatn are candidates; their coverage was not verified.
- **Low-literacy users, UNVERIFIED [EXP / HCI field studies, older].** Medhi et al. (2011, *ACM TOCHI*, "Designing mobile interfaces for novice and low-literacy users") found text-free or voice-annotated interfaces and flat (non-hierarchical) navigation outperform text-heavy menus for low-literacy users.
- **Internet shutdowns and connectivity, UNVERIFIED [OBS/NGO].** Iraq (including recurring nationwide exam-season shutdowns), Iran (2019, 2022 and later) and Syria impose frequent government internet shutdowns, as documented by Access Now's #KeepItOn reports. Mobile data cost relative to income is high in parts of the region. **Offline-capable lessons are an inclusion requirement for in-region learners**, but current figures were not retrieved.
- **Older and low-end devices:** I have no verified data on the device mix of Kurdish users. General guidance, unverified, is to test on low-RAM Android (2–3 GB), keep animation and JS bundle budgets, and use efficient audio codecs (Opus/AAC at low speech bitrates).
- **Screen readers in Kurdish:** I could not verify whether VoiceOver or TalkBack ship Kurdish (Kurmanji or Sorani) voices. My belief is that support is absent or poor, so in-app recorded audio must remain the primary way to hear Kurdish.

---

## Implications for Hevalo

Concrete design implications. Each one notes its evidence basis: **(C)** = rests on cited findings above; **(U)** = rests on UNVERIFIED background knowledge, to verify before external claims; **(I)** = my inference or design judgement.

### A. Lesson screens and exercise design (cognitive load and multimedia)
1. **New-word screens:**
   - **Native audio and written Kurdish together, by default**, with audio playing on reveal.
   - Add a **picture for concrete words** and a **UI-language gloss for all words**.
   - Don't force stock pictures onto abstract words; use a short example sentence instead.
   - (C: captions g = 0.56; gloss modality n.s.; L1 > L2 glosses; U: dual coding, Plass 1998, concreteness effect)
2. **"Guess first" multiple-choice glosses everywhere a word is introduced or tapped:** in lessons, stories and feed posts. Show 2–3 candidate meanings before revealing the answer, then add the word to review. (C: MC glosses most effective)
3. **Karaoke read-along:** in stories, dialogues, alphabet demos and community posts that have audio, **highlight words in sync with the audio** (audio-paced). A plain audio player beside a text block adds little. (C: RWL g = 0.41 audio-paced vs 0.06 self-paced)
4. **Fade text support with level:**
   - full Kurdish captions;
   - then keyword-only captions;
   - then audio-only listening items.
   - Captions stay on by default for beginners and children.
   - (C: caption effects largest at low proficiency; I)
5. **Grammar tips:**
   - **segment** each tip into at most about 3 short, learner-paced cards, each followed immediately by a practice item;
   - never auto-advance on a timer;
   - do not narrate long tip text word for word *and* print it (pick one, or narrate while showing only key words).
   - (U: segmenting, redundancy boundary conditions; C: sla_theory "brief explanations followed by practice")
6. **Signal one thing at a time.**
   - Highlight the target morpheme (e.g., ezafe *-ê/-a/-ên*, past-tense agreement, Sorani clitics) or the target letter.
   - Use **colour plus a second cue** (underline or bold), never colour alone.
   - Keep everything else visually quiet.
   - (U: signaling meta-analyses, low-prior-knowledge benefit; U: WCAG 1.4.1)
7. **Pre-training before stories and dialogues:** a 20–30-second "words you'll meet" preview with audio, before the learner faces a text with high element interactivity. (U: pre-training principle; C: 95–98% coverage evidence in sla_theory.md)
8. **Spatial contiguity in feedback:** on wrong answers, show the learner's answer **directly above the correct answer**, with the differing letter or diacritic highlighted (e.g., *e* → ***ê***). Don't put a generic "incorrect" banner at the bottom. (U: contiguity; C: sla_theory item 16, error-type diagnosis)
9. **Remove seductive details during tasks:**
   - no background music, idle mascot animations or decorative motion while an exercise item is on screen;
   - keep celebrations and mascots *between* items or at lesson end;
   - in kids' stories, keep illustrative animation and narration, but move hotspots, mini-games and dictionary pop-ups out of the reading flow.
   - (C: Takacs 2015 interactive features distract; U: seductive-details meta-analyses; U: emotional design supports a friendly but static mascot)
10. **Adaptive scaffolding (expertise reversal):**
    - hide pictures, translations and word banks as an item's memory strength rises;
    - heritage learners placed at higher levels should start with fewer scaffolds;
    - add a "hide hints" toggle.
    - (U: expertise reversal; C: heritage placement in sibling notes)
11. **Do not build "learning style" settings** (visual vs auditory learner). Offer modality choices for access and comfort only. (U: Pashler 2008)

### B. Mnemonics, imagery and embodiment
12. **Optional "memory hook" per word, per UI language:**
    - learners can write or draw a keyword mnemonic;
    - the community can upvote hooks (reusing the feed and moderation pipeline);
    - show one hook only after a learner fails a word twice;
    - use hooks for **hard, concrete, non-cognate words only**.
    - (U: keyword method helps immediately but decays; I: per-language keywords)
13. **Always follow a mnemonic with spaced, productive retrieval** (L1→Kurdish typed or spoken). Keyword mnemonics mostly serve the receptive direction, and form recall is where learners lose most (58.5% → 25.1%). (C: Webb et al. 2020; Nakata; U: keyword forgetting)
14. **Gesture-enriched items for verbs, actions, body parts and emotions:**
    - a 2–3-second native-speaker clip performing an iconic gesture;
    - a prompt to "do it and say it".
    - For kids, make it a TPR game ("Simon says" with "Destên xwe bilind bike!").
    - Camera pose checking is optional, later and low priority.
    - (U: Macedonia; Mayer et al. 2015; Andrä et al. 2020, 6-month durability in children; C: TPR + songs preschool QE)
15. **Image style:** prefer clear photos or illustrations of real, culturally Kurdish referents with one unambiguous object per image. Avoid clip-art that is ambiguous across cultures. (I)

### C. Session and microlearning design, notifications
16. **Define lessons by structure, not time:**
    - about 3–5 new items;
    - each retrieved about 5–7 times with other items between;
    - end with the learner's own errors recycled.
    - That gives about 12–20 interactions, a few minutes.
    - **A/B-test lesson size against 1-week delayed recall**, not completion or XP.
    - (C: Nakata 2017; Nakata & Webb 2016; Kim & Webb 2022)
17. **"Sleep on it" default:** schedule the first review of new words for the **next day**, and open each day's session with a short review of yesterday's words. (C: sleep g = 0.50)
18. **Make stopping cheap:**
    - save progress mid-lesson;
    - let a learner exit after any item without losing work;
    - give a no-shame "welcome back" review lesson after a gap.
    - (C: pauses are normal in persistent learners; U: Lally et al., a missed day doesn't break habit formation)
19. **Notification policy:**
    - **at most one practice reminder a day**, at the learner's chosen or learned time;
    - **rotate message templates** (a simple novelty-aware bandit);
    - **back off** after about 7 ignored reminders (to weekly, then stop);
    - respect quiet hours and time zones;
    - give social notifications (DMs, friend requests, multiplayer invites) **their own toggles**, so practice reminders don't stack on top of them;
    - never send streak-death guilt messages.
    - (C: Yancey & Settles; Bidargaddi; Morrison; motivation_gamification.md item 15)
20. **Ask for notification permission at a meaningful moment**, e.g., after the first completed lesson ("Want a daily nudge at this time?"), not at install. This matters because Android 13+ and iOS require explicit opt-in. (U: platform docs)
21. **Under-18 and especially under-16 accounts in the EU:** push notifications and streaks **off by default**, with a weekly parent digest instead. (C: DSA Art. 28 guidelines; children.md)

### D. Script learning (alphabet module and beyond)
22. **Two script tracks with different emphases:**
    - **Kurmancî:** letter–sound mapping, with drills that **interleave** e/ê, i/î, u/û, c/ç, s/ş, x/q/h and k/q contrasts.
    - **Soranî:** visual forms first, covering
      - positional forms,
      - joining vs non-joining letters (ا د ر ڕ ز ژ و ۆ ە),
      - dot-distinguished families (ب پ ت, ج چ ح خ, ر ڕ ز ژ),
      - Kurdish-specific letters (ڵ ڕ ێ ۆ ڤ ە),
      - and the rule that vowels are written.
    - (C: interleaving for similar categories; U: Sorani orthography facts)
23. **Drills in both directions:**
    - hear the sound, pick the letter;
    - see the letter, pick the sound;
    - "listen and choose" minimal pairs with no text cue, for contrasts Hawar doesn't mark (aspiration) and for ڕ/ر and ڵ/ل.
    - (C: Hawar does not mark aspiration; HVPT evidence in speech_audio_tech.md)
24. **Add a handwriting stage for Sorani, and optionally for Kurmancî kids:**
    - animated stroke order;
    - then **tracing**, then **copying**, then **writing from memory** on the touchscreen;
    - letters shown in all positional forms, then joined into short words with an animation of how they connect;
    - tolerant shape recognition.
    - Make it optional for adults, with typing as an alternative.
    - (U: Wiley & Rapp 2021 handwriting > typing for adults learning Arabic letters; Longcamp; James & Engelhardt)
25. **Move straight to decodable reading:** once about 6–10 letters are known, unlock tiny stories that use only known letters, read with karaoke highlighting. (C: sla_theory item 30; children.md item 15; RWL)
26. **Contrastive tips by UI language** (examples to be validated by native speakers):
    - **German, Dutch and English speakers:** ş ≈ "sch"/"sh", ç ≈ "tsch"/"ch", c ≈ "dsch"/"j", x ≈ "ch" in *Bach*, j ≈ French *j*, and "ê is not e".
    - **Turkish speakers:** ç and ş are familiar, while ê, î and û are new, and Turkish ı is not Kurmanji i.
    - **Arabic and Persian speakers learning Sorani:** vowels are written, there are extra letters, and ە ≠ ه.
    - (C: heritage_minority_kurdish.md item 12; U: linguistic details)
27. **Kurdish input everywhere learners type** (lessons, Wordle, typing race, dictionary search, DMs, feed):
    - a **persistent character bar** with ê î û ç ş above the system keyboard on web and mobile;
    - a long-press hint ("hold *e* for *ê*");
    - for Sorani, an **in-app Sorani keyboard** (or a one-tap guide to enabling the system Central Kurdish keyboard).
    - Early lessons accept base letters with an "almost" correction; strictness rises with level.
    - (C: speech_audio_tech item 19; U: keyboard availability)
28. **Normalise all text input and content:**
    - NFC Unicode normalisation;
    - map Arabic ي/ك to Kurdish ی/ک;
    - handle ە/ه/ھ and zero-width non-joiner consistently;
    - count Wordle letters as normalised graphemes;
    - make dictionary search fold diacritics *for finding* (e→ê) while still teaching the correct form.
    - (C: arXiv 2301.11406 normaliser exists; script-mismatch error inflation; U: Unicode specifics)
29. **Sorani Latin transliteration as an on-tap training aid only** (for learners who read Latin script but not Arabic), not shown by default. It should fade as letter mastery rises so it does not become a crutch. (C: transliterators exist; U/I: expertise reversal)

### E. Accessibility and inclusion
30. **Adopt WCAG 2.2 AA as the target for web and mobile and audit against it** (U for every criterion below):
    - **tap-to-place alternatives for every drag interaction** (word banks, matching, sentence building) (2.5.7);
    - **at least 24×24 CSS px targets**, with 44–48 px for primary actions and larger for kids (2.5.8);
    - the sticky bottom "check / continue" feedback sheet must not hide keyboard focus (2.4.11);
    - login with passkeys or magic links and **paste allowed**, with no puzzle CAPTCHAs (3.3.8);
    - help in the same place on every screen (3.2.6).
31. **Right/wrong feedback must never be colour-only.** Use an icon, a text label, a sound and haptics. Give Wordle tiles shape or pattern cues and a colour-blind palette option. (U: WCAG 1.4.1)
32. **Timed games:**
    - typing race and quiz get an **untimed or extended-time practice mode**;
    - multiplayer rooms get a "relaxed timer" setting;
    - single-player timers must be adjustable.
    - (U: WCAG 2.2.1)
33. **Captions and transcripts for all audio and video**, including community posts with audio. This is an accessibility requirement and a learning booster in one. (C: caption meta-analysis; U: WCAG 1.2)
34. **Language and direction markup:**
    - every Kurdish string carries `lang` (`ku`/`kmr` for Kurmancî, `ckb` for Soranî) and `dir="rtl"` for Soranî;
    - user-generated and mixed-script strings get `dir="auto"` / `<bdi>`;
    - audio buttons get accessible names in the UI language;
    - because Kurdish screen-reader voices are likely unavailable, **the in-app recorded-audio button is the accessible path to hearing Kurdish**.
    - (U: WCAG 3.1.2, bidi docs)
35. **Full RTL for the ckb and ar UIs:**
    - mirror layout, navigation and progress, and the course-map direction;
    - do not mirror play icons or logos;
    - use CSS logical properties on the web and test `I18nManager` behaviour in Expo;
    - format numbers with locale-aware `Intl`, with an option for Eastern Arabic digits.
    - Test long German and Dutch strings and short Sorani ones in the same components.
    - (U: Material bidi guidance, CLDR)
36. **Fonts:**
    - ship an Arabic-script font verified to render ڵ ڕ ێ ۆ ڤ ە correctly;
    - use a slightly larger default size and generous line height for Sorani;
    - check that the Latin font's ê î û ç ş are distinct and not clipped.
    - (U: expert advice)
37. **Reading-comfort settings instead of a "dyslexia font":**
    - letter, word and line spacing, font size, background tint, and a read-aloud button on every text;
    - left-aligned text with no justified blocks, italics or all-caps paragraphs.
    - Do not market OpenDyslexic as a fix.
    - (U: Wery & Diliberto 2017; Kuster et al. 2018; Zorzi et al. 2012; BDA style guide)
38. **Reduced motion:** respect OS `prefers-reduced-motion`, and make confetti, screen shake and animated transitions optional. (U: WCAG 2.3.3)
39. **Offline and low-bandwidth mode:**
    - downloadable unit packs (text, images, low-bitrate audio) on mobile, and a service-worker cache on web;
    - lessons, reviews and alphabet drills work fully offline, with XP and review logs queued for later sync;
    - an offline core dictionary (top N thousand headwords);
    - a "data saver" setting that lazy-loads images in the feed and avoids auto-downloading media.
    - (U: shutdowns and data cost; C: on-device speech libraries exist)
40. **Performance budget for old phones:** test on low-RAM Android, cap animation (Lottie) weight in lessons, keep first-lesson load small, and degrade gracefully when audio fails, e.g., show "tap to retry" instead of blocking the item. (U/I)
41. **Audio-first "listening path" for pre-readers and low-literacy adults:**
    - spoken Kurdish instructions with picture choices and icon-led, flat navigation;
    - no reading required to make progress.
    - Adults who speak but can't read get an **adult** literacy-from-zero course: same phonics logic as the kids' track, adult themes and imagery.
    - (C: audio-only vocab ≈ reading; Iran schooling/literacy; NN/g age bands; U: Medhi et al. 2011)
42. **Children's interaction rules by age:**
    - 3–5: tap only, no typing, no drag-required tasks, spoken instructions, very large targets;
    - 6–8: simple keystrokes and short words;
    - 9+: the full game set.
    - (C: NN/g age bands; children.md)
43. **Measure learning, not engagement, for every change above.** Use 1-week and 1-month delayed retrieval checks embedded in review, and segment results by script, UI language and learner type (heritage, in-region, non-Kurd, child). Design guidance here comes mostly from non-Kurdish, often lab-based research, so Hevalo's own data should decide. (C: memory_retention / ai_llm_tutoring recommendations; I)
