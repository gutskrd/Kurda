import { onClassifierError, type CategoryScores, type PolicyResult, type Surface, evaluateForSurface } from './policy.js';

/**
 * Provider-agnostic text classification seam: a hosted moderation API or self-hosted model implements `classify`.
 * Returns per-category confidence in [0,1] plus the model version (stored for audit and threshold tuning).
 */
export interface ClassifierResult {
  scores: CategoryScores;
  modelVersion: string;
}

export interface ModerationClassifier {
  classify(text: string): Promise<ClassifierResult>;
}

/**
 * Default backend until a provider is configured: a deterministic spam and scam heuristic (link spam, scam keywords,
 * shouting, character flooding). Toxicity, hate, sexual and self-harm scores stay 0 here; they need a real model behind
 * the same interface.
 */
export class HeuristicSpamClassifier implements ModerationClassifier {
  readonly modelVersion = 'heuristic-spam-v1';

  private static readonly SCAM = [
    'free money', 'click here', 'buy followers', 'crypto', 'bitcoin', 'giveaway',
    'prize', 'you won', 'work from home', 'make $', 'earn $', 'viagra', 'casino',
    'telegram.me', 'whatsapp +', 'dm me', 'investment opportunity',
  ];

  async classify(text: string): Promise<ClassifierResult> {
    const lower = text.toLowerCase();
    let spam = 0;

    const urls = (lower.match(/https?:\/\/|www\.|t\.me\/|\b\w+\.(com|net|io|xyz|ru)\b/g) ?? []).length;
    if (urls >= 3) spam = Math.max(spam, 0.9);
    else if (urls === 2) spam = Math.max(spam, 0.7);
    else if (urls === 1) spam = Math.max(spam, 0.3);

    const scamHits = HeuristicSpamClassifier.SCAM.filter((k) => lower.includes(k)).length;
    if (scamHits >= 2) spam = Math.max(spam, 0.95);
    else if (scamHits === 1) spam = Math.max(spam, 0.65);

    // character flooding ("!!!!!!!!!!", "aaaaaaaa")
    if (/(.)\1{7,}/.test(lower)) spam = Math.max(spam, 0.6);

    // shouting: long + mostly uppercase
    const letters = text.replace(/[^A-Za-z]/g, '');
    if (letters.length >= 20) {
      const upper = (text.match(/[A-Z]/g) ?? []).length / letters.length;
      if (upper > 0.8) spam = Math.max(spam, 0.6);
    }

    return { scores: { spam: Math.min(1, spam) }, modelVersion: this.modelVersion };
  }
}

/**
 * Classify and evaluate against a surface policy. Any classifier error yields the configured fail-open or fail-closed
 * result without throwing, so an outage never blocks a low-risk surface nor silently publishes on a high-risk one.
 */
export async function classifyForSurface(
  classifier: ModerationClassifier,
  text: string,
  surface: Surface,
  failClosed: boolean,
): Promise<{ result: PolicyResult; scores: CategoryScores; modelVersion: string }> {
  try {
    const { scores, modelVersion } = await classifier.classify(text);
    return { result: evaluateForSurface(scores, surface), scores, modelVersion };
  } catch {
    return { result: onClassifierError(failClosed), scores: {}, modelVersion: 'unavailable' };
  }
}
