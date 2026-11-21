import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { preloadCatalogue } from './i18n/catalogues';
import { applyTheme, watchSystemTheme } from './theme/theme';
import { startArtOverrides } from './art/overrides';
import { installPressFeedback } from './lib/press';
import { watchOpeners } from './lib/opener';
import { unlockOnFirstTap } from './lib/sound';
import './styles/tokens.css';
import './styles/base.css';
import './styles/ui.css';
import './styles/layout.css';
import './styles/pages.css';
import './styles/feed.css';
import './styles/filter.css';
import './styles/rail.css';
import './styles/editor.css';
import './styles/product.css';
import './styles/profile.css';
import './styles/alphabet.css';
// The words after the letters: colours, numbers, days and months.
import './styles/words.css';
import './styles/learn.css';
import './styles/marketing.css';
import './styles/stories.css';
// A ticket: the shape every invitation takes (ui/Ticket.tsx).
import './styles/ticket.css';
// Playing with friends: invites, the banner, game cards, playing again.
import './styles/play.css';
// Gifts in chat, reporting, account standing.
import './styles/social.css';
import './styles/settings.css';
import './styles/keyboard.css';
import './styles/feedback.css';
import './styles/ranks.css';
// How things move: presses, answers, bars, lists arriving, sheets, celebrations.
import './styles/motion.css';
// The shell's newer parts: the top bar and its menu, the bell, the five places' pages.
import './styles/shell.css';
// Liquid glass on the floating chrome, after the shell's own fills (glass/lens.ts).
import './styles/glass.css';
// Each control's touch reach, after every control's own rules (lib/reach.ts).
import './styles/reach.css';
// The screen in place of the app while Hevalo is offline.
import './styles/maintenance.css';

const root = document.getElementById('root');
if (!root) throw new Error('root element missing');

/* The colour scheme is set before anything is drawn, so someone who chose light never sees a dark first frame. */
applyTheme();
watchSystemTheme();

/*
 * The admin's replacements for built-in art (badges, emblems, frames, default avatars), fetched now so they are usually
 * in hand by the first render; until then the last cached list or the built-in art is drawn.
 */
startArtOverrides();
// A button shows pressed only for a real press, never for a scrolling finger (lib/press.ts).
installPressFeedback();
// The last press's position, so a dialog can grow out of its opener (lib/opener.ts).
watchOpeners();
// So a lesson's line can play on its turn without its own tap, Safari included (lib/sound.ts).
unlockOnFirstTap();
// In development, `?show-reach` tints each control's touch area (styles/reach.css).
if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('show-reach')) document.documentElement.classList.add('show-reach');

/*
 * Only one catalogue ships in the entry chunk, so the reader's is fetched before the first render; rendering first would
 * flash English on every cold load. `preloadCatalogue` falls back to English rather than rejecting.
 */
void preloadCatalogue().then(() => {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
