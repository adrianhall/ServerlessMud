import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@src": path.resolve(__dirname, "../../src")
    }
  },
  test: {
    name: "client",
    environment: "happy-dom",
    include: ["**/*.test.{ts,tsx}"],
    setupFiles: ["./setup.ts"]
  }
});
