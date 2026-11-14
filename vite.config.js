import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base is './' so the site works on any GitHub Pages path
export default defineConfig({
  base: './',
  plugins: [react()],
})
