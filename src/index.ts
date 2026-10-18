/**
 * Exports Mind Elixir mind maps as standalone SVG with native text and vector shapes, reading
 * the geometry the browser laid out. Importing this module does not touch the DOM; only the
 * export functions need a browser.
 */
export { renderSvg, exportSvg, downloadSvg } from "./browser/exporter.js";
export { createSvgExportPlugin, type WithVectorSvgExport } from "./plugin.js";
export { SvgExportError, type SvgExportErrorCode } from "./errors.js";
export { DEFAULT_LIMITS } from "./options.js";
export type {
  ImageResolver,
  MindElixirLike,
  ResolvedImage,
  SvgExportLimits,
  SvgExportOptions,
  SvgExportResult,
  SvgExportWarning,
  SvgExportWarningCode,
} from "./types.js";
