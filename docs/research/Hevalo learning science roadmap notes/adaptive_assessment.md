# Adaptive learning, learner modeling, assessment and measuring real learning in apps

**Read this first: where the evidence comes from.** This researcher started after the run's shared web-search budget (200 searches per turn, shared by all agents) was already used up. All four searches returned "budget used up" and none ran. WebFetch is blocked in this environment. So this file has two kinds of findings:
- **[SIB]**: reused from sibling notes in this folder (`memory_retention.md`, `sla_theory.md`, `ai_llm_tutoring.md`, `motivation_gamification.md`, `heritage_minority_kurdish.md`, `children.md`). Their URLs *were* retrieved by WebSearch in this run, mostly at snippet level, as those notes say.
- **[MK]**: from the model's training knowledge (cutoff mid-2026). Authors, venues and DOI/arXiv links are given from memory and were **not retrieved or re-checked in this session**. Numbers marked "(verify)" are ones I am less sure of. Nothing published after mid-2026 could be checked. A report writer should treat [MK] items as well-known literature that is probably accurate but needs a citation check before publication.

**Evidence grades:**
- [MA] meta-analysis or systematic review
- [RCT] randomised experiment, including within-subject
- [QE] quasi-experimental
- [OBS] observational or correlational
- [BENCH] prediction benchmark: it measures model fit, not learning gains
- [STD] standards document
- [EXP-OP] expert opinion, theory or review
- [VENDOR] company claim, peer-reviewed or not

---

## 1. Knowledge tracing, IRT, and the evidence for mastery learning

### Takeaway
On small and mid-sized data, simple, interpretable learner models predict about as well as deep or transformer knowledge tracing (KT). Examples are Elo/Rasch-style ability-vs-difficulty models, logistic regression on practice counts, and BKT with forgetting. Deep KT wins mainly on very large logs, and its gains are in prediction accuracy (AUC), not demonstrated learning. Mastery learning and intelligent tutoring do work, but far less than Bloom's "2 sigma". Realistic effects are about 0.3–0.7 SD on researcher-made tests and about 0.0–0.2 SD on standardised tests. Only a handful of studies link model-driven personalisation to *delayed* learning outcomes. The cleanest one is a language-vocabulary study (Lindsey et al. 2014).

### Cited Findings

