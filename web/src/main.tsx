import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { preloadCatalogue } from './i18n/catalogues';
import './styles/tokens.css';
import './styles/base.css';
import './styles/ui.css';
import './styles/layout.css';
import './styles/pages.css';
import './styles/feed.css';
import './styles/rail.css';
import './styles/editor.css';

const root = document.getElementById('root');
if (!root) throw new Error('root element missing');

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
