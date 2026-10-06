# Speech Technology for Language Learning, Especially Low-Resource Kurdish: Pronunciation, Listening, ASR and TTS

Research date: 2026-10-06. Method note for the report writer: WebFetch and direct HTTP to Hugging Face were blocked by the egress proxy, so **every finding below comes from WebSearch result summaries and snippets, not from reading the full papers or model cards.** Numbers are reported as the search summaries gave them. Where a summary was ambiguous, conflicting, or came only from an aggregator, I say so. The search budget ran out before I could check universal phone recognizers (Allosaurus, ZIPA and similar); see Gaps.

Evidence grades used: **[MA]** meta-analysis; **[SR]** systematic review without pooling; **[RCT/QE]** randomized or quasi-experimental study; **[Bench]** technical benchmark or observational evaluation (a model's error rates on a test set); **[Expert]** expert or practitioner opinion; **[Vendor]** vendor or developer claim; **[Snippet-only]** the claim rests on a search summary whose attribution was unclear.

---

## 1. Evidence on pronunciation training: CAPT effectiveness, HVPT, shadowing, perception-before-production, visual feedback

### Takeaway
Pronunciation instruction works, and computer-assisted pronunciation training (CAPT) has medium pooled effects (g/d ≈ 0.68–0.69). Effects are largest for **explicit corrective feedback, segmental targets (single sounds), beginners, and controlled tasks.** High-variability phonetic training (HVPT), which means perception drills that use many voices, gives large perception gains (g ≈ 1.0, about 0.7 after correcting for publication bias). It gives only small and unreliable gains in production. Shadowing and visual pitch feedback look promising but have no meta-analytic support yet.

### Cited Findings

**General pronunciation instruction**
- [MA] Lee, Jang & Plonsky (2015, *Applied Linguistics* 36(3)) pooled 86 reports and found a large effect for pronunciation instruction: d = 0.89 within groups and 0.80 between groups. Effects were larger for **longer interventions, treatments that gave feedback, and controlled outcome measures**. This is an older baseline, still widely cited. — [NAU Experts](https://experts.nau.edu/en/publications/the-effectiveness-of-second-language-pronunciation-instruction-a-/); [shadowing search summary](https://www.tandfonline.com/doi/full/10.1080/29984475.2025.2546827)
- [MA] Saito & Plonsky (2019, *Language Learning* 69(3):652–708) coded 77 studies (1982–2017). Instruction is **most effective when it targets learners' monitored production of specific segmental or suprasegmental features**. Its effect on global human ratings of spontaneous speech "remains relatively unclear." — [NAU Experts](https://experts.nau.edu/en/publications/effects-of-second-language-pronunciation-teaching-revisited-a-pro/); [UCL Discovery](https://discovery-pp.ucl.ac.uk/id/eprint/10068780)

**CAPT meta-analyses**
- [MA] Mahdi & Al Khateeb (2019, *Review of Education*) reviewed 20 studies. CAPT was effective, especially for beginners and intermediates. A search summary reports a medium pooled effect, d = 0.68, from 20 studies, but I could not confirm in the abstract that this number belongs to this paper. This 2019 finding is **older and has been complemented by the 2024 meta-analyses below**. — [Wiley](https://bera-journals.onlinelibrary.wiley.com/doi/abs/10.1002/rev3.3165); [ERIC EJ1231516](https://eric.ed.gov/?id=EJ1231516); [Snippet-only for d = 0.68]
- [MA] Almusharraf, Mahdi, Al-Nofaie & Aljasser (2024, *JCAL* 40(4):1605–1615) pooled 31 primary studies with 42 effect sizes and found a medium overall effect. CAPT **inside classrooms** had a large effect. CAPT in **schools and language institutes** had a large effect, while in universities it was medium. **Video-based tools** had a large effect; other tools had medium effects. — [Wiley](https://onlinelibrary.wiley.com/doi/10.1111/jcal.12974)
- [MA] Ngo, Chen & Lai (2024, *ReCALL* 36(1):4–21) studied ASR-based pronunciation training: 15 studies, 38 effect sizes, 2008–2021.
  - Pooled g = 0.69, 95% CI [0.31, 1.08].
  - **Explicit corrective feedback g = 0.86 vs indirect feedback g = 0.50.**
  - **Segmental targets g = 0.82 vs suprasegmental g = 0.37.**
  - Note that the confidence interval is wide and the evidence base is small (15 studies).
  - [Cambridge](https://www.cambridge.org/core/journals/recall/article/effectiveness-of-automatic-speech-recognition-in-eslefl-pronunciation-a-metaanalysis/A915444CF252B61D14961D2FE733822D); [PDF](https://www.cambridge.org/core/services/aop-cambridge-core/content/view/A915444CF252B61D14961D2FE733822D/S0958344023000113a.pdf/effectiveness_of_automatic_speech_recognition_in_eslefl_pronunciation_a_metaanalysis.pdf)
- [MA, Snippet-only] A further meta-analysis of 37 experimental and quasi-experimental studies reported Hedges' g = 0.68, which the summary called medium-to-large. It appears to be the conference abstract "Technology-Based Settings for Pronunciation Skills: Meta-Analytical Insights." Its authorship and quality are unverified. — [dpublication](https://www.dpublication.com/abstract-of-10th-aretl/13-4483/)
- [SR] A *ReCALL* (2024) systematic review of CAPT found that **few studies used global measures such as intelligibility or comprehensibility**. Practice in the reviewed studies was **dominated by listen-and-repeat and read-aloud drilling**, "despite the technological innovations available." — [Cambridge PDF](https://resolve.cambridge.org/core/services/aop-cambridge-core/content/view/71E786F7DFC99727837909FDED7A2320/S0958344024000181a.pdf/computer-assisted-pronunciation-training-a-systematic-review.pdf)
- [MA, adjacent topic] A three-level meta-analysis of dialogue-based CALL systems for L2 speaking development exists in *ReCALL*. I did not retrieve its numbers. — [Cambridge](https://www.cambridge.org/core/journals/recall/article/dialoguebased-computerassisted-language-learning-systems-for-second-language-speaking-development-a-threelevel-metaanalysis/31847710516602398819C5E594038E7B)

**High-variability phonetic training (HVPT) and perception-before-production**
- [MA] Uchihara et al. (2025, *Studies in Second Language Acquisition* 47(3):794–827) is a meta-analysis of 79 HVPT studies.
  - Pooled perception gain **g = 1.02, which drops to 0.71 after adjusting for publication bias.**
  - A summary attributes average perception improvement of **14.12% on trained items and 12.96% on untrained items** to this line of work. This is Snippet-only: it may come from this paper or from the companion paper below.
  - Talker number: **no significant difference anywhere between 2 and 30 talkers**, with slightly smaller effects at 20–30.
  - Audiovisual input, type of corrective feedback, and order of talker presentation were **not** significant predictors.
  - This supersedes earlier, smaller HVPT syntheses, such as the 2024 ERIC meta-analysis and the 2021 JSLHR talker-variability review.
  - [Cambridge](https://www.cambridge.org/core/journals/studies-in-second-language-acquisition/article/high-variability-phonetic-training-hvpt-a-metaanalysis-of-l2-perceptual-training-studies/6ABB8C1F32D88D53EA8D05A4565E76F6); [researchmap PDF](https://researchmap.jp/takumiuchihara/published_papers/50374212/attachment_file.pdf); [ERIC 2024](https://files.eric.ed.gov/fulltext/EJ1425175.pdf); [JSLHR 2021](https://pubs.asha.org/doi/abs/10.1044/2021_JSLHR-21-00181)
- [MA] Uchihara et al. (2024, *Applied Psycholinguistics*) asked whether perceptual HVPT improves production.
  - Production gains were **small to medium: 10.50% on trained items, 4.50% on untrained items.**
  - The study-level correlation between perception gains and production gains was **small and nonsignificant.**
  - There was **no strong support for long-term retention of production learning or for generalization** to untrained items.
  - [Cambridge](https://www.cambridge.org/core/journals/applied-psycholinguistics/article/does-perceptual-high-variability-phonetic-training-improve-l2-speech-production-a-metaanalysis-of-perceptionproduction-connection/E38D8F5CE65DC708137B0E95F97C6BC7)
- [MA] Sakai & Moorman (2018, *Applied Psycholinguistics*) covered 25 years of perception-training studies.
  - Perception **d = 0.92**; production **d = 0.54**.
  - The perception–production correlation was not significant.
  - **Obstruents (stops, fricatives, affricates) improved more than sonorants or vowels.**
  - These numbers are consistent with Uchihara 2024, which uses a larger and more recent HVPT-specific sample.
  - [Cambridge](https://resolve.cambridge.org/core/journals/applied-psycholinguistics/article/can-perception-training-improve-the-production-of-second-language-phonemes-a-metaanalytic-review-of-25-years-of-perception-training-research/57401D28450902EE96659AD10AA11488)
- [Expert/SR] There is "strong evidence" that training on individual sounds such as HVPT improves phoneme identification and makes word- and sentence-level speech more intelligible. This comes from a review summary, and the claim is stronger than what the 2024 production meta-analysis supports. — [Cambridge PDF (CAPT systematic review)](https://resolve.cambridge.org/core/services/aop-cambridge-core/content/view/71E786F7DFC99727837909FDED7A2320/S0958344024000181a.pdf/computer-assisted-pronunciation-training-a-systematic-review.pdf)
- [Expert] Saito (2022, *Language Learning*) discusses the potential and limits of incidental and multimodal HVPT. I did not retrieve details. — [Wiley](https://onlinelibrary.wiley.com/doi/10.1111/lang.12503)
- [RCT/QE] Thomson's CAPT work targeting L2 vowel perception reported that it improves pronunciation (CALICO). — [Equinox](https://api.equinoxpub.com/articles/22985)

**Shadowing**
- [SR] A 2025 systematic review (Tandfonline, 44 studies from six databases) tentatively finds that shadowing improves comprehensibility, intelligibility, accentedness, fluency and prosody. **Evidence on segmental gains is inconclusive.** I found no shadowing meta-analysis. — [Tandfonline](https://www.tandfonline.com/doi/full/10.1080/29984475.2025.2546827); [ResearchGate](https://www.researchgate.net/publication/395163218_A_Systematic_Review_of_Research_on_the_use_of_Shadowing_for_Second_Language_Pronunciation_Teaching); [Oxford ORA review](https://ora.ox.ac.uk/objects/uuid:3104cae1-3a6b-400a-b173-de44384238d2/files/r1z40kv86w)
- [RCT/QE] A 2025 study combined shadowing practice with ASR feedback to improve EFL pronunciation accuracy and fluency. I could not reliably attribute specific statistics to it from the snippet. — [Springer](https://link.springer.com/article/10.1007/s40692-025-00374-x)

**Visual feedback**
- [QE, no MA found] Visual pitch-contour feedback can support L2 intonation learning, and visual-acoustic biofeedback training produced significant production gains. One JSLP study reports that **all forms of visual feedback helped, with the largest gains after longer treatments and a sequential approach.** — [JSLP / Benjamins](https://www.jbe-platform.com/content/journals/10.1075/jslp.20005.ols); [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC6937206)
- [QE] In contextualized computer-based prosody training, all groups improved. **Discourse-level input transferred better to novel natural speech**, and video helped more with discourse-level input than with isolated sentences. — [CALICO / Equinox](https://journals.equinoxpub.com/CALICO/article/view/23182)

### Inferences
- The strongest supported design for Kurdish sounds is: **explicit, segment-level feedback, plus perception training across many voices, plus long or repeated exposure.** Suprasegmental and "global accent" scoring has weaker support and is harder to automate.
- Perception training is cheap and robust, because it needs only recorded audio and no ASR. Its transfer to production is modest and inconsistent. So use perception training as a foundation, and pair it with production practice instead of treating it as a replacement.
- The finding that obstruents improve most (Sakai & Moorman) matters for Kurmanji. Its hardest contrasts for non-native and many heritage learners are stop and affricate contrasts (see section 4), so they are exactly the category perception training helps most.
- About 5–10 talkers per contrast is probably enough. Uchihara 2025 found no gain from going beyond a few talkers up to 30. This makes HVPT feasible with a modest volunteer recording drive.

### Gaps
- I could not retrieve Thomson & Derwing (2015) directly. Its conclusions (for example, that intelligibility should be prioritized over nativeness, and that most CAPT studies have weak designs) are not cited here from a primary source.
- No meta-analysis of shadowing or of visual pitch feedback was found.
- No pronunciation-training studies of any kind on **Kurdish as L2** were found. All of the evidence above comes from other languages, mostly English as L2.
- The retention and generalization data come from summaries. The exact delayed-posttest effect sizes were not retrieved.

---

## 2. Kurdish ASR: availability and quality for Kurmanji (kmr) and Sorani (ckb)

### Takeaway
As of October 2026, **no off-the-shelf model gives reliably good, learner-grade Kurmanji ASR.**
- Whisper does not officially support Kurdish.
- Fine-tuned models reach about 10–12% WER on in-domain read speech for both Kurmanji and Sorani. Error rates are much higher out of domain: about 28% WER on FLEURS-Kobani, and complete failure on non-standard varieties.
- Meta's Omnilingual ASR (Nov 2025, Apache 2.0) is the most important new option. It explicitly covers kmr_Latn and ckb_Arab and has a 300M model that can run on devices. I found no published Kurdish-specific error rates for it.
- Google Chirp 3 supports only Sorani (ckb-IQ, in preview). Azure has no Kurdish speech support that I could find.

### Cited Findings

**Foundation and multilingual models**
- [Bench/docs] **Whisper (including large-v3) covers 99 languages, and Kurdish is not among them.** All Kurdish Whisper results come from fine-tuning. — [Whisper languages (Mintlify mirror)](https://www.mintlify.com/openai/whisper/concepts/languages); [HF large-v3 README](https://huggingface.co/openai/whisper-large-v3/blob/f6811141b63c306e32c86041979f6a691bb62892/README.md?code=true); [arXiv 2410.16330](https://arxiv.org/html/2410.16330v1)
- [Bench/Vendor] **Meta Omnilingual ASR** (released Nov 2025, arXiv 2511.09690):
  - Covers 1,600+ languages and reports CER below 10% for 78% of 1,570 tested languages.
  - Trained on about 4.3M hours of audio, with a 7B-parameter wav2vec 2.0 encoder.
  - The language list includes **ckb_Arab, kmr_Latn, kmr_Arab, kmr_Cyrl and kur_Arab.**
  - Model sizes are 300M, 1B, 3B and 7B. The CTC-300M model is reported at **96× real time on 2 GiB VRAM**. A third-party CoreML port runs the 300M model on the Apple Neural Engine.
  - Models are released under **Apache 2.0** and the corpus under CC-BY.
  - Language list and benchmarks are vendor-reported.
  - [Slator](https://slator.com/what-is-meta-omnilingual-asr/); [arXiv 2511.09690](https://arxiv.org/pdf/2511.09690); [Supported languages (Mintlify mirror)](https://www.mintlify.com/facebookresearch/omnilingual-asr/supported-languages); [Soniqo Apple Silicon guide](https://soniqo.audio/guides/omnilingual); [VentureBeat](https://venturebeat.com/ai/meta-returns-to-open-source-ai-with-omnilingual-asr-models-that-can); [The Decoder](https://the-decoder.com/metas-omnilingual-asr-brings-speech-recognition-to-1600-languages/)
- [Bench] Meta MMS: the **MMS-1B-all model has a Central Kurdish (ckb) adapter.** Evaluated unadapted on 1,722 segments (117.9 minutes) of **Garrusi Kurdish**, written in Latin field orthography, it failed:
  - 111.70% WER and 100.92% CER on the raw Arabic-script output.
  - Even after transliteration and orthographic folding, 97.85% WER and 51.20% CER.
  - Part of the failure is measurement: script mismatch counts as recognition error. The rest is a real dialect gap.
  - [arXiv 2608.16379](https://arxiv.org/abs/2608.16379)
- [Docs] **Google Cloud Speech-to-Text Chirp 3 lists Central Kurdish (Iraq), "ckb-IQ", in Preview.** I found no Kurmanji locale. Chirp 3 became generally available in Oct 2025. — [Google Chirp 3 docs](https://docs.cloud.google.com/speech-to-text/docs/models/chirp-3)
- [Vendor] ElevenLabs offers **Central Kurdish speech-to-text** (Scribe), and a search summary says Scribe v2 supports Kurdish among 90+ languages. — [ElevenLabs Central Kurdish STT](https://elevenlabs.io/speech-to-text/central-kurdish); [ElevenLabs STT docs](https://elevenlabs.io/docs/overview/capabilities/speech-to-text)
- [Docs] **Azure:** Microsoft Translator has supported Northern and Central Kurdish **text** translation since August 2020. I found no Azure Speech locale for Kurdish STT or TTS, and no Kurdish locale for Azure Pronunciation Assessment. This is an absence of evidence, not a confirmed absence. — [Microsoft Translator blog](https://www.microsoft.com/en-us/translator/blog/2020/08/20/translator-adds-two-kurdish-dialects-for-text-translation/); [Azure language-support doc](https://github.com/MicrosoftDocs/azure-docs/blob/main/articles/ai-services/speech-service/language-support.md)
- [Vendor, conflicting] Gemini Live API: an April 2026 Google developer-forum thread requests a Kurdish (Sorani) voice, which implies it was absent. A search summary of the same thread claims Google replied that Kurdish "is currently supported." This is unresolved. — [Google AI forum](https://discuss.ai.google.dev/t/requesting-kurdish-sorani-voice-to-gemini-voices/139217)

**Kurmanji (Northern Kurdish) results**
- [Bench] Northern Kurdish ASR with Whisper (arXiv 2410.16330, 2024): about **68 h** of validated transcribed speech. An "additional module" fine-tuning strategy gave **WER 10.5%, CER 5.7% with Whisper v3.** — [arXiv](https://arxiv.org/abs/2410.16330)
- [Bench] **FLEURS-Kobani** (2026, DialRes / arXiv 2603.29892) is the first public Northern Kurdish ASR, speech-translation and speech-to-speech benchmark:
  - 5,162 validated utterances, **18 h 24 min, 31 native speakers**, CC BY 4.0.
  - Best ASR was Whisper large-v3 with two-stage fine-tuning (Common Voice, then FLEURS-Kobani): **WER 28.11, CER 9.84** on test.
  - Kurmanji-to-English speech translation scored 8.68 BLEU.
  - [arXiv HTML](https://arxiv.org/html/2603.29892); [ACL Anthology](https://aclanthology.org/2026.dialres-1.10/); [HF dataset](https://huggingface.co/datasets/aranemini/northern-kurdish-fleurs)
- [Bench] **Badini** (a Northern Kurdish variant), from about 15 h of narrated children's stories (78 stories, 6 narrators). **Wav2Vec2-XLSR-53 clearly beat Whisper-small:**

  | Model | Accuracy | Readability |
  |---|---|---|
  | Wav2Vec2-XLSR-53 | 82.67% | 90.38% |
  | Whisper-small | 53.17% | 65.45% |

  [arXiv 2508.09957](https://arxiv.org/html/2508.09957v1)
- [Bench] FLEURS-Badini (IWSLT 2026) extends FLEURS to Badini. A summary says Omnilingual models showed higher error rates on Badini, but I did not retrieve the numbers. — [ACL Anthology](https://aclanthology.org/2026.iwslt-1.14/); [Badini reusability paper](https://aclanthology.org/2026.dialres-1.11/)
- [Community] A Kurmanji Whisper fine-tune exists on Hugging Face: `amedcj/whisper-kurmanji`, trained on Common Voice Kurmanji. I did not retrieve its WER. — [HF](https://huggingface.co/amedcj/whisper-kurmanji)

**Sorani (Central Kurdish) results**
- [Bench] Central Kurdish ASR (arXiv 2406.02561, 2024) used a corpus of about 100 h. **XLS-R-2B with a 3-gram LM and a Kurdish tokenizer reached WER 10.0% on validation and 11.8% on the AsoSoft test set.** Common Voice ckb contains only standard Central Kurdish text, though speakers' accents vary. — [arXiv](https://arxiv.org/pdf/2406.02561)
- [Community] Hugging Face models:
  - `roshna-omer/whisper-small-Kurdish-Sorani`: WER about 13.2.
  - `rzgar/qwen3-asr-sorani-kurdish-ckb-v1`: a Qwen3-ASR-1.7B adaptation. WER not retrieved.
  - `PawanKrd/asr-large-ckb` and `asr-tiny-ckb`: gated, metrics not retrieved.
  - [roshna-omer](https://huggingface.co/roshna-omer/whisper-small-Kurdish-Sorani); [rzgar](https://huggingface.co/rzgar/qwen3-asr-sorani-kurdish-ckb-v1); [PawanKrd](https://huggingface.co/PawanKrd/asr-large-ckb)

**Datasets**
- [Bench] **Common Voice Kurmanji has about 68 h validated**, per the FLEURS-Kobani paper summary. Common Voice clips need at least 2 up-votes to count as validated. This figure probably reflects a 2024–2025 release. Common Voice as a whole reached 22,640 validated hours in release 22.0. — [arXiv 2603.29892](https://arxiv.org/html/2603.29892); [CV 22.0 release](https://discourse.mozilla.org/t/common-voice-22-0-release/144358)
- [Docs] KASET (LDC2024S01) has about 147 h of Kurmanji and Sorani telephone and broadcast speech, of which about 60 h is transcribed. It is an LDC license, not free. — [LDC](https://catalog.ldc.upenn.edu/LDC2024S01)
- [Bench] Hameed, Ahmadi, Hadi & Sennrich (Interspeech 2025) ran a **volunteer, community-driven speech collection** for six low-resource Middle Eastern languages (including Laki, Hawrami, Southern Kurdish and Zazaki) and fine-tuned Whisper. They report clear limitations of state-of-the-art models on these languages. Code is open. — [ISCA PDF](https://www.isca-archive.org/interspeech_2025/hameed25_interspeech.pdf); [GitHub DOLMA-NLP/asr](https://github.com/DOLMA-NLP/asr)

**Children and on-device use**
- [Bench/Expert] Children's speech is much harder to recognize.
  - Whisper scores about 3% WER on clean adult speech vs about 25% on similar child speech.
  - Typical figures are 15–21% WER for ages 6–10 and up to 35% for ages 4–6.
  - Kid-Whisper fine-tuning cut MyST WER from 13.93% to 9.11% (Whisper-small).
  - All of these figures are for English.
  - [Learning Agency](https://the-learning-agency.com/the-cutting-ed/article/how-speech-recognition-systems-struggle-with-childrens-voices/); [Kid-Whisper, AAAI/AIES](https://ojs.aaai.org/index.php/AIES/article/view/31618)
- [Docs] `react-native-sherpa-onnx` provides offline STT (Whisper, Zipformer, Paraformer), TTS (VITS, Matcha, Kokoro) and VAD on Android 7+ and iOS 13+, with NNAPI and Core ML acceleration. Expo would need a development build or config plugin, not Expo Go. That last point is my inference. — [GitHub](https://github.com/XDcobra/react-native-sherpa-onnx); [Docs](https://www.mintlify.com/xdcobra/react-native-sherpa-onnx)

### Inferences
- **Kurmanji ASR is good enough for constrained tasks but not for open-ended conversation scoring.** Constrained tasks include "say this word or sentence," keyword spotting, and checking whether the expected word was recognized. CER of about 6–10% on read speech is usable when the expected text is known. WER of 28% on harder read sentences is not good enough for open-ended feedback.
- Omnilingual ASR's Apache 2.0 license, kmr_Latn coverage and 300M size make it the most practical base model for a small team. However, it is **untested for Kurdish in public sources**, so Hevalo must build its own small evaluation set (see Implications).
- Off-the-shelf scores will be much worse for children, Badini and other dialect speakers, and heritage learners with mixed accents. Hevalo should not penalize users on the basis of ASR output alone.
- Script matters. Sorani models output Arabic script, and the Garrusi study shows script mismatch can masquerade as 100% error. Hevalo's evaluation must normalize scripts.

### Gaps
- No public Kurdish-specific WER or CER for Omnilingual ASR, Google Chirp 3 (ckb-IQ) or ElevenLabs Scribe was found.
- Current Common Voice validated hours for kmr and ckb (CV 23 or 24) were not retrieved, and the ckb figure was not found at all.
- I did not verify whether MMS-1B-all has a **kmr** ASR adapter. Only the ckb adapter was confirmed.
- I found no reports of on-device Kurdish ASR in production apps.

---

## 3. Kurdish TTS: MMS-TTS, Coqui/XTTS/F5, commercial support, quality, and the risk of synthetic pronunciation models

### Takeaway
Sorani TTS is advancing quickly in research: F5-TTS adaptations from JSALT 2025 report MOS of 3.9–4.7. **Kurmanji TTS is much thinner.** Meta's MMS-TTS has a Kurmanji model, but the only one I could confirm is in **Arabic script**. Commercial coverage is patchy:
- ElevenLabs v4 reportedly supports Sorani only.
- Google and Azure TTS support neither variety, as far as I could find.
- Small Kurdish vendors claim hundreds of voices, but their claims are unverified.

For pronunciation models, high-quality **English** TTS performs about as well as human voices in learner ratings. However, **Kurmanji Hawar orthography does not mark the aspirated vs unaspirated stop contrast.** A text-driven TTS therefore cannot reliably produce the contrast learners most need. Native recordings should remain the reference for pronunciation content.

### Cited Findings

**Open models and research**
- [Docs] An MMS-TTS model for Northern Kurdish exists: `facebook/mms-tts-kmr-script_arabic`, a VITS model. — [HF](https://huggingface.co/facebook/mms-tts-kmr-script_arabic)
  - A `kmr-script_latin` variant is mentioned only on an aggregator page that also mislabels it as Sorani. Its existence is **unverified**. — [PromptLayer](https://www.promptlayer.com/models/mms-tts)
  - One summary claims the MMS ckb adapter supports TTS. This is unverified and may be a confusion with ASR. — [arXiv 2609.11246 summary](https://arxiv.org/pdf/2609.11246)
- [Bench] The JSALT 2025 workshop's TTS4All initiative released **three Central Kurdish TTS models based on F5-TTS** (`aranemini/central-kurdish-tts`). They support speech generation, voice cloning and speech-translation use. — [HF](https://huggingface.co/aranemini/central-kurdish-tts)
- [Bench, single team] An F5-TTS adaptation to Sorani reported **CER 4.3% and MOS 4.72**, which the authors describe as close to the original speaker. — [ResearchGate](https://www.researchgate.net/publication/396411677_Adapting_F5-TTS_Model_to_Kurdish_Sorani_Diffusion-based_Speech_Synthesis_with_a_Specialized_Dataset)
- [Bench] Ahmad & Rashid (2024, *Algorithms*) trained a VAE-based end-to-end Sorani TTS and reported **MOS 3.94** on a custom dataset. — [arXiv 2408.03887](https://arxiv.org/pdf/2408.03887)
- [Bench] Asadpour (2026, arXiv 2609.11246) audited a recent public Central Kurdish TTS release: three voices and 35 h of speech. It found:
  - a configuration file listing equipment that was never used;
  - **test recordings left unlabeled inside the training data** (evaluation leakage);
  - a bug in long-number normalization.
  - It also notes that three speakers reading prepared texts **strip out regional and everyday speech.**

  [arXiv](https://arxiv.org/abs/2609.11246)
- [Docs] Sorani TTS datasets:
  - SoraniTTS (Mendeley, Sept 2025): 6,565 sentences, about 19 h.
  - Gigant-KTTS: 6,078 samples plus a pronunciation lexicon.
  - Central Kurdish TTS dataset 1.0 on the Mozilla Data Collective: 2 h 18 min, 1,653 files.
  - A 21 h female-voice corpus (ScienceDirect, 2024).

  [Mendeley](https://data.mendeley.com/datasets/jmtn248cc9/5); [PMC Gigant-KTTS](https://pmc.ncbi.nlm.nih.gov/articles/PMC11324836/); [Mozilla Data Collective](https://mozilladatacollective.com/datasets/cmj77njd701ljmb07m97pw1p3); [ScienceDirect](https://www.sciencedirect.com/science/article/pii/S294971912400044X)
- [Expert] Published Kurdish TTS research and datasets focus overwhelmingly on Central Kurdish. **Northern Kurdish (Kurmanji) TTS is much more limited.** — [search summary across PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC11324836/) and [ScienceDirect](https://www.sciencedirect.com/science/article/pii/S294971912400044X)

**Commercial**
- [Vendor] ElevenLabs Eleven v4 reportedly lists **Sorani Kurdish (ckb)** among its 90+ TTS languages, according to a search summary of the docs. This conflicts with an earlier Change.org petition saying ElevenLabs lacked Kurdish TTS, probably because the petition predates v4. Kurmanji was not mentioned. — [ElevenLabs Eleven v4 docs](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/eleven-v4); [ElevenLabs models](https://elevenlabs.io/docs/overview/models); [Change.org](https://www.change.org/p/provide-kurdish-language-support-on-elevenlabs-website-for-text-to-speech-speech-to-text)
- [Vendor, conflicting] KurdishTTS (kurdishtts.com) claims Sorani, Kurmanji and Badini TTS, STT with dialect detection, voice chat, an API with a free tier, and an MCP server.
  - Voice counts conflict: **198** (Google Play listing) vs **664** (MCP directory).
  - It appears to be built by an individual developer listed as "Bear Rizgar."
  - There is no independent quality evaluation.

  [kurdishtts.com](https://www.kurdishtts.com/); [Google Play](https://play.google.com/store/apps/details?id=com.kurdishttsapp.mobile&hl=en_US); [MCP listing](https://www.getdrio.com/mcp/com-kurdishtts-kurdish-tts-stt/md)
- [News] Google Translate added Sorani as a text language in May 2022 (Kurmanji was earlier). I found no confirmation of a Kurdish TTS voice in Google Translate or Google Cloud TTS. — [Rudaw](https://www.rudaw.net/english/kurdistan/110520224); [Kurdistan Chronicle](https://www.kurdistanchronicle.com/babat/2697)

**Synthetic voices as pronunciation models**
- [QE, older, English only] 29 Brazilian EFL learners rated a TTS voice **about as well as a human voice on almost every measure** (comprehensibility, naturalness, accuracy). Learners noticed few differences on short and long vowels. Synthetic **sentences** were easier to understand than synthetic **isolated words**. These are mid-2010s studies on high-resource English TTS. — [LLT / ScholarSpace](https://scholarspace.manoa.hawaii.edu/server/api/core/bitstreams/54f66cfe-2240-41a9-8c61-54a2396388fa/content); [ERIC ED578266](https://files.eric.ed.gov/fulltext/ED578266.pdf); [Academia figure](https://www.academia.edu/figures/31701452/figure-1-synthetic-voices-in-the-foreign-language-context)
- [Bench] Korzekwa et al. (2022, *Speech Communication*) showed that synthetic speech can **generate mispronounced training data** for pronunciation-error detectors ("speech synthesis is almost all you need"). A 2026 paper uses TTS augmentation for L2 English speaking assessment. — [ScienceDirect](https://www.sciencedirect.com/science/article/pii/S0167639322000863); [arXiv 2207.00774](https://arxiv.org/pdf/2207.00774); [arXiv 2607.10790](https://arxiv.org/pdf/2607.10790)
- [Docs] **Kurmanji has a three-way stop contrast:** voiced, voiceless aspirated, and voiceless unaspirated (slightly pharyngealized).
  - The pairs are /p/–/pʰ/, /t/–/tʰ/, /k/–/kʰ/ and /t͡ʃ/–/t͡ʃʰ/.
  - **The aspiration contrast is not written in Hawar Latin orthography**, only in Kurdish Cyrillic.
  - The unaspirated series is absent or disappearing in some dialects, for example Khorasan Kurmanji under Persian influence.

  [Wikipedia: Kurdish phonology](https://en.wikipedia.org/wiki/Kurdish_phonology); [Wikipedia: Kurmanji](https://en.wikipedia.org/wiki/Kurmanji)

### Inferences
- **For Kurmanji pronunciation content, native recordings are mandatory.** A grapheme-to-speech TTS trained on Hawar text has no signal telling it which /p/ or /t/ to produce. It will either guess from training statistics or neutralize the contrast, and that is the contrast learners most need to hear. This is my inference from the orthography fact, not a tested result.
- For **listening volume** (stories, dialogues, community-post read-aloud), good Sorani TTS such as F5-based models or ElevenLabs v4 is plausible today, given English evidence that TTS sentences are acceptable input. **Kurmanji TTS should be pilot-tested** with native raters before wide use.
- Voice-cloning F5-type models could, in principle, extend a small set of consented native voices. That raises consent and licensing questions (see Implications).
- TTS is most valuable for **training scorers** (synthetic mispronunciations) and **filling gaps**, not as the gold pronunciation model.

### Gaps
- I could not verify whether a Latin-script Kurmanji MMS-TTS model exists, or what MMS-TTS's license is. MMS weights are widely understood to be CC-BY-NC 4.0, which would bar commercial use, but **I did not verify this in this session**. Check the model card before any use.
- There are no independent MOS or intelligibility evaluations of commercial Kurdish TTS (kurdishtts.com, ElevenLabs v4 Sorani).
- I found no studies of learners trained on synthetic vs natural voices in **any low-resource language**.
- XTTS/Coqui Kurdish support was not found in searches. Coqui (the company) shut down in early 2024; that fact is from prior knowledge and was not re-verified here.

---

## 4. Pronunciation scoring for low-resource languages: GOP, phoneme recognizers, LLM audio models, and feasibility for Kurdish

### Takeaway
Classic goodness-of-pronunciation (GOP) scoring and wav2vec2-family phoneme or articulatory-feature recognizers are the realistic route for Kurdish. Zero-shot LLM audio models are poor scorers even in English: GPT-4o sentence-level correlation with humans was r ≈ 0.45 vs about 0.81 for specialized models, and phoneme-level r ≈ 0.24 vs 0.69. They should not be the scoring engine. For Kurdish, **word- and phoneme-level checks against a known target are feasible** with a fine-tuned CTC model and forced alignment. **Reliable phone-level diagnosis of the aspiration contrast is unproven** and needs custom labeled data.

### Cited Findings
- [SR] An overview of automatic pronunciation assessment, covering GOP, alignment-based scoring and end-to-end methods, appears in "Automatic Pronunciation Assessment — A Review" (2023). — [arXiv 2310.13974](https://arxiv.org/pdf/2310.13974)
- [Bench] Wav2Vec2-BERT has been evaluated for **CAPT in an under-resourced language** (isiZulu; its pretraining included 67 h of isiZulu ASR data). The authors offer suggestions for building pronunciation tools in low-resource settings. — [Interspeech 2025 (Fort et al.)](https://www.isca-archive.org/interspeech_2025/fort25_interspeech.pdf)
- [Bench] A phonological-level, wav2vec2-based mispronunciation detection and diagnosis method detects errors in terms of **articulatory features** (manner, place) with a multi-label CTC loss, and reports state-of-the-art attribute detection (*Speech Communication* 2025). Articulatory features are language-transferable by design. — [ScienceDirect](https://www.sciencedirect.com/science/article/pii/S0167639325000640)
- [Bench] A fusion-aware two-stage mispronunciation detection framework exists for **low-resource Modern Standard Arabic** (2026), and a lightweight assessment method uses discrete speech-token surprisal (2026). Neither result was retrieved in detail. — [arXiv 2606.24086](https://arxiv.org/pdf/2606.24086); [arXiv 2606.19910](https://arxiv.org/pdf/2606.19910)
- [Bench] An unsupervised intelligibility score based on the alignment distance between teacher and learner wav2vec2 representations needs **no phone labels**, only a reference recording. — [arXiv 2306.08845](https://arxiv.org/pdf/2306.08845)
- [Bench] **LLM audio models, zero-shot, on speechocean762** (5,000 English utterances, 250 Mandarin L1 speakers):

  | Level | GPT-4o PCC | Specialized model (3MH) PCC |
  |---|---|---|
  | Sentence total | 0.445 | 0.811 |
  | Phoneme | 0.241 | 0.693 |

  One-shot prompting did not help much, and audio-input LLMs are costly. — [arXiv 2503.11229](https://arxiv.org/html/2503.11229)
- [Bench] **Fine-tuning** multimodal LLMs, for example with LoRA, substantially improves their pronunciation scores in English. Zero-shot speech LLMs for multi-aspect L2 evaluation were studied at SLaTE 2025. — [arXiv 2509.15701](https://arxiv.org/html/2509.15701); [arXiv 2509.02915](https://arxiv.org/html/2509.02915); [SLaTE 2025](https://www.isca-archive.org/slate_2025/parikh25_slate.pdf); [AudioJudge](https://arxiv.org/pdf/2507.12705)
- [MA] For tie-in, see Ngo et al. 2024 in section 1: **explicit** corrective feedback (g = 0.86) beat indirect feedback (0.50), and segmental feedback beat suprasegmental. So a scorer only needs to localize *which sound* went wrong to be pedagogically useful.

### Inferences
- Hevalo's scoring tiers, from most to least feasible, with a small team in 2026:
  1. **Template-matching:** compare the learner's recording against native recordings of the same item using wav2vec2 or HuBERT embedding distance. This needs no Kurdish ASR training and works for the alphabet and word lists. It gives a coarse similarity score only.
  2. **Did-they-say-the-target-word:** run a fine-tuned Kurmanji or Sorani CTC model (an Omnilingual or XLS-R fine-tune) with forced alignment to the expected text, and compute GOP-style posteriors per character or phoneme. Kurmanji Hawar is close to phonemic, so characters can serve as phone proxies, except for the unmarked aspiration contrast.
  3. **Contrast-specific detectors** for aspirated vs unaspirated stops (and Sorani-specific targets). These need a few thousand native tokens labeled for the contrast, plus synthetic or elicited errors.
  4. **LLM audio models** only for qualitative coaching text, never for scores.
- Given the children's-ASR gap and dialect variation, scores must be **lenient, positive, and paired with the native model to compare against**, not presented as pass/fail.

### Gaps
- **Search budget ran out before I could check universal phone recognizers** (Allosaurus, ZIPA, and other 2025 phone-recognition models) and their accuracy on unseen languages. No sourced numbers are available here.
- No Kurdish GOP or mispronunciation-detection paper was found. No labeled Kurdish L2 pronunciation dataset (a speechocean762 equivalent) was found.
- No Kurdish results for LLM audio models were found, and GPT-4o voice support for Kurdish was not confirmed.

---

## 5. Listening comprehension training: speed control, transcripts, dictation, minimal pairs, audio-first lessons

### Takeaway
Captions and transcripts reliably help L2 listening and vocabulary, especially at low proficiency. Reading-while-listening gives only a small edge over reading alone (g ≈ 0.18), and only when the audio sets the pace. Slower speech is preferred by learners, but its comprehension benefit is mixed. Dictation improves phonological decoding more than overall listening. Minimal-pair and HVPT perception games are the best-supported bottom-up listening tool (section 1).

### Cited Findings
- [MA, older] Montero Perez, Van Den Noortgate & Desmet (2013) is the seminal meta-analysis of captioned video for L2 listening and vocabulary. Later reviews continue to find that captions help comprehension, **especially at low proficiency**, and help vocabulary learning and anxiety. **The 2013 effect sizes were not retrieved in this session.** — [Frontiers 2022 review](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2022.904523/pdf); [ERIC](https://files.eric.ed.gov/fulltext/EJ1125240.pdf)
- [MA] Reading-while-listening vs reading only: 30 studies, N = 1,945, 62 effect sizes.
  - Overall **g = 0.18**, a small effect.
  - The benefit was confined to **experimenter- or audio-paced reading (g = 0.41)**. Self-paced reading showed g = 0.06.
  - [Cambridge (Language Teaching)](https://www.cambridge.org/core/services/aop-cambridge-core/content/view/S0261444822000507)
- [MA] Incidental vocabulary learning (24 studies, N = 2,771): gains were similar across reading (17%/15%), listening (15%/13%) and reading-while-listening (13%/17%) on immediate and delayed posttests. **Audio-only input teaches vocabulary about as well as text.** — [Cambridge](https://www.cambridge.org/core/product/B020D5E8D8B4764CFFBD6A97EC0D8F00)
- [QE, mixed] Speech rate: slower speech helped comprehension and lowered perceived difficulty in several studies. Others found **little benefit for lower-intermediate learners**, or found that **learners prefer slower playback but comprehension does not change**. — [Iowa State](https://dr.lib.iastate.edu/entities/publication/3007a6a2-58d7-4015-89ad-434c0e712bf8/full); [Arizona](https://repository.arizona.edu/handle/10150/194002?show=full); [Interspeech 2019 (Novak)](https://www.isca-archive.org/interspeech_2019/novak19_interspeech.html)
- [QE, mixed] Dictation **improved phonological recognition but not overall listening scores** in one study; the authors recommend pairing it with meaning-focused tasks. A transcribing exercise improved **beginners'** listening comprehension in another study. — [Tsukuba](https://tsukuba.repo.nii.ac.jp/record/2007991/files/DA010616.pdf); [Asian EFL Journal](https://mail.asian-efl-journal.com/PTA/October_2010.pdf)
- [QE] **TipTopTalk!** is a minimal-pair pronunciation serious game with exposure, discrimination and production stages, using TTS and ASR in a mobile app (Valladolid). — [UVaDoc](https://uvadoc.uva.es/bitstream/handle/10324/27857/tejedor16c.pdf?sequence=1)
- [RCT, clinical, adjacent] Mandarin-speaking preschoolers aged 5–6 with developmental language disorder (n = 33) used a 12-week app with **adaptive difficulty, multiple speaker voices**, and tone and consonant discrimination games. They gained in phonological awareness and receptive vocabulary vs an e-book control. Engagement was high: about 39 sessions on average, 83% in-app accuracy. This is not an L2 population, but it shows multi-talker discrimination games are workable for young children. — [FJU](https://spark.fju.edu.tw/node/428)

### Inferences
- **Transcripts and captions should be on by default for beginners and fadeable**, for example progressive caption reduction. Audio-paced highlighting, as in karaoke-style read-along, is the condition with the measurable advantage. Free self-paced reading next to audio adds little.
- **Speed control is a comfort and anxiety feature with uncertain learning value.** Offer 0.75× and 0.9×, but don't build lessons around slowing down. Native-recorded "slow careful" versions are better than time-stretched audio, because they keep clear articulation and fewer reductions. That is my inference from the rate literature's explanation for why slower speech helps.
- Dictation or "type what you hear" fits Hevalo's typing games and the Kurdish orthographies, which are close to phonemic. It mainly trains decoding, so pair it with meaning checks.
- Audio-only lessons are justified for vocabulary, since gains match reading. This matters for children who can't yet read and for heritage learners whose listening is stronger than their literacy.

### Gaps
- The Montero Perez 2013 effect sizes and any newer caption meta-analysis numbers were not retrieved.
- There are no studies of Kurdish listening instruction or of Kurdish heritage learners' listening vs literacy profiles. The latter is likely covered by the heritage-learner researcher's notes.
- I found no meta-analysis of speed-controlled playback.

---

## Implications for Hevalo

These follow from the findings above. The app context was supplied by the task, and I did not inspect the codebase. The items are ordered roughly by evidence strength and buildability for a small team.

### A. Perception first: an HVPT "Ear Training" track (no ASR needed, strongest evidence)
1. **Build a minimal-pair perception module** on top of the existing alphabet module. Use 2-alternative forced-choice "Which did you hear?" trials with **immediate right/wrong feedback and replay**.
   - Basis: HVPT perception g ≈ 0.71–1.02 (Uchihara 2025). Obstruents gain most (Sakai & Moorman 2018).
   - Kurmanji priority contrasts:
     - **aspirated vs unaspirated p/pʰ, t/tʰ, k/kʰ, ç/çʰ.** These are invisible in Hawar, so they are almost never taught in text-first apps.
     - Possible further candidates, **not sourced in these notes and to be confirmed by Kurdish linguists**: x vs the voiced uvular/velar fricative, h vs pharyngeal ḧ, and vowel pairs such as i/î and u/û.
   - Sorani priority contrasts: native Kurdish linguists should choose them. **This is a gap in these notes.**
2. **Record each item from about 5–10 native speakers**: mixed gender and age, Kurmanji regional variety (Serhed, Botan, Badini) noted in metadata.
   - Uchihara 2025 found no benefit from more than a handful of talkers.
   - Store the speaker and variety id per clip so the app can rotate talkers.
   - Clips must be short (single words), 16 kHz or higher mono, with loudness normalized.
3. **Generalization check:** hold out some talkers and words as "new voices" test items. Perception gains on untrained items are about 13% vs 14% on trained items, and that only holds if the app trains on varied input.
4. **Make it a game, not a drill.** Add a "Guhdarî" (listen) round to the existing Kahoot-style multiplayer and the single-player games, for example "Rhyme match" with an audio-only variant. The children's DLD study above shows multi-voice adaptive discrimination games sustain about 39 sessions for 5–6-year-olds.
5. **Don't expect perception training alone to fix production.** The perception-to-production link is small and nonsignificant (Uchihara 2024). Always follow a perception block with a "now you say it" step (section B).

### B. Production practice: start with ASR-free tools, then add scoring
6. **Phase 1 (no ASR): record-and-compare.**
   - The learner records and hears their own clip and the native clip back to back, with an optional pitch-contour or waveform overlay.
   - Add **shadowing mode** (speak along with native audio for sentences and short dialogues).
   - Evidence: shadowing helps comprehensibility, fluency and prosody per a systematic review, though segmental effects are unclear. Visual pitch feedback is useful in quasi-experiments, especially with longer training.
   - Ship this on web (MediaRecorder) and Expo (expo-audio or expo-av).
7. **Phase 2: word-level "did you hit the target" checking with a fine-tuned open model.**
   - Fine-tune **Omnilingual ASR 300M (Apache 2.0, covers kmr_Latn and ckb_Arab)** or an XLS-R/Whisper model on Common Voice kmr (about 68 h), FLEURS-Kobani (about 18 h, CC BY 4.0) and Hevalo's own recordings.
   - Expect roughly 6–10% CER on read speech, based on Kurmanji Whisper results of CER 5.7–9.8%.
   - Use it **only against a known target text**: force-align, compute per-character or per-phoneme confidence (GOP-style), and highlight the weak letter in the Hawar word.
   - This gives **explicit, segmental feedback**, the most effective CAPT type in Ngo et al. 2024 (g = 0.86 explicit, 0.82 segmental).
8. **Run scoring server-side first.** Use the Node API plus a small GPU or CPU inference worker. The CTC-300M model runs about 96× real time on a 2 GiB GPU, so it is cheap.
   - Move on-device later via `react-native-sherpa-onnx` (an Expo development build) or CoreML, for offline and privacy reasons. This matters for kids.
   - On web, consider ONNX Runtime Web only after server-side scoring is validated.
9. **Phase 3: contrast detectors** for aspiration and Sorani-specific targets.
   - Collect labeled tokens through the HVPT recording drive. Augment them with synthetic errors, as in Korzekwa et al. 2022.
   - Do this only after Phase 2 is shown to work.
10. **Never score with an LLM audio model.** GPT-4o zero-shot correlates r ≈ 0.45 with humans at sentence level and 0.24 at phoneme level, in English. Using an LLM to turn alignment results into a friendly explanation in the learner's UI language (nine languages) is fine.
11. **Make scores lenient and child-aware.**
    - ASR error rates for children are several times those for adults (English: about 25–35% WER vs 3–5%).
    - Dialect speakers fail standard-variety models (Garrusi: about 98% WER).
    - So show "try again / great / listen to the model" and stars, not hard fail. Never withhold XP, streaks or Zêr on ASR verdicts alone. Allow "skip speaking" (as Duolingo does) for no-mic or public situations.
    - Add a dialect selector, and accept variant pronunciations where Kurmanji dialects legitimately differ, for example where the unaspirated series is absent.

### C. Audio content strategy: native recordings vs TTS
12. **Native recordings are the gold standard for all pronunciation-teaching audio.** This covers the alphabet, minimal pairs, lesson vocabulary and model sentences. Hawar spelling does not encode aspiration, so **Kurmanji TTS cannot be trusted as a pronunciation model** for these items.
13. **Use TTS to scale listening volume, not to model pronunciation.**
    - Uses: read-aloud of dictionary entries (~400k words, impossible to record), community stories and poems, and long-tail sentences. Label these clearly as "computer voice."
    - Sorani: test ElevenLabs v4 (ckb, vendor claim) and the JSALT F5-TTS Sorani models (reported MOS 3.9–4.7).
    - Kurmanji: options are thin. Test MMS-TTS, checking whether a Latin-script model exists and **whether its license allows commercial use**; Kurdish-specific vendors such as kurdishtts.com (unverified quality); or fine-tune an open TTS such as F5 or VITS on Hevalo's own consented voice-actor recordings.
    - Before release, run a **blind native-rater check** (MOS and word intelligibility) with about 10 native speakers per variety.
14. **Build a community voice-recording feature into the existing social layer.**
    - Heritage and native users record words, sentences, or their own stories and poems. Others validate recordings with Common Voice-style 2-vote validation and earn XP or Zêr for both actions.
    - This feeds HVPT talker variety, the dictionary audio, and ASR fine-tuning data. It mirrors the volunteer model of Hameed et al. (Interspeech 2025) and Common Voice.
    - It needs explicit consent, age gating (no children's voices without guardian consent), and a clear license for the recordings, ideally CC0 or CC-BY so they can also go to Common Voice.
15. **Audit data hygiene.** The 2026 audit of a public Sorani TTS release found test/train leakage and unused configuration. Hevalo should keep a held-out, speaker-disjoint **evaluation set of about 1–2 h per variety**, including adult learners, heritage speakers and children, with dialect tags. Measure every ASR or TTS model on it before adopting, using script-normalized CER and WER.

### D. Listening lessons
16. **Audio-first lesson steps:**
    - "listen, then pick the picture or meaning" before showing text;
    - audio-only vocabulary review, since audio input matches text for vocabulary gains;
    - **audio-paced, karaoke-style transcript highlighting** for stories, since paced reading-while-listening gives g ≈ 0.41 vs about 0.06 when self-paced.
17. **Captions on by default for beginners and children, then fade them:** full captions, then keyword-only, then none, as learners level up. Caption benefits are largest at low proficiency.
18. **Speed control (0.75×/1×) is a comfort feature.** Where possible, record a **native slow-careful take** for key sentences instead of time-stretching. Evidence that slowing helps comprehension is mixed.
19. **Use dictation and "type what you hear"** in the existing typing-race and Wordle formats ("Wordle by ear"). Pair each with a meaning question, because dictation alone trains decoding but not overall comprehension. Accept both Hawar diacritic variants and keyboard fallbacks (for example "e" for "ê", with a gentle correction).

### E. Sorani and script specifics
20. For Sorani, ASR and TTS output is Arabic script. Script-normalize every comparison, because the Garrusi study shows script mismatch alone can produce WER above 100%. If Hevalo ever offers Latin transliteration for Sorani, scoring must happen in one canonical script.
21. Google Chirp 3 (ckb-IQ, preview) and ElevenLabs Scribe are **hosted fallbacks for Sorani STT** while an in-house model matures. I found no equivalent hosted Kurmanji STT from major vendors, which is why the open-model route is required for Kurmanji.

### F. What not to do
- Don't build a "native-likeness %" accent score. Meta-analytic evidence favours **specific, intelligibility-relevant segment feedback** over global ratings, which are unreliable to automate (Saito & Plonsky 2019).
- Don't depend on Whisper zero-shot for Kurdish. It isn't supported.
- Don't ship unlabeled synthetic voices as the "correct pronunciation" for Kurmanji.
- Don't let ASR errors on children or dialect speakers cost streaks or league standing.
