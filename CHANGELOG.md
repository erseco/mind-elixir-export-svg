# Changelog

## Unreleased

- First version: `renderSvg`, `exportSvg` and `downloadSvg` export an initialized Mind Elixir map
  (5.15.1 or later 5.x) as standalone SVG with native text and vector shapes, from the editor's
  own layout: topics, branches, tags, icons, links, images, the collapsed-branch indicator,
  arrows and summaries with their labels, and the theme background. `createSvgExportPlugin()`
  adds `mind.exportVectorSvg()`.
- Options for padding, background, accessible title and description, ids, fonts, `textLength`,
  links, images (with a resolver), strict mode, cancellation and resource limits; typed errors
  and warnings.
