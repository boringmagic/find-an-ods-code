import { defineConfig, devices } from '@playwright/test'

const PORT = process.env.PORT || 3000

export default defineConfig({
  testDir: './tests/e2e',
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: 'npm start',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI
  },
  projects: [
    // Most NHS users are on phones, so test mobile first
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } }
  ]
})
