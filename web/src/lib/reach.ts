/**
 * The classes that get an enlarged touch area in `styles/reach.css`: a weightless `::before` up to 44px with a mouse
 * and 48px with a finger, never past half the gap to a neighbour. Kept here so `reach.test.ts` can hold the stylesheet
 * to these lists and `pressables.test.ts` can find clickables missing from all of them. Each class is in one list:
 *
 *   - `REACH_CONTROLS`: buttons, chips, tabs and the like, on every pointer.
 *   - `STANDALONE_LINKS`: links on a line of their own, enlarged only under a coarse pointer.
 *   - `HAND_TUNED`: areas already cut by hand to the seam with their neighbour.
 *   - `LARGE_ENOUGH`: reviewed and at least 48px each way.
 *
 * `SCROLLERS` are sideways-scrolling rows of controls; they clip overflow, so each gets padding above and below,
 * offset by a negative margin.
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
  // The story player's buttons are 44px across and its speed 36px tall with a mouse.
  '.story-player-btn',
  '.story-player-rate',
  '.letters-change',
  // A suspect's notes in Detective (games/detective.css).
  '.dt-note',
  // Today's goal on Learn, a 40px pill that opens the goal picker.
  '.learn-strip-goal',
] as const;

/** Links on a line of their own, enlarged only under a coarse pointer. */
export const STANDALONE_LINKS = ['.auth-alt a', '.link', '.by-zagrosian', '.reach-line'] as const;

/** Areas already cut by hand to their seams; they keep their own rules. */
export const HAND_TUNED = [
  // A filter chip and its clear button meet in the middle (styles/filter.css).
  '.ffilter-chip-main',
  '.ffilter-chip-clear',
  // A picture's remove and alt-text buttons on its tile's corners (composer/composer.css).
  '.cmp-tile-remove',
  '.cmp-tile-alt',
  // Adding a member, beside its field (groups/groups.css).
  '.gadd-btn',
  // A lesson's words and its slow chip, in running text (styles/learn.css).
  '.lesson-word',
  '.lesson-slow-chip',
  // Seen-by, under a message (styles/pages.css).
  '.mkp-seen',
  // A memory game's gaps, whose ::before is their glow (games/memory-thief.css).
  '.mt-gap',
  // A story's replay and glossed words, in running text where every word is a target.
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
  // A lesson's tile (learn/Tile.tsx).
  '.tile',
  // Who Am I's answers, 84px tall in a row of three (whoami/whoami.css).
  '.wa-answer-btn',
  // Learn's practice tools, cards at least 64px tall in a row of two or three (styles/shell.css).
  '.learn-tool-link',
  // The event card on Learn, 64px tall across the column (events/events.css).
  '.event-card',
] as const;

/** Sideways-scrolling rows of controls, padded above and below for their reach. */
export const SCROLLERS = [
  '.note-filters',
  '.mkp-tabs',
  '.story-shelf-row',
  '.league-ladder',
  '.gp .ranks-grid',
  '.imp-cat-strip',
  '.pic-radio.is-strip .pic-radio-options',
  '.ll-cards',
  // Not `.pp-track`: each of its slides is a button the size of the strip, with no reach to keep.
  '.filter-strip',
  '.yours-trees',
  '.item-tabs',
] as const;
