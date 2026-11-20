import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

/**
 * Dedicated single-bundle Vite build configuration for the standalone
 * OrcaSlicer Page Plugin (renders inside OrcaSlicer's embedded WebView).
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  build: {
    outDir: 'dist-plugin',
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    rollupOptions: {
      output: {
        format: 'iife',
        name: 'LayerCostZAPlugin',
        inlineDynamicImports: true,
        entryFileNames: 'assets/plugin.js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
});
