import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // GitHub Pages serves under /timekeeper-online/; keep dev at /
  base: command === 'build' ? '/timekeeper-online/' : '/',
  server: { port: 5180 },
}));
