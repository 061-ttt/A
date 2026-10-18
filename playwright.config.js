// @ts-check
const { defineConfig, devices } = require('@playwright/test');

// BASE_URL を指定すると公開中のサイトをテストします（例: GitHub Pages）。
// 指定しない場合は、このフォルダをローカルで配信してテストします。
const baseURL = process.env.BASE_URL || 'http://localhost:4173/';

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL,
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 860 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: process.env.BASE_URL
    ? undefined
    : { command: 'python3 -m http.server 4173', url: 'http://localhost:4173/', reuseExistingServer: !process.env.CI },
});
