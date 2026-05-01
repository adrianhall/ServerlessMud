import path from "node:path";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@lib": path.resolve(__dirname, "../../src/lib")
    }
  },
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "../../wrangler.jsonc" }
    })
  ],
  test: {
    name: "lib",
    include: ["**/*.test.ts"]
  }
});
