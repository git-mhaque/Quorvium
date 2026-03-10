function getRouterMode(): 'browser' | 'hash' {
  const configuredMode = import.meta.env.VITE_ROUTER_MODE;
  if (configuredMode === 'hash' || configuredMode === 'browser') {
    return configuredMode;
  }

  if (
    typeof window !== 'undefined' &&
    window.location.hostname.endsWith('storage.googleapis.com')
  ) {
    return 'hash';
  }

  return 'browser';
}

export const env = {
  apiBaseUrl: __API_BASE_URL__,
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '',
  googleRedirectUri:
    import.meta.env.VITE_GOOGLE_REDIRECT_URI ??
    (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173'),
  routerMode: getRouterMode()
};
