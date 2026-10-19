// Compare this renderer with a Mind Elixir version from npm, without changing the repo lockfile.
//
//   npm run test:compat -- --mind-elixir-version 5.15.1
//   npm run test:compat -- --mind-elixir-version latest
//   npm run test:compat -- --mind-elixir-version next
//
// `latest` is the newest stable release. npm's latest tag currently points at a 6.0 prerelease,
// and a prerelease is reported as experimental: it does not fail the run. A stable version
// outside the geometry tolerances exits 1. A visual failure on the supported baseline does too.
// `--advisory` always exits 0. `--visual` also runs the Chromium visual spec. Reports go to
// artifacts/compat/ and are not baseline files.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { build } from "esbuild";
import { measureLayouts } from "./measure-layout.mjs";

const spec = valueOf("--mind-elixir-version");
const advisory = process.argv.includes("--advisory");
const visual = process.argv.includes("--visual");
if (!spec || spec.startsWith("--")) {
  console.error(
    "Usage: npm run test:compat -- --mind-elixir-version <5.15.1|latest|next|version> [--advisory] [--visual]",
  );
  process.exit(1);
}

const load = async (entry) => {
  const out = await build({ entryPoints: [entry], bundle: true, format: "esm", write: false, platform: "node" });
  return import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString("base64")}`);
};

const pkgJson = JSON.parse(readFileSync("package.json", "utf8"));
const { SUPPORTED_MIND_ELIXIR_VERSION } = await load("src/profile.ts");
const { MEASURED_FIXTURES, withinTolerance, KNOWN_LIMITATIONS } = await load("tests/tolerances.ts");

let resolved;
try {
  resolved = resolveSpec(spec);
} catch (error) {
  failResolve(error);
}

const installRoot = path.resolve(".scratch/compat/pkg");
rmSync(installRoot, { recursive: true, force: true });
mkdirSync(installRoot, { recursive: true });
writeFileSync(
  path.join(installRoot, "package.json"),
  JSON.stringify({ private: true, dependencies: { "mind-elixir": resolved.version } }) + "\n",
);
execFileSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--no-package-lock"], {
  cwd: installRoot,
  stdio: "inherit",
});
const mindElixir = path.join(installRoot, "node_modules", "mind-elixir");
const installed = JSON.parse(readFileSync(path.join(mindElixir, "package.json"), "utf8")).version;
execFileSync("node", ["scripts/build-harness.mjs"], {
  stdio: "inherit",
  env: { ...process.env, MIND_ELIXIR_PACKAGE: mindElixir },
});

const measured = await measureLayouts({
  fixtures: MEASURED_FIXTURES,
  checkZoom: true,
  tolerateErrors: true,
});
const recorded = existsSync("docs/layout-deviation.json")
  ? JSON.parse(readFileSync("docs/layout-deviation.json", "utf8"))
  : {};

const cases = [];
const drifts = [];
let max = { x: 0, y: 0, width: 0, height: 0 };
for (const [browser, result] of Object.entries(measured)) {
  for (const [fixture, row] of Object.entries(result.maps)) {
    const deviation = {
      x: row.x ?? 0,
      y: row.y ?? 0,
      width: row.width ?? 0,
      height: row.height ?? 0,
    };
    const failed = Boolean(row.error) || (row.missing ?? 0) > 0 || !withinTolerance(fixture, browser, deviation);
    if (!row.error) for (const key of Object.keys(max)) max[key] = Math.max(max[key], deviation[key]);
    cases.push({
      fixture,
      browser,
      passed: !failed,
      topics: row.topics ?? 0,
      missing: row.missing ?? 0,
      deviation,
      ...(row.error ? { error: row.error } : {}),
    });
    const baseline = recorded[browser]?.maps?.[fixture];
    if (baseline) {
      for (const key of ["x", "y", "width", "height"]) {
        if (typeof row[key] === "number" && row[key] > baseline[key] + 1) {
          drifts.push({ fixture, browser, metric: key, measured: row[key], baseline: baseline[key] });
        }
      }
    }
  }
}

let visualResult = "not run";
if (visual) {
  const run = spawnSync("npx", ["playwright", "test", "tests/browser/visual.spec.ts", "--project=chromium"], {
    stdio: "inherit",
    env: { ...process.env, CI: process.env.CI ?? "1" },
  });
  visualResult = run.status === 0 ? "passed" : "failed";
}

const geometryPassed = cases.every((row) => row.passed);
const zoom = Object.fromEntries(Object.entries(measured).map(([browser, result]) => [browser, result.zoom ?? null]));
const zoomMoved = Object.values(zoom).some(
  (value) => value && Object.values(value).some((delta) => typeof delta === "number" && delta > 0.05),
);

let status;
if (installed === SUPPORTED_MIND_ELIXIR_VERSION) {
  status = geometryPassed && visualResult !== "failed" ? "supported" : "incompatible";
} else if (!geometryPassed && !resolved.prerelease) status = "incompatible";
else status = "experimental";

const passed = cases.filter((row) => row.passed).length;
const report = {
  status,
  geometry: geometryPassed ? "passed" : "failed",
  promoted: false,
  mindElixir: {
    requested: spec,
    version: installed,
    prerelease: resolved.prerelease,
    ...(resolved.note ? { note: resolved.note } : {}),
  },
  renderer: {
    name: pkgJson.name,
    version: pkgJson.version,
    commit: git(["rev-parse", "HEAD"]),
    supportedMindElixir: SUPPORTED_MIND_ELIXIR_VERSION,
  },
  runtime: { node: process.version, platform: process.platform, arch: process.arch },
  browsers: Object.entries(measured).map(([name, result]) => ({ name, version: result.version })),
  tests: { passed, failed: cases.length - passed, total: cases.length },
  maxDeviation: Object.fromEntries(Object.entries(max).map(([key, n]) => [key, +n.toFixed(2)])),
  zoom,
  visual: visualResult,
  cases,
  regressions: cases.filter((row) => !row.passed),
  driftFromRecordedBaseline: drifts,
  potentialBreakingChanges: [
    ...cases.filter((row) => !row.passed).map((row) => `${row.browser} ${row.fixture} is outside the 5.15.1 tolerance`),
    ...drifts.map(
      (row) =>
        `${row.browser} ${row.fixture} ${row.metric} is ${row.measured} px, recorded baseline ${row.baseline} px`,
    ),
    ...(zoomMoved ? ["Topic boxes in layout space moved when the editor zoom changed."] : []),
    ...(visualResult === "failed" ? ["Chromium visual comparison failed."] : []),
  ],
  knownLimitations: KNOWN_LIMITATIONS,
  summary: summaryText(),
};

const outDir = path.resolve("artifacts/compat");
mkdirSync(outDir, { recursive: true });
const stem = path.join(outDir, installed.replace(/[^A-Za-z0-9._-]/g, "_"));
writeFileSync(`${stem}.json`, JSON.stringify(report, null, 2) + "\n");
writeFileSync(`${stem}.md`, markdown(report));
console.log(`\n${report.summary}`);
console.log(`Report: ${stem}.json`);
if (status === "incompatible" && !advisory) process.exit(1);

function summaryText() {
  const head = `Mind Elixir ${installed} (${spec}) is ${status}. Geometry ${geometryPassed ? "passed" : "failed"}: ${passed}/${cases.length}.`;
  if (status === "supported") {
    return `${head} This is the supported baseline ${SUPPORTED_MIND_ELIXIR_VERSION}. A passing run does not re-record it.`;
  }
  if (status === "incompatible") {
    return `${head} The failures are listed in the report. This version is not supported.`;
  }
  return `${head} Experimental: a passing subset does not make ${installed} supported. The supported baseline stays ${SUPPORTED_MIND_ELIXIR_VERSION}.`;
}

function markdown(report) {
  const lines = [
    `# Mind Elixir ${report.mindElixir.version}`,
    "",
    report.summary,
    "",
    `| | |`,
    `| --- | --- |`,
    `| Status | ${report.status} |`,
    `| Geometry | ${report.geometry} |`,
    `| Requested | ${report.mindElixir.requested} |`,
    `| Prerelease | ${report.mindElixir.prerelease} |`,
    `| Renderer | ${report.renderer.version} (${report.renderer.commit}) |`,
    `| Supported baseline | ${report.renderer.supportedMindElixir} |`,
    `| Node | ${report.runtime.node} on ${report.runtime.platform} |`,
    `| Browsers | ${report.browsers.map((b) => `${b.name} ${b.version}`).join(", ")} |`,
    `| Tests | ${report.tests.passed} passed, ${report.tests.failed} failed |`,
    `| Max deviation px | x ${report.maxDeviation.x}, y ${report.maxDeviation.y}, width ${report.maxDeviation.width}, height ${report.maxDeviation.height} |`,
    `| Visual | ${report.visual} |`,
    "",
  ];
  if (report.mindElixir.note) lines.push(report.mindElixir.note, "");
  lines.push("## Failures", "");
  if (report.regressions.length === 0) lines.push("None.", "");
  else {
    for (const row of report.regressions) {
      const detail = row.error ? row.error : JSON.stringify(row.deviation);
      lines.push(`- ${row.browser} / ${row.fixture}: ${detail}`);
    }
    lines.push("");
  }
  lines.push("## Drift from the recorded baseline", "");
  if (report.driftFromRecordedBaseline.length === 0) lines.push("None beyond 1 px.", "");
  else {
    for (const row of report.driftFromRecordedBaseline) {
      lines.push(`- ${row.browser} / ${row.fixture} ${row.metric}: ${row.measured} px (recorded ${row.baseline} px)`);
    }
    lines.push("");
  }
  lines.push("## Known limitations", "");
  for (const item of report.knownLimitations) lines.push(`- ${item}`);
  lines.push(
    "",
    "Zoom check (layout-space movement of `three`, px):",
    "",
    "```json",
    JSON.stringify(report.zoom, null, 2),
    "```",
    "",
  );
  return lines.join("\n");
}

