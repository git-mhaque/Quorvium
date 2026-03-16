const runtimeConfig =
  typeof window !== 'undefined' ? window.__QUORVIUM_RUNTIME_CONFIG__ : undefined;

function resolveString(runtimeValue: string | undefined, fallbackValue: string | undefined) {
  if (typeof runtimeValue === 'string' && runtimeValue.trim().length > 0) {
    return runtimeValue;
  }
  if (typeof fallbackValue === 'string' && fallbackValue.trim().length > 0) {
    return fallbackValue;
  }
  return '';
}

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
  apiBaseUrl: resolveString(runtimeConfig?.apiBaseUrl, __API_BASE_URL__),
  appVersion: resolveString(runtimeConfig?.appVersion, __APP_VERSION__),
  googleClientId: resolveString(runtimeConfig?.googleClientId, import.meta.env.VITE_GOOGLE_CLIENT_ID),
  googleRedirectUri:
    resolveString(runtimeConfig?.googleRedirectUri, import.meta.env.VITE_GOOGLE_REDIRECT_URI) ||
    (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173'),
  routerMode: getRouterMode()
};
