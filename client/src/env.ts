const runtimeConfig =
  typeof window !== 'undefined' ? window.__QUORVIUM_RUNTIME_CONFIG__ : undefined;

function getRouterMode(): 'browser' | 'hash' {
  const configuredMode = runtimeConfig?.routerMode ?? import.meta.env.VITE_ROUTER_MODE;
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
  apiBaseUrl: runtimeConfig?.apiBaseUrl ?? __API_BASE_URL__,
  appVersion: runtimeConfig?.appVersion ?? __APP_VERSION__,
  googleClientId: runtimeConfig?.googleClientId ?? import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '',
  googleRedirectUri:
    runtimeConfig?.googleRedirectUri ??
    import.meta.env.VITE_GOOGLE_REDIRECT_URI ??
    (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173'),
  routerMode: getRouterMode()
};
