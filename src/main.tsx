import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { SplashScreen } from './components/common/SplashScreen';
import { isDesktop } from './platform/detect';
import './index.css';

// Before the first render, so no frame is styled for the wrong target. CSS
// that only fits a browser (the pointer cursor on buttons, say) keys off this.
if (isDesktop()) document.documentElement.classList.add('is-desktop');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    {/* A sibling, not a wrapper: App hides itself behind a "Loading…" line
        until storage has opened, and the splash's job is to cover that. */}
    <SplashScreen />
  </React.StrictMode>
);
