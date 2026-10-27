import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { preloadCatalogue } from './i18n/catalogues';
import { applyTheme, watchSystemTheme } from './theme/theme';
import { startArtOverrides } from './art/overrides';
import './styles/tokens.css';
import './styles/base.css';
import './styles/ui.css';
import './styles/layout.css';
import './styles/pages.css';
import './styles/feed.css';
import './styles/rail.css';
import './styles/editor.css';
import './styles/product.css';
import './styles/alphabet.css';
import './styles/learn.css';
import './styles/marketing.css';
import './styles/stories.css';
// playing with friends: invites, the banner, game cards, playing again
import './styles/play.css';
// gifts in chat, reporting, account standing
import './styles/social.css';
import './styles/settings.css';
import './styles/keyboard.css';
import './styles/feedback.css';
import './styles/ranks.css';
// how things move: presses, answers, bars, lists arriving, sheets, celebrations
import './styles/motion.css';
// the shell's newer parts: the top bar and its menu, the bell, the five places' own pages
import './styles/shell.css';
// Hevalo offline for a while: the screen in place of the app
import './styles/maintenance.css';

const root = document.getElementById('root');
if (!root) throw new Error('root element missing');

/*
 * Light or dark before anything is drawn.
 *
 * The scheme is one attribute on <html> that every colour is keyed off, so it
 * is set here, ahead of the language and the first render, rather than by a
 * component: set later, somebody who chose light would watch the page draw
 * dark and then flip.
 */
applyTheme();
watchSystemTheme();

/*
 * The pictures an admin has put in place of the built-in art (badges,
 * emblems, frames, default avatars): asked for now, alongside the language,
 * so they are usually in hand by the first render. This browser's copy of the
 * last list is drawn until then, and the built-in art when there is none.
 */
startArtOverrides();

/*
 * The language before the app.
 *
 * Only one of the nine catalogues ships in the entry chunk, so the one this
 * visitor reads has to be fetched — and it is fetched here, before the first
 * render, so that render has the right words in it. Rendering first and
 * swapping the language in afterwards would show every non-English reader a
 * flash of English on every cold load, which is a worse thing to do to
 * somebody than making them wait for one small file they were going to need
 * anyway.
 *
 * `preloadCatalogue` falls back to English rather than rejecting, so a
 * language pack that will not download delays the app and does not stop it.
 */
void preloadCatalogue().then(() => {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
