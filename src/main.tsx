import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { SplashScreen } from './components/common/SplashScreen';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    {/* A sibling, not a wrapper: App hides itself behind a "Loading…" line
        until storage has opened, and the splash's job is to cover that. */}
    <SplashScreen />
  </React.StrictMode>
);
