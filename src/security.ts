/**
 * Allow-lists for everything that leaves the editor as a reference or as markup-like data:
 * link targets, path data and embedded images. Anything not matched is dropped by the caller.
 */

const LINK_SCHEMES = new Set(["http:", "https:", "mailto:"]);

/** The link target to write, or `null` when the scheme is not http, https or mailto. */
export function safeLink(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href.trim());
  } catch {
    return null;
  }
  return LINK_SCHEMES.has(url.protocol) ? url.href : null;
}

// Commands, numbers (with exponents), separators. No letters other than path commands.
const PATH_DATA = /^[MmLlHhVvCcSsQqTtAaZz\d\s,.eE+\-]*$/;

/** Path data that only contains path commands and numbers, or `null`. */
export function safePathData(d: string, maxLength = 1_000_000): string | null {
  const trimmed = d.trim();
  if (!trimmed || trimmed.length > maxLength || !PATH_DATA.test(trimmed)) return null;
  // `e`/`E` are only valid inside a number, never as a command
  if (/(^|[^\d.])[eE]/.test(trimmed)) return null;
  return trimmed.replace(/\s+/g, " ");
}

/** Raster formats an SVG viewer can be expected to decode. SVG images are never embedded. */
export const RASTER_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"] as const;
export type RasterType = (typeof RASTER_TYPES)[number];

/** The raster type of an image from its first bytes, or `null` when it is not a known one. */
export function sniffRaster(bytes: Uint8Array): RasterType | null {
  const at = (i: number, ...values: number[]) => values.every((v, j) => bytes[i + j] === v);
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return "image/gif";
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  if (at(4, 0x66, 0x74, 0x79, 0x70) && (at(8, 0x61, 0x76, 0x69, 0x66) || at(8, 0x61, 0x76, 0x69, 0x73)))
    return "image/avif";
  return null;
}

/** Decodes a base64 `data:` URL, or returns `null` when it is not one. */
export function decodeDataUrl(url: string): { type: string; bytes: Uint8Array } | null {
  const m = /^data:([\w.+-]+\/[\w.+-]+)?((?:;[\w-]+=[^;,]*)*);base64,([A-Za-z0-9+/\s]*={0,2})$/i.exec(url.trim());
  if (!m) return null;
  let binary: string;
  try {
    binary = atob((m[3] as string).replace(/\s+/g, ""));
  } catch {
    return null;
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { type: (m[1] ?? "").toLowerCase(), bytes };
}

/** Encodes bytes as a base64 `data:` URL. */
export function encodeDataUrl(type: RasterType, bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return `data:${type};base64,${btoa(binary)}`;
}

/**
 * The `data:` URL to embed for some image bytes: re-encoded from the bytes themselves, with
 * the type they actually have. Returns a reason instead when they cannot be embedded.
 */
export function rasterDataUrl(bytes: Uint8Array, maxBytes: number): { url: string } | { reason: string } {
  if (bytes.length > maxBytes) return { reason: `the image is larger than ${maxBytes} bytes` };
  const type = sniffRaster(bytes);
  if (!type) return { reason: "the image is not PNG, JPEG, GIF, WebP or AVIF" };
  return { url: encodeDataUrl(type, bytes) };
}
