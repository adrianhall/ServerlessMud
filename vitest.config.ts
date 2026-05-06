import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "tests/client/vitest.config.ts",
      "tests/lib/vitest.config.ts",
      "tests/tools/vitest.config.ts",
      "tests/worker/vitest.config.ts"
    ],
    coverage: {
      provider: "istanbul",
      reporter: ["text", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/tools/generate-world/index.ts" // CLI entry point — tested via end-to-end smoke test
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90
      }
    }
  }
});
