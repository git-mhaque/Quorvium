/// <reference types="vite/client" />

declare const __API_BASE_URL__: string;
declare const __APP_VERSION__: string;

type RouterMode = 'browser' | 'hash';

interface QuorviumRuntimeConfig {
  apiBaseUrl?: string;
  googleClientId?: string;
  googleRedirectUri?: string;
  routerMode?: RouterMode;
  appVersion?: string;
}

interface Window {
  __QUORVIUM_RUNTIME_CONFIG__?: QuorviumRuntimeConfig;
}
