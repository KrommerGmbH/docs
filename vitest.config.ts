import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/engine/**/*.test.ts'],
    exclude: ['tests/renderer/**', 'node_modules/**', 'dist/**'],
    environment: 'node',
  },
})