import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // Everything runs without a DOM, so everything is covered (types.ts has no code)
      exclude: ["src/types.ts"],
      reporter: ["text", "lcov", "json-summary"],
      thresholds: { lines: 100, functions: 100, statements: 100, branches: 100 },
    },
  },
});
