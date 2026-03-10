import { GoogleOAuthProvider } from '@react-oauth/google';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';

import App from './App';
import './styles.css';
import { AuthProvider } from './state/auth';
import { env } from './env';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

const app = (
  <React.StrictMode>
    {env.routerMode === 'hash' ? (
      <HashRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </HashRouter>
    ) : (
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    )}
  </React.StrictMode>
);

const withProviders = env.googleClientId ? (
  <GoogleOAuthProvider clientId={env.googleClientId}>{app}</GoogleOAuthProvider>
) : (
  app
);

ReactDOM.createRoot(rootElement).render(withProviders);
