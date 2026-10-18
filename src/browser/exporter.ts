import { parseColor } from "../css.js";
import { SvgExportError, throwIfAborted } from "../errors.js";
import { resolveOptions } from "../options.js";
import { renderDocument } from "../svg/document.js";
import type { MindElixirLike, SvgExportOptions, SvgExportResult, SvgExportWarning } from "../types.js";
import { extractScene } from "./extract.js";
import { unavailableFonts, waitForFonts } from "./fonts.js";

function assertMind(mind: MindElixirLike): void {
  const nodes = (mind as Partial<MindElixirLike> | null | undefined)?.nodes;
  if (typeof Element === "undefined" || !(nodes instanceof Element)) {
    throw new SvgExportError("NOT_INITIALIZED", "Expected an initialized Mind Elixir instance (mind.nodes is missing)");
  }
  if (!nodes.isConnected)
    throw new SvgExportError("NOT_INITIALIZED", "The Mind Elixir map is not attached to the document");
}

/**
 * Exports an initialized Mind Elixir map as a standalone SVG, as the editor displays it. The
 * editor is only read: zoom, pan, selection, folding and data stay as they are.
 */
export async function renderSvg(mind: MindElixirLike, options?: SvgExportOptions): Promise<SvgExportResult> {
  const opts = resolveOptions(options);
  assertMind(mind);
  const warnings: SvgExportWarning[] = [];
  const seen = new Set<string>();
  const warn = (code: SvgExportWarning["code"], message: string, nodeId?: string) => {
    if (opts.strict) throw new SvgExportError(code, message);
    const key = `${code}\u0000${message}\u0000${nodeId ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    warnings.push(nodeId === undefined ? { code, message } : { code, message, nodeId });
  };

  const fontsLoaded = opts.waitForFonts ? await waitForFonts(opts.fontTimeout, opts.signal) : true;
  throwIfAborted(opts.signal);
  const scene = await extractScene(mind, opts, warn);
  throwIfAborted(opts.signal);
  if (!fontsLoaded)
    warn(
      "FONT_UNAVAILABLE",
      `Fonts were still loading after ${opts.fontTimeout} ms; text was measured with the fonts available`,
    );
  for (const font of unavailableFonts(scene.fonts, scene.families))
    warn("FONT_UNAVAILABLE", `Font not loaded: ${font}`);

  const container = mind.container ?? mind.nodes.closest<HTMLElement>(".map-container");
  const background =
    opts.background === "theme"
      ? container
        ? parseColor(getComputedStyle(container).backgroundColor)
        : null
      : opts.background;
  const doc = renderDocument(scene.shapes, {
    padding: opts.padding,
    background,
    title: opts.title ?? (scene.rootText || "Mind map"),
    description: opts.description,
    idPrefix: opts.idPrefix,
    maxOutputLength: opts.limits.maxOutputLength,
    textLength: opts.textLength,
  });
  return { ...doc, warnings };
}

/** `renderSvg` as an `image/svg+xml` Blob. */
export async function exportSvg(mind: MindElixirLike, options?: SvgExportOptions): Promise<Blob> {
  const { svg } = await renderSvg(mind, options);
  return new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
}

/** Downloads the map as an SVG file. Resolves with the export result. */
export async function downloadSvg(
  mind: MindElixirLike,
  filename = "mindmap.svg",
  options?: SvgExportOptions,
): Promise<SvgExportResult> {
  const result = await renderSvg(mind, options);
  const url = URL.createObjectURL(new Blob([result.svg], { type: "image/svg+xml;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_") || "mindmap.svg";
  link.style.display = "none";
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    // Revoked on the next task, after the download has started
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  return result;
}
