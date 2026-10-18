import { renderSvg } from "./render.js";
import type { MindElixirData, SvgExportOptions, SvgExportResult } from "./types.js";

/** What the plugin needs from a Mind Elixir instance. */
export interface MindElixirLike {
  getData(): MindElixirData;
  theme?: unknown;
  direction?: unknown;
}

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
