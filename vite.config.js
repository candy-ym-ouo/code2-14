import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiPort = Number(process.env.PORT || 3001);
if (!Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65535) {
  throw new Error(`PORT 必须是 1-65535 之间的整数，当前值：${process.env.PORT}`);
}

export default defineConfig({
  root: 'client',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': `http://localhost:${apiPort}`
    }
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true
  }
});
