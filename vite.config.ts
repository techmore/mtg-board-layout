import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // The server's compiled output (npm run server:build) mirrors its src tests;
    // only the TypeScript sources should run.
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
})
