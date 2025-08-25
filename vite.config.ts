import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,                    // you’re on 5175
    proxy: {
      '/api': {
        target: 'https://app.b-callio.com',  // remote backend
        changeOrigin: true,
        secure: true                      // remote is https
        // no rewrite needed because remote paths also start with /api
      }
    },
    // optional: hide red overlay if you prefer
    // hmr: { overlay: false }
  }
})
