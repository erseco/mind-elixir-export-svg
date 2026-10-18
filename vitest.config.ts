import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // The DOM-dependent modules (src/browser, the plugin and the entry point) run in real
      // browsers instead: see tests/browser
      include: ["src/**/*.ts"],
      exclude: ["src/browser/**", "src/plugin.ts", "src/index.ts", "src/types.ts"],
      reporter: ["text", "lcov", "json-summary"],
      thresholds: { lines: 100, functions: 100, statements: 100, branches: 100 },
    },
  },
});
