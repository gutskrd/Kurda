# Accessibility checklist (KUR-266)

Run this checklist for **every new mobile screen** before it ships. Accessibility
is an App Store review area and a correctness requirement, not a nice-to-have.

Shared building blocks live in `mobile/src/a11y/`:

- `a11yProps(role, label, hint?)` — consistent label / role / hint on every control.
- `decorative()` — hide a purely decorative icon/image from VoiceOver.
- `meetsTouchTarget(w, h)` / `hitSlopFor(w, h)` / `MIN_TOUCH_TARGET` (44pt).
- `resolveMotion(spec, reduceMotion)` + `useReducedMotion()` — gate decorative animation.

## VoiceOver

- [ ] Every interactive element has a clear `accessibilityLabel` (via `a11yProps`).
- [ ] Roles are correct (`button`, `link`, `header`, `adjustable`, `switch`, …).
- [ ] Hints describe the *action* ("Skips onboarding"), not the control.
- [ ] Decorative icons/images use `decorative()`; meaningful images have labels.
- [ ] Focus order is logical top-to-bottom; no focus traps; modals capture focus.
- [ ] Custom controls announce their state (selected / expanded / value).
- [ ] Kurdish diacritics are announced correctly.

## Dynamic Type

- [ ] Text uses `allowFontScaling` (RN default on) — no `allowFontScaling={false}`.
- [ ] Layout reflows from XS up to the largest accessibility size — no clipping/overlap.
- [ ] No fixed-height text containers; use min-height + wrapping instead.

## Reduce Motion

- [ ] Every decorative animation resolves through `resolveMotion(spec, useReducedMotion())`.
- [ ] With Reduce Motion ON the resting state is shown — nothing pulses, rotates, or slides.
- [ ] Essential motion (progress, value changes) is intentionally *not* gated.

## Contrast & color

- [ ] Text/background contrast passes WCAG AA in **both** light and dark mode.
- [ ] State is never conveyed by color alone (add icon/label/shape).
- [ ] Respects Bold Text and Increase Contrast where applicable.

## Touch targets

- [ ] Every tappable control is ≥ 44×44pt, or padded with `hitSlopFor(...)`.

## RTL (coordinate with the RTL issue, #267)

- [ ] Arabic-script layouts (Soranî / Arabic) mirror correctly and remain operable.

## Device pass

- [ ] Full VoiceOver walkthrough on a physical device.
- [ ] Largest Dynamic Type size on every screen — no clipping.
- [ ] Reduce Motion ON — no decorative animation plays.
- [ ] Contrast checker on key screens (light + dark).
