import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { Backdrop } from './backdrop/Backdrop';
import './styles.css';
import './backdrop/backdrop.css';
import './brand/mark.css';
import './ui/kit.css';
import './pages/pages.css';
import './pages/moderation.css';
import './pages/ranks.css';

// the ribbons behind every page, in a root of their own so nothing the pages do redraws them
createRoot(document.getElementById('backdrop')!).render(<Backdrop />);
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
