import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Em produção a URL do backend vem da variável VITE_API_URL
  define: {
    __API_URL__: JSON.stringify(process.env.VITE_API_URL || ''),
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
