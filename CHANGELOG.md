# Changelog

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
