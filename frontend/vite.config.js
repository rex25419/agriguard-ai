import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Listen on all IP addresses
    allowedHosts: true, // Allow all hosts (like localtunnel)
    cors: true
  }
})
