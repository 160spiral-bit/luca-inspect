import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  define: {
    __BUILD_ID__: JSON.stringify(new Date().toISOString()),
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      input: 'index.html',
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
});
