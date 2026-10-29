import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The dev server is frontend-only: /api is proxied to a real Talkie server
// (`wtb-server start -f`), so development exercises the same API, auth and
// request guard as production. It used to embed its own copy of the API, which
// had drifted (wildcard CORS, Bash allowed, a hard-coded claude path).
const apiPort = process.env.WTB_PORT || '5173'

export default defineConfig({
  plugins: [react()],
  server: {
    // Not 5173: that's the API server's default port.
    port: 5180,
    proxy: {
      // changeOrigin stays false so the Host header matches the browser's Origin,
      // which the server's same-origin check requires.
      '/api': `http://localhost:${apiPort}`,
    },
  },
})
