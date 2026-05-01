import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "tests/client/vitest.config.ts",
      "tests/lib/vitest.config.ts",
      "tests/worker/vitest.config.ts"
    ],
    coverage: {
      provider: "istanbul",
      reporter: ["text", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90
      }
    }
  }
});
