/**
 * What answers a finger, and how far past its edges: the lists the website's
 * reach is written from.
 *
 * A control is drawn at its size, but a finger that lands a few pixels off it
 * should still press it. `styles/reach.css` gives every control named here an
 * area that answers past its edges (a `::before` of no weight, so the
 * control's own rules always win), up to 44px with a mouse and 48px when any
 * pointer is a finger, and never further than half the gap to its neighbour.
 * The lists are kept here rather than only in the stylesheet so the tests can
 * hold the stylesheet to them (`reach.test.ts`) and can count every clickable
 * that is not yet in any of them (`pressables.test.ts`).
 *
 * A class belongs in exactly one list:
 *
 *   - `REACH_CONTROLS`: buttons, chips, tabs and the like, on every pointer.
 *   - `STANDALONE_LINKS`: links that stand on a line of their own; they reach
 *     only where a pointer is coarse, because with a mouse a link is pointed
 *     at, not aimed for.
 *   - `HAND_TUNED`: controls whose area was already cut by hand to the seam
 *     with their neighbour; a general rule would undo that work.
 *   - `LARGE_ENOUGH`: reviewed and at least 48px each way already.
 *
 * `SCROLLERS` are the sideways-scrolling rows that hold controls. A scrolling
 * box cuts off whatever reaches past it, so each one keeps room above and below
 * its controls (padding, taken back by a negative margin so nothing moves).
 */

/** Controls that reach to the minimum on every pointer. */
export const REACH_CONTROLS = [
  '.btn',
  '.icon-btn',
  '.close-btn',
  '.nav-back',
  '.nav-bell',
  '.chip',
  '.seg-btn',
  '.switch-btn',
  '.rankings-tab',
  '.note-filter',
  '.story-chip',
  '.ffilter-period',
  '.key-bar-key',
  '.wordle-key',
  '.p3d-tab',
  '.paper-paint',
  '.paper-pen',
  '.paper-tool',
  '.paper-icon-btn',
  '.chat-send',
  '.chat-run-avatar',
  '.chat-jump',
  '.lore-toggle',
  '.yours-link',
  '.letter-sheet-report',
  '.cmp-kind-option',
  '.mkp-tab',
  '.mkp-more',
  '.mkp-bio-add',
  '.msg-menu-btn',
  '.link-btn',
  '.link-button',
  '.back-link',
  '.lp-callout',
  '.request-name.is-link',
  '.byline-who',
  '.ranks-untouched-game',
  '.rank-card-more',
  '.ab-sound',
  '.settings-search-clear',
  '.nav-search-clear',
  '.lesson-leave',
  '.lesson-play-round',
  // the story player's buttons are 44 across and its speed 36 tall with a mouse: no bigger than a fingertip, so they reach as the rest do
  '.story-player-btn',
  '.story-player-rate',
  '.letters-change',
] as const;

/** Links on a line of their own, which reach only under a coarse pointer. */
export const STANDALONE_LINKS = ['.auth-alt a', '.link', '.by-zagrosian', '.reach-line'] as const;

/** Areas already cut by hand to their seams; they keep their own rules and stay out of both lists. */
export const HAND_TUNED = [
  // a filter chip and its clear, which meet in the middle (styles/filter.css)
  '.ffilter-chip-main',
  '.ffilter-chip-clear',
  // a picture's remove and alt-text buttons, on the corners of its tile (composer/composer.css)
  '.cmp-tile-remove',
  '.cmp-tile-alt',
  // adding a member, beside the field it reads (groups/groups.css)
  '.gadd-btn',
  // a lesson's words and its slow chip, in the running line (styles/learn.css)
  '.lesson-word',
  '.lesson-slow-chip',
  // seen-by, under a message (styles/pages.css)
  '.mkp-seen',
  // the gaps in a memory game's line, whose ::before is their glow (games/memory-thief.css)
  '.mt-gap',
  // a story's replay and its glossed words: running text, where every word is its own target
  '.story-replay',
  '.story-gloss',
] as const;

/** Reviewed, and at least 48px each way already. */
export const LARGE_ENOUGH = [
  '.settings-row',
  '.list-row-main',
  '.places-link',
  '.nav-link',
  '.ab-tile',
  '.faq-q',
  '.fcard-act',
  '.story-card-bookmark',
  '.post-plus',
  '.ffilter-btn',
  '.shop-gift-btn',
  '.user-actions-btn',
  '.editor-history-btn',
  '.framer-zoom-btn',
  '.story-size-btn',
  '.chat-game-action',
  // a lesson's tile (learn/Tile.tsx)
  '.tile',
] as const;

/** The sideways-scrolling rows that hold controls, each with room above and below them for their reach. */
export const SCROLLERS = [
  '.note-filters',
  '.mkp-tabs',
  '.story-shelf-row',
  '.league-ladder',
  '.gp .ranks-grid',
  '.imp-cat-strip',
  '.pic-radio.is-strip .pic-radio-options',
  '.ll-cards',
  // not `.pp-track`: a post's pictures scroll there, but each slide is a whole button the size of the strip, with no reach to keep
  '.filter-strip',
  '.yours-trees',
  '.item-tabs',
] as const;
