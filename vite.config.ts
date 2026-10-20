import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // The server's compiled output (npm run server:build) mirrors its src tests;
    // only the TypeScript sources should run. The server suite needs its own
    // dependencies (`npm --prefix server ci`) and runs via `npm run test:server`.
    exclude: ['**/node_modules/**', '**/dist/**', 'server/**'],
  },
})
