/**
 * The parts of a Mind Elixir instance the exporter reads. Structural, so the package does not
 * import Mind Elixir (or its types) at runtime; any initialized `MindElixirInstance` matches.
 */
export interface MindElixirLike {
  /** `me-nodes`: the untransformed layout surface every map element is placed in. */
  nodes: HTMLElement;
  /** `.map-container`: its background is the theme background. */
  container?: HTMLElement | undefined;
}

/** A resolved image: a `Blob`, or a `data:` URL string. */
export type ResolvedImage = Blob | string;

/**
 * Supplies the bytes of an image the exporter would not fetch on its own (anything other than
 * `data:` and `blob:` URLs). Return `null` to leave the image out, with a warning.
 */
export type ImageResolver = (
  url: string,
  context: { signal: AbortSignal | undefined },
) => Promise<ResolvedImage | null> | ResolvedImage | null;

export interface SvgExportLimits {
  /** Topics (`me-tpc`) in the map. Default 10,000. */
  maxNodes: number;
  /** Characters of text in the whole map. Default 1,000,000. */
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
   * `"theme"` (default): the map container's background colour. `"transparent"`: none. Or a
   * colour: `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()` or `rgba()`.
   */
  background?: string;
  /** Accessible name of the SVG (`<title>`). Default: the root topic's text. */
  title?: string;
  /** Accessible description (`<desc>`). */
  description?: string;
  /** Prefix of the ids the SVG defines, unique per document. Default `"mindmap-svg"`. */
  idPrefix?: string;
  /** Wait for web fonts before measuring text. Default true. */
  waitForFonts?: boolean;
  /** How long to wait for fonts, in ms. Default 3,000. */
  fontTimeout?: number;
  /**
   * Write each run of text's measured width as `textLength` (default true), so a viewer whose
   * font metrics differ (another font, WebKit's rounded advances at 1×) adjusts the spacing to
   * fit the same width instead of overflowing the node. Renderers without `textLength` support,
   * such as svg2pdf.js, ignore it.
   */
  textLength?: boolean;
  /** `"preserve"` (default): node links become SVG links (http, https and mailto only). `"text"`: only their text. */
  links?: "preserve" | "text";
  /** Embed images (default true). When false, images are left out with a warning. */
  embedImages?: boolean;
  /** Resolves images that are not `data:` or `blob:` URLs. Without it they are left out. */
  resolveImage?: ImageResolver;
  /** Throw instead of warning when something cannot be exported faithfully. Default false. */
  strict?: boolean;
  /** Cancels the export. */
  signal?: AbortSignal;
  /** Resource limits; the export fails with `LIMIT_EXCEEDED` beyond them. */
  limits?: { [K in keyof SvgExportLimits]?: number | undefined };
}

export type SvgExportWarningCode =
  | "FONT_UNAVAILABLE"
  | "IMAGE_NOT_EMBEDDED"
  | "UNSUPPORTED_HTML"
  | "UNSUPPORTED_STYLE"
  | "UNSAFE_LINK"
  | "INVALID_GEOMETRY";

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
