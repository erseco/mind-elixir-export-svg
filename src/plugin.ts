import { cssVarDiffers, readLiveCssVars } from "./live.js";
import { renderSvg } from "./render.js";
import { DARK_THEME, THEME, type Theme } from "./theme.js";
import type { MindElixirData, SvgExportOptions, SvgExportResult } from "./types.js";

/** What the plugin needs from a Mind Elixir instance. */
export interface MindElixirLike {
  getData(): MindElixirData;
  theme?: unknown;
  direction?: unknown;
  /** The map container, when the plugin is installed on a live editor. */
  container?: unknown;
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
    (mind as WithVectorSvgExport<T>).exportVectorSvg = (options?: SvgExportOptions) => {
      const merged: SvgExportOptions = {
        ...defaults,
        ...options,
        limits: { ...defaults.limits, ...options?.limits },
      };
      // An explicit theme wins. Otherwise, CSS variables on the live container (compact gaps,
      // a partial theme, a page override) are used when they differ from the declared theme.
      if (merged.theme === undefined) {
        const live = themeFromEditor(mind);
        if (live) merged.theme = live;
      }
      return renderSvg(mind, merged);
    };
  };
}

/**
 * A theme whose variables are what the editor is actually showing. Returns undefined when the
 * container cannot be read or it shows the declared theme, so the SVG stays byte-identical.
 */
function themeFromEditor(mind: MindElixirLike): Theme | undefined {
  const live = readLiveCssVars(mind.container);
  if (!live) return undefined;
  const declared = normalizeDeclared(mind.theme);
  const base = declared?.type === "dark" ? DARK_THEME : THEME;
  const mergedCss: Record<string, string> = { ...base.cssVar, ...declared?.cssVar };
  const overrides: Record<string, string> = {};
  for (const [key, value] of Object.entries(live)) {
    if (cssVarDiffers(mergedCss[key], value)) overrides[key] = value;
  }
  if (Object.keys(overrides).length === 0) return undefined;
  const theme: Theme = {
    palette: declared && declared.palette.length ? declared.palette : base.palette,
    cssVar: { ...mergedCss, ...overrides },
  };
  if (declared?.name !== undefined) theme.name = declared.name;
  theme.type = declared?.type === "dark" ? "dark" : "light";
  return theme;
}

function normalizeDeclared(value: unknown): Theme | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const theme = value as { name?: unknown; type?: unknown; palette?: unknown; cssVar?: unknown };
  if (!Array.isArray(theme.palette)) return undefined;
  const cssSource =
    typeof theme.cssVar === "object" && theme.cssVar !== null && !Array.isArray(theme.cssVar)
      ? (theme.cssVar as Record<string, unknown>)
      : {};
  const declared: Theme = {
    palette: theme.palette.filter((p): p is string => typeof p === "string"),
    cssVar: Object.fromEntries(
      Object.entries(cssSource).filter((e): e is [string, string] => typeof e[1] === "string"),
    ),
  };
  if (theme.type === "light" || theme.type === "dark") declared.type = theme.type;
  if (typeof theme.name === "string") declared.name = theme.name;
  return declared;
}
