# AI and LLM tutoring for language learning (2023–2026): evidence, products, and fitness for Kurdish

**Method note (read first).** The research ran on 6 October 2026.
- WebFetch was blocked by the egress proxy (tested on pmc.ncbi.nlm.nih.gov and refused). GitHub API access to third-party repos was also refused.
- The shared WebSearch budget ran out after 8 searches in this thread.
- As a result, **most findings below rest on search-result summaries or snippets, not on the full primary text.** Each finding is marked:
  - **[SNIPPET]**: the claim comes from a search summary.
  - **[VIA SIBLING]**: the claim was taken from another researcher's notes in this folder, with that researcher's source URL.
- Facts I hold from prior knowledge that were **not** verified this session are listed only under "Gaps", labelled "unverified lead". They are not stated as findings.

**Evidence grades used:** [MA] meta-analysis · [RCT] randomised controlled trial · [QE] quasi-experimental · [OBS] observational/descriptive · [EXP-OP] expert opinion / informal evaluation · [VENDOR] vendor or press claim.

---

## 1. What controlled evidence shows about AI tutors (including over-reliance risks)

### Takeaway
- The best 2024–2025 trials show that **LLM tutors with pedagogical guardrails** can produce large short-term learning gains:
  - Harvard physics: about 2× the gains of active-learning class.
  - Nigeria English: +0.31 SD in 6 weeks.
  - Tutor CoPilot (AI-assisted human tutors): +4 percentage points (pp) in topic mastery.
- **Unguarded "answer-machine" access harms learning once the AI is removed**: −17% on exams in the Bastani et al. PNAS trial.
- Language-specific evidence (L2 speaking and writing with chatbots) is consistently positive (meta-analytic g ≈ 0.58–0.61). The studies are short, mostly English-as-a-foreign-language, and prone to novelty effects.

### Cited Findings

