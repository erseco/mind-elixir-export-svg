// Packs the library, installs the tarball in an empty project and uses it from there, so what
// is tested is exactly what gets published: the files, the exports, the types, and that
// importing it outside a browser does not touch the DOM.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// npm_execpath also works on Windows without invoking a .cmd through a shell
const npm = (args, cwd = process.cwd()) =>
  execFileSync(process.execPath, ["--", process.env.npm_execpath, ...args], { cwd, encoding: "utf8" });
mkdirSync("artifacts", { recursive: true });
const [pack] = JSON.parse(npm(["pack", "--ignore-scripts", "--json", "--pack-destination", "artifacts"]));
for (const file of pack.files) {
  assert.match(
    file.path,
    /^(dist\/[\w./-]+\.(js|d\.ts)|README\.md|LICENSE|package\.json)$/,
    `unexpected file ${file.path}`,
  );
}
for (const required of ["dist/index.js", "dist/index.d.ts", "dist/browser/exporter.js", "LICENSE", "README.md"]) {
  assert.ok(
    pack.files.some((f) => f.path === required),
    `missing ${required}`,
  );
}

const temporary = mkdtempSync(join(tmpdir(), "mind-elixir-export-svg-"));
try {
  npm(["init", "-y"], temporary);
  writeFileSync(join(temporary, "package.json"), JSON.stringify({ name: "consumer", private: true, type: "module" }));
  // Peer dependencies are the application's: leave them out to see what the package brings
  npm(
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--omit=peer", resolve("artifacts", pack.filename)],
    temporary,
  );
  const lock = JSON.parse(readFileSync(join(temporary, "package-lock.json"), "utf8"));
  assert.deepEqual(
    Object.keys(lock.packages)
      .filter(Boolean)
      .filter((p) => !lock.packages[p].peer),
    ["node_modules/@erseco/mind-elixir-export-svg"],
    "The package must have no runtime dependencies",
  );

  // Node has no DOM: importing must work, and exporting must fail with a typed error
  const check = `
    import * as lib from "@erseco/mind-elixir-export-svg";
    const names = ["renderSvg", "exportSvg", "downloadSvg", "createSvgExportPlugin", "SvgExportError", "DEFAULT_LIMITS"];
    for (const n of names) if (!(n in lib)) { console.error("missing export", n); process.exit(1); }
    if (typeof document !== "undefined") process.exit(2);
    const error = await lib.renderSvg({}).catch((e) => e);
    if (!(error instanceof lib.SvgExportError) || error.code !== "NOT_INITIALIZED") { console.error(error); process.exit(3); }
    const invalid = await lib.renderSvg({}, { padding: -1 }).catch((e) => e.code);
    if (invalid !== "INVALID_OPTIONS") process.exit(4);
  `;
  execFileSync(process.execPath, ["--input-type=module", "-e", check], { cwd: temporary, stdio: "inherit" });

  // The declarations type-check in a strict consumer, without Mind Elixir's types
  writeFileSync(
    join(temporary, "consumer.ts"),
    `import { renderSvg, createSvgExportPlugin, type SvgExportOptions, type SvgExportResult, type WithVectorSvgExport, type MindElixirLike } from "@erseco/mind-elixir-export-svg";
declare const mind: MindElixirLike & { install(plugin: (m: MindElixirLike) => void): void };
const options: SvgExportOptions = { padding: 8, background: "transparent", links: "text", limits: { maxNodes: 5 } };
const result: Promise<SvgExportResult> = renderSvg(mind, options);
mind.install(createSvgExportPlugin({ padding: 0 }));
void (mind as WithVectorSvgExport<typeof mind>).exportVectorSvg().then((r) => r.warnings.map((w) => w.code));
void result;
`,
  );
  writeFileSync(
    join(temporary, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        module: "NodeNext",
        moduleResolution: "NodeNext",
        target: "ES2022",
        lib: ["ES2022", "DOM"],
        skipLibCheck: false,
        exactOptionalPropertyTypes: true,
      },
      files: ["consumer.ts"],
    }),
  );
  execFileSync(process.execPath, [resolve("node_modules/typescript/bin/tsc"), "-p", temporary], { stdio: "inherit" });

  const installed = JSON.parse(
    readFileSync(join(temporary, "node_modules/@erseco/mind-elixir-export-svg/package.json"), "utf8"),
  );
  assert.equal(installed.version, pack.version);
  console.log(
    `PASS: ${pack.filename}, ${pack.files.length} allowed files, imported and type-checked from the installed package`,
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
