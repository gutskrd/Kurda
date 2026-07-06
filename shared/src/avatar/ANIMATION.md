# Animated cosmetics — asset format (KUR-080)

Kurda avatars are procedural SVG (see [render.ts](render.ts)). An "animated" cosmetic is the same static art **plus** declarative SMIL nodes (`<animate>`, `<animateTransform>`), gated behind the `animate` render option.

## Rules (enforced by `validateAnimatedFragment`)

1. **Additive only.** Stripping every `<animate*>` node must leave the complete static art. `react-native-svg` ignores SMIL, so mobile falls back to the static frame automatically — old static assets stay valid forever; animation is opt-in decoration, never a migration.
2. **Loop-safe.** Every animation node carries `repeatCount="indefinite"`; nothing may depend on document load timing.
3. **Bounded.** ≤ 3 animated nodes per cosmetic; durations 1–4 s. Avatars decorate screens — they must never distract from a lesson or a live game.

## Adding an animated cosmetic

1. Mark the catalog item `animatable: true` ([catalog.ts](catalog.ts)).
2. Emit the SMIL nodes in the renderer only when `opts.animate` is true.
3. Add a test asserting `validateAnimatedFragment(fragment)` returns `[]` and that the static render (default) is byte-identical to before.

Proof of concept: **Agirê Newrozê** (`bg-newroz`) — flame flicker (scale) + ember glow (opacity), both looping, both stripped cleanly for static contexts.

## Mobile animation pipeline (future)

When avatar animation ships on mobile, the plan is to map each SMIL node to a Reanimated keyframe (the bounded rule set above keeps that mapping mechanical). Until then `animate` stays false in the app and the flag lives at the `KurdishAvatar` call site.
