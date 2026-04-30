/**
 * ESLint configuration for the ServerlessMud project. This file defines linting 
 * rules and settings for different parts of the codebase, including global ignores, 
 * base TypeScript files, React client files, Worker files, and configuration files 
 * at the repo root.
 */
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";

export default tseslint.config(
  // ── Global ignores ────────────────────────────────────────────────────
  { ignores: ["dist/", ".wrangler/", "worker-configuration.d.ts"] },

  // ── Base: all TypeScript source and test files ─────────────────────────
  {
    files: ["src/**/*.{ts,tsx}", "tests/**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" }
      ]
    }
  },

  // ── Test relaxations ──────────────────────────────────────────────────
  {
    files: ["tests/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/ban-ts-comment": "off"
    }
  },

  // ── React (src/client + tests/client) ─────────────────────────────────
  {
    files: ["src/client/**/*.{ts,tsx}", "tests/client/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh
    },
    languageOptions: {
      globals: globals.browser
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }]
    }
  },

  // ── Worker (src/worker + tests/worker) ──────────────────────────────────
  {
    files: ["src/worker/**/*.ts", "tests/worker/**/*.ts"],
    rules: {
      // Workers should never reference DOM APIs directly; the type-checker
      // already enforces this via the tsconfig, but these lint rules catch
      // logical mistakes at the lint layer too.
      "no-restricted-globals": [
        "error",
        { name: "window", message: "Not available in Cloudflare Workers." },
        { name: "document", message: "Not available in Cloudflare Workers." },
        { name: "localStorage", message: "Not available in Cloudflare Workers." },
        { name: "sessionStorage", message: "Not available in Cloudflare Workers." }
      ]
    }
  },

  // ── Config files at the repo root (vite, eslint, etc.) ────────────────
  {
    files: ["*.config.{js,ts}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      globals: globals.node
    }
  }
);
