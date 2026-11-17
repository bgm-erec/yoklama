import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    base: './',
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'disable-vite-hmr-ws',
        transform(code, id) {
          if (id.includes('vite/dist/client/client.mjs')) {
            return code.replace(
              /const createWebSocketModuleRunnerTransport = \(options\) => \{[\s\S]*?\n\};\n/,
              'const createWebSocketModuleRunnerTransport = () => ({ async connect() {}, async disconnect() {}, send() {} });\n'
            );
          }
          return null;
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: false,
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: null,
    },
  };
});
