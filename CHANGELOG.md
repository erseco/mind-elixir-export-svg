# Changelog

## 0.2.0 — 2026-10-19

- Layout lengths for Mind Elixir 5.15.1 live in `src/profile.ts`
  (`SUPPORTED_MIND_ELIXIR_VERSION`). `npm run test:compat` measures a chosen Mind Elixir version
  and writes `artifacts/compat/`. A weekly workflow checks the newest stable release; the `next`
  prerelease is advisory and does not fail the pipeline.
- Themes follow `changeTheme`: `type: "dark"` fills a partial theme from the dark theme, and
  `compact` applies the compact gaps. A transparent background stays transparent.
- The plugin copies allow-listed CSS variables from a live editor when they differ from the
  declared theme. `renderSvg` still needs no DOM.
- Main-node children stay in data order. The previous mapping searched the side order once per
  child.

## 0.1.1 — 2026-10-18

- `toDataUrl(svg)`: the SVG as a base64 `data:` URL, for an `<img src>`.
- The README shows example maps next to the editor and gives sizes in bytes and in kB/MB; the
  eXeLearning guide describes the integration as it is.

## 0.1.0 — 2026-10-18

- First version: `renderSvg`, `exportSvg` and `downloadSvg` render Mind Elixir data (or an
  instance) as standalone SVG with native text and vector shapes, laid out as Mind Elixir 5.15.1
  lays maps out, from the data and Arial's metrics alone: no browser or DOM. Topics, branches,
  tags, icons, links, images, the folded-branch icon, arrows and summaries with their labels,
  themes, and left, right, both-sides and top-down layouts. `createSvgExportPlugin()` adds
  `mind.exportVectorSvg()`.
- Options for padding, background, accessible title and description, ids, theme, direction,
  font family and measurer, `textLength`, links, images (with a resolver), strict mode,
  cancellation and resource limits; typed errors and warnings.
