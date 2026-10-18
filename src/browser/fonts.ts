import { SvgExportError, throwIfAborted } from "../errors.js";

/**
 * Waits until the document's fonts have loaded, for at most `timeout` ms. Resolves `true` when
 * they have, `false` when time ran out (text would then be measured with fallback fonts).
 */
export async function waitForFonts(timeout: number, signal: AbortSignal | undefined): Promise<boolean> {
  throwIfAborted(signal);
  const fonts = document.fonts as FontFaceSet | undefined;
  if (!fonts || fonts.status === "loaded") return true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  try {
    return await Promise.race([
      fonts.ready.then(() => true),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), timeout);
      }),
      new Promise<boolean>((_, reject) => {
        onAbort = () => reject(new SvgExportError("ABORTED", "The export was cancelled"));
        signal?.addEventListener("abort", onAbort, { once: true });
      }),
    ]);
  } finally {
    clearTimeout(timer);
    if (onAbort) signal?.removeEventListener("abort", onAbort);
  }
}

const familyKey = (family: string) =>
  family
    .trim()
    .replace(/^["']|["']$/g, "")
    .toLowerCase();

/**
 * Fonts the map uses that the document knows of but could not or did not load: shorthands
 * `document.fonts.check()` rejects, and web fonts whose loading failed (WebKit's `check()`
 * accepts those, so their `FontFace` status is read too).
 */
export function unavailableFonts(shorthands: Iterable<string>, families: Iterable<string>): string[] {
  const fonts = document.fonts as FontFaceSet | undefined;
  if (!fonts) return [];
  const missing: string[] = [];
  for (const font of shorthands) {
    try {
      if (!fonts.check(font)) missing.push(font);
    } catch {
      // An unparsable shorthand is not a font the document can load
    }
  }
  const used = new Set([...families].map(familyKey));
  const failed = new Set<string>();
  fonts.forEach((face) => {
    if (face.status === "error" && used.has(familyKey(face.family)))
      failed.add(face.family.replace(/^["']|["']$/g, ""));
  });
  for (const family of failed) if (!missing.some((m) => m.includes(family))) missing.push(family);
  return missing;
}
