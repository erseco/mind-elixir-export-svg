import type { TextMeasurer } from "./text/measure.js";
import type { Theme } from "./theme.js";

/** Mind Elixir data, as `mind.getData()` returns it (only what the renderer reads). */
export interface MindElixirData {
  nodeData: object;
  arrows?: readonly object[] | undefined;
  summaries?: readonly object[] | undefined;
  direction?: number | undefined;
  theme?: Theme | undefined;
  /** Mind Elixir's compact layout. Omitted means not compact. */
  compact?: boolean | undefined;
}

/** What `renderSvg` accepts: Mind Elixir data, or an instance (its `getData()`, theme and direction). */
export type MindElixirInput = MindElixirData | { getData(): MindElixirData; theme?: unknown; direction?: unknown };

/** A resolved image: a `Blob`, or a `data:` URL string. */
export type ResolvedImage = Blob | string;

/**
 * Supplies the bytes of an image the renderer does not read on its own (anything other than a
 * `data:` URL, or a `blob:` URL in a browser). Return `null` to leave the image out, with a
 * warning.
 */
export type ImageResolver = (
  url: string,
  context: { signal: AbortSignal | undefined },
) => Promise<ResolvedImage | null> | ResolvedImage | null;

export interface SvgExportLimits {
  /** Nodes in the map. Default 10,000. */
  maxNodes: number;
  /** Levels below the root. Default 1,000. */
  maxDepth: number;
  /** Characters of topic text in the whole map. Default 1,000,000. */
  maxTextLength: number;
  /** Embedded images. Default 200. */
  maxImages: number;
  /** Bytes of one embedded image. Default 5 MiB. */
  maxImageBytes: number;
  /** Characters of the SVG document. Default 50,000,000. */
  maxOutputLength: number;
}

export interface SvgExportOptions {
  /** Space around the map, in px. Default 24. */
  padding?: number;
  /**
   * `"theme"` (default): the theme's background (`--bgcolor`). `"transparent"`: none. Or a
   * colour: `#hex`, `rgb()`, `rgba()` or a CSS colour name.
   */
  background?: string;
  /** Accessible name of the SVG (`<title>`). Default: the root topic. */
  title?: string;
  /** Accessible description (`<desc>`). */
  description?: string;
  /** Prefix of the ids the SVG defines, unique per document. Default `"mindmap-svg"`. */
  idPrefix?: string;
  /**
   * Mind Elixir theme. Default: the data's or instance's theme, else Mind Elixir's light theme.
   * A partial `cssVar` is filled from the light theme, or from the dark theme when `type` is
   * `"dark"`, as Mind Elixir's `changeTheme` does.
   */
  theme?: Theme;
  /** 0 left, 1 right, 2 both sides, 3 top-down. Default: the data's or instance's, else 2. */
  direction?: 0 | 1 | 2 | 3;
  /**
   * The font family written into the SVG. Default `Arial, Helvetica, 'Liberation Sans', Arimo,
   * sans-serif`, the font the default measurer has metrics for. Pass `measureText` with it to
   * lay out for another font.
   */
  fontFamily?: string;
  /** Measures text for the layout. Default: Arial's advances (no canvas, no DOM). */
  measureText?: TextMeasurer;
  /**
   * Write each line's computed width as `textLength` (default true), so a viewer whose font
   * differs adjusts the spacing to fit the same width instead of overflowing the node.
   * Renderers without `textLength` support, such as svg2pdf.js, ignore it.
   */
  textLength?: boolean;
  /** `"preserve"` (default): node links become SVG links (http, https and mailto only). `"text"`: only the 🔗. */
  links?: "preserve" | "text";
  /** Embed images (default true). When false, images are left out with a warning. */
  embedImages?: boolean;
  /** Resolves images that are not `data:` (or, in a browser, `blob:`) URLs. Without it they are left out. */
  resolveImage?: ImageResolver;
  /** Throw instead of warning when something cannot be rendered faithfully. Default false. */
  strict?: boolean;
  /** Cancels the export. */
  signal?: AbortSignal;
  /** Resource limits; the export fails with `LIMIT_EXCEEDED` beyond them. */
  limits?: { [K in keyof SvgExportLimits]?: number | undefined };
}

export type SvgExportWarningCode = "IMAGE_NOT_EMBEDDED" | "UNSUPPORTED_HTML" | "UNSUPPORTED_STYLE" | "UNSAFE_LINK";

export interface SvgExportWarning {
  code: SvgExportWarningCode;
  message: string;
  /** The Mind Elixir node id the warning is about, when there is one. */
  nodeId?: string;
}

export interface SvgExportResult {
  /** A complete, standalone SVG document (UTF-8, no XML declaration). */
  svg: string;
  width: number;
  height: number;
  viewBox: string;
  warnings: SvgExportWarning[];
}
