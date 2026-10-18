// Bundles tests/browser/harness.ts (Mind Elixir + this library) into one offline script,
// with Mind Elixir's stylesheet next to it, the PDF tools used by the compatibility test and the screenshot library used by the benchmark.
import { build } from "esbuild";
import { copyFileSync, mkdirSync } from "node:fs";

const out = "tests/browser/.harness";
mkdirSync(out, { recursive: true });
for (const name of ["harness", "pdf-harness", "bench-harness"]) {
  await build({
    entryPoints: [`tests/browser/${name}.ts`],
    bundle: true,
    format: "iife",
    target: "es2022",
    outfile: `${out}/${name}.js`,
    logLevel: "warning",
  });
}
copyFileSync("node_modules/mind-elixir/dist/MindElixir.css", `${out}/mind-elixir.css`);

// The demo page
const demo = "examples/demo/dist";
mkdirSync(demo, { recursive: true });
await build({
  entryPoints: ["examples/demo/demo.ts"],
  bundle: true,
  format: "iife",
  target: "es2022",
  outfile: `${demo}/demo.js`,
  logLevel: "warning",
});
copyFileSync("node_modules/mind-elixir/dist/MindElixir.css", `${demo}/mind-elixir.css`);
