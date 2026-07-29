# Personalized review + adaptive difficulty v2 (KUR-121)

A per-user heuristic that tunes SM-2 from each learner's historical accuracy, so
review timing matches how *they* forget. Pure and offline-evaluable
(`api/src/review/adaptive.ts`).

## The model (heuristic v2)
- `easeModifier(stats)` maps a user's historical accuracy to a **±20% multiplier**
  on SM-2 easiness. Above the target recall (0.85) → stretch intervals (they
  forget slowly); below → compress. Neutral (1.0) at the target.
- `adaptEasiness` / `personalEasiness` apply the modifier, clamped to
  `[MIN_EASINESS, MAX_EASINESS]` so intervals never collapse or explode.

## Cold-start (edge case)
Users with fewer than `MIN_REVIEWS_FOR_ADAPTATION` (20) reviews get a modifier of
**1.0 — i.e. stock SM-2**. No personal signal is trusted until there's enough
history, so new learners are never mis-scheduled.

## Offline evaluation (rollout gate)
`evaluateAdaptation(samples)` computes the mean absolute error between predicted
recall at review time (`predictedRecall`, an exponential forgetting curve) and
the target, for the **stock vs. adapted** schedules over historical data. It
reports `improved` only when the adapted schedule sits **closer to the target
recall**. This is the gate: the model must show improved predicted recall on
historical data before rollout.

## Shipping behind an A/B test
The adapted easiness is applied only for users in the treatment arm of a KUR-107
experiment (e.g. `adaptive_review`), measuring retention against the stock-SM-2
control. Wiring `personalEasiness` into `ReviewService` behind that experiment
flag is the rollout step; the model + its offline gate land here first.
