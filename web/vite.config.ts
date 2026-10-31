import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json';

export default defineConfig({
  plugins: [react()],
  // The app's version, for backups and the before-update snapshot.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  // Cross-origin isolation lets the speech models use several CPU threads (needed for live Bangla).
  server: { port: 5290, strictPort: true, headers: { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'credentialless' } },
  preview: { headers: { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'credentialless' } },
  optimizeDeps: { exclude: ['@huggingface/transformers'] },
  worker: { format: 'es' },
});
