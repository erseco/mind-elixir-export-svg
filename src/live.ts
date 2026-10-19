import { parseColor, parsePx } from "./css.js";
import { THEME_VARS } from "./theme.js";

/**
 * Reads the CSS variables Mind Elixir writes on a live map container. Browser-only: the layout
 * never calls this. Only `THEME_VARS` are read, and each value is a string the theme parser
 * still has to accept, so a page stylesheet cannot inject markup or a URL into the SVG.
 */
export function readLiveCssVars(container: unknown): Record<string, string> | undefined {
  if (typeof globalThis.getComputedStyle !== "function" || !isElement(container)) return undefined;
  let style: CSSStyleDeclaration;
  try {
    style = globalThis.getComputedStyle(container);
  } catch {
    return undefined;
  }
  if (typeof style?.getPropertyValue !== "function") return undefined;
  const cssVar: Record<string, string> = {};
  for (const name of THEME_VARS) {
    const value = style.getPropertyValue(name).trim();
    if (value) cssVar[name] = value;
  }
  return cssVar;
}

function isElement(value: unknown): value is Element {
  return typeof value === "object" && value !== null && (value as Element).nodeType === 1;
}

/** True when a live value is not the theme value, after colour and length normalisation. */
export function cssVarDiffers(declared: string | undefined, live: string): boolean {
  const a = (declared ?? "").trim().replace(/\s+/g, " ");
  const b = live.trim().replace(/\s+/g, " ");
  if (a === b) return false;
  const colorA = a ? parseColor(a) : null;
  const colorB = parseColor(b);
  if (colorA && colorB) return colorA.hex !== colorB.hex || Math.abs(colorA.alpha - colorB.alpha) > 1e-6;
  const pxA = parsePx(a);
  const pxB = parsePx(b);
  if (Number.isFinite(pxA) && Number.isFinite(pxB)) return pxA !== pxB;
  return true;
}