**Knowledge tracing models**
- **BKT (Corbett & Anderson 1994/95)** [EXP-OP/model] [MK]
  - A hidden Markov model per skill with four parameters: prior knowledge P(L0), learning P(T), guess P(G) and slip P(S).
  - Cognitive Tutors declare mastery when P(known) ≥ 0.95.
  - [DOI 10.1007/BF01099821](https://doi.org/10.1007/BF01099821)
- **DKT (Piech et al., NeurIPS 2015)** [BENCH] [MK]
  - An LSTM over the whole interaction sequence.
  - It originally reported AUC ≈ 0.86 vs ≈ 0.69 for BKT on ASSISTments (verify).
  - [arXiv:1506.05908](https://arxiv.org/abs/1506.05908)
- **Superseded: DKT's original margin** [BENCH] [MK]
  - Khajah, Lindsey & Mozer, "How deep is knowledge tracing?" (EDM 2016): BKT extended with forgetting, latent student ability and skill discovery matched DKT.
  - Xiong et al. (EDM 2016) showed that part of DKT's reported gain came from duplicated rows in the ASSISTments 2009 data.
  - Treat DKT's 2015 headline gap as superseded.
  - [arXiv:1604.02416](https://arxiv.org/abs/1604.02416)
- **Gervet, Koedinger, Schneider & Mitchell, "When is deep learning the best approach to knowledge tracing?" (JEDM 2020)** [BENCH] [MK]
  - Nine datasets.
  - Logistic-regression models with rich features ("Best-LR", which counts prior successes and failures per skill and overall) matched or beat DKT on small and medium datasets.
  - DKT won on large datasets with long sequences.
  - BKT was generally the weakest.
  - [JEDM](https://jedm.educationaldatamining.org/index.php/JEDM/article/view/451) (URL from memory)
- **Transformer KT generation (2019–2020)** [BENCH] [MK]
  - SAKT (Pandey & Karypis 2019): [arXiv:1907.06837](https://arxiv.org/abs/1907.06837)
  - SAINT (Choi et al. 2020, Riiid): [arXiv:2002.07033](https://arxiv.org/abs/2002.07033)
  - AKT (Ghosh, Heffernan & Lan, KDD 2020): Rasch-style item embeddings plus attention with exponential decay, i.e. built-in forgetting. [arXiv:2007.12324](https://arxiv.org/abs/2007.12324)
  - EdNet, the large public dataset behind this line of work: about 131M interactions from about 784k students (verify). [arXiv:1912.03072](https://arxiv.org/abs/1912.03072)
- **pyKT (Liu et al., NeurIPS 2022 Datasets & Benchmarks)** [BENCH] [MK]
  - Re-evaluated many deep-KT models under one preprocessing and evaluation protocol.
  - Many published improvements shrank, gaps between models were often small, and DKT stayed a strong baseline.
  - [arXiv:2206.11460](https://arxiv.org/abs/2206.11460)
  - Follow-up, simpleKT (ICLR 2023): a deliberately simple Rasch-embedding transformer is "tough to beat". [arXiv:2302.06881](https://arxiv.org/abs/2302.06881)
- **LLM- and text-aware KT (2023–2026)** [BENCH] [MK, low confidence on specifics]
  - Recent work feeds item text to language models, mainly to fix cold start for new items.
  - Reported gains centre on cold-start and small-data settings.
  - I know of no robust evidence that LLM-based KT beats tuned AKT/DKT/Best-LR on large logs, and none that it improves learning outcomes.
  - Could not verify 2025–26 papers (see Gaps).
- **Duolingo's models** [VENDOR]
  - Half-life regression (HLR) for word strength: in a peer-reviewed vendor paper, its error was roughly half of Leitner's on 13M learning traces [SIB]. [Settles & Meeder 2016, ACL](https://research.duolingo.com/papers/settles.acl16.pdf)
  - The HLR A/B test reported **+9.5% daily retention (practice), +1.7% (lessons) and +12% overall activity**. These are engagement and retention metrics, not test scores [SIB]. [ACL Anthology](https://aclanthology.org/anthology-files/pdf/P/P16/P16-1174.pdf)
  - **Birdbrain** (blog 2020; IEEE Spectrum 2023 by Bicknell, Brust & Settles) [MK]:
    - Predicts, for each learner–exercise pair, the probability of a correct answer.
    - Version 1 was a logistic, Elo/IRT-like model of learner ability vs exercise difficulty, updated after every answer. Later versions are neural.
    - The session generator uses it to pick exercises at a suitable difficulty.
    - No peer-reviewed paper, numeric success target or learning-outcome effect size is public, to my knowledge. The sibling memory note also found no primary source.
    - [Duolingo blog](https://blog.duolingo.com/learning-how-to-help-you-learn-introducing-birdbrain/) (URL from memory); [IEEE Spectrum](https://spectrum.ieee.org/duolingo) (URL from memory)
- **Duolingo SLAM shared task (Settles et al., BEA 2018)** [BENCH] [MK]
  - Task: predict word-level mistakes in learners' first 30 days on en→es, es→en and fr→en.
  - The best systems reached AUC ≈ 0.86 (verify), with gradient-boosted trees and RNNs both strong.
  - Useful features: the word, the learner, the exercise format and timing.
  - [ACL Anthology W18-0506](https://aclanthology.org/W18-0506/)
- **Lindsey, Shroyer, Pashler & Mozer (2014, *Psychological Science*)** [RCT, within-student] [MK]
  - US 8th-graders learning Spanish vocabulary over a semester.
  - Personalised review scheduled by a model combining population and individual data gave **+16.5% retention** on a cumulative exam **one month after the semester**, vs massed study.
  - It gave **+10.0%** vs one-size-fits-all spaced review.
  - This is the strongest evidence I know that learner-model personalisation improves *delayed* language learning.
  - [DOI 10.1177/0956797613504302](https://doi.org/10.1177/0956797613504302)
- **Equity** [OBS/simulation] [MK]
  - Doroudi & Brunskill, "Fairer but not fair enough" (LAK 2019): BKT with population-level parameters systematically under-practises slower learners. Per-learner or per-group parameters reduce, but do not remove, the gap.
  - [DOI 10.1145/3303772.3303838](https://doi.org/10.1145/3303772.3303838) (verify)
- **Wheel-spinning** [OBS] [MK]
  - Beck & Gong (AIED 2013): students who have not mastered a skill after about 10 practice opportunities rarely master it through more of the same practice.
  - [DOI 10.1007/978-3-642-39112-5_44](https://doi.org/10.1007/978-3-642-39112-5_44) (verify)
- **Gaming the system** [OBS] [MK]
  - Baker, Corbett & Koedinger (ITS 2004): systematic guessing or hint abuse is detectable from logs and is associated with lower learning.
  - [DOI 10.1007/978-3-540-30139-4_50](https://doi.org/10.1007/978-3-540-30139-4_50) (verify)
  - Related [SIB]: Mogavi et al. (L@S 2022) document Duolingo "gamification misuse", i.e. XP and streak farming. [arXiv 2203.16175](https://arxiv.org/pdf/2203.16175)

**IRT, Elo and adaptive selection**
- **IRT basics** [EXP-OP/psychometrics] [MK]
  - Rasch/1PL: P(correct) = σ(θ − b), where θ is learner ability and b is item difficulty.
  - 2PL adds a discrimination parameter a.
  - 3PL adds a guessing floor c, about 1/k for k-option multiple choice.
  - Computer-adaptive testing (CAT) picks the most informative next item. Under Rasch that is the item with b ≈ θ, i.e. about 50% predicted success.
  - CATs typically reach the precision of a fixed test with roughly half the items (Weiss & Kingsbury 1984, *J. Educational Measurement*). [DOI 10.1111/j.1745-3984.1984.tb01040.x](https://doi.org/10.1111/j.1745-3984.1984.tb01040.x) (verify)
- **Calibration sample size (Linacre 1994)** [EXP-OP] [MK]
  - Item difficulty to within ±1 logit (95% confidence) needs about 30 respondents.
  - ±0.5 logit needs about 100; about 150 for 99% confidence.
  - [Rasch Measurement Transactions 7:4](https://www.rasch.org/rmt/rmt74m.htm) (URL from memory)
- **Elo for adaptive practice (Pelánek 2016, *Computers & Education*)** [BENCH/EXP-OP] [MK]
  - Elo updates of learner skill and item difficulty predict close to full IRT and Performance Factors Analysis.
  - They are cheap, update online and handle new items.
  - Used in several large adaptive-practice systems.
  - [DOI 10.1016/j.compedu.2016.03.017](https://doi.org/10.1016/j.compedu.2016.03.017)
- **Math Garden / Rekentuin (Klinkenberg, Straatemeier & van der Maas 2011)** [OBS, large deployment with children] [MK]
  - Elo-based on-the-fly estimation of child ability and item difficulty, using both accuracy and response time.
  - [DOI 10.1016/j.compedu.2011.02.003](https://doi.org/10.1016/j.compedu.2011.02.003)
  - Scoring uses the "high speed, high stakes" rule (Maris & van der Maas 2012, *Psychometrika*). Score = (2·correct − 1) × remaining time, so fast correct answers earn most and fast wrong answers lose most, which discourages guessing. [DOI 10.1007/s11336-012-9288-y](https://doi.org/10.1007/s11336-012-9288-y) (verify)
- **ARTS (Mettler, Massey & Kellman 2016, *JEP: General*)** [RCT] [MK]
  - Adaptive sequencing that uses response time plus accuracy beat classic fixed spacing schedules on learning efficiency.
  - [DOI 10.1037/xge0000170](https://doi.org/10.1037/xge0000170) (verify)
- **Mastery thresholds (Pelánek & Řihák, UMAP 2017)** [BENCH/simulation] [MK]
  - The threshold chosen matters more than the model.
  - Simple criteria (an exponential moving average of correctness, or N-consecutive-correct) perform comparably to BKT-based criteria.
  - [DOI 10.1145/3079628.3079667](https://doi.org/10.1145/3079628.3079667) (verify)

**Mastery learning and tutoring: effect sizes**
- **Bloom (1984), "The 2 Sigma Problem"** [EXP-OP, based on small studies] [MK]
  - Claim: one-to-one tutoring with mastery learning puts the average tutored student about 2 SD above conventional instruction; group mastery learning about 1 SD.
  - The data were short dissertation studies (about 3–4 weeks) by Bloom's students (Anania; Burke), with small samples and researcher-made tests.
  - **Superseded as an effect-size estimate.**
  - [DOI 10.3102/0013189X013006004](https://doi.org/10.3102/0013189X013006004)
- **von Hippel (2024, *Education Next*), "Two-sigma tutoring: separating science fiction from science fact"** [EXP-OP/review] [MK]
  - Re-examined Bloom's sources: the 2 SD figure is not replicated.
  - Rigorous modern tutoring studies average roughly 0.3–0.4 SD.
  - [Education Next](https://www.educationnext.org/two-sigma-tutoring-separating-science-fiction-from-science-fact/) (URL from memory)
- **Kulik, Kulik & Bangert-Drowns (1990, *RER*)** [MA] [MK]
  - 108 controlled evaluations of mastery learning (Keller's Personalized System of Instruction and Bloom's Learning for Mastery).
  - Average **ES ≈ 0.52** on end-of-course exams.
  - Effects were larger for weaker students, on locally developed tests and with stricter mastery criteria. Mastery learning also increased time needed.
  - [DOI 10.3102/00346543060002265](https://doi.org/10.3102/00346543060002265)
- **Contradicting the above: Slavin (1987, *RER*), "Mastery learning reconsidered"** [best-evidence synthesis] [MK]
  - In group-based mastery studies lasting at least 4 weeks and measured with **standardised** tests, effects were **about zero** (median ≈ 0.04).
  - On experimenter-made tests, about 0.25 (verify).
  - The disagreement with Kulik is mostly explained by outcome measure and study duration.
  - [DOI 10.3102/00346543057002175](https://doi.org/10.3102/00346543057002175)
- **VanLehn (2011, *Educational Psychologist*)** [MA/review] [MK]
  - Against no tutoring: human tutoring d ≈ 0.79; step-based intelligent tutoring systems (ITS) d ≈ 0.76; **answer-based computer tutoring d ≈ 0.31**.
  - Duolingo-style exercises, which grade the final answer, are answer-based.
  - [DOI 10.1080/00461520.2011.611369](https://doi.org/10.1080/00461520.2011.611369)
- **Kulik & Fletcher (2016, *RER*)** [MA] [MK]
  - ITS median ES ≈ 0.66 across 50 studies.
  - Much smaller on standardised tests (≈ 0.13) than on locally developed tests (verify).
  - [DOI 10.3102/0034654315581420](https://doi.org/10.3102/0034654315581420)
- **Cognitive Tutor Algebra I at scale (Pane et al. 2014, *EEPA*)** [RCT, about 147 schools] [MK]
  - No significant effect in year 1.
  - About **+0.20 SD in year 2** in high schools.
  - [DOI 10.3102/0162373713507480](https://doi.org/10.3102/0162373713507480)
- **ASSISTments homework (Roschelle et al. 2016, *AERA Open*)** [RCT, Maine 7th grade] [MK]
  - **+0.18 SD** on a standardised maths test.
  - Larger for lower-achieving students.
  - [DOI 10.1177/2332858416673968](https://doi.org/10.1177/2332858416673968)
- **Nickow, Oreopoulos & Quan (2020, NBER w27476)** [MA of 96 RCTs] [MK]
  - PreK–12 tutoring pooled ES ≈ **0.37 SD**.
  - Teacher and paraprofessional tutors had larger effects than volunteers or parents.
  - [NBER](https://www.nber.org/papers/w27476)
- **Large-scale education RCTs** [MA] [MK]
  - Lortie-Forgues & Inglis (2019): 141 large education RCTs averaged **0.06 SD**, often with wide confidence intervals.
  - [DOI 10.3102/0013189X19832850](https://doi.org/10.3102/0013189X19832850)
  - Kraft (2020) proposes benchmarks for causal effects on standardised achievement: <0.05 small, 0.05–0.20 medium, ≥0.20 large. [DOI 10.3102/0013189X20912798](https://doi.org/10.3102/0013189X20912798)
- **Educational apps for ages 3–8 (Kim, Gilbert, Yu & Gale 2021)** [MA] [SIB]
  - +0.31 SD on average.
  - Larger for constrained skills (letters, phonics) and for researcher-developed outcomes.
  - [Harvard CEPR](https://cepr.harvard.edu/resource/measures-matter-meta-analysis-effects-educational-apps-preschool-grade-3-childrens-0)
- **AI tutoring and over-reliance (Bastani et al. 2025, *PNAS*)** [RCT, about 1,000 students] [SIB]
  - Unguarded GPT-4 raised practice performance by 48% but lowered later exam scores by 17%.
  - [Penn CHIBE](https://chibe.upenn.edu/publications/generative-ai-without-guardrails-can-harm-learning-evidence-from-high-school-mathematics)

### Inferences
- At Hevalo's likely data scale, deep or transformer KT would be over-engineering. Two good options:
  - Elo/Rasch with per-skill abilities, item difficulties and a guessing correction.
  - Logistic regression on practice counts (Best-LR / PFA-style).
  - Both are interpretable, update online in a Node API, and predict nearly as well.
- Spaced-repetition scheduling (FSRS, covered in `memory_retention.md`) and ability/difficulty modelling are complementary:
  - FSRS answers "when should this word be reviewed?"
  - IRT/Elo answers "how hard should the next exercise be, and how proficient is this learner?"
- Expect realistic effect sizes of 0.1–0.4 SD on independent or delayed measures, not "2 sigma". Size experiments and marketing claims accordingly.
- Answer-based exercises cap the tutoring benefit (VanLehn d ≈ 0.31). Step-level feedback (hint ladders, error-specific feedback on morphology) is where ITS-level effects come from.

### Gaps
- No primary Duolingo publication on Birdbrain's architecture, its target success rate, or learning-outcome A/B results could be retrieved. The search budget was exhausted; the sibling note also failed.
- The state of LLM-based and "foundation" KT models in 2025–2026, and current pyKT leaderboard numbers, could not be verified.
- I know of no knowledge-tracing or IRT work on Kurdish (Kurmanji or Sorani) learner data. This is an unverified absence.

---

## 2. Placement tests and proficiency frameworks (CEFR, can-do statements, CAT, ACTFL), and Kurdish standards

### Takeaway
The CEFR (2001; Companion Volume 2020) provides language-neutral can-do descriptors, originally scaled with Rasch models from teacher judgements. It now includes Pre-A1, mediation, and collections of descriptors for young learners. It is not a curriculum: each language needs "Reference Level Descriptions" (RLDs) saying which vocabulary and grammar belong to each level. I could **not** confirm any CEFR RLD, validated CEFR-linked exam or official CEFR-aligned standard for Kurmanji or Sorani. The Duolingo English Test shows that machine-learning-predicted item difficulty can bootstrap a computer-adaptive test without large pretest samples. Fast lexical tests (LexTALE-type yes/no word recognition) are validated, few-minute proficiency proxies that suit heritage placement.

### Cited Findings
- **How the CEFR descriptors were built** [STD/EXP] [MK]
  - The CEFR's six levels (A1–C2) and illustrative scales came from a Swiss project. Descriptors were calibrated by Rasch-scaling teachers' ratings of learners (North & Schneider 1998, *Language Testing* 15(2)).
  - So the can-do descriptors are themselves IRT-scaled.
  - [DOI 10.1177/026553229801500204](https://doi.org/10.1177/026553229801500204) (verify)
- **CEFR Companion Volume (Council of Europe, 2020; provisional 2018)** [STD] [MK]
  - Adds:
    - Pre-A1
    - mediation scales
    - online interaction
    - plurilingual/pluricultural competence
    - a phonological-control scale based on intelligibility rather than native-speaker norms
    - sign-language scales
  - Descriptors are modality-inclusive.
  - [Council of Europe CEFR page](https://www.coe.int/en/web/common-european-framework-reference-languages); [Companion Volume PDF](https://rm.coe.int/common-european-framework-of-reference-for-languages-learning-teaching/16809ea0d4) (URL from memory)
- **Young-learner descriptors** [STD] [MK]
  - The Council of Europe (2018) published collated descriptors adapted for young learners, ages 7–10 and 11–15.
  - These can be reused directly for Hevalo's child tracks.
  - [Council of Europe CEFR page](https://www.coe.int/en/web/common-european-framework-reference-languages) (specific document URL not retrieved)
- **Linking a test to the CEFR** [STD] [MK]
  - The Council of Europe's *Relating Language Examinations to the CEFR: A Manual* (2009) prescribes:
    - familiarisation
    - specification
    - standardisation (benchmarking with judges)
    - standard setting
    - empirical validation
  - Claiming "CEFR level X" credibly requires this process.
  - [Council of Europe CEFR page](https://www.coe.int/en/web/common-european-framework-reference-languages) (manual URL not retrieved)
- **Limits of the CEFR as a test blueprint** [EXP-OP] [MK]
  - Alderson et al. (2006, *Language Assessment Quarterly*; Dutch CEFR Construct Project): CEFR descriptors are too vague and inconsistent to specify test content.
  - Language-specific RLDs are needed, as English Profile and Profile deutsch did for English and German.
  - [DOI 10.1207/s15434311laq0301_2](https://doi.org/10.1207/s15434311laq0301_2) (verify)
- **ACTFL** [STD] [MK + SIB]
  - The ACTFL Proficiency Guidelines (2012, revised in a 2024 edition [MK]) define Novice, Intermediate, Advanced, Superior and Distinguished with sublevels.
  - The NCSSFL-ACTFL Can-Do Statements are self-assessment descriptors for setting goals and building self-efficacy [SIB]. [ACTFL](https://www.actfl.org/educator-resources/ncssfl-actfl-can-do-statements)
  - Approximate ACTFL–CEFR correspondence [MK, approximate; verify against ACTFL's published crosswalk]:
    - Novice High ≈ A1
    - Intermediate Low/Mid ≈ A2
    - Intermediate High ≈ B1
    - Advanced Low/Mid ≈ B1+/B2
- **Measuring app learners on ACTFL scales** [OBS/VENDOR] [SIB]
  - Jiang et al. 2021: beginners who completed a Duolingo course scored comparably to university students after four semesters in reading. Listening was weaker. [Wiley/FLA](https://onlinelibrary.wiley.com/doi/full/10.1111/flan.12600)
  - Smith, Jiang & Peters 2024: about 27 hours over 3 months took learners to reading Intermediate Low and listening Novice High. [LLT](https://www.lltjournal.org/item-detail/1152/)
  - Kittredge et al. 2024: only 66% (Spanish) and 53% (French) reached A2 speaking. [Duolingo whitepaper](https://duolingo-papers.s3.amazonaws.com/reports/Duolingo_whitepaper_language_conversation_2024.pdf)
  - Takeaway: vendors validate apps with *external* proficiency tests, not in-app XP.
- **Duolingo English Test (Settles, LaFlair & Hagiwara 2020, *TACL* 8)** [VENDOR, peer-reviewed] [MK]
  - Item difficulty is predicted from item content by ML/NLP models trained on CEFR-labelled texts and vocabulary. This allows items to be generated automatically and administered adaptively without traditional large-sample pretesting.
  - Item types include:
    - yes/no recognition of real vs pseudo-words
    - C-tests (fill in deleted word halves)
    - dictation
    - read-aloud
  - Scores correlate with TOEFL/IELTS. I do not quote the coefficients from memory.
  - [ACL Anthology 2020.tacl-1.17](https://aclanthology.org/2020.tacl-1.17/) (URL from memory); [DET research page](https://englishtest.duolingo.com/research) (URL from memory)
- **LexTALE (Lemhöfer & Broersma 2012, *Behavior Research Methods* 44)** [validation study] [MK]
  - 60-item untimed yes/no lexical decision: 40 words plus 20 pseudowords.
  - Takes about 3.5 minutes.
  - Predicted standardised English proficiency better than self-ratings did.
  - Versions now exist for several other languages.
  - [DOI 10.3758/s13428-011-0146-0](https://doi.org/10.3758/s13428-011-0146-0)
- **Quick proxies for heritage proficiency (Polinsky & Kagan 2007, *Language and Linguistics Compass*)** [EXP-OP/OBS] [MK]
  - Lexical proficiency (vocabulary or translation tests) and speech rate are quick, reliable predictors of heritage speakers' overall grammatical proficiency.
  - [DOI 10.1111/j.1749-818X.2007.00022.x](https://doi.org/10.1111/j.1749-818X.2007.00022.x)
- **Heritage learner profile** [OBS, survey n ≈ 1,800] [SIB]
  - Carreira & Kagan 2011: relatively strong aural and oral skills, limited literacy.
  - [Carreira & Kagan PDF](https://hwpi.harvard.edu/files/heritagespanish/files/carreira_kagan_survey_0.pdf)
  - Proficiency is a continuum, from acrolectal to basilectal speakers to "overhearers" [SIB]. [Frontiers in Education 2020](https://www.frontiersin.org/journals/education/articles/10.3389/feduc.2020.00053/pdf)
- **Self-assessment validity (Ross 1998, *Language Testing* 15(1))** [MA] [MK]
  - Self-assessments correlate moderately to strongly with criterion measures.
  - Correlations are higher for receptive skills (reading) than productive ones.
  - Accuracy improves when the descriptors refer to concrete tasks the learner has experienced. Exact pooled r not quoted (verify).
  - [DOI 10.1177/026553229801500101](https://doi.org/10.1177/026553229801500101) (verify)
  - Formative self-assessment against can-do statements raised self-efficacy in a small quasi-experiment [QE] [SIB]. [ERIC EJ1033761](https://files.eric.ed.gov/fulltext/EJ1033761.pdf)
- **Kurdish standards: what siblings found** [SIB]
  - Kurdish is taught in KRG–diaspora online schools: about 30 schools abroad and about 3,000 students. [Kurdistan24](https://www.kurdistan24.net/en/story/893463/kurdish-now-taught-as-formal-subject-in-sweden-and-germany-under-joint-kdc-krg-init)
  - It is taught as an elective in Turkey: record enrolment, but few teachers. [Turkish Minute](https://www.turkishminute.com/2025/06/03/kurdish-elective-course-enrollment-hits-record-high-in-turkey-as-barriers-remain/)
  - The Sorani standard is official in the Kurdistan Region. [Kurdish alphabets (Wikipedia)](https://en.wikipedia.org/wiki/Kurdish_alphabets)
  - None of these sources mentions CEFR alignment.

### Inferences
- **No Kurdish CEFR standard could be confirmed.** Hevalo could credibly be the first to publish Kurdish (Kurmancî and Soranî) can-do descriptors and "RLD-lite" inventories mapped to CEFR levels: frequency-banded vocabulary plus grammar points per level. That would be a positioning asset with schools and diaspora programmes.
- Hevalo should say "aligned to CEFR descriptors", not "CEFR-certified", until it has done standard setting with Kurdish teachers following the Council of Europe Manual.
- A LexTALE-style Kurdish lexical decision test is the cheapest validated placement building block:
  - Use real words from the 400k-word dictionary plus phonotactically legal pseudo-words.
  - An **audio** version is needed for heritage speakers who cannot yet read Hawar or Sorani script.
- The DET approach (predict item difficulty from features) matters because Hevalo's item bank will be large (dictionary-scale) while its response data will be small for a long time.

### Gaps
- Whether a CEFR-aligned Kurdish curriculum, RLD, or validated proficiency exam exists (from the KRG Ministry of Education, Turkey's MEB Kurmancî elective programme, INALCO or Institut kurde de Paris, university Kurdish departments, or Swedish modersmål/German HSU syllabi) **could not be searched**. Treat it as unknown, not as "none exists".
- Whether US government tests (ILR/DLPT) or ACTFL/LTI offer OPIs in Kurmanji or Sorani was not verified. A Kurdish OPI would allow external validation.
- The exact ACTFL–CEFR crosswalk and the 2024 ACTFL Guidelines changes were not retrieved.
- Duolingo's in-course proficiency score (reported in some sources as a CEFR-linked "Duolingo Score") was not verified.

---

## 3. Calibrating desirable difficulty: target success rates and the zone of proximal development in practice

### Takeaway
The "85% rule" (Wilson et al. 2019) is a mathematical result for gradient-descent learners on binary classification. It supports "mostly successful but not trivial" practice, but it is not a validated target for vocabulary or grammar learning. Deployed adaptive systems aim somewhere around 70–90% success. Child-focused evidence suggests that easier settings (about 90%) increase the amount of practice. Reading input calibrates differently: about 95–98% of words should be known. Accuracy *during* practice is a poor proxy for learning, so a success-rate target should be treated as a motivation/efficiency dial, validated against delayed outcomes.

### Cited Findings
- **Wilson, Shenhav, Straccia & Cohen (2019), "The Eighty Five Percent Rule for optimal learning", *Nature Communications* 10:4646** [theory + simulations] [MK]
  - For learners using stochastic gradient descent on binary classification with Gaussian noise, the optimal training error rate is ≈ **15.87%**, i.e. about 85% accuracy.
  - Training at that rate can make learning exponentially faster than training at fixed difficulty.
  - Illustrated with a perceptron, two-layer neural networks and a biologically plausible model of perceptual learning in monkeys. **No human language-learning test.** The authors flag their assumptions.
  - [DOI 10.1038/s41467-019-12552-4](https://doi.org/10.1038/s41467-019-12552-4)
- **Where the 85% rule stops applying** [EXP-OP] [MK]
  - Declarative memory (recalling a word's form) is not gradient descent on a noisy classification boundary.
  - Spaced-retrieval research optimises *when* to retrieve (desired retention), not the error rate per se. FSRS's commonly used default desired retention is 0.90 [SIB: see `memory_retention.md` for FSRS].
  - Multiple-choice accuracy is inflated by guessing.
- **Math Garden difficulty experiment (Jansen et al. 2013, *Learning and Individual Differences* 24)** [RCT, children] [MK]
  - Conditions targeted roughly 90% (easy), 75% (medium) and 60% (hard) success; exact values to verify.
  - Children in the easy condition practised more items.
  - Math performance gains were driven by the amount of practice.
  - No clear effect on math anxiety.
  - [DOI 10.1016/j.lindif.2012.12.014](https://doi.org/10.1016/j.lindif.2012.12.014) (verify)
- **Learning vs performance (Soderstrom & Bjork 2015, *Perspectives on Psychological Science*)** [EXP-OP/review] [MK]
  - Conditions that slow acquisition (spacing, interleaving, retrieval, variability) often improve long-term retention and transfer.
  - Performance during training is an unreliable index of learning.
  - [DOI 10.1177/1745691615569000](https://doi.org/10.1177/1745691615569000)
  - Spacing in L2 vocabulary (Kim & Webb 2022) [MA] [SIB]: **g = 0.58 immediate, 0.80 delayed**. [Wiley](https://onlinelibrary.wiley.com/doi/abs/10.1111/lang.12479)
- **Errorful generation / pretesting effect (Kornell, Hays & Bjork 2009, *JEP: LMC*)** [RCT, lab] [MK]
  - Unsuccessful retrieval attempts followed by feedback improve later memory.
  - So "guess first, then see the answer" for new words is not harmful when feedback is immediate.
  - [DOI 10.1037/a0015729](https://doi.org/10.1037/a0015729) (verify)
- **Region of proximal learning (Metcalfe 2002; Metcalfe & Kornell 2005)** [EXP] [MK]
  - Effective learners allocate study to items just beyond their current mastery.
  - This is an operational version of Vygotsky's zone of proximal development (ZPD).
  - [DOI 10.1016/j.jml.2004.12.001](https://doi.org/10.1016/j.jml.2004.12.001) (verify)
- **Expertise reversal effect (Kalyuga, Ayres, Chandler & Sweller 2003, *Educational Psychologist*)** [EXP-OP/review of experiments] [MK]
  - Guidance and worked examples that help novices become redundant or harmful for more knowledgeable learners.
  - Scaffolding should fade with proficiency.
  - [DOI 10.1207/S15326985EP3801_4](https://doi.org/10.1207/S15326985EP3801_4)
- **Input difficulty (vocabulary coverage)** [OBS/EXP] [MK]
  - Hu & Nation (2000): about **98%** known running words needed for adequate unassisted comprehension of fiction.
  - Laufer (1989): about 95% as a minimum.
  - Schmitt, Jiang & Grabe (2011, *MLJ*): comprehension rises roughly linearly with coverage.
  - [Hu & Nation, *Reading in a Foreign Language* 13(1)](https://nflrc.hawaii.edu/rfl/) (URL is journal home, from memory); [DOI 10.1111/j.1540-4781.2011.01146.x](https://doi.org/10.1111/j.1540-4781.2011.01146.x) (verify)
- **Over-easy practice can be harmful** [RCT] [SIB]
  - Bastani: practice success up 48–127%, exam performance down 17% without guardrails.
  - [Penn CHIBE](https://chibe.upenn.edu/publications/generative-ai-without-guardrails-can-harm-learning-evidence-from-high-school-mathematics)
- **The failure-side boundary** [OBS] [MK]
  - Wheel-spinning after about 10 failed opportunities (Beck & Gong 2013; see section 1).
- **Duolingo's target** [VENDOR] [MK]
  - Public descriptions of Birdbrain say it picks exercises in a "sweet spot" of predicted success.
  - I could not verify any published numeric target.

### Inferences
- **Correct for guessing before comparing to any target.** With 4-option multiple choice, 85% observed accuracy implies only about 80% "true" success: (0.85 − 0.25)/0.75. With 2-option items (e.g. "did you hear ڕ or ر?"), 85% observed is only 70% true.
- A defensible starting policy, to be tuned by experiment:
  - About 80–85% predicted success on recall and production items for teens and adults.
  - About 85–90% for children, absolute beginners, the first two weeks, and literacy-focused heritage tracks, where shame and anxiety are risks.
  - Input (stories, poems, graded reading) at ≥ 95–98% known words.
- Placement and checkpoint tests should use the CAT logic (items near 50% for maximum information). Practice should use the motivation/efficiency logic (80–90%). Mixing the two on one screen, e.g. a placement test that feels like failure, hurts heritage learners' confidence. Frame placement as "let's find your level" with a skip-ahead outcome.

### Gaps
- No language-learning RCT varying target success rate (e.g. 70% vs 85% vs 95%) with delayed outcomes is known to me. The Math Garden study is maths with children.
- Whether Wilson et al.'s result has been tested in human vocabulary or grammar learning since 2019 could not be searched.

---

## 4. Learning analytics and experimentation: measuring retention, avoiding Goodhart, A/B ethics

### Takeaway
XP, streaks, in-session accuracy, time-on-app and learners' feeling of learning all diverge from durable learning, sometimes in the opposite direction. Measure learning with **delayed, unassisted probes** and treat engagement as a guardrail metric:
- recall at 7 and 30 days on sampled items
- transfer to unseen sentences
- periodic CEFR-linked checkpoints
- growth in re-placement ability (θ)

Realistic effects are small (about 0.05–0.2 SD), so a small app needs within-learner randomisation and variance reduction to detect them. A/B tests of normal educational practice are ethically defensible with transparency and guardrails. People object more to experiments than to untested rollouts (the "A/B illusion"), and children need stricter rules.

### Cited Findings
- **Feeling of learning vs actual learning (Deslauriers et al. 2019, *PNAS*)** [RCT, crossover] [MK]
  - Physics students learned more under active learning but *felt* they learned less than under polished lectures.
  - [DOI 10.1073/pnas.1821936116](https://doi.org/10.1073/pnas.1821936116)
- **Practice performance vs exam performance** [RCT] [SIB]
  - Bastani: +48% practice, −17% exam.
  - [Penn CHIBE](https://chibe.upenn.edu/publications/generative-ai-without-guardrails-can-harm-learning-evidence-from-high-school-mathematics)
- **Engagement wins reported as wins** [VENDOR] [SIB]
  - Duolingo leagues: +17% learning time, and "highly engaged" users tripled (Mazal, ex-CPO).
  - HLR: +12% activity.
  - Both are engagement metrics.
  - [Sailer & Homner 2020 (for gamification MA context)](https://d-nb.info/1202307655/34); [Settles & Meeder 2016](https://research.duolingo.com/papers/settles.acl16.pdf)
- **Goodhart in practice** [QUAL] [SIB]
  - Duolingo learners fixate on XP and streaks, take shortcuts and game leagues.
  - [Mogavi et al. 2022](https://arxiv.org/pdf/2203.16175)
  - Goodhart's law has distinct failure modes (Manheim & Garrabrant 2018): regressional, extremal, causal and adversarial. All are relevant when XP is both the reward and the metric [EXP-OP] [MK]. [arXiv:1803.04585](https://arxiv.org/abs/1803.04585)
- **Novelty effects** [QE] [SIB]
  - Gamification effects dip after about 4 weeks and recover between weeks 6 and 10. Evaluate mechanics at 8–12 weeks.
  - [Rodrigues et al. 2022](https://link.springer.com/article/10.1186/s41239-021-00314-6)
- **Delayed outcome measure in a language study** [RCT] [MK]
  - Lindsey et al. 2014 measured retention one month after the course on a cumulative exam: +16.5% vs massed, +10% vs generic spacing.
  - [DOI 10.1177/0956797613504302](https://doi.org/10.1177/0956797613504302)
- **Learning curves (Koedinger and colleagues; DataShop; Stamper & Koedinger, AIED 2011)** [EXP/method] [MK]
  - Plot error rate against practice opportunity for each knowledge component (KC).
  - A smooth, declining (power-law) curve indicates a well-specified skill.
  - Flat, rising or spiky curves reveal mis-specified skills (merge or split KCs) or bad items.
  - [DataShop](https://pslcdatashop.web.cmu.edu/) (URL from memory)
- **Evidence-centred design and stealth assessment** [EXP-OP] [MK]
  - Evidence-centred design (Mislevy, Steinberg & Almond 2003) and stealth assessment in games (Shute 2011): game play can yield valid evidence of skill if tasks are designed so that observable behaviours map to specific claims.
  - Otherwise game scores mostly measure game skill, e.g. typing speed.
  - [DOI 10.1207/S15366359MEA0101_02](https://doi.org/10.1207/S15366359MEA0101_02) (verify)
- **Online-experiment practice (Kohavi, Tang & Xu 2020, *Trustworthy Online Controlled Experiments*, Cambridge UP)** [EXP-OP/industry] [MK]
  - Define an Overall Evaluation Criterion (OEC) plus guardrail metrics.
  - Check for sample-ratio mismatch.
  - Expect novelty and primacy effects.
  - Distrust surprising wins ("Twyman's law").
  - [DOI 10.1017/9781108653985](https://doi.org/10.1017/9781108653985) (verify)
- **CUPED (Deng, Xu, Kohavi & Walker, WSDM 2013)** [method, industry] [MK]
  - Using a pre-experiment covariate (e.g. prior-period behaviour) substantially reduces variance, meaning smaller samples for the same power.
  - [DOI 10.1145/2433396.2433413](https://doi.org/10.1145/2433396.2433413) (verify)
- **Bandits in education experiments** [EXP/simulation] [MK]
  - Adaptive (multi-armed bandit) experiments in education help learners during the experiment.
  - They bias effect estimates and reduce power (Rafferty, Ying & Williams, JEDM 2019; verify).
  - The MOOClet framework (Williams and colleagues) supports adaptive in-course experiments.
  - [JEDM](https://jedm.educationaldatamining.org/) (specific URL not retrieved)
- **Sample sizes** [method; computed here, not sourced]
  - Two-arm comparison, α = 0.05 two-sided, 80% power: n per arm ≈ 2(1.96 + 0.84)² / d².
  - That gives **≈ 393 per arm for d = 0.2** and **≈ 1,570 per arm for d = 0.1**, before attrition.
  - Within-learner designs, where each learner's items are randomised to conditions, need far fewer learners when outcomes correlate within a learner.
- **Effect-size realism** [MA] [MK]
  - The mean effect in large education RCTs is 0.06 SD (Lortie-Forgues & Inglis 2019).
  - [DOI 10.3102/0013189X19832850](https://doi.org/10.3102/0013189X19832850)
- **The "A/B illusion" (Meyer et al. 2019, *PNAS*)** [RCT, survey experiments] [MK]
  - Across many vignette studies (about 16 studies, about 5,900 participants; verify), people rated A/B tests of two acceptable policies as *less* appropriate than implementing either policy untested.
  - [DOI 10.1073/pnas.1820701116](https://doi.org/10.1073/pnas.1820701116)
- **The Facebook emotional-contagion study (Kramer, Guillory & Hancock 2014, *PNAS*)** [RCT, about 689k users] [MK]
  - Manipulated users' feeds to change emotional content.
  - It prompted an editorial expression of concern and set the reference case for objectionable platform experiments: manipulating wellbeing without consent.
  - [DOI 10.1073/pnas.1320040111](https://doi.org/10.1073/pnas.1320040111)
- **US Common Rule exemption** [REG] [MK]
  - 45 CFR 46.104(d)(1) exempts research in established educational settings that involves normal educational practices not likely to adversely affect students' opportunity to learn.
  - It applies only to federally funded or IRB-bound research, but is a useful ethical yardstick.
  - [eCFR 45 CFR 46.104](https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-A/part-46/subpart-A/section-46.104)
- **Learning-analytics ethics (Slade & Prinsloo 2013, *American Behavioral Scientist*)** [EXP-OP] [MK]
  - Principles: learners as agents, transparency, informed consent where feasible, and that labels or predictions should not fix a learner's identity.
  - [DOI 10.1177/0002764213479366](https://doi.org/10.1177/0002764213479366)
- **Children** [REG] [SIB]
  - The UK ICO Children's Code bars nudges that extend use, citing streaks.
  - The sibling note recommends never running A/B tests on children that optimise time-on-app.
  - [ICO code](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/)
- **Tooling** [product docs] [MK, verify current features]
  - GrowthBook: open source, warehouse-native (can query Postgres), frequentist and Bayesian statistics, CUPED, JS/React/React Native SDKs.
  - PostHog: open source, includes experiments.
  - UpGrade: open-source A/B platform built for education software (Carnegie Learning).
  - [GrowthBook](https://www.growthbook.io/); [PostHog](https://posthog.com/); [UpGrade](https://www.upgradeplatform.org/) (URLs from memory)

### Inferences
- Hevalo's **north-star learning metric** should be delayed unassisted recall and production on sampled items (e.g. "words still known at 30 days per hour studied"), not XP. DAU, streaks and minutes become guardrails and secondary goals.
- **XP is both the reward and the visible metric, so it will be gamed (Goodhart).** XP should be tied to evidence of learning:
  - diminishing XP for already-mastered or very easy items
  - a bonus for delayed correct recall
  - leagues computed on learning-weighted XP
- At Hevalo's scale, user-level A/B tests on learning outcomes will be underpowered unless effects are large. Prefer:
  - within-learner, item-level randomisation (which words get feature X)
  - CUPED, using placement θ and prior-month activity as covariates
  - long run times (8–12 weeks)
  - pre-registered single primary metrics

### Gaps
- No public Duolingo (or other language-app) paper reporting an A/B test with a *delayed proficiency* primary outcome was retrievable. Duolingo's published A/B results (HLR, notifications, leagues) use engagement and retention.
- Current (2026) EU guidance specific to experimentation on minors in edtech was not searched beyond what the children sibling note covers.

---

## 5. Personalisation by learner type (heritage vs new learner, child vs adult, Kurmanji vs Sorani)

### Takeaway
The best-supported personalisation is by **prior knowledge**, using placement, skill-specific ability estimates and fading scaffolding (expertise reversal), and by **age** (audio-first for pre-readers, higher success targets, constrained-skill outcomes). Personalising by "learning styles" has no support and should be avoided. Heritage learners need a *multi-dimensional* profile: listening and speaking vs script literacy vs spelling vs grammar. Kurmanji and Sorani need separate ability scales and item banks. Any cross-variety benefit should be measured, not assumed. Population-level model parameters can shortchange minority subgroups, so models should be checked for differential item functioning (DIF) and per-group calibration.

### Cited Findings
- **Learning styles (Pashler, McDaniel, Rohrer & Bjork 2008, *Psychological Science in the Public Interest*)** [EXP-OP/review] [MK]
  - Virtually no adequate evidence supports matching instruction to "learning styles" (the meshing hypothesis).
  - [DOI 10.1111/j.1539-6053.2009.01038.x](https://doi.org/10.1111/j.1539-6053.2009.01038.x)
- **Scaffolding by prior knowledge** [MK]
  - Expertise reversal (Kalyuga et al. 2003): scaffolding should depend on prior knowledge.
  - [DOI 10.1207/S15326985EP3801_4](https://doi.org/10.1207/S15326985EP3801_4)
- **Heritage learners** [SIB]
  - Strong aural and oral skills, weak literacy; a proficiency continuum.
  - For diaspora Kurds the bottleneck is likely literacy in Hawar or Sorani script and spelling.
  - [Carreira & Kagan PDF](https://hwpi.harvard.edu/files/heritagespanish/files/carreira_kagan_survey_0.pdf); [Frontiers in Education 2020](https://www.frontiersin.org/journals/education/articles/10.3389/feduc.2020.00053/pdf)
- **In-region learners schooled in Turkish, Arabic or Persian** [SIB]
  - Often fluent speakers who cannot read or write Kurdish; their need is literacy and standard spelling.
  - (`heritage_minority_kurdish.md`, citing [Kurdistan24](https://www.kurdistan24.net/en/story/893463/kurdish-now-taught-as-formal-subject-in-sweden-and-germany-under-joint-kdc-krg-init) and [Turkish Minute](https://www.turkishminute.com/2025/06/03/kurdish-elective-course-enrollment-hits-record-high-in-turkey-as-barriers-remain/))
- **Quick proxies** [MK]
  - Lexical proficiency is a fast proxy for heritage proficiency (Polinsky & Kagan 2007).
  - [DOI 10.1111/j.1749-818X.2007.00022.x](https://doi.org/10.1111/j.1749-818X.2007.00022.x)
- **Varieties and scripts** [EXP/reference] [SIB]
  - Kurmanji is written in Hawar Latin script (Turkey, Syria, Armenia); Sorani in Kurdo-Arabic script (Iraq, Iran).
  - Kurmanji's hardest feature for learners is split ergativity in the past tense, with variation among speakers.
  - [Kurdish alphabets (Wikipedia)](https://en.wikipedia.org/wiki/Kurdish_alphabets)
- **Children's apps** [MA] [SIB]
  - Effects are larger for constrained skills (letters, phonics) and for preschoolers; smaller on broad measures.
  - [Harvard CEPR, Kim et al. 2021](https://cepr.harvard.edu/resource/measures-matter-meta-analysis-effects-educational-apps-preschool-grade-3-childrens-0)
  - Gamification's motivational effect is smallest in primary school (g ≈ 0.31) (`motivation_gamification.md`).
- **Children and difficulty** [RCT] [MK]
  - Easier targets (about 90% success) increased the amount of practice (Jansen et al. 2013; see section 3).
  - [DOI 10.1016/j.lindif.2012.12.014](https://doi.org/10.1016/j.lindif.2012.12.014) (verify)
- **Self-assessment by children** [QE] [MK]
  - Butler & Lee (2010, *Language Testing* 27(1)): young EFL learners' self-assessments were less accurate than older learners'.
  - Training improved accuracy and confidence somewhat. Can-do self-ratings from children need performance checks.
  - [DOI 10.1177/0265532209346370](https://doi.org/10.1177/0265532209346370) (verify)
- **Equity across subgroups** [OBS/simulation] [MK]
  - Population-parameter models under-serve slower learners (Doroudi & Brunskill 2019; section 1).
  - Standard psychometrics checks items for **DIF**, e.g. Mantel–Haenszel (Holland & Thayer 1988): items that are harder for one group at equal ability.
  - [DOI 10.1002/j.2330-8516.1986.tb00186.x](https://doi.org/10.1002/j.2330-8516.1986.tb00186.x) (verify)

### Inferences
- A Hevalo learner profile should be a **vector**, not a single level. Estimate each dimension separately, per variety:
  - listening comprehension
  - reading in the script
  - spelling/typing (production)
  - vocabulary breadth
  - grammar points such as ergative past and ezafe
  - speaking, where it can be measured
- Heritage learners will show high listening, low spelling. Non-Kurds will show low everything. In-region speakers schooled in another language will show high listening and speaking, low literacy.
- **Kurmanji and Sorani get separate θ scales and item banks.** Cross-variety transfer (shared vocabulary, recognition across scripts) can later be estimated from learners who do both, rather than assumed.
- **UI language matters for item difficulty:**
  - Turkish, Arabic and Persian speakers share many loanwords with Kurdish.
  - Arabic- and Persian-script readers have a head start on Sorani script.
  - Item difficulty should therefore get a UI-language/L1 covariate, or a DIF check.
- **Child mode:**
  - higher success target
  - audio and picture items with 2–3 options (so correct for guessing)
  - shorter adaptive placement
  - outcomes framed as constrained skills (letter–sound knowledge, picture naming at one week)

### Gaps
- No Kurdish-specific evidence on learner profiles (e.g. the share of diaspora learners who are literate in Hawar or Sorani), Kurmanji–Sorani mutual intelligibility, or cross-variety transfer was found in sibling notes, and it could not be searched here.
- No study known to me compares placement methods for heritage learners in an app context with delayed outcomes.

---

## 6. Implications for Hevalo

These are concrete design implications, ordered roughly by dependency. Each traces to findings above.

**A. Instrumentation (prerequisite for everything else)**
1. **Log every response as an attempt event**, to a Postgres table partitioned by month. Fields:
   - learner, item and knowledge-component (KC) tags: lexeme, grammar point, letter/grapheme
   - variety (kmr/ckb) and script
   - skill: listen, read, spell/type or speak
   - format, with the number of options k for multiple choice
   - correct, partial credit (edit distance for typed answers)
   - response time in ms, hints used, attempt number
   - context: lesson, review, placement, checkpoint, single-player game or multiplayer game
   - UI language, platform (web/mobile), keyboard type, timestamp
   - Without this, neither a learner model nor learning measurement is possible.
   - Basis: sections 1 and 4; FSRS log needs in `memory_retention.md`.
2. **Tag the curriculum with KCs**, as a many-to-many mapping from items to skills. Review **learning curves** per KC monthly: flat curves mean bad items or mis-specified skills (DataShop method).

**B. Learner model v1 (simple, online, interpretable)**
3. **Elo/Rasch model** with per-learner θ per (variety × skill) and per-item difficulty b, updated after each answer in the Node API and cached in Redis.
   - Add a **guessing floor c = 1/k** for multiple-choice and tap formats (3PL-style).
   - Use response time with Maris–van der Maas scoring **only** in timed games.
   - Basis: Pelánek 2016; Klinkenberg 2011; DET.
4. **Cold-start item difficulty from features** (DET-style), so the 400k-word dictionary and new content get usable priors before anyone answers them:
   - word frequency rank from a Kurdish corpus or dictionary usage
   - word length and morphological complexity
   - special graphemes: Hawar ê/î/û/ç/ş/x/q; Sorani ڕ/ڵ/ۆ/ێ/ە
   - loanword/cognate status relative to the UI language
   - exercise format
   - Re-estimate from data once an item has about 100–150 responses (Linacre).
5. **Defer deep or transformer KT** until there are tens of millions of attempts. Upgrade path:
   - first, logistic regression on success/failure counts per KC (Best-LR/PFA)
   - then consider DKT/AKT
   - Judge every model by held-out-learner log loss and calibration, and judge model *changes* by delayed-learning A/B tests (Gervet 2020; pyKT; Lindsey 2014).
6. **Equity check:** fit and check calibration separately for heritage vs new learners, children vs adults, and UI-language groups. Run DIF on placement and checkpoint items (Doroudi & Brunskill; Mantel–Haenszel).

**C. Difficulty calibration in lessons and games**
7. **Session generator with a target predicted success rate:**
   - About **80–85%** for teens and adults.
   - About **85–90%** for children, the first two weeks and heritage literacy tracks.
   - Always use **guessing-corrected** predictions: with 4 options, 85% observed ≈ 80% true; with 2 options, 85% observed ≈ 70% true.
   - Expose the target as a server-side parameter so it can be A/B tested; it is not fixed science (Wilson 2019 is theory; Jansen 2013 is maths with children).
8. **Mix every session from three pools:** items due for review (FSRS), new items in the zone of proximal development, and 1–2 "stretch" items. "Guess first" on brand-new words is acceptable with immediate feedback (pretesting effect).
9. **Wheel-spinning detector:** if a learner has had about 8–10 opportunities on a KC without reaching mastery, stop repeating the same drill. Switch to:
   - an explicit mini-explanation in the UI language
   - an audio or picture modality
   - a prerequisite KC
   - For heritage learners, scaffolding should fade fast (expertise reversal).
10. **Mastery = delayed, unassisted success**, not "3 in a row today". A KC or unit counts as mastered only after a correct *unhinted production* (typed or spoken) in a **later session (≥ 1 day)**. Crowns, unit completion and can-do ticks should follow this rule (Soderstrom & Bjork; Pelánek & Řihák on thresholds).
11. **Graded input:** stories, poems and community-feed texts recommended for reading should have about 95–98% of tokens in the learner's known-word set (estimated from the model). Unknown words link to the dictionary and to spaced-repetition review (Hu & Nation).
12. **Games as evidence, carefully:**
    - Feed single-player Wordle, rhyme, quiz and typing-race results into θ with **format-specific parameters**.
    - In typing races and timed multiplayer, separate language knowledge from typing and keyboard skill: use speed only within a learner's own baseline, and accept a diacritic-lenient answer as partial credit.
    - Score timed quizzes with "high speed, high stakes" so fast guessing is penalised.
    - Do **not** count speed-dependent multiplayer scores as mastery evidence for children (Shute; Maris & van der Maas).

**D. Placement and proficiency (CEFR)**
13. **Onboarding profile, about 1 minute:**
    - which variety is spoken at home
    - which scripts the learner can read
    - self-rated understanding, speaking, reading and writing
    - age band
    - goal
    - Use it as the CAT's *prior*, not as the result.
14. **5–8 minute adaptive placement per variety:**
    - (a) A **LexTALE-KU** yes/no recognition block with real words and pseudo-words, in both a **text** and an **audio** version, the audio one for speakers who cannot read the script.
    - (b) A Rasch CAT across listening (audio → picture/meaning), reading in the script, and spelling (short dictation).
    - Stop when the standard error < about 0.4 logits or after about 20 items.
    - Route the learner to the matching track: e.g. "Read & write what you already speak" for heritage learners and in-region speakers schooled in another language.
    - Allow **test-out at any unit**.
    - Re-run the placement every 8–12 weeks as a growth measure.
    - Basis: LexTALE; Polinsky & Kagan; Weiss & Kingsbury; heritage sibling note.
15. **Write Kurdish can-do statements per unit**, adapted from CEFR Companion Volume and young-learner descriptors, in both Kurmancî and Soranî tracks. Also build an **"RLD-lite"**: frequency-banded vocabulary and grammar inventories per level, written with Kurdish teachers and linguists.
    - Wording: say "aligned to CEFR descriptors".
    - Plan a Council of Europe Manual-style **standard-setting workshop** with teachers from KRG–diaspora schools, German HSU and Swedish modersmål programmes before making any "level" claims.
    - Publishing this openly could make Hevalo the reference Kurdish framework, since no such framework could be confirmed (section 2 gaps).
16. **Show proficiency as a profile with uncertainty**, e.g. "Listening ≈ A2, Reading ≈ A1, Writing: Pre-A1", rather than one number. Pair it with periodic can-do self-checks, Rasch-scaled. Show learners where their self-rating and measured performance diverge; this is informational feedback.
17. **External validation, once:**
    - Have Kurdish teachers rate about 50–100 consenting users with a short structured interview or writing task.
    - Correlate the ratings with in-app placement θ.
    - Report this concurrent validity before making public proficiency claims, as Duolingo validated against ACTFL tests (Jiang 2021; Smith et al. 2024).

**E. Measuring learning, not engagement (anti-Goodhart)**
18. **Primary learning metrics** for dashboards and every experiment:
    - Delayed recall rate on **probe items** at 7 and 30 days: unassisted, no hints, no audio replay, production where possible.
    - Words or KCs retained per study hour.
    - Checkpoint pass rates.
    - θ growth between re-placements.
    - DAU, streaks, minutes and Zêr are **guardrails**: they must not drop, but they are not the goal.
19. **Probe-item sampling:** each week, randomly hold out a small share (about 5%) of a learner's recently learned items from scheduled review and test them later as probes. This yields an unbiased retention curve per cohort and feature. Keep probes out of XP and league scoring so they cannot be farmed.
20. **Make XP learning-weighted:**
    - diminishing XP for repeating mastered or easy items
    - bonus XP for delayed correct recall and for review
    - leagues computed on this learning-XP
    - This removes the farming incentive documented at Duolingo (Mogavi 2022).

**F. Experimentation infrastructure and ethics**
21. **Experiment platform:** feature flags plus logged assignments. Options: GrowthBook or PostHog, both open source and able to read Postgres, or a thin in-house table. For each experiment:
    - pre-register one primary learning metric and its guardrails
    - check sample-ratio mismatch
    - use CUPED with placement θ and prior activity as covariates
    - run for ≥ 8–12 weeks for any motivational mechanic (novelty effect)
22. **Power realism:**
    - d = 0.2 needs about 400 learners per arm; d = 0.1 about 1,600.
    - Prefer **within-learner, item-level randomisation**, e.g. which words get audio-first vs text-first presentation, or which get mnemonic hints. This is how Lindsey et al. got a clean 30-day result.
    - Use bandits only where estimating the effect is not the goal.
23. **Ethics policy:**
    - Publish a plain-language "how we improve Hevalo" notice.
    - Test only variants that are both acceptable teaching practice (the Common Rule "normal educational practice" yardstick).
    - Never run experiments that manipulate wellbeing or emotions, or withhold core content.
    - **No time-on-app optimisation experiments on child accounts**; tell parents about learning experiments.
    - Do a GDPR data-protection impact assessment (DPIA) and minimise data.
    - Partner with a university IRB if results will be published. Expect some user pushback even to benign tests (A/B illusion), so frame tests as "trying two good ways to teach".

**G. Personalisation axes to implement (and one to avoid)**
24. **Implement:**
    - variety (separate scales)
    - script literacy
    - skill profile (listening vs literacy)
    - age band (target success rate, item formats, session length)
    - UI language/L1 (cognate and loanword hints, a DIF covariate)
    - goal (content selection)
25. **Do not build a "learning styles" quiz** or visual/auditory-learner tracks; no support (Pashler et al. 2008). Instead, offer every learner multimodal items and adapt on *measured* skill gaps.
