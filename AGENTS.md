# Agent instructions

A TypeScript library that renders Mind Elixir maps as standalone SVG with Mind Elixir's layout,
from the data alone (like Pele: font metrics, no DOM). MIT. Not an official Mind Elixir package.

- Write all code, identifiers, comments, documentation, commits and user-facing text in English.
- Use strict TypeScript and two spaces; `npm run format` applies formatting. Use English branch
  names prefixed with `feature/` or `hotfix/`.
- One way to calculate: the layout model in `src/layout.ts`, with metrics tables. Never read a
  live DOM, measure with a canvas, or add a second code path for browsers. Never use
  `foreignObject`, screenshots, rasterized text, `<style>`, scripts or remote resources in the
  output.
- The model follows Mind Elixir 5.15.1's stylesheet and connector code. A change to it needs the
  value from Mind Elixir's source, a unit test, and `npm run compare-layout` before and after;
  update `tests/unit/reference.json` (`scripts/record-reference.mjs`) only when Mind Elixir
  itself changes.
- Keep the package free of runtime dependencies and of the DOM (only `downloadSvg` uses it, when
  called). Playwright, Mind Elixir, Pele, modern-screenshot, svg2pdf.js, resvg and the fonts are
  for tests, benchmarks and generating metrics.
- `src` stays at 100% unit coverage in Node. The browser tests (`npm run test:e2e`) measure the
  layout against real Mind Elixir in Chromium, Firefox and WebKit.
- Every new string written to the SVG goes through `escapeXml`, every number through `num`, every
  link through `safeLink`, every image through `rasterDataUrl`. A change to escaping, links or
  images needs a test with hostile input.
- Do not widen a test tolerance without measuring why, and record the measurement in
  docs/COMPATIBILITY.md.
- Do not copy code from Mind Elixir or Pele wholesale; credit any adapted piece (themes, layout
  constants, connector formulas and the expand icon are credited in their files and README;
  the metrics in `src/text/metrics.ts` come from Arimo, credited there).

Before release: `npm ci`, `npm run check`, `npm run test:e2e`, `npm run test:package`.

Publishing is not enabled yet (`"private": true` in package.json). Once it is authorized: remove
`private`, then after CI passes publish a GitHub Release whose title and new tag are `v` plus the
exact `package.json` version. The release triggers `publish.yml`, which uses npm Trusted
Publishing (OIDC), environment `npm`, and publishes the tarball the package test installed.
Never replace a published release. Record changes in CHANGELOG.md.
