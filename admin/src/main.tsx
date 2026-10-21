import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { Backdrop } from './ui/Backdrop';
import './styles.css';
import './ui/kit.css';
import './pages/pages.css';
import './pages/moderation.css';
import './pages/ranks.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Backdrop />
    <App />
  </StrictMode>,
);
