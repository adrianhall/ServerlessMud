import path from "node:path";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@lib": path.resolve(__dirname, "../../src/lib"),
      "@src": path.resolve(__dirname, "../../src")
    }
  },
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "../../wrangler.jsonc" }
    })
  ],
  test: {
    name: "worker",
    include: ["**/*.test.ts"],
    env: {
      LOG_LEVEL: "silent"
    }
  }
});
