import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: process.env.BASE_URL || "http://localhost:3100",
    headless: true,
    launchOptions: {
      ...(process.env.CI
        ? {}
        : {
            executablePath:
              "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          }),
    },
  },
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: "npm run start -- --port 3100",
        url: "http://localhost:3100",
        reuseExistingServer: !process.env.CI,
      },
});
