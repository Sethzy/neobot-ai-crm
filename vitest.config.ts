import path from "path";
import { defineConfig } from "vitest/config";

const testInclude = [
  "src/**/*.{test,spec}.{ts,tsx}",
  "scripts/**/*.{test,spec}.{ts,tsx}",
  "tests/**/*.{test,spec}.{ts,tsx}",
  "api/**/*.{test,spec}.{ts,tsx}",
  "app/**/*.{test,spec}.{ts,tsx}",
  "supabase/migrations/**/*.{test,spec}.{ts,tsx}",
];

const integrationInclude = ["tests/integration/**/*.{test,spec}.{ts,tsx}"];

export default defineConfig({
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: testInclude,
          exclude: integrationInclude,
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: integrationInclude,
          fileParallelism: false,
        },
      },
    ],
  },
});
