import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * In development the API is proxied through the Vite dev server so the browser
 * sees a single origin. That keeps the HttpOnly session cookie SameSite=Lax and
 * avoids cross-site cookie problems entirely.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:4000';

  return {
    plugins: [react()],
    server: {
      port: Number(env.VITE_PORT || 5173),
      strictPort: false,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          // Media streaming needs range requests to pass through untouched.
          configure: (proxy) => {
            proxy.on('error', (error) => {
              // eslint-disable-next-line no-console
              console.error('[vite-proxy] API unreachable:', error.message);
            });
          },
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: mode !== 'production',
      chunkSizeWarningLimit: 900,
    },
    preview: {
      port: Number(env.VITE_PREVIEW_PORT || 4173),
    },
  };
});
