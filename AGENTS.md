# Agent instructions

A TypeScript library that exports an initialized Mind Elixir map as standalone, faithful SVG.
MIT. Not an official Mind Elixir package.

- Write all code, identifiers, comments, documentation, commits and user-facing text in English.
- Use strict TypeScript and two spaces; `npm run format` applies formatting. Use English branch
  names prefixed with `feature/` or `hotfix/`.
- Fidelity comes from the browser's layout. Never re-implement wrapping, layout or Mind Elixir's
  geometry in the browser exporter; read it. Never use `foreignObject`, screenshots, rasterized
  text, `<style>`, scripts or remote resources in the output.
- Keep the package free of runtime dependencies. `mind-elixir` is a peer dependency; everything
  else (Playwright, Pele, modern-screenshot, svg2pdf.js, resvg) is for tests and benchmarks only.
- Keep DOM access out of module scope: importing the package must work without a DOM.
- Exporting must not change the editor (DOM, zoom, selection, history). Any new reading of the
  DOM needs a test that compares the editor's state before and after.
- Code outside `src/browser` is pure and stays at 100% unit coverage. Code in `src/browser` is
  tested in Chromium, Firefox and WebKit (`npm run test:e2e`) against real Mind Elixir maps.
- Every new string written to the SVG goes through `escapeXml`, every number through `num`, every
  link through `safeLink`, every image through `rasterDataUrl`. A change to escaping, links or
  images needs a test with hostile input.
- Do not widen a test tolerance without measuring why, and record the measurement in
  docs/COMPATIBILITY.md.
- Do not copy code from Mind Elixir or Pele wholesale; credit any adapted piece (the expand icon
  is credited in `src/browser/extract.ts` and README).

Before release: `npm ci`, `npm run check`, `npm run test:e2e`, `npm run test:package`.

Publishing is not enabled yet (`"private": true` in package.json). Once it is authorized: remove
`private`, then after CI passes publish a GitHub Release whose title and new tag are `v` plus the
exact `package.json` version. The release triggers `publish.yml`, which uses npm Trusted
Publishing (OIDC), environment `npm`, and publishes the tarball the package test installed.
Never replace a published release. Record changes in CHANGELOG.md.
