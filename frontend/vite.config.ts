import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
  server: {
    // Bind all interfaces so the dev server is reachable from outside the
    // container. Harmless for native host dev.
    host: true,
    port: 5173,
    // macOS Docker bind mounts don't propagate fs events into the Linux
    // container, so HMR needs polling there. Enabled only when
    // VITE_USE_POLLING=true (set in docker-compose) — native host dev is
    // unaffected.
    watch: {
      usePolling: process.env.VITE_USE_POLLING === 'true',
    },
  },
})
