/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  // GitHub Pages 部署路徑：https://rattlecruiser.github.io/mahjong-training/
  base: '/mahjong-training/',
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
