import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        docs: resolve(__dirname, 'docs/index.html'),
        'getting-started': resolve(__dirname, 'docs/getting-started.html'),
        features: resolve(__dirname, 'docs/features.html'),
        api: resolve(__dirname, 'docs/api.html'),
        integrations: resolve(__dirname, 'docs/integrations.html'),
        themes: resolve(__dirname, 'docs/themes.html'),
      },
    },
  },
})
