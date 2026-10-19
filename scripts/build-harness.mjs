// Bundles tests/browser/harness.ts (Mind Elixir + this library) into one offline script,
// with Mind Elixir's stylesheet next to it, the PDF tools used by the compatibility test and the screenshot library used by the benchmark.
// MIND_ELIXIR_PACKAGE points at another install (see scripts/compat.mjs) without changing this repo's lockfile.
import { build } from "esbuild";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const mindRoot = process.env.MIND_ELIXIR_PACKAGE ? checkedPackage(process.env.MIND_ELIXIR_PACKAGE) : undefined;
const alias = mindRoot ? { "mind-elixir": mindRoot } : undefined;

// Only an install under this repo's .scratch or node_modules, and only the mind-elixir package.
function checkedPackage(dir) {
  const resolved = path.resolve(dir);
  const allowed = [".scratch", "node_modules"].map((name) => path.resolve(name) + path.sep);
  if (!allowed.some((root) => resolved.startsWith(root))) {
    throw new Error(`MIND_ELIXIR_PACKAGE must be under .scratch or node_modules: ${resolved}`);
  }
  const name = JSON.parse(readFileSync(path.join(resolved, "package.json"), "utf8")).name;
  if (name !== "mind-elixir") throw new Error(`MIND_ELIXIR_PACKAGE is ${name}, not mind-elixir`);
  return resolved;
}

function mindStylesheet() {
  const dist = path.join(mindRoot ?? "node_modules/mind-elixir", "dist");
  for (const name of ["MindElixir.css", "style.css", "mind-elixir.css"]) {
    const candidate = path.join(dist, name);
    if (existsSync(candidate)) return candidate;
  }
  const found = existsSync(dist) ? readdirSync(dist).find((file) => file.endsWith(".css")) : undefined;
  if (!found) throw new Error(`No stylesheet in ${dist}. Mind Elixir's CSS filename may have changed.`);
  return path.join(dist, found);
}

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
    ...(alias ? { alias } : {}),
  });
}
copyFileSync(mindStylesheet(), `${out}/mind-elixir.css`);

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
