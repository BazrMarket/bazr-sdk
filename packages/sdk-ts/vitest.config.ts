import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // test/sleep.test.ts loads the built entry point from a child process.
    globalSetup: ["./test/global-setup.ts"],
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
