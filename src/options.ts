import { parseColor, type Color } from "./css.js";
import { SvgExportError } from "./errors.js";
import type { ImageResolver, SvgExportLimits, SvgExportOptions } from "./types.js";

export const DEFAULT_LIMITS: Readonly<SvgExportLimits> = Object.freeze({
  maxNodes: 10_000,
  maxTextLength: 1_000_000,
  maxImages: 200,
  maxImageBytes: 5 * 1024 * 1024,
  maxOutputLength: 50_000_000,
});

export interface ResolvedOptions {
  padding: number;
  /** `"theme"`, or a colour (`null` = transparent). */
  background: "theme" | Color | null;
  title: string | undefined;
  description: string;
  idPrefix: string;
  waitForFonts: boolean;
  fontTimeout: number;
  links: "preserve" | "text";
  textLength: boolean;
  embedImages: boolean;
  resolveImage: ImageResolver | undefined;
  strict: boolean;
  signal: AbortSignal | undefined;
  limits: SvgExportLimits;
}

function invalid(message: string): never {
  throw new SvgExportError("INVALID_OPTIONS", message);
}

function nonNegative(name: string, value: unknown, fallback: number, integer = false): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || (integer && !Number.isInteger(value))) {
    invalid(`${name} must be a ${integer ? "non-negative integer" : "non-negative number"}`);
  }
  return value;
}

function text(name: string, value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") invalid(`${name} must be a string`);
  return value;
}

/** Validates options and fills in the defaults. Throws `INVALID_OPTIONS`. */
export function resolveOptions(options: SvgExportOptions = {}): ResolvedOptions {
  if (typeof options !== "object" || options === null) invalid("options must be an object");

  let background: ResolvedOptions["background"] = "theme";
  if (options.background !== undefined) {
    const value = text("background", options.background)?.trim().toLowerCase() as string;
    if (value === "theme") background = "theme";
    else if (value === "transparent") background = null;
    else {
      const color = parseColor(value);
      if (!color) invalid("background must be theme, transparent, #hex, rgb() or rgba()");
      background = color;
    }
  }

  const idPrefix = text("idPrefix", options.idPrefix) ?? "mindmap-svg";
  if (!/^[A-Za-z][\w-]{0,63}$/.test(idPrefix)) invalid("idPrefix must be a letter followed by letters, digits, - or _");

  if (options.links !== undefined && options.links !== "preserve" && options.links !== "text") {
    invalid('links must be "preserve" or "text"');
  }
  if (options.resolveImage !== undefined && typeof options.resolveImage !== "function") {
    invalid("resolveImage must be a function");
  }
  if (options.signal !== undefined && !(options.signal instanceof AbortSignal))
    invalid("signal must be an AbortSignal");

  const limits = { ...DEFAULT_LIMITS };
  if (options.limits !== undefined) {
    if (typeof options.limits !== "object" || options.limits === null) invalid("limits must be an object");
    for (const [key, value] of Object.entries(options.limits)) {
      if (!(key in DEFAULT_LIMITS)) invalid(`Unknown limit: ${key}`);
      if (value !== undefined) limits[key as keyof SvgExportLimits] = nonNegative(`limits.${key}`, value, 0, true);
    }
  }

  return {
    padding: nonNegative("padding", options.padding, 24),
    background,
    title: text("title", options.title),
    description: text("description", options.description) ?? "",
    idPrefix,
    waitForFonts: options.waitForFonts !== false,
    fontTimeout: nonNegative("fontTimeout", options.fontTimeout, 3000),
    links: options.links ?? "preserve",
    textLength: options.textLength !== false,
    embedImages: options.embedImages !== false,
    resolveImage: options.resolveImage,
    strict: options.strict === true,
    signal: options.signal,
    limits,
  };
}