**Harvard physics AI tutor: Kestin et al., *Scientific Reports*, June 2025 [RCT, crossover, n = 194]**
- Ran in Harvard's Physical Sciences 2 with 194 students.
- Each student learned one topic (surface tension or fluid flow) in an instructor-led active-learning class, and the other at home with a custom GPT-4 tutor, over two consecutive weeks. Each student was their own control. — [iatroX summary](https://www.iatrox.com/blog/harvard-ai-tutor-trial-what-it-showed-question-banks); [PMC full text](https://pmc.ncbi.nlm.nih.gov/articles/PMC12179260/) [SNIPPET]
- The tutor was "a GPT-4 tutor with careful guardrails". Students "learned roughly twice as much" as in the active-learning class. — [Live in the Future](https://liveinthefuture.org/stories/bloom-two-sigma-ai-tutor.html) [SNIPPET]
- The AI tutor was "informed by the same pedagogical best practices as employed in the in-class lessons". The trial also measured students' perceptions (engagement and motivation). — [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC12179260/) [SNIPPET]
- **Caveat.** An independent re-analysis says the effect "is plausibly as small as 9% or as high as 24%" based on the confidence interval. The snippet does not make the unit clear, but this is a smaller and less certain effect than the headline "2×". — [Clay Ford re-analysis](https://www.clayford.net/posts/ai_tutoring_nature/) [SNIPPET]
- Other critical reviews exist. — [ETC Journal review (Nov 2025)](https://etcjournal.com/2025/11/10/review-of-kestin-et-al-s-june-2025-harvard-study-on-ai-tutoring/); [Michelle Miller, R3 newsletter (Jul 2025)](https://michellemillerphd.substack.com/p/r3-37-july-15-2025-how-do-tutoring)
- **Superseded:** the 2024 preprint version was replaced by the June 2025 *Sci. Rep.* publication.

**World Bank Nigeria after-school GPT-4 programme: De Simone et al. [RCT, n = 759]**
- Six weeks, Benin City, nine public schools. Students used Microsoft Copilot (GPT-4) for English. 422 treatment, 337 control. — [WarpNews](https://www.warpnews.org/artificial-intelligence/ai-teachers-provide-major-academic-progress-in-nigeria/); [World Bank blog](https://blogs.worldbank.org/en/education/From-chalkboards-to-chatbots-Transforming-learning-in-Nigeria) [SNIPPET]
- **Effect: +0.31 SD**, described as equivalent to 1.5–2 years of "business-as-usual" schooling. — [World Bank Development Talk blog](https://blogs.worldbank.org/en/developmenttalk/addressing-the-learning-crisis-with-generative-ai--lessons-from-) [SNIPPET]
- Design:
  - Students worked in pairs, twice a week, in 90-minute sessions.
  - Teachers were trained to guide use.
  - **Specially designed prompts made the AI act as a teacher rather than give direct answers.**
- Cost: about $48 per student for six weeks.
- Who gained most: female students and students with higher prior performance, though all groups improved. — [WarpNews](https://www.warpnews.org/artificial-intelligence/ai-teachers-provide-major-academic-progress-in-nigeria/) [SNIPPET]
- **Caveat:** the control group got no extra instruction, so the effect mixes "more learning time plus a teacher-facilitator" with "AI". — [WarpNews](https://www.warpnews.org/artificial-intelligence/ai-teachers-provide-major-academic-progress-in-nigeria/); [Five recent AI tutoring studies (GreaterWrong)](https://www.greaterwrong.com/posts/bs3yj8vLDKNnoa95m/five-recent-ai-tutoring-studies) [SNIPPET]

**Over-reliance: Bastani et al., "Generative AI without guardrails can harm learning", *PNAS* 122 (2025), e2422633122 [RCT/field experiment, about 1,000 high-school maths students]**
- Two arms:
  - **GPT Base**: a ChatGPT-like interface.
  - **GPT Tutor**: prompts designed to safeguard learning. — [Penn CHIBE](https://chibe.upenn.edu/publications/generative-ai-without-guardrails-can-harm-learning-evidence-from-high-school-mathematics); [RePEc](https://ideas.repec.org/a/nas/journl/v122y2025pe2422633122.html)
- During practice, performance rose **48% (Base)** and **127% (Tutor)**.
- **After access was removed, the Base group scored 17% lower** than students who never had access.
- The Tutor safeguards "largely mitigated" the harm.
- Mechanism: students used GPT-4 "as a crutch". — [Penn CHIBE](https://chibe.upenn.edu/publications/generative-ai-without-guardrails-can-harm-learning-evidence-from-high-school-mathematics) [SNIPPET]
- **Superseded:** the July 2024 SSRN working paper was titled "Generative AI Can Harm Learning". The PNAS version (2025) carries the "without guardrails" framing.

**Tutor CoPilot, Stanford: Wang, Ribeiro, Robinson, Loeb & Demszky [RCT, 900 tutors, 1,800 K-12 students]**
- This was the first RCT of a human–AI system in live tutoring.
- Students of tutors with CoPilot were **+4 pp more likely to master topics** (p < 0.01). Students of **lower-rated tutors gained +9 pp**.
- Tutors with CoPilot used more high-quality strategies (guiding questions) and were **less likely to give away answers**.
- Cost: **about $20 per tutor per year**. — [arXiv 2410.03017](https://arxiv.org/html/2410.03017v1); [NSSA Stanford](https://nssa.stanford.edu/studies/tutor-copilot-human-ai-approach-scaling-real-time-expertise); [SCALE Stanford](https://scale.stanford.edu/publications/tutor-copilot-human-ai-approach-scaling-real-time-expertise) [SNIPPET]
- arXiv v1 is dated Oct 2024; a revision was submitted 26 Jan 2025. — [alphaXiv](https://alphaxiv.org/abs/2410.03017)

**Language-learning-specific evidence**
- **Chatbots in L2 learning, Lyu 2025, *Int. J. Applied Linguistics* [MA]:** 31 studies, 41 effect sizes, **g = 0.608**. — [Wiley](https://onlinelibrary.wiley.com/doi/full/10.1111/ijal.12668) [VIA SIBLING: sla_theory.md]
- **Generative-AI chatbots, Li 2025, *J. Computer Assisted Learning* [MA]:**
  - **ES = 0.576** (95% CI 0.385–0.768).
  - Interventions of 1–7 days had a large moderating effect, which is a novelty / short-term-measurement warning. — [Wiley](https://onlinelibrary.wiley.com/doi/10.1111/jcal.70060?af=R) [VIA SIBLING]
- **Dialogue-based CALL for L2 speaking, ReCALL [MA, three-level]:** **g = 0.61** (95% CI 0.34–0.89). — [Cambridge/ReCALL](https://www.cambridge.org/core/journals/recall/article/dialoguebased-computerassisted-language-learning-systems-for-second-language-speaking-development-a-threelevel-metaanalysis/31847710516602398819C5E594038E7B) [VIA SIBLING]
- **ASR pronunciation feedback, Ngo, Chen & Lai, ReCALL [MA]:**
  - Overall **g = 0.69**; explicit feedback g = 0.86.
  - **With a peer g = 0.89 vs alone g = 0.44.** — [Cambridge/ReCALL](https://www.cambridge.org/core/journals/recall/article/effectiveness-of-automatic-speech-recognition-in-eslefl-pronunciation-a-metaanalysis/A915444CF252B61D14961D2FE733822D) [VIA SIBLING]
- **GPT-4 as a collaborative dialogue partner [RCT, n = 83 Chinese first-year undergraduates, 4 weeks]:**
  - Significantly improved oral proficiency, willingness to communicate (WTC) and self-efficacy.
  - Significantly reduced foreign-language anxiety. — [CALL journal, T&F 2025](https://www.tandfonline.com/doi/full/10.1080/09588221.2025.2453191) [SNIPPET]
- **AI chatbot in think–pair–share activities [QE, n = 75, 6 weeks]:** lower speaking anxiety, more enjoyment, better speaking performance. — [CALL journal, T&F 2025](https://www.tandfonline.com/doi/full/10.1080/09588221.2025.2478271) [SNIPPET]
- **AI conversation bots [mixed methods, experimental vs control]:** significant gains in L2 speaking and lower anxiety. — [Humanities & Social Sciences Communications (Nature), 2025](https://www.nature.com/articles/s41599-025-05550-z) [SNIPPET]
- **Chatbots and WTC:** learners found chatbot practice less anxiety-provoking than peer interaction. — [System (ScienceDirect), 2025](https://www.sciencedirect.com/science/article/abs/pii/S0346251X2500329X) [SNIPPET]
- **Newer research directions (2025–2026), outcome data not retrieved:**
  - EFL learners' code-switching in LLM speaking practice and how teachers handle it. — [arXiv 2512.23136](https://arxiv.org/pdf/2512.23136)
  - Level-appropriate embodied conversational agents to reduce foreign-language anxiety (July 2026). — [arXiv 2607.21887](https://arxiv.org/pdf/2607.21887)
  - Mixed-reality agents for group conversation practice. — [arXiv 2510.08227](https://arxiv.org/pdf/2510.08227)
- **Feedback research:**
  - Corrective feedback overall: d ≈ 0.61–0.64.
  - **Prompts that push self-correction outperform recasts that give the answer** (Lyster & Saito 2010). — [VIA SIBLING: sla_theory.md, citing ResearchGate](https://www.researchgate.net/publication/234580927_Oral_Feedback_in_Classroom_SLA_A_Meta-Analysis)
  - This converges with the AI-tutor findings: "don't give away the answer" designs work better.

### Inferences
- The RCTs agree on one design rule: **the AI should scaffold, not answer.**
  - Kestin's tutor had guardrails and pedagogy.
  - Nigeria's prompts made the AI act as a teacher.
  - Tutor CoPilot reduced answer-giving.
  - Bastani's GPT Tutor removed the harm.
- **In-session performance is a misleading metric.** Bastani's Base arm practised 48% better but tested 17% worse. Any Hevalo A/B test of AI features must measure **delayed, AI-free retention**, not lesson accuracy or XP.
- Effects in the L2 chatbot literature are medium (g ≈ 0.6), but short interventions inflate them. Expect smaller durable effects. Note that "AI reduces speaking anxiety" is a fairly robust secondary finding across the small studies, which matters for shy heritage learners.
- None of these trials involved a low-resource language. Every effect assumes a model that is competent in the target language, which is not a safe assumption for Kurdish (see section 3).

### Gaps
- Full-text effect sizes for Kestin (SD units) and the Nigeria working paper (sub-outcomes, end-of-year exam effects) were not retrieved.
  - Unverified lead: Kestin reports effect sizes of roughly 0.73–1.3 SD.
  - Unverified lead: the tutor's system prompts included expert-written step-by-step solutions, a form of grounding.
- No RCT of an LLM tutor for a **minority or heritage language** was found.
- No long-term (more than 6 months) retention study of LLM language tutoring was found.
- No study of AI tutors with **children under 13 in language learning** was retrieved.

---

## 2. Products: how leading apps use AI, and outcome data

### Takeaway
- The market leaders use LLMs for three things:
  - **In-lesson explanations** (Duolingo "Explain My Answer").
  - **Scenario role-play with post-conversation feedback** (Duolingo Roleplay; Speak; Praktika).
  - **Realtime voice or video "calls" with a character** (Duolingo Video Call with Lily; Speak on OpenAI Realtime; Praktika's avatars with ElevenLabs TTS).
- Public outcome data is almost entirely **vendor-reported**. Engagement and revenue metrics are much better documented than learning outcomes.

### Cited Findings
- **Duolingo Max** bundles Roleplay, Explain My Answer, and an upgraded 3D Video Call with Lily. — [StoryLearning review](https://storylearning.com/duolingo-max-review); [Beginners in AI](https://beginnersinai.org/duolingo-max-explained/) [SNIPPET, secondary]
- **Explain My Answer** explains the grammar and vocabulary behind an answer inside a lesson. **Since 1 January 2026 it is reportedly free for all learners** in most courses teaching Spanish, French, German, Japanese, Portuguese, Italian and Korean. — [CopyCat Café review (2025/26)](https://copycatcafe.com/blog/duolingo-max) [SNIPPET, secondary; not confirmed on a Duolingo page]
  - **Superseded:** at its March 2023 launch it was Max-only. The shift to free signals that per-item AI explanations became cheap enough to give away.
- **Roleplay and Video Call:** learners work through everyday scenarios with a Duolingo character, then **get feedback on the accuracy and complexity of what they said**. — [CopyCat Café](https://copycatcafe.com/blog/duolingo-max) [SNIPPET]
- **Duolingo Video Call study:** Duolingo's Efficacy Research Lab reports that Video Call improves speaking and reduces speaking anxiety. — [FeedBagel aggregator](https://feedbagel.com/post/duolingo-study-shows-video-calls-improve-language-learners-speaking-skills) [VENDOR via aggregator; no effect sizes in snippet]
- **Speak:**
  - Uses **OpenAI's Realtime API** as its conversation engine, combined with Speak's own curriculum and feedback systems trained on language-learning data.
  - Uses OpenAI ASR building on Whisper for open-ended conversation with real-time feedback.
  - Claims 15M+ downloads and a $1B valuation (late 2024). — [CO/AI tool profile](https://getcoai.com/tool-detail/speak/164726/) [SNIPPET, secondary; VENDOR figures]
- **Praktika:**
  - AI-avatar tutors; $35.5M Series A led by Blossom Capital (May 2024).
  - Claims 1.2M monthly active users in 100 countries and about $20M revenue in the trailing 12 months. — [TechCrunch (May 2024)](https://techcrunch.com/2024/05/22/praktika-raises-35-5m-to-use-ai-avatars-to-make-learning-languages-feel-more-natural) [VENDOR via press]
  - **Voice quality drove engagement.** In A/B tests with other TTS models "metrics dropped noticeably". An "upgraded voices" campaign went viral and pushed the app into the global top-10 language apps. — [ElevenLabs case study](https://elevenlabs.io/blog/praktika-scales-immersive-language-learning-with-elevenlabs-tts) [VENDOR]
- **Independent studies of AI speaking apps** are mostly small local studies (e.g., ELSA Speak) reporting "significant improvements" without robust designs. — [IAIN Palopo journal](https://ejournal.iainpalopo.ac.id/index.php/ideas/article/download/6573/4196/24217) [OBS/QE, SNIPPET]
- **Competitive context for Kurdish:** Duolingo has no Kurdish course. The Kurdish app field is fragmented (uTalk, Dialect, Bimus, ZimanGo). — [VIA SIBLING: heritage_minority_kurdish.md]

### Inferences
- The proven product pattern is a **scripted scenario plus free conversation inside it, then structured feedback** (accuracy, complexity, suggested better phrasing). Open "chat with AI about anything" is not the pattern.
- Praktika's A/B evidence suggests that **voice naturalness is a first-order engagement driver** for AI conversation. For Kurdish, where TTS is weak, a robotic voice could undermine an AI-call feature. Hevalo should prefer human-recorded audio, or wait for vetted Kurdish TTS.
- Duolingo making Explain My Answer free suggests explanations are a table-stakes, low-cost feature. Conversation (realtime voice) remains the premium tier because it costs more per minute.

### Gaps
- No independent RCT of Duolingo Max, Speak, Praktika, Gliglish, Langua or Babbel AI features was found. Duolingo's Video Call efficacy numbers were not retrieved.
- Babbel's AI features (e.g., AI conversation and speaking practice), Gliglish and Langua were not covered: the search budget was exhausted before these were queried.
- ChatGPT voice mode for language practice: no outcome data retrieved. Unverified lead: Kurdish is not among the languages OpenAI officially lists for ChatGPT voice.
- Unverified lead: Duolingo Max launched March 2023 (GPT-4: Explain My Answer, Roleplay) and Video Call launched around September 2024.

---

## 3. LLM quality for Kurdish (Kurmanji and Sorani), 2025–2026

### Takeaway
- **No rigorous, peer-reviewed, model-by-model benchmark of 2025–2026 frontier LLMs on Kurmanji and Sorani was retrieved.**
- The only direct comparison found is an informal open-source framework (KurdEval, Sorani, 5 prompts). It rated **Gemini 3.x Flash "Excellent"**. Open-weight GPT-OSS models were "Poor/Very Poor": they looped and **injected Arabic and Turkish words where Kurdish equivalents exist**.
- Kurdish NLP resources (corpora, transliterators, normalisers, Whisper-based ASR, TTS datasets) have grown fast, with Sorani better resourced than Kurmanji.
- Hevalo must run its **own evaluation**, with separate native raters for each dialect.

### Cited Findings
- **KurdEval** is an LLM evaluation framework for Kurdish tasks [EXP-OP; informal; SNIPPET]:
  - It tested 3 LLMs on the **same 5 Sorani prompts** across 5 categories.
  - Gemini 3.x Flash was rated "Excellent". GPT-OSS models were rated "Poor" and "Very Poor".
  - GPT-OSS was about 5× faster but showed "severe output degradation". It "frequently loop[s] on meaningless words and inject[s] Arabic/Turkish words when Kurdish equivalents exist".
  - "Only Gemini produces literary-quality Kurdish suitable for native readers". — [GitHub: Lavanmawlood/KurdEval](https://github.com/Lavanmawlood/KurdEval)
  - Note: n = 5 prompts, Sorani only, and Claude and GPT-5-class closed models are apparently not among the 3. Treat this as a signal, not a benchmark.
- **Kurdish NLP state of the art** [OBS, VIA SIBLING: heritage_minority_kurdish.md]:
  - Resource scarcity and dialect/script diversity are the core challenges. — [Towards a Complete Kurdish NLP Pipeline](https://www.researchgate.net/publication/371970808_Towards_a_Complete_Kurdish_NLP_Pipeline_Challenges_and_Opportunities)
  - Tools for script safety:
    - KLPT toolkit. — [KLPT paper](https://sinaahmadi.github.io/docs/articles/ahmadi2020klpt.pdf)
    - Sorani Arabic↔Latin transliteration. — [arXiv 1811.10278](https://arxiv.org/pdf/1811.10278)
    - Latin→Perso-Arabic transliterator for Kurmanji and Sorani. — [arXiv 2110.12374](https://arxiv.org/pdf/2110.12374)
    - Perso-Arabic script normalisation. — [arXiv 2301.11406](https://arxiv.org/pdf/2301.11406)
  - Parallel and dialect data:
    - Sorani–Kurmanji–English parallel corpus. — [KurdishBLARK InterdialectCorpus](https://github.com/KurdishBLARK/InterdialectCorpus)
    - Dialectal MT benchmark (CODET) covering Kurdish varieties. — [arXiv 2305.17267](https://arxiv.org/pdf/2305.17267)
    - Central Kurdish varieties corpus (CORDI). — [arXiv 2403.01983](https://arxiv.org/pdf/2403.01983)
  - Speech:
    - Whisper-based Kurmanji ASR. — [arXiv 2410.16330](https://arxiv.org/pdf/2410.16330)
    - SoraniTTS corpus v5 (Sept 2025). — [Mendeley Data](https://data.mendeley.com/datasets/jmtn248cc9/5)
    - A commercial Kurdish TTS/STT vendor claims CER as low as 4.54% on FLEURS. — [kurdishtts.com](https://www.kurdishtts.com/) [VENDOR]
  - The sibling researcher concludes AI and speech are "feasible in 2026, especially for Sorani; Kurmanji is still thinner".
- **Children's speech:** child-speech ASR is far worse than adult speech: about 25% WER for Whisper on child speech vs about 3% for adults (English). — [Learning Agency](https://the-learning-agency.com/the-cutting-ed/article/how-speech-recognition-systems-struggle-with-childrens-voices/) [VIA SIBLING: children.md; secondary]
- **Analogous low-resource evidence:** a 2025 benchmark of modern LLMs on low-resource and morphologically rich languages exists (Cantonese, Japanese, Turkish). Kurdish is not covered. — [arXiv 2511.10664](https://arxiv.org/pdf/2511.10664)

### Inferences
- **Main risks for Kurdish output:**
  1. **Lexical contamination** from contact languages: Arabic, Turkish and Persian (shown in KurdEval).
  2. **Dialect mixing**, with Sorani forms leaking into Kurmanji. Inferred from shared training data and the fact that both are labelled "Kurdish". Not directly measured in the sources.
  3. **Script confusion**:
     - Sorani text may use Arabic/Persian letters (ي/ك/ة vs Kurdish ی/ک/ە) or drop Kurdish-specific letters (ڕ ڵ ۆ ێ).
     - Kurmanji Hawar-script diacritics (ê î û ç ş) may be dropped or replaced with Turkish ı/ğ.
     - The existence of dedicated normalisation tools (arXiv 2301.11406) implies such inconsistencies are common in real Kurdish text, and LLMs learn from that text.
  4. **Hallucinated grammar explanations.** Ergativity in past transitive clauses, ezafe, gender, and oblique case in Kurmanji are exactly the areas where low-resource models will produce plausible but wrong rules.
- Rankings may differ between Kurmanji and Sorani, and between generation and explanation tasks. Choose models **per dialect and per task**.
- Speed and cost trade-offs (GPT-OSS 5× faster but poor) mean the cheapest model is likely unusable for learner-facing Kurdish text. Smaller models might still work for classification tasks (e.g., moderation, error tagging) after validation.

### Gaps
- **Not retrieved (search budget exhausted):** FLORES-200, Belebele, or MMLU-ProX/Global-MMLU scores for kmr_Latn and ckb_Arab on GPT-4o/GPT-5, Claude, Gemini 2.5/3, Llama 3/4, Aya.
- Unverified leads:
  - FLORES-200 and NLLB-200 include both Central Kurdish (ckb_Arab) and Northern Kurdish (kmr_Latn).
  - Belebele includes at least ckb_Arab, possibly kmr_Latn.
  - MMLU-ProX and Global-MMLU do not appear to include Kurdish.
  - Aya-101 lists Kurdish among its 101 languages; the 23-language Aya Expanse does not.
  - Google Translate added Sorani in May 2022, alongside existing Kurmanji.
  - Meta's MMS speech models cover Kurdish varieties.
- No peer-reviewed study of **LLM grammar-explanation accuracy for Kurdish** was found.
- No data on **realtime voice models** (OpenAI Realtime, Gemini Live) speaking or understanding Kurdish.

---

## 4. Design patterns: Socratic hints, grounding, human review, graded readers, L1 explanations

### Takeaway
- The evidence base supports five patterns:
  1. **Guarded, Socratic tutoring.** Hints and guiding questions before answers (Bastani, Nigeria, Tutor CoPilot, corrective-feedback meta-analyses).
  2. **Grounding** the model in vetted content.
  3. **Human-in-the-loop** setups where AI assists a human expert (Tutor CoPilot: +4 pp, +9 pp for weaker tutors, $20/tutor/year).
  4. **Scenario-bounded role-play with post-hoc feedback** (Duolingo, Speak).
  5. **Delayed-retention evaluation** rather than in-session accuracy.

### Cited Findings
- **Guardrails remove the harm of AI help.**
  - GPT Tutor (prompted to tutor, not answer) "largely mitigated" the −17% post-access harm seen with unguarded GPT-4. — [Penn CHIBE / PNAS](https://chibe.upenn.edu/publications/generative-ai-without-guardrails-can-harm-learning-evidence-from-high-school-mathematics) [RCT]
  - Nigeria used "specially designed prompts that made the AI function more as a teacher rather than simply providing direct answers", plus teacher facilitation and pair work. — [WarpNews](https://www.warpnews.org/artificial-intelligence/ai-teachers-provide-major-academic-progress-in-nigeria/) [RCT, SNIPPET]
- **AI guidance shifts humans toward Socratic moves.** Tutors with CoPilot asked more guiding questions and gave away answers less. — [arXiv 2410.03017](https://arxiv.org/html/2410.03017v1) [RCT]
- **Prompts beat recasts** in corrective feedback. Explicit feedback has a bigger immediate effect; implicit feedback is better maintained. — [VIA SIBLING: sla_theory.md](https://www.researchgate.net/publication/234580927_Oral_Feedback_in_Classroom_SLA_A_Meta-Analysis) [MA]
- **Pedagogy-matched design.** Kestin's tutor was built on the same pedagogical best practices as the active-learning class, so the AI was treated as a carrier of a designed lesson rather than a free agent. — [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC12179260/) [RCT, SNIPPET]
- **Feedback after role-play.** Duolingo Roleplay and Video Call give feedback on the "accuracy and complexity" of learner output after the conversation, not during it. — [CopyCat Café](https://copycatcafe.com/blog/duolingo-max) [SNIPPET]
- **Peer and social framing amplifies tech-based speaking practice.** ASR practice with a peer gave g = 0.89 vs 0.44 alone. — [ReCALL MA, VIA SIBLING](https://www.cambridge.org/core/journals/recall/article/effectiveness-of-automatic-speech-recognition-in-eslefl-pronunciation-a-metaanalysis/A915444CF252B61D14961D2FE733822D)
  - Nigeria also used pair work. — [WarpNews](https://www.warpnews.org/artificial-intelligence/ai-teachers-provide-major-academic-progress-in-nigeria/)
- **Code-switching is normal in LLM speaking practice** and is now studied as a design question. — [arXiv 2512.23136](https://arxiv.org/pdf/2512.23136) [OBS; outcome not retrieved]
- **Level-appropriateness is an active design lever** for reducing anxiety with conversational agents. — [arXiv 2607.21887](https://arxiv.org/pdf/2607.21887) [findings not retrieved]

### Inferences
- **Grounding pattern for Kurdish.** Retrieval-augmented generation (RAG) over Hevalo's own vetted assets: course grammar notes, the ~400k-word Wiktionary-derived dictionary, and approved example sentences. The LLM rephrases and explains; it does not originate facts about Kurdish. Correctness is decided deterministically by the exercise engine, never by the LLM. This follows from the RCTs' "pedagogy-designed" tutors combined with the Kurdish quality risks in section 3.
- **Generate offline, review, then publish.** For content generation (graded readers, example sentences, distractors, rhyme sets), LLM output should be batch-generated, auto-checked (script validator, dictionary out-of-vocabulary rate, dialect lexicon check), then **human-reviewed by native editors** before learners see it. This applies the Tutor CoPilot logic (AI amplifies the human expert) to content.
- **L1 explanations.** Explanations in the learner's UI language (en, de, tr, ar, fr, es, nl) are exactly what frontier LLMs do best, because those are high-resource languages. Writing the explanation in a high-resource language while quoting Kurdish only from vetted sources moves the risk away from Kurdish generation.

### Gaps
- No controlled study comparing hint ladders and full answers specifically in language apps was retrieved. The evidence is from maths and physics (Bastani, Kestin) plus classroom corrective-feedback meta-analyses.
- No empirical study of **LLM-generated graded readers** (quality, learner outcomes) was retrieved.
- No study of LLM explanations delivered in L1 vs L2 was retrieved.

---

## 5. Child safety, privacy, and cost for AI features

### Takeaway
- The amended **US COPPA rule** has been fully in force since 22 April 2026. It requires:
  - separate parental consent for third-party disclosures (relevant when a child's text or voice is sent to an LLM vendor);
  - a written retention policy;
  - a security programme.
- **California SB 243** (in force 1 January 2026) imposes AI-disclosure, break-reminder and self-harm-protocol duties on companion chatbots used by known minors.
- The **FTC opened a 6(b) inquiry** into AI chatbots and children in September 2025.
- EU digital consent ages range from 13 to 16.
- **Model-provider age policies, data-retention terms and current prices were not verified this session** (see Gaps). They must be checked before launch.

### Cited Findings
- **COPPA amendments:** finalised January 2025, published 22 April 2025, effective 23 June 2025, **compliance deadline 22 April 2026**.
  - Requirements: separate parental consent for third-party disclosures, a written data-retention policy (no indefinite retention), a written security programme, and neutral age screens for mixed-audience services. — [FTC press release (Jan 2025)](https://www.ftc.gov/news-events/news/press-releases/2025/01/ftc-finalizes-changes-childrens-privacy-rule-limiting-companies-ability-monetize-kids-data); [Hunton](https://www.hunton.com/privacy-and-information-security-law/ftc-publishes-final-coppa-rule-amendments) [VIA SIBLING: children.md]
  - **Superseded:** the 2013 rule text.
- **AI chatbots and minors:**
  - California SB 243 took effect 1 January 2026. Companion chatbots must tell known minors they are talking to an AI, **repeat this every 3 hours with a break reminder**, block sexual content for minors, and have suicide/self-harm protocols. There is a private right of action.
  - The FTC launched a 6(b) inquiry on 11 September 2025 (orders to Alphabet, Character.AI, Instagram, Meta, OpenAI, Snap, xAI). — [FTC](https://www.ftc.gov/news-events/news/press-releases/2025/09/ftc-launches-inquiry-ai-chatbots-acting-companions); [Jones Walker on SB 243](https://www.joneswalker.com/en/insights/blogs/ai-law-blog/ai-regulatory-update-californias-sb-243-mandates-companion-ai-safety-and-accoun.html); [Orrick 2026 state chatbot laws](https://www.orrick.com/en/Insights/2026/04/2026-State-Chatbot-Laws-Key-Provisions-and-Regulatory-Trends) [VIA SIBLING: children.md]
- **EU digital age of consent (GDPR Art. 8):** 16 in Germany, the Netherlands and Ireland; 15 in France; 14 in Spain and Austria; 13 in Sweden. — [Didomi](https://www.didomi.io/blog/privacy-laws-underage-consumers); [EuConsent](https://euconsent.eu/digital-age-of-consent-under-the-gdpr/) [VIA SIBLING: children.md]
- **Pending US legislation:** the House passed the KIDS Act (H.R. 7757, bundling KOSA and COPPA 2.0) on 29 June 2026. It is in the Senate. — [VIA SIBLING: children.md]
- **Cost data points from trials:**
  - Nigeria programme: about **$48 per student for 6 weeks**, including facilitation. — [WarpNews](https://www.warpnews.org/artificial-intelligence/ai-teachers-provide-major-academic-progress-in-nigeria/)
  - Tutor CoPilot: about **$20 per tutor per year**. — [NSSA Stanford](https://nssa.stanford.edu/studies/tutor-copilot-human-ai-approach-scaling-real-time-expertise)
- **Speed vs quality:** in KurdEval the faster open models were unusable for Kurdish, so cheap and fast is not automatically viable for Kurdish. — [KurdEval](https://github.com/Lavanmawlood/KurdEval) [EXP-OP]
- **Voice data from children** needs on-device processing or immediate deletion (COPPA retention and biometrics). Child-speech ASR is unreliable, so **no automatic pass/fail on children's pronunciation**. — [VIA SIBLING: children.md]

### Inferences
- Any LLM call carrying a child's free text or voice is a **third-party disclosure** under amended COPPA. It needs separate verifiable parental consent, a vendor contract with no training on the data, and minimal retention.
  - The low-risk design for under-13s is **no free-form input to an LLM at all**: only pre-generated, human-reviewed AI content, or closed-choice interactions.
- A Hevalo "AI friend" character with persistent memory and a persona would likely fall under **companion-chatbot rules** (SB 243 and similar state laws) for minors. A task-bounded tutor with no persona memory is lower-risk.
- **Caching cuts costs.** Most wrong answers in a fixed exercise bank repeat, so a cached explanation per (exercise, wrong answer) pair turns per-request LLM costs into one-off, reviewable costs.

### Gaps (not verified this session; must be checked against current provider terms)
- **Unverified lead, OpenAI:** consumer and API terms require users to be 13+, with parental consent under 18. API data is not used for training by default. Abuse-monitoring retention is about 30 days, with Zero Data Retention for eligible customers.
- **Unverified lead, Anthropic:** Claude.ai consumer is 18+. API customers may build products for minors only with additional safeguards: age verification, content moderation, disclosing AI use, and COPPA compliance.
- **Unverified lead, Google Gemini API:** the Additional Terms have restricted use in apps "directed towards or likely to be accessed by individuals under the age of 18". This is critical if Gemini turns out to be the best Kurdish model and Hevalo has child users. Check current Gemini API and Vertex AI terms.
- **Unverified lead, EU AI Act Article 50:** the duty to tell users they are interacting with AI applies from August 2026. AI used to evaluate learning outcomes in educational institutions is high-risk under Annex III. A consumer practice app is probably outside this, but needs legal review. The Digital Omnibus proposal (Nov 2025) to delay high-risk obligations was not verified.
- **Current per-token and per-minute prices** were not retrieved:
  - text models (GPT-4o-mini/GPT-5-mini, Claude Haiku, Gemini Flash);
  - realtime voice (OpenAI gpt-realtime, Gemini Live).
- The moderation quality of provider moderation endpoints on Kurdish text is unknown. No source was found, and it is likely weak for a low-resource language.

---

## Implications for Hevalo

Each item is tied to the evidence above. Items marked (I) are inferences without direct Kurdish evidence.

1. **Build an in-house Kurdish model evaluation ("HevalBench") before shipping any generative feature.**
   - Size: 200–400 items per dialect. Tasks: grammar explanation, error diagnosis, sentence generation within a word list, translation, and role-play turns.
   - Score with **separate native Kurmanji and Sorani raters** on:
     - correctness;
     - dialect purity (no Sorani forms in Kurmanji, and vice versa);
     - lexical purity (no Arabic, Turkish or Persian substitutes where Kurdish words exist, the failure KurdEval documented);
     - script fidelity.
   - Re-run on every model release. Pick the model **per dialect and per task**; Gemini is the only current positive signal (KurdEval, n = 5).
2. **Script and lexicon guards on every LLM output** (I):
   - Kurmanji output must pass a Hawar-alphabet validator: ê î û ç ş allowed; Turkish ı ğ and stray Arabic script rejected.
   - Sorani output goes through Kurdish Perso-Arabic normalisation (ی ک ە instead of ي ك ة; presence of ڕ ڵ ۆ ێ checked). Reuse KLPT and the normaliser from arXiv 2301.11406.
   - Compute the **out-of-dictionary token rate** against Hevalo's ~400k-word dictionary and reject outputs above a threshold. The dictionary is a free hallucination detector.
3. **"Why was this wrong?" (Explain My Answer equivalent), grounded and cached, free for all.**
   - The exercise engine decides correctness deterministically.
   - The LLM gets only the item, the accepted answers, the learner's answer, the unit's vetted grammar note and the dictionary entries. It writes the explanation **in the learner's UI language** (en/de/tr/ar/fr/es/nl), quoting Kurdish only from those inputs.
   - Cache per (item, normalised wrong answer). Have native editors review the top-N most frequent explanations.
   - Duolingo made this free in 2026, so it should not be paywalled.
4. **Hint ladder, not answer-reveal (Bastani guardrails; Tutor CoPilot; prompts beat recasts).**
   - Three levels: (1) metalinguistic clue ("check the verb ending: past transitive → ergative"); (2) partial form; (3) answer plus explanation.
   - Each hint level costs XP or Zêr, or reduces the item's spaced-repetition credit.
   - Never offer AI help on checkpoint, league-scored or multiplayer items.
   - Teens and adults may ask the tutor questions, but the system prompt forbids completing exercises for the learner.
5. **Evaluate AI features on delayed, AI-free retention.**
   - Add "AI-free" review checkpoints (e.g., day 7 and day 30) and compare A/B arms on those, not on lesson accuracy, XP or session length.
   - Bastani shows practice gains of +48% to +127% can coexist with −17% exam performance.
6. **Scenario role-play ("Peyvîn", "Axaftin"), text first, voice later.**
   - Bounded to the current course unit's vocabulary and grammar, with a stated goal (order tea, introduce your family to a dapîr/nene).
   - The AI plays a character; after 6–10 turns, give structured feedback on accuracy, complexity and one better phrasing (Duolingo/Speak pattern).
   - **Accept code-switching from heritage learners** (German/Turkish/English mixed with Kurdish). Respond in Kurdish, recasting the switched word with a gloss.
   - Treat it as anxiety reduction for heritage learners who are ashamed to speak; the L2 chatbot RCTs consistently report lower foreign-language anxiety and higher WTC.
7. **Voice: gate realtime AI voice on Kurdish TTS and ASR quality.**
   - Praktika's A/B tests show voice quality drives engagement, and mainstream realtime APIs are not known to support Kurdish.
   - Near term: native-recorded audio plus constrained speaking tasks (read-aloud, minimal pairs, "listen–record–compare"), scored leniently and never auto-failing accents.
   - Pilot Whisper-based Kurmanji ASR (arXiv 2410.16330) and vendor Kurdish STT/TTS on **Hevalo's own learner audio** before any open voice call. Sorani is likely ready sooner than Kurmanji.
8. **Use AI to amplify humans (Tutor CoPilot pattern).**
   - **Community feed:** an AI first pass suggests gentle corrections and comments on user-written stories and poems; a human moderator or volunteer editor approves.
   - **Teacher or class mode** for diaspora Saturday schools: the AI drafts feedback suggestions for teachers, not for students directly.
   - Also use AI as a **moderation pre-filter** for the feed, DMs and images. Kurdish moderation quality is unverified, so add human escalation.
9. **Generate content offline with human review: graded readers, example sentences, game items.**
   - Use LLMs to draft graded stories constrained to a learner's known-word list, plus example sentences per dictionary headword and distractors and rhyme sets for Wordle, rhyme match and quiz.
   - Run every draft through the guards in item 2, then a native editor; publish only approved items.
   - Possibly let trusted community writers earn Zêr as paid reviewers.
   - This gets most of the value of generative AI **without exposing learners or children to live Kurdish generation errors**.
10. **Children (likely under 13; under 16 in DE/NL/IE):**
    - **No open-ended AI chat and no free text or voice sent to LLM vendors.**
    - Children see only pre-generated, human-reviewed AI content and closed-choice "AI character" interactions.
    - No persona memory, so the feature is not a "companion" under SB 243-style laws.
    - For teens:
      - AI disclosure at the start and every 3 hours, plus break reminders;
      - self-harm escalation;
      - no training on minors' data;
      - zero or minimal retention contracts with vendors;
      - separate parental consent for any third-party AI processing (amended COPPA, in force 22 April 2026).
    - **Check provider terms before choosing a model.** A Gemini API under-18 restriction (unverified) could rule out the best Kurdish model for mixed-audience use. Anthropic and OpenAI have their own minor-use conditions.
11. **Cost architecture** (I):
    - Cache explanations; batch-generate content offline; route classification tasks (error tagging, moderation pre-screening) to small models only after HevalBench validation.
    - Reserve per-minute realtime voice for a premium tier (like Duolingo Max), with per-user daily AI budgets.
    - The Nigeria trial ($48 per student for 6 weeks with facilitation) and Tutor CoPilot ($20 per tutor per year) show that effective AI tutoring can be cheap when the AI is scoped narrowly.
12. **Make AI social, not solitary.**
    - ASR practice with a peer doubled the effect (g 0.89 vs 0.44), and Nigeria used pairs.
    - Add AI-refereed **paired speaking and writing challenges** in multiplayer, e.g., co-writing a short story where the AI suggests corrections to both players, or a describe-and-guess round.
    - AI judging should be advisory, with no league points at stake when confidence is low.
