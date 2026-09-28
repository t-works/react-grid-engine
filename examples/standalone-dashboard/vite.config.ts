import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// D4: exercise the built `dist`, pick up rebuilds without a server restart.
export default defineConfig({
  plugins: [react()],
  optimizeDeps: { exclude: ['@t-works/react-grid-engine'] },
});