function valueOf(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

function npmJson(args) {
  return JSON.parse(execFileSync("npm", args, { encoding: "utf8" }));
}

function resolveSpec(requested) {
  const tags = npmJson(["view", "mind-elixir", "dist-tags", "--json"]);
  if (requested === "latest") {
    const versions = npmJson(["view", "mind-elixir", "versions", "--json"]).filter((version) => !version.includes("-"));
    versions.sort(compareStable);
    const version = versions.at(-1);
    if (!version) throw new Error("npm has no stable mind-elixir release");
    const note = String(tags.latest).includes("-")
      ? `npm's latest tag is ${tags.latest}, a prerelease. latest here is the newest stable release.`
      : undefined;
    return { version, prerelease: false, note };
  }
  if (Object.prototype.hasOwnProperty.call(tags, requested)) {
    const version = tags[requested];
    return { version, prerelease: version.includes("-"), note: `dist-tag ${requested}` };
  }
  const version = execFileSync("npm", ["view", `mind-elixir@${requested}`, "version"], { encoding: "utf8" }).trim();
  if (version.includes("\n")) throw new Error(`Pass one version. npm returned:\n${version}`);
  return { version, prerelease: version.includes("-") };
}

function compareStable(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const delta = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (delta) return delta;
  }
  return 0;
}

function git(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function failResolve(error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  if (advisory) {
    const outDir = path.resolve("artifacts/compat");
    mkdirSync(outDir, { recursive: true });
    writeFileSync(
      path.join(outDir, "unresolved.json"),
      JSON.stringify({ status: "experimental", geometry: "failed", error: message, requested: spec }, null, 2) + "\n",
    );
    process.exit(0);
  }
  process.exit(1);
}
