import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const basePath = env.VITE_BASE_PATH ?? process.env.VITE_BASE_PATH ?? '/';
  const appVersion = env.VITE_APP_VERSION ?? process.env.VITE_APP_VERSION ?? 'dev.local';

  return {
    plugins: [react()],
    base: basePath,
    server: {
      port: Number(env.VITE_DEV_SERVER_PORT ?? 5173)
    },
    define: {
      __API_BASE_URL__: JSON.stringify(env.VITE_API_BASE_URL ?? 'http://localhost:4000'),
      __APP_VERSION__: JSON.stringify(appVersion)
    }
  };
});
