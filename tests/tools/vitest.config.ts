import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@lib": path.resolve(__dirname, "../../src/lib")
    }
  },
  test: {
    name: "tools",
    environment: "node",
    include: ["**/*.test.ts"]
  }
});
