import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const API_PORT = process.env.API_PORT || 3001

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': `http://localhost:${API_PORT}`
    }
  }
})
