import { throwIfAborted } from "../errors.js";
import type { ResolvedOptions } from "../options.js";
import { decodeDataUrl, rasterDataUrl } from "../security.js";

/**
 * Turns an image source into a raster `data:` URL to embed, without network access unless the
 * caller's resolver does it. `data:` URLs are decoded and `blob:` URLs read locally; everything
 * else goes through `options.resolveImage`. The bytes are checked and re-encoded with the type
 * they really have, so a `data:` URL claiming to be a PNG cannot smuggle SVG or HTML.
 */
export async function embedImage(
  src: string,
  options: Pick<ResolvedOptions, "resolveImage" | "signal" | "limits">,
): Promise<{ url: string } | { reason: string }> {
  const { signal, limits } = options;
  throwIfAborted(signal);
  let bytes: Uint8Array;
  if (/^data:/i.test(src)) {
    const decoded = decodeDataUrl(src);
    if (!decoded) return { reason: "the data: URL is not base64-encoded image data" };
    bytes = decoded.bytes;
  } else if (/^blob:/i.test(src)) {
    try {
      bytes = await blobBytes(await (await fetch(src, signal ? { signal } : {})).blob(), limits.maxImageBytes);
    } catch (error) {
      throwIfAborted(signal);
      return { reason: `the blob: URL could not be read (${(error as Error).message})` };
    }
  } else if (options.resolveImage) {
    let resolved: Blob | string | null;
    try {
      resolved = await options.resolveImage(src, { signal });
    } catch (error) {
      throwIfAborted(signal);
      return { reason: `resolveImage failed (${(error as Error).message})` };
    }
    throwIfAborted(signal);
    if (resolved === null || resolved === undefined) return { reason: "resolveImage returned nothing" };
    if (typeof resolved === "string") {
      const decoded = decodeDataUrl(resolved);
      if (!decoded) return { reason: "resolveImage must return a Blob or a base64 data: URL" };
      bytes = decoded.bytes;
    } else if (resolved instanceof Blob) {
      try {
        bytes = await blobBytes(resolved, limits.maxImageBytes);
      } catch (error) {
        return { reason: (error as Error).message };
      }
    } else return { reason: "resolveImage must return a Blob or a base64 data: URL" };
  } else {
    return { reason: "it is not a data: or blob: URL and no resolveImage option was given" };
  }
  return rasterDataUrl(bytes, limits.maxImageBytes);
}

async function blobBytes(blob: Blob, maxBytes: number): Promise<Uint8Array> {
  // Check the size before reading, so an oversized image is never loaded into memory
  if (blob.size > maxBytes) throw new Error(`the image is larger than ${maxBytes} bytes`);
  return new Uint8Array(await blob.arrayBuffer());
}
