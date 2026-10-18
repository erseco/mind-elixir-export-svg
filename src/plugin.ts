import { renderSvg } from "./browser/exporter.js";
import type { MindElixirLike, SvgExportOptions, SvgExportResult } from "./types.js";

/** A Mind Elixir instance with the plugin installed. */
export type WithVectorSvgExport<T extends MindElixirLike = MindElixirLike> = T & {
  exportVectorSvg(options?: SvgExportOptions): Promise<SvgExportResult>;
};

/**
 * A Mind Elixir plugin (`mind.install(createSvgExportPlugin())`) that adds
 * `mind.exportVectorSvg(options)`. It does not touch Mind Elixir's deprecated `exportSvg`.
 * `defaults` are merged under the options of each call.
 */
export function createSvgExportPlugin(defaults: SvgExportOptions = {}) {
  return function svgExportPlugin<T extends MindElixirLike>(mind: T): void {
    (mind as WithVectorSvgExport<T>).exportVectorSvg = (options?: SvgExportOptions) =>
      renderSvg(mind, { ...defaults, ...options, limits: { ...defaults.limits, ...options?.limits } });
  };
}
