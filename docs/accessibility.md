# Accessibility checklist (KUR-266)

Run through this when adding or reviewing a mobile screen. The goal is that
every primary flow is fully operable with VoiceOver, scales with Dynamic Type,
respects Reduce Motion, and meets WCAG AA contrast in light **and** dark.

## VoiceOver / labels
- [ ] Every tappable control is a `Pressable`/button with `accessibilityRole="button"`.
- [ ] **Icon-only** controls (no visible text) have an `accessibilityLabel`
      describing the action, e.g. `"Decline friend request from sara"`, not "✕".
- [ ] Labels include state where it matters (`"Notifications, 3 unread"`).
- [ ] Selection state uses `accessibilityState={{ selected }}` (tabs, segmented,
      pickers) so it isn't conveyed by colour alone.
- [ ] Decorative-only images/icons are not focusable (no label needed).
- [ ] Focus order reads top-to-bottom, left-to-right (matches layout order).

## Colour & contrast
- [ ] Text meets **AA 4.5:1** (large text / muted 3:1) on its surface, in both
      schemes. The palette itself is guarded by `palette.contrast.test.ts` —
      re-run it after any palette change.
- [ ] State is **never colour-only**: pair it with text/icon (e.g. Wordle tiles
      announce `"s, correct"`; the tab bar shows the active label, not just a hue).

## Dynamic Type
- [ ] Text uses the type tokens (`typography.sizes.*`); avoid hard-coded heights
      on text containers so they can grow.
- [ ] Verify the largest accessibility size doesn't clip or overlap.
      (`a11y/dynamicType.ts` + `useFontScale` help components react to scale.)

## Reduce Motion
- [ ] Every decorative animation is gated by `useReducedMotion()` and snaps to
      its end state when reduce-motion is on (breathing icons, the tab-bar
      highlight slide, board/shake animations all do this).

## Touch targets
- [ ] Interactive targets are ≥ 44×44 pt (use `hitSlop` to extend small icons).

## Helpers in this repo
- `a11y/contrast.ts` — `contrastRatio`, `checkContrast`, `AA_NORMAL`/`AA_LARGE`.
- `a11y/ensureContrast.ts` — nudge a colour until it passes.
- `a11y/useReducedMotion.ts`, `a11y/motion.ts` — motion gating.
- `a11y/dynamicType.ts`, `a11y/useFontScale.ts` — font-scale support.

## Known limitation
React Native exposes no OS "High Contrast" reader
(`AccessibilityInfo.isDarkerSystemColorsEnabled` is unavailable), so an explicit
high-contrast theme toggle isn't wired. The monochrome palette already runs high
contrast by design; revisit if RN adds the API. The full on-device VoiceOver +
largest-Dynamic-Type sweep of every screen is a manual QA pass.
