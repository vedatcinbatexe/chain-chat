import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// The dashboard calls the API on its own origin (/api/...) and this dev server forwards those calls, so the
// browser never makes a cross-origin request. In Docker, nginx does the same (see nginx.conf).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: {
      port: 5173,
      strictPort: true, // the sign-in message is bound to this origin (Admin:Domain on the API)
      proxy: { '/api': { target: env.API_TARGET || 'http://localhost:5080', changeOrigin: true } },
    },
  };
});
