import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  resolve: {
    alias: {
      "@lib": path.resolve(__dirname, "src/lib")
    }
  },
  plugins: [react(), cloudflare()]
});
