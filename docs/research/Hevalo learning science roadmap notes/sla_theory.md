# Second Language Acquisition (SLA) Research Applied to App Design

**Method note (read first).** WebFetch was blocked in this environment, so every claim below comes from WebSearch result summaries and snippets (journal abstract pages, ERIC records, ResearchGate and Semantic Scholar listings, publisher PDFs as summarised by the search tool). I did not read any full paper myself. Where a number appeared only in a search summary and I could not cross-check it, it is marked **(snippet only)**. Evidence grades used throughout:
- **[MA]** meta-analysis or meta-regression
- **[RCT/Exp]** randomised or controlled experiment
- **[Obs]** observational or pre-post study without a control group
- **[Expert]** expert framework or opinion
- **[Vendor]** study run or funded by the app maker, or authored by its staff

Effect-size rules of thumb in SLA (Plonsky and Oswald's field-specific benchmarks; not retrieved in this session, so treat them as background): between-group d of about 0.40 is small, 0.70 medium and 1.00 large. These are higher than Cohen's general benchmarks. SLA meta-analyses also tend to report large effects partly because many primary studies are short, lab-based and test exactly what was taught.

---

## Q1. Comprehensible input, extensive reading/listening, output and interaction, task-based teaching: what do meta-analyses show?

### Takeaway
Every major acquisition route has meta-analytic support, with medium-to-large effects: large amounts of comprehensible meaning-focused input (extensive reading, d of about 0.46–0.57 against controls), interaction with feedback (d of about 0.71 immediately and 1.09 at delay), and task-based programmes (d = 0.93, revised down to g = 0.61 and disputed). The strong 1980s claim that input alone is sufficient and instruction is useless is superseded: input is necessary, but input combined with interaction, output and some focus on form beats input alone. Effects of interaction tend to grow over time, which matters for retention.

### Cited Findings
- **Extensive reading (ER), Nakanishi 2015, TESOL Quarterly [MA].** 34 studies, 43 effect sizes, N = 3,942. ER against control groups: d = 0.46 (medium). Pre-post: d = 0.71. — [Wiley/TESOL Quarterly](https://onlinelibrary.wiley.com/doi/10.1002/tesq.157); [Semantic Scholar](https://www.semanticscholar.org/paper/A-meta-analysis-of-extensive-reading-research-Nakanishi/fd0d8525de750844b2d94ff8c3e15637f7aa46ee)
- **ER, Jeon & Day 2016 [MA].** 49 studies. Between-group d = 0.57, pre-post d = 0.79, across reading comprehension, reading rate and vocabulary. — [ERIC full text](https://files.eric.ed.gov/fulltext/EJ1117026.pdf)
- Both ER meta-analyses report that ER is **more effective for older participants (adults) than for younger learners**. — [TEFLIN review of ER research](https://journal.teflin.org/index.php/journal/article/download/724/315/1643) (secondary summary)
- A newer ER meta-analysis appeared in *Educational Psychology Review* in 2025: "Learning a Language Through Reading: A Meta-analysis of Studies on the Effects of Extensive Reading on Second and Foreign Language Learning". Its numbers were not retrieved. — [ResearchGate](https://www.researchgate.net/publication/395882958_Learing_a_language_through_reading_A_meta-analysis_of_studies_on_the_effects_of_extensive_reading_on_second_and_foreign_language_learning)
- **Interaction, Mackey & Goo 2007 [MA].** 28 interaction studies, in and out of class. Interaction against no interaction: d = 0.71 (medium) on immediate post-tests and **d = 1.09 (large) on delayed post-tests**, so effects were clearer at delay. **(snippet only)** — [Semantic Scholar](https://www.semanticscholar.org/paper/Interaction-research-in-SLA-:-A-meta-analysis-and-Mackey-Goo/2b270feebe31f2f01e7c645cc00f8e94d504fb8b); [Lancaster record](https://research.lancaster-university.uk/en/publications/interaction-research-in-sla-a-meta-analysis-and-research-synthesi/)
- **Comprehension-based vs production-based grammar instruction, Shintani, Li & Ellis 2013, Language Learning [MA].** 35 research projects in 30 studies. Comprehension-based instruction was superior on immediate tests of *receptive* knowledge; the search summary gives d = 1.09. The comparison for productive knowledge was not retrieved. **(snippet only)** — [Wiley](https://onlinelibrary.wiley.com/doi/abs/10.1111/lang.12001); [Curtin open copy](https://espace.curtin.edu.au/bitstream/handle/20.500.11937/54469/253836.pdf?isAllowed=y&sequence=2)
- **Task-based language teaching (TBLT), Bryfonski & McKay 2019, Language Teaching Research [MA].** 52 studies. Overall d = 0.93 for TBLT programmes on a range of outcomes. — [SAGE](https://journals.sagepub.com/doi/abs/10.1177/1362168817744389)
  - **Superseded or contested:** Xuan, Cheung & Liu (technical comment, LTR, online 2022, issue 2025) criticised the loose inclusion criteria, the way outcome effect sizes were combined, and the neglect of moderators. Their re-analysis gives a more modest **g = 0.61**. — [SAGE](https://doi.org/10.1177/13621688221131127)
  - Boers & Faez 2023 (LTR) re-examined 16 of the studies plus newer ones. They concluded the field is "not yet ripe" for a meaningful meta-analysis of the relative effectiveness of task-based or task-supported programmes. — [SAGE](https://journals.sagepub.com/doi/10.1177/13621688231167573)
- A meta-analysis of *technology-mediated* TBLT exists (CALICO Journal, 2024/25). Its numbers were not retrieved. — [CALICO](https://utppublishing.com/doi/10.3138/calico-2024-0029)

### Inferences
- An app that delivers only short decontextualised items covers at most one of the routes with meta-analytic support. Large volumes of level-appropriate reading and listening, plus interaction with feedback, are the missing ingredients in most gamified apps.
- Interaction effects get *larger* at delayed testing, which suggests meaning-focused exchanges support retention ("sticking"), not just immediate performance.
- TBLT is promising, but the evidence is weaker than the headline d = 0.93 suggests. Treat it as "tasks work as a component" rather than "a pure task-based syllabus is proven superior".
- Superseded: Krashen's strong input hypothesis (comprehensible input is sufficient and conscious instruction has little value). The explicit-instruction and feedback meta-analyses in Q3 and Q4 contradict it. The weak form, that lots of comprehensible input is necessary, remains well supported.

### Gaps
- I found no meta-analysis isolating **extensive listening** from extensive reading. The incidental-vocabulary meta-analysis in Q2 covers listening for vocabulary only.
- Numbers for the 2025 *Educational Psychology Review* ER meta-analysis and the technology-mediated TBLT meta-analysis were not retrieved.
- No meta-analysis specifically on the **output hypothesis** (Swain) was found beyond the Shintani et al. comprehension-vs-production comparison.

---

## Q2. Vocabulary: frequency sequencing, lexical coverage thresholds, encounters needed, incidental vs intentional learning, formulaic sequences

### Takeaway
Comprehension depends heavily on knowing the words in a text. Learners need about **95% of running words known for minimal comprehension and about 98% for comfortable unassisted reading**, which in English corresponds to roughly 8,000 word families. Deliberate, word-focused study (flashcards, word lists) gives about four times the immediate gains of incidental learning (about 60% vs 9–18% of target words), but about a third to over half of those gains are lost by the delayed test unless they are spaced and repeated. Incidental learning from reading and listening is slow per word but scales with volume. Repetition matters (r = .34 between number of encounters and learning) and spacing matters (spaced beats massed practice). Glosses, especially L1 and multiple-choice glosses, and captions add measurable gains. Chunks are best learned as whole units.

### Cited Findings
**Lexical coverage**
- Laufer & Ravenhorst-Kalovski (2010) proposed two thresholds: **95% coverage for minimal comprehension and 98% for optimal comprehension**. Schmitt, Jiang & Grabe (2011) found a *linear* relationship between coverage and comprehension from 92% to 100%, not a cliff (r = .40). They suggest 98% may be needed if comprehension scores of 60% or more are the goal. — [ERIC review EJ1194237](https://files.eric.ed.gov/fulltext/EJ1194237.pdf); [Reading in a Foreign Language, "Lexical coverage and reading comprehension revisited"](https://scholarspace.manoa.hawaii.edu/bitstreams/be187723-ba8b-433c-9472-b3b4ac847b86/download) [Exp/correlational]
- About **8,000 word families** are needed for 98% coverage of written English. — [ERIC EJ1472063](https://files.eric.ed.gov/fulltext/EJ1472063.pdf) (secondary summary)
- **Listening:** van Zeeland & Schmitt (2013) treat 95% coverage as enough for "good but not necessarily complete" listening comprehension and 98% as ideal for very high comprehension. — [ERIC EJ1316858](https://files.eric.ed.gov/fulltext/EJ1316858.pdf) [Exp]
- Older status: Hu & Nation (2000) originally argued for 98%. Later work keeps 98% as the "ideal" but shows comprehension rises gradually rather than switching on at a threshold. — same sources as above.

**Repetition and spacing**
- **Uchihara, Webb & Yanagisawa 2019, Language Learning [MA, correlational].** 26 studies, 45 effect sizes, N = 1,918. Number of encounters is correlated with incidental vocabulary learning at **r = .34 (medium)**. Moderators include learner age and vocabulary size, **spaced learning, visual support, engagement**, and the range of encounters. — [Wiley](https://onlinelibrary.wiley.com/doi/abs/10.1111/lang.12343); [ERIC EJ1224114](https://eric.ed.gov/?id=EJ1224114)
- **Kim & Webb 2022, Language Learning [MA].** 48 experiments, 98 effect sizes, 3,411 learners. **Spaced practice was significantly more effective than massed practice**, with a medium-to-large effect. The search summary gives g = 1.15 on delayed tests and g = 0.76 for immediate learning. It also mentions immediate feedback g = 1.04 in a moderator analysis. **(snippet only; which comparison each g refers to was not clear in the summary)** — [ResearchGate](https://www.researchgate.net/publication/358406370_The_Effects_of_Spaced_Practice_on_Second_Language_Learning_A_Meta-Analysis)
- A follow-up study asks whether spacing works equally for fill-in-the-blanks vs flashcards. Its results were not retrieved. — [ResearchGate](https://www.researchgate.net/publication/376584142_Does_spaced_practice_have_the_same_effects_on_different_second_language_vocabulary_learning_activities_Fill-in-the-blanks_versus_flashcards)

**Incidental vs intentional**
- **Incidental learning (Language Teaching 2023, Uchihara and colleagues) [MA].** 24 studies, 29 effect sizes, N = 2,771. Large overall effects, but small absolute gains: **9–18% of target words learned on immediate tests and 6–17% on delayed tests**.
  - By mode (immediate/delayed): reading 17%/15%, listening 15%/13%, reading-while-listening 13%/17%, viewing 7%/5%.
  - **Narrative texts beat expository texts.**
  - Whether material was written for L1 or for L2 readers was a significant moderator.
  - — [Cambridge Core](https://www.cambridge.org/core/journals/language-teaching/article/how-effective-is-second-language-incidental-vocabulary-learning-a-metaanalysis/E38E3468FD2090B1FA3051051DE8E70C); [ERIC EJ1373102](https://eric.ed.gov/?id=EJ1373102)
- **Intentional learning, Webb, Yanagisawa & Uchihara 2020, Modern Language Journal [MA].** 22 studies, 100 effect sizes, covering flashcards, word lists, writing and fill-in-the-blanks.
  - Immediate gains: **60.1% (meaning recall) and 58.5% (form recall)**.
  - Delayed gains fall to **39.4% (meaning recall) and 25.1% (form recall)**.
  - — [Wiley](https://onlinelibrary.wiley.com/doi/abs/10.1111/modl.12671); [ERIC EJ1277328](https://eric.ed.gov/?id=EJ1277328)

**Glosses and captions**
- **Glossing, Yanagisawa, Webb & Uchihara 2020, SSLA [MA, meta-regression].** 42 studies, 359 effect sizes, N = 3,802.
  - Glossed reading: 45.3% immediate and 33.4% delayed. Unglossed reading: 26.6% and 19.8%.
  - **Multiple-choice glosses were most effective** (the learner picks the meaning from options), followed by marginal, hyperlinked, glossary, interlinear and in-text glosses.
  - **L1 glosses gave about 4.0 percentage points more than L2 glosses**, with no interaction with proficiency.
  - No significant difference between textual, pictorial and auditory glosses.
  - — [ERIC EJ1251024](https://eric.ed.gov/?id=EJ1251024); [author preprint](https://takumiuchihara.weebly.com/uploads/1/2/3/7/123756989/yanagisawa-webb-uchihara-2019-glossing_meta-analysis.pdf)
- **Captioned viewing, Kurokawa et al. 2025, Language Learning [MA].** 49 studies, 89 effect sizes.
  - Captioned vs uncaptioned viewing: **g = 0.56**, which is 3.11–4.55% more target words learned.
  - **Videos made for L2 learners: g = 1.04. Videos made for native speakers: g = 0.46.**
  - **Primary-school learners: g = 1.36**, against g = 0.44 for secondary and university learners.
  - — [Wiley](https://onlinelibrary.wiley.com/doi/10.1111/lang.12697); [author copy](https://takumiuchihara.weebly.com/uploads/1/2/3/7/123756989/kurokawa_et_al.__2024_.pdf)

**Formulaic sequences (chunks)**
- Boers and colleagues found that studying verb-noun collocations **as whole units**, rather than attending to their individual words, was most effective, with gains in form recall and meaning recall. [Exp] — [ERIC EJ1174070, "Learning and teaching L2 collocations"](https://files.eric.ed.gov/fulltext/EJ1174070.pdf)
- Webb, Newton & Chang manipulated how often 18 collocations appeared in a graded reader (1, 5, 10 or 15 times), read while listening. The search summary describes the design only; the outcome numbers were not retrieved. [Exp] — [ResearchGate chapter listing](https://www.researchgate.net/publication/259428229_Experimental_and_Intervention_Studies_on_Formulaic_Sequences_in_a_Second_Language)
- A meta-analysis on the **processing advantage of multiword sequences** (SSLA) and a meta-analysis on the **effectiveness of L2 collocation instruction** (IRAL; 64 research projects in 17 studies, per the snippet) exist. Their effect sizes were not retrieved. — [SSLA](https://www.cambridge.org/core/journals/studies-in-second-language-acquisition/article/abs/processing-advantage-of-multiword-sequences-a-metaanalysis/64D9BFF2B458422C8CCE202A520F914A); [IRAL/De Gruyter](https://www.degruyterbrill.com/document/doi/10.1515/iral-2021-0218/pdf?lang=en)
- Familiarity with formulaic language speeds up processing of multiword combinations, which supports receptive fluency. — [ERIC EJ1174070](https://files.eric.ed.gov/fulltext/EJ1174070.pdf) (review)

### Inferences
- Deliberate study gives about four times the immediate yield of incidental exposure, but it decays steeply, especially for **form recall** (58.5% to 25.1%). An app therefore needs both:
  - deliberate study with spaced retrieval, to build the high-frequency core fast;
  - large volumes of input, to supply the repeated, varied encounters that consolidate words and build depth (collocations, grammar in context).
- Because comprehension rises roughly linearly with coverage, text "readability" for a learner can be computed as the share of a text's tokens in that learner's known-word set. Texts should be served at **95% or more coverage with glosses available** and **98% or more for fluency or speed reading**.
- Since narrative beats expository text and L2-targeted materials beat native materials, *simplified stories written for learners* are the highest-yield reading and listening input.
- Frequency-based sequencing follows from the coverage logic: the most frequent words give the most coverage per word learned. However, I did not retrieve a source quantifying this for Kurdish specifically (see Gaps).

### Gaps
- **Number of encounters needed.** The commonly cited "about 10+ encounters" (often attributed to Webb 2007) could not be verified in this session. The 2019 meta-analysis gives a correlation, not a threshold, and finds the effect depends on spacing and engagement.
- **Frequency coverage figures** (for example "the top 1,000/2,000 word families cover about X% of text") were not retrieved for English. **No frequency list or coverage figures for Kurmanji or Sorani were found.** Corpus work would be needed.
- Effect sizes for the formulaic-sequence and collocation meta-analyses were not retrieved.

---

## Q3. Grammar: explicit vs implicit instruction, focus on form, input processing, durability

### Takeaway
Across five meta-analyses from 2000 to 2024, **explicit instruction** (giving or eliciting the rule) produces larger immediate effects than **implicit instruction** (exposure, input flood, recasts without explanation). The size of that advantage has shrunk in later syntheses. The most recent large synthesis (Kang, Sok & Han 2019) finds both have large immediate effects, with **implicit instruction showing more durable effects**. Outcome measures that tap explicit knowledge inflate the explicit advantage. The practical consensus: brief explicit explanation **plus** plenty of meaningful, comprehension-first practice and feedback.

### Cited Findings
- **Norris & Ortega 2000 [MA]** (the first major synthesis; now *older*):
  - 29 implicit treatments: **d = 0.54**.
  - 69 explicit treatments: a "substantially larger" effect. The exact explicit figure was not retrieved in this session; see Gaps.
  - — [ResearchGate: Effectiveness of L2 Instruction](https://www.researchgate.net/publication/228003219_Effectiveness_of_L2_Instruction_A_Research_Synthesis_and_Quantitative_Meta-analysis); [KCI review article (Modern English Education 2020)](https://journal.kci.go.kr/meeso/archive/articlePdf?artiId=ART002651180)
- **Spada & Tomita 2010, Language Learning [MA].** **(snippet only)**
  - Explicit instruction: d = 0.88 for complex forms and d = 0.73 for simple forms.
  - Implicit instruction: d = 0.39 for complex forms and d = 0.33 for simple forms.
  - — [KCI review](https://journal.kci.go.kr/meeso/archive/articlePdf?artiId=ART002651180); [Scribd copy of Spada & Tomita](https://www.scribd.com/doc/309585941/spada-et-al-2010-language-learning)
- **Goo et al. 2015 [MA].** 34 studies. Implicit instruction showed a higher mean effect than in Norris & Ortega and Spada & Tomita, which prompted a partial revision of the earlier "explicit dominates" conclusion. Explicit instruction remained ahead. — [KCI review](https://journal.kci.go.kr/meeso/archive/articlePdf?artiId=ART002651180)
- **Kang, Sok & Han 2019, Language Teaching Research [MA].** 54 studies, 15 of them overlapping with Norris & Ortega. **Both explicit and implicit instruction had large immediate effects; implicit instruction had longer-lasting effects.** — [KCI review](https://journal.kci.go.kr/meeso/archive/articlePdf?artiId=ART002651180)
- **"Explicit Versus Implicit Instruction: A Meta-Analysis of Comparative Studies"** (about 2020; ResearchGate listing, likely a Korean journal):
  - Immediate: explicit g = 1.361 vs implicit g = 0.830.
  - The explicit advantage persisted at 8–9-day and 30-day delays, but **k < 10 at those delays, too few for valid conclusions**.
  - **Conflict:** this "explicit stays ahead at delay" result sits in tension with Kang et al.'s "implicit more durable". Both rest on thin delayed-test data. **(snippet only)**
  - — [ResearchGate](https://www.researchgate.net/publication/347408013_Explicit_Versus_Implicit_Instruction_A_Meta-Analysis_of_Comparative_Studies)
- **Li 2024, Foreign Language Annals [MA]**, "Effects of different forms of explicit instruction on L2 development". This is the most recent synthesis found. Its findings were not retrieved. — [Wiley](https://onlinelibrary.wiley.com/doi/10.1111/flan.12726)
- **Comprehension-based (input-processing-style) instruction vs production-based instruction:** comprehension-based instruction was superior for receptive knowledge on immediate tests (Shintani, Li & Ellis 2013; see Q1). [MA] — [Wiley](https://onlinelibrary.wiley.com/doi/abs/10.1111/lang.12001)
- **Test type matters.** Bowles (2011) showed that L2 classroom learners score higher on tasks that maximise explicit knowledge, while heritage speakers score lower on those but better on implicit or oral tasks. Measured "learning" therefore depends on how explicit the test is. [Exp] — [Montrul, EUROSLA Yearbook 2012](http://www.eurosla.org/Docs/Yearbook2012/Montrul.pdf); [Cambridge Handbook chapter "Instructed Heritage Language Acquisition"](https://www.cambridge.org/core/books/abs/cambridge-handbook-of-heritage-languages-and-linguistics/instructed-heritage-language-acquisition/CDF1A617D1D04A7B9C8B07308BD37AF9)
- An Applied Linguistics study with an artificial mini-language found implicit vs explicit training differentially affected *fluency* of production. The details were not retrieved. [Exp] — [Applied Linguistics](https://academic.oup.com/applij/article/42/4/668/6009751)

### Inferences
- For an app, "explicit" should mean **short, targeted rule explanations** (in the learner's UI language), delivered just before or during meaningful practice. Long grammar lectures are not supported by these findings, and there is no evidence that more explanation beats less.
- Since implicit or meaning-focused learning appears more durable, and explicit learning gives the fast start, the course should **pair each explicit rule with input-based practice**: structured input, where learners must process the form to get the meaning, before production.
- In-app quizzes that only test explicit knowledge (for example "pick the right ending") will overstate progress. Include time-pressured or meaning-focused measures to see real acquisition.

### Gaps
- The exact explicit-instruction d in Norris & Ortega 2000 (widely cited as about 1.13) and the Goo et al. 2015 and Kang et al. 2019 point estimates were **not retrieved**, so I do not report them.
- Results of the Li 2024 explicit-instruction meta-analysis were not retrieved.
- No meta-analytic evidence was found on **processing instruction** (VanPatten) specifically.
- No research was found on grammar instruction for **Kurdish** specifically.

---

## Q4. Corrective feedback (recasts, prompts, metalinguistic): meta-analytic effects and app implementation

### Takeaway
Corrective feedback (CF) reliably helps: **d of about 0.61–0.64 overall**, and the effect holds over time (Li 2010). **Prompts**, which push the learner to self-correct (clarification requests, metalinguistic clues, elicitation), outperform **recasts**, which simply give the correct form (Lyster & Saito 2010). Explicit feedback gives bigger immediate effects; implicit feedback is better maintained. Younger learners benefit more. For pronunciation, automatic speech recognition (ASR) feedback gives a medium effect (g = 0.69), larger when the feedback is explicit (g = 0.86) and when learners practise with a peer (g = 0.89 vs 0.44 alone). Chatbots and generative-AI conversation partners show medium effects (g of about 0.58–0.61), but the studies are short and novelty-prone.

### Cited Findings
- **Li 2010, Language Learning [MA].** 33 studies (22 published, 11 dissertations).
  - Overall **d = 0.61 (fixed effects) and 0.64 (random effects)**, medium.
  - **The effect was maintained over time.**
  - Explicit feedback beat implicit feedback immediately, but **implicit feedback was better maintained**.
  - Lab studies showed larger effects than classroom studies, shorter treatments larger than longer ones, and foreign-language contexts larger than second-language contexts.
  - — [Wiley](https://onlinelibrary.wiley.com/doi/abs/10.1111/j.1467-9922.2010.00561.x); [ResearchGate](https://www.researchgate.net/publication/229940242_The_Effectiveness_of_Corrective_Feedback_in_SLA_A_Meta-Analysis)
- **Lyster & Saito 2010, SSLA [MA].** 15 classroom studies, N = 827.
  - Oral CF significantly helps, **especially prompts rather than recasts**.
  - **Younger learners benefited more than older learners.**
  - The search summary gives recasts d = 0.70 and prompts d = 1.14. **(snippet only)**
  - — [ResearchGate](https://www.researchgate.net/publication/234580927_Oral_Feedback_in_Classroom_SLA_A_Meta-Analysis)
- **Timing.** A study of immediate vs delayed CF in video-based computer-mediated communication was published in LTR 2025 (Canals, Granena, Yilmaz & Malicka). Its results were not retrieved. [Exp] — [SAGE](https://journals.sagepub.com/doi/10.1177/13621688211052793)
- **ASR for pronunciation, Ngo, Chen & Lai, ReCALL (2023/2024) [MA].** 15 studies, 38 effect sizes, 2008–2021.
  - Overall **g = 0.69**.
  - Explicit CF: g = 0.86. Indirect feedback: g = 0.50.
  - Practising **alone: g = 0.44. With a peer: g = 0.89.**
  - — [Cambridge/ReCALL](https://www.cambridge.org/core/journals/recall/article/effectiveness-of-automatic-speech-recognition-in-eslefl-pronunciation-a-metaanalysis/A915444CF252B61D14961D2FE733822D)
- **Computer-assisted pronunciation training (CAPT), Almusharraf 2024, Journal of Computer Assisted Learning [MA].** Medium overall effect; large when used inside classrooms. — [Wiley](https://onlinelibrary.wiley.com/doi/10.1111/jcal.12974)
- **Chatbots, Lyu 2025, International Journal of Applied Linguistics [MA].** 31 studies, 41 effect sizes. **g = 0.608.** — [Wiley](https://onlinelibrary.wiley.com/doi/full/10.1111/ijal.12668)
- **Generative-AI chatbots, Li 2025, Journal of Computer Assisted Learning [MA].** ES = **0.576** (95% CI 0.385–0.768). Moderators included ChatGPT use, vocabulary as the target, and **interventions of 1–7 days, which had a large moderating effect**. That is a warning sign for novelty effects and short-term measurement. — [Wiley](https://onlinelibrary.wiley.com/doi/10.1111/jcal.70060?af=R)
- **Dialogue-based CALL systems for speaking, ReCALL [MA, three-level].** **g = 0.61** (95% CI 0.34–0.89) on L2 speaking development. — [Cambridge/ReCALL](https://www.cambridge.org/core/journals/recall/article/dialoguebased-computerassisted-language-learning-systems-for-second-language-speaking-development-a-threelevel-metaanalysis/31847710516602398819C5E594038E7B)
- A meta-analysis of feedback in CALL (TESL-EJ vol. 24) and several written-CF meta-analyses exist. Their numbers were not retrieved. — [TESL-EJ](https://tesl-ej.org/wordpress/issues/volume24/ej94/ej94a4/); [TESL-EJ written CF](https://tesl-ej.org/wordpress/issues/volume24/ej95/ej95a3/)

### Inferences
- The default "red X plus the correct answer" in most apps is essentially a **recast** (or explicit correction), the weaker type in classroom data. A **prompt-first** design is better supported: first give a hint or metalinguistic clue and let the learner retry, then show the answer.
- Because explicit feedback wins short term and implicit feedback holds longer, a sensible app policy is:
  - explicit metalinguistic feedback on new forms;
  - lighter-touch feedback (highlight only, or recast) on forms the learner has seen many times.
- Peer-plus-ASR beating solo ASR (0.89 vs 0.44) supports using social features (friends, multiplayer) for speaking practice rather than solo pronunciation drills alone.
- Chatbot evidence is promising but mostly short-term, and largely in English. Generalising to a lower-resource language such as Kurdish is untested.

### Gaps
- I found no studies of ASR or LLM feedback quality **for Kurdish (Kurmanji or Sorani)**. ASR accuracy for low-resource languages is a known risk, but I have no source here.
- No meta-analytic estimate was found for immediate vs delayed CF timing in apps. The Kim & Webb feedback-timing moderator is ambiguous in its snippet.
- No retrieved data on typed vs spoken CF modality in apps.

---

## Q5. Translation exercises vs meaning-focused tasks; L1 use; evidence on gamified apps like Duolingo

### Takeaway
L1 support is **helpful for vocabulary**: L1 explanations beat L2-only explanations, especially for children, and L1 glosses beat L2 glosses by about 4 percentage points. That argues against an "L2-only" dogma. I found no rigorous evidence on translation-heavy app exercises themselves; criticisms of them come mostly from bloggers. On Duolingo, the evidence base has grown and become more rigorous (ACTFL-rated tests, a 2026 SSLA three-arm comparison), but most outcome studies are **vendor-affiliated pre-post designs without control groups**. They consistently show:
- reasonable **reading** gains;
- weaker **listening** than reading;
- weakest **speaking** (only 53–66% reaching A2 speaking in Duolingo's own report).
The independent SSLA comparison found Duolingo about as effective as a beginner classroom for French over the study period, with a classroom-plus-Duolingo advantage only for pragmatics (tu/vous).

### Cited Findings
**L1 and translation**
- **Lee & Macaro 2013, Modern Language Journal [Exp].** 443 elementary-school children and 286 university students (Korean learners of English). **L1 (Korean) explanations of vocabulary led to better acquisition and retention than English-only**, with **larger benefits for young learners**. Students wanted mostly L2 instruction, with L1 as an aid for memorising vocabulary and explaining difficult concepts. — [Wiley](https://onlinelibrary.wiley.com/doi/10.1111/j.1540-4781.2013.12044.x); [ResearchGate review of L1 use](https://www.researchgate.net/publication/337008861_An_updated_review_on_use_of_L1_in_foreign_language_classrooms)
- Lee & Levine 2020 (LTR) studied instructor language choice effects on vocabulary and listening comprehension. Details were not retrieved. — [SAGE](https://journals.sagepub.com/doi/abs/10.1177/1362168818770910)
- L1 glosses give about 4.0 points more than L2 glosses (see Q2). [MA] — [ERIC EJ1251024](https://eric.ed.gov/?id=EJ1251024)
- Claims that translation-heavy app design holds learners back come from **blogs, not research** [Expert opinion, low quality]. — [Anywhere Immersion blog](https://www.anywhereimmersion.com/blog/duolingo). I found **no** reliable documentation of Duolingo removing translation exercises.

**Duolingo and app efficacy (chronological)**
- **Loewen et al. 2019, ReCALL [Obs, university researchers].** 9 learners of Turkish over one semester. They improved, and time on Duolingo correlated moderately with gains. Gains were **stronger in written skills (reading, writing) than oral skills (listening, speaking)**. — [ERIC EJ1226279](https://eric.ed.gov/?id=EJ1226279); [ResearchGate](https://www.researchgate.net/publication/333431833_Mobile-assisted_language_learning_A_Duolingo_case_study)
- **Loewen et al. 2020, Foreign Language Annals (Babbel, Spanish) [Obs; Babbel-commissioned per MSU coverage].** About **69% of participants improved noticeably on an oral proficiency interview** despite limited speaking opportunities in the app. **Hours of use predicted learning on all tests.** — [ResearchGate](https://www.researchgate.net/publication/341904580_The_effectiveness_of_app-based_language_instruction_for_developing_receptive_linguistic_knowledge_and_oral_communicative_ability); [MSU Today](https://msutoday.msu.edu/news/2020/04/how-effective-are-language-learning-apps)
- **Jiang et al. 2021, Foreign Language Annals [Obs/Vendor; authors include Duolingo staff].**
  - Adults who completed beginning-level Duolingo Spanish or French courses took ACTFL reading and listening tests.
  - They scored **comparably to university students after four semesters**, in roughly half the time.
  - **Listening proficiency was significantly lower than reading**, mirroring university students.
  - No randomised control group.
  - — [Wiley/FLA](https://onlinelibrary.wiley.com/doi/full/10.1111/flan.12600); [ResearchGate](https://www.researchgate.net/publication/357763104_Evaluating_the_reading_and_listening_outcomes_of_beginning-level_Duolingo_courses)
- **Smith, Jiang & Peters 2024, Language Learning & Technology 28(1) [Obs/Vendor; Jiang and Peters are Duolingo researchers].**
  - n = 48 independent learners of Duolingo Spanish, 3 months, about **27 hours (about 2.25 hours per week)**.
  - Significant gains on all receptive and productive measures.
  - Reading reached **ACTFL Intermediate Low**; listening reached **Novice High**.
  - Gains were linked to session completion, accuracy rate and positive user experience.
  - — [LLT](https://www.lltjournal.org/item-detail/1152/); [ScholarSpace PDF](https://scholarspace.manoa.hawaii.edu/server/api/core/bitstreams/ea47a53e-da6e-4419-bd55-e72b458294f4/content)
- **Duolingo speaking report (Kittredge et al. 2024, DRR-24-01) [Vendor].** 140 beginner learners of English, Spanish and French. **Only 66% of Spanish learners and 53% of French learners reached A2 speaking or higher.** — [Duolingo whitepaper](https://duolingo-papers.s3.amazonaws.com/reports/Duolingo_whitepaper_language_conversation_2024.pdf) **(snippet only)**
- Duolingo also published a 2024 report claiming its "Path" meets expectations for reading, listening, writing and speaking outcomes [Vendor]. Details were not retrieved. — [Duolingo whitepaper](https://duolingo-papers.s3.amazonaws.com/reports/Duolingo_whitepaper_language_read_listen_write_speak_2024.pdf)
- **SSLA 2026, "Comparing the effectiveness of Duolingo, Classroom instruction, and Classroom + Duolingo instruction conditions on beginner-level French language development" [quasi-experimental, three arms; authors and funding not retrieved].**
  - All three groups improved significantly on nearly all measures, with **similar magnitudes**.
  - The exception was ***tu* vs *vous*** (pragmatics), where Classroom + Duolingo outperformed both single conditions.
  - — [Cambridge/SSLA](https://www.cambridge.org/core/journals/studies-in-second-language-acquisition/article/comparing-the-effectiveness-of-duolingo-classroom-instruction-and-classroom-duolingo-instruction-conditions-on-beginnerlevel-french-language-development/68C0E7E296669798089C84CDC7F3BB9E)
- **Shortt et al. 2023, Computer Assisted Language Learning [systematic review].** Reviews Duolingo literature from 2012 to early 2020 (methods, frameworks, settings, outcomes). Its conclusions were not retrieved beyond scope. — [ERIC EJ1386218](https://eric.ed.gov/?id=EJ1386218)
- An independent-research concern is noted by the vendor's own framing: Jiang et al. explicitly set out to address "insufficient involvement from independent researchers and lack of rigor in the instruments" in earlier app-efficacy research. — [Wiley/FLA](https://onlinelibrary.wiley.com/doi/full/10.1111/flan.12600)
- Plonsky and colleagues studied how frequency, duration and intensity of Duolingo use relate to L2 learning (Journal of Second Language Studies). Results were not retrieved. — [JSLS](https://www.jbe-platform.com/content/journals/10.1075/jsls.00021.plo)

### Inferences
- Gamified apps *can* produce real, ACTFL-measurable **reading** gains within tens of hours. The consistent weakness is **listening and especially speaking**. This matches the SLA prediction that input and output practice under real-time pressure is under-supplied by tap-to-answer items.
- "Time on app" predicts gains across several studies. Engagement mechanics (streaks, leagues) matter, but only insofar as the time is spent on productive activities.
- The SSLA finding (app about equal to a beginner classroom) suggests a well-designed app can replace early classroom instruction for basic morphosyntax and vocabulary. Pragmatics such as register benefits from added human interaction.
- Using L1 for meaning (glosses, brief explanations) is evidence-based, especially for children and beginners. The case for *reducing* translation as learners progress rests on the four-strands and comprehension-based logic (Q1, Q6), not on direct evidence against translation exercises.

### Gaps
- **No independent RCT** of Duolingo with a no-treatment control and long-term (6+ month) retention was found. Most studies have **no comparison with what learners would otherwise have done**, and suffer from survivorship (only completers tested).
- Early vendor claims (for example the 2012 "34 hours = one college semester" study) were not searched and should be treated as superseded by the ACTFL-based studies above.
- No efficacy research was found on any **Kurdish-learning app**.

---

## Q6. Nation's Four Strands: how balanced should an app be?

### Takeaway
Paul Nation's Four Strands framework (2007) recommends **roughly equal time** for:
1. meaning-focused input (reading and listening for meaning);
2. meaning-focused output (speaking and writing to communicate);
3. language-focused learning (deliberate study of words, grammar, pronunciation);
4. fluency development (fast use of already-known material).

So **no more than about 25% of total learning time** should be deliberate item study. This is an expert framework grounded in the research above, not an experimentally tested ratio.

### Cited Findings
- Nation's framework categorises learning into meaning-focused input, meaning-focused output, language-focused learning and fluency development, which "should get roughly the same amount of time". It states that **"no more than 25 per cent of the learning time in and out of class should be given to the direct study of language items."** [Expert] — [Cambridge Papers in ELT, "Time for Speaking" (2017)](https://www.cambridge.org/us/files/8415/7488/4554/CambridgePapersinELT_TimeForSpeaking_2017_ONLINE.pdf); [TESL Ontario](https://contact.teslontario.org/?p=2244)
- Fluency development means using **familiar** language quickly and confidently, with no new items. [Expert] — [TESL Ontario](https://contact.teslontario.org/?p=2244)
- Applied evaluations of coursebooks use the four strands as an audit framework ("parity of learning tasks"). [Obs] — [ELT Forum / UNNES](https://journal.unnes.ac.id/sju/elt/article/view/77174)

### Inferences
- Typical gamified-app lessons (match, translate, pick the word, arrange tiles) are almost entirely **language-focused learning**, so by Nation's yardstick they cover about 25% of a balanced diet.
- Meaning-focused input is supported by the ER, incidental-vocabulary and caption meta-analyses. Meaning-focused output and interaction are supported by Mackey & Goo and the CF studies. Fluency is supported by formulaic-processing research. The framework is therefore a useful audit tool even though the equal split itself is not experimentally validated.
- An app does not have to deliver all four strands *inside lessons*. It can route learners to readers, audio, conversation partners and speed games, and count those minutes toward a balanced weekly mix.

### Gaps
- I found **no empirical test of the 25/25/25/25 split** against other ratios. It remains expert opinion.
- I found no published audit of Duolingo or similar apps against the four strands.

---

## Implications for Hevalo

### Takeaway
Hevalo's current feature set (lessons and course map, alphabet module, word games, dictionary, community feed, social and gamification) is strong on **language-focused learning** and **motivation**. It is weakest, by the research, on four things: **level-appropriate meaning-focused input** (graded reading and listening), **feedback that makes the learner self-correct**, **spaced re-encounter of items**, and **meaning-focused output and interaction**. The items below are ordered by strength of evidence and expected impact. Kurdish-specific claims are marked where unsourced.

### Concrete design implications (with the evidence each rests on)

**A. Build a meaning-focused input engine: graded readers and listening (Q1, Q2)**
1. **Graded reader and audio-story library for Kurmancî and Soranî, levelled by vocabulary frequency.** Prioritise *narrative* texts written *for learners*: folk tales, children's stories, daily-life dialogues.
   - Evidence: ER d of about 0.46–0.57 [MA]. Narrative > expository and L2-targeted > native material for incidental vocabulary [MA]. Captions for L2-targeted videos g = 1.04 vs 0.46 for native-targeted [MA].
2. **Per-learner coverage meter.** Keep a known-word model per learner (from lessons, SRS reviews and dictionary look-ups). Show a text as "readable for you" when about **95% or more of its tokens are known (assisted, with glosses)**, and use about **98% or more for fluency or speed reading**.
   - Apply the same filter to the **community feed**, so stories and poems are tagged by estimated level and learners see "posts you can read".
   - Evidence: 95/98% coverage thresholds [Exp/correlational].
3. **Reading-while-listening by default.** Record or synthesise audio for every reader, with sentence-level highlighting.
   - Evidence: reading-while-listening gains match reading-only gains, 13%/17% immediate/delayed [MA]. Listening lags reading in app-efficacy data (Jiang 2021; Smith et al. 2024), so extra aural input is the main gap to close.
   - This especially helps heritage learners, who often understand speech better than they read (Bowles 2011, via Montrul).
4. **Captioned short videos and animations for kids.** Use Kurdish captions (same-language captions, not translations).
   - Evidence: captions g = 0.56 overall and **g = 1.36 for primary-school learners** [MA].

**B. Reading support that teaches: smart glossing (Q2, Q5)**
5. **Tap-to-gloss in every reader, feed post and lesson sentence**, pulling from the 400k-word dictionary. Show the gloss **in the learner's UI language** (en, ar, tr, de, fr, es, nl…), not in Kurdish.
   - Evidence: L1 glosses about +4 points over L2 glosses; glossed reading 45% vs 27% immediate [MA].
6. **Offer "guess first" multiple-choice glosses.** On tap, show 2–3 candidate meanings before revealing the answer, then add the word to review.
   - Evidence: multiple-choice glosses were the most effective gloss type [MA].
7. **One-tap "add to my review deck"** from the dictionary, the reader and community posts, so incidental encounters feed deliberate spaced study.

**C. Vocabulary sequencing and spaced retrieval (Q2)**
8. **Build Kurmancî and Soranî frequency lists from a corpus** (for example news, Wikipedia, community posts, transcribed speech) and sequence lesson vocabulary by frequency band.
   - Do not use Wiktionary headword order: the 400k entries are a reference resource, not a syllabus.
   - Keep separate lists per dialect and script; a corpus is needed because no published Kurdish coverage figures were found (Gap).
9. **Spaced retrieval scheduler for every taught word and chunk**, revisited across days rather than within one lesson.
   - Track **form recall** (typing or spelling the Kurdish word) separately from **meaning recall**, because form recall decays fastest (58.5% to 25.1%) [MA].
   - Evidence: spaced > massed, medium-to-large effects [MA].
10. **Guarantee repeated, varied encounters.** Each new word should reappear across lessons, readers and games in different contexts.
    - Evidence: encounters correlate with learning at r = .34, moderated by spacing, visual support and engagement [MA].
    - Use the existing games (Wordle, typing race, quiz) as *review delivery* for the learner's due words, not random words.
11. **Teach chunks as whole units**: greetings, fixed expressions, frequent verb-noun collocations, light-verb constructions. Give them their own cards and audio.
    - Evidence: holistic collocation study beat word-by-word study [Exp]; formulaic sequences speed processing [review].
    - Turn "rhyme match" into a "chunk match" or "collocation match" game mode.

**D. Grammar: brief explicit explanation plus comprehension-first practice (Q3)**
12. **Add 30–60-second explicit "grammar notes" per unit**, in the UI language, for Kurdish features learners struggle with. The candidates below are **not sourced in these notes; standard descriptive-grammar knowledge, to be checked by Kurdish linguists**:
    - Kurmancî: ezafe, oblique case, gender agreement, past-tense ergative alignment.
    - Soranî: clitic pronouns, ezafe, definiteness suffixes.
    - Evidence: explicit instruction gives larger immediate effects across five meta-analyses [MA].
13. **Follow each note with input-processing items before production items.** Example: "Who did the action, A or B?" items where the learner must notice the case or agreement marker to answer.
    - Evidence: comprehension-based > production-based on immediate receptive tests [MA]; implicit or meaningful practice more durable (Kang et al. 2019) [MA].
14. **Measure grammar with meaning-focused and timed items as well as rule items.** Explicit-only tests overstate acquisition (Bowles 2011; Norris & Ortega measurement concern).

**E. Feedback that makes learners self-correct (Q4)**
15. **Prompt-first error handling.** On a wrong answer:
    - first show a **targeted hint or metalinguistic clue** (for example "check the vowel: ê vs e", "this verb is past transitive: who takes the oblique?", "Soranî: the pronoun attaches to…") and allow one retry;
    - only then show the model answer (the recast).
    - Evidence: prompts > recasts, d of about 1.14 vs 0.70 (snippet only) [MA]; CF overall d of about 0.61–0.64 and durable [MA].
16. **Error-type diagnosis for typed answers.** Distinguish missing diacritics (ç ş ê î û), Arabic-script letter confusions in Soranî, word order and wrong ending, and give feedback specific to the error type. Do not mark everything simply "wrong".
17. **Fade explicitness with familiarity.** Use explicit metalinguistic feedback on newly taught forms and lighter-touch feedback later.
    - Evidence: explicit feedback gives bigger short-term effects, implicit feedback is better maintained [MA].
18. **Children get more feedback, not less.** Make it encouraging and specific.
    - Evidence: younger learners benefited more from CF [MA].

**F. Meaning-focused output and interaction (Q1, Q4, Q6)**
19. **End each course-map unit with a communicative "task"** rather than another drill: describe a picture to a friend, plan a Newroz picnic, introduce your family, leave a voice message for a relative. Allow completion with a friend via DMs or voice notes, or with an AI partner.
    - Evidence: interaction d of about 0.71 immediate and 1.09 delayed [MA]; tasks g of about 0.61 (contested) [MA].
20. **Peer speaking modes in multiplayer and friends**: picture-description battles, "describe-and-guess" (information gap), and paired pronunciation challenges scored by ASR plus peer rating.
    - Evidence: ASR with a peer g = 0.89 vs alone g = 0.44 [MA].
21. **AI conversation partner, piloted cautiously.** It should:
    - run scripted, task-based role-plays at the learner's level, giving prompts or recasts on errors;
    - be restricted to one dialect per session, so Kurmancî and Soranî are not mixed;
    - be evaluated over weeks, not days, because chatbot meta-analytic gains are partly short-intervention or novelty effects.
    - Evidence: chatbots g of about 0.58–0.61 [MA].
    - Kurdish LLM and ASR quality is unverified (Gap).
22. **Writing prompts in the community feed, levelled by unit** ("write 3 sentences about your weekend using the past tense"), with peer reactions and optional AI or teacher corrections. This turns the feed into structured meaning-focused output, not just free posting.

**G. Fluency development (Q6)**
23. **Re-purpose speed games as fluency practice with known material only.** The typing race, timed quiz and speed-reading rounds should draw on words and chunks the learner already knows well (high SRS strength), at increasing speed.
    - Evidence: fluency uses only familiar language [Expert, Nation].
24. **Timed re-reading of easy texts (about 98% or more coverage)** and "say it faster" repeat-after-me audio drills.

**H. Balance, measurement, learner groups**
25. **Track minutes per strand per learner** (input, output, language-focused, fluency). Nudge toward balance, for example "you've done lots of drills this week; read a short story?", and reward balanced weeks with XP or Zêr, not only lesson completions.
    - Evidence: Nation's ≤25% direct-study guideline [Expert].
    - Gamification should pay out for reading, listening and speaking minutes, since time on app predicts gains only if the time is spent on productive activities [Obs].
26. **Placement and tracks for heritage learners.** Offer a diagnostic that separately measures listening and speaking comprehension and script literacy (Hawar Latin; Soranî Arabic script).
    - Heritage learners can skip early oral units and focus on literacy, spelling, ezafe and other morphology they use but cannot label, and formal register.
    - Evidence: heritage speakers do better on implicit or oral tasks and worse on explicit tasks than L2 learners; explicit instruction improves heritage learners' accuracy (Montrul & Bowles) [Exp].
27. **Kids mode.** Include:
    - more pictures, audio and captions (primary g = 1.36 for captions);
    - L1 support for word meaning (Lee & Macaro: young learners benefit more from L1 links);
    - extensive *read-along* audio stories rather than silent extensive reading (ER effects are larger for older learners);
    - frequent, warm corrective feedback.
28. **Measure real proficiency, not XP.**
    - Add periodic CEFR-aligned checkpoints covering reading, listening and short speaking tasks (can-do statements), with delayed re-tests of earlier content.
    - Report results internally per feature.
    - Plan an independent evaluation, ideally with a comparison group, given the field's criticism of vendor-only efficacy evidence.
    - Pay particular attention to **listening and speaking**, the skills where Duolingo-style apps consistently underperform (Jiang 2021; Smith et al. 2024; Kittredge 2024; Loewen 2019).
29. **Use L1 deliberately, then fade it.** Keep L1 (UI-language) meaning support for beginners and children. Progressively replace translate-the-sentence items with Kurdish-only comprehension items (picture-matching, true/false on a story, answering questions) as level rises.
    - Evidence: L1 helps vocabulary [Exp/MA]; the case for fading rests on the comprehension-based and four-strands logic, not on direct evidence against translation.
30. **Alphabet module: link to reading early.** Once letters are learned, move straight into decodable mini-stories with audio, so script learning becomes meaning-focused input quickly. This is especially important for Soranî script and for adults schooled in other scripts.
    - This is an inference from the input findings; there is no Kurdish-specific evidence.

### Gaps
- No research was found on Kurdish-specific acquisition difficulties, Kurdish corpora or frequency lists, or Kurdish ASR or LLM quality. Several implications above (12, 16, 21, 30) need validation with Kurdish linguists and small in-app experiments, such as A/B tests of prompt-first vs show-answer feedback.
- No evidence was found on how Kurmancî–Soranî bidialectal learners should sequence the two varieties.
