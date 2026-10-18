/**
 * Renders Mind Elixir mind maps as standalone SVG with native text and vector shapes, laid out
 * as Mind Elixir lays them out, from the data and font metrics alone: no browser or DOM, and
 * the same SVG wherever it runs.
 */
export { renderSvg, exportSvg, downloadSvg } from "./render.js";
export { createSvgExportPlugin, type MindElixirLike, type WithVectorSvgExport } from "./plugin.js";
export { SvgExportError, type SvgExportErrorCode } from "./errors.js";
export { DEFAULT_LIMITS, DEFAULT_FONT_FAMILY } from "./options.js";
export { THEME, DARK_THEME, type Theme } from "./theme.js";
export { arialMeasurer, type Font, type TextMeasurer } from "./text/measure.js";
export type {
  ImageResolver,
  MindElixirData,
  MindElixirInput,
  ResolvedImage,
  SvgExportLimits,
  SvgExportOptions,
  SvgExportResult,
  SvgExportWarning,
  SvgExportWarningCode,
} from "./types.js";
