import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    name: "client",
    environment: "happy-dom",
    include: ["**/*.test.{ts,tsx}"],
    setupFiles: ["./setup.ts"]
  }
});
