import { defineConfig, devices } from '@playwright/test'

// Tests run their own prototype on a different port from the one you use
const PORT = process.env.TEST_PORT || 3100

export default defineConfig({
  testDir: './tests/e2e',
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: 'npm start',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    env: {
      PROTOTYPE_PORT: String(PORT)
    }
  },
  projects: [
    // Most NHS users are on phones, so test mobile first
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } }
  ]
})
