import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/homekeeper/',
  plugins: [react()],
  build: {
    outDir: '../public/homekeeper',
    emptyOutDir: true,
  },
});
