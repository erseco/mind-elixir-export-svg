/**
 * How far a topic may sit from Mind Elixir before a layout comparison fails.
 * The numbers are the measured bounds in docs/COMPATIBILITY.md (2026-10-18, Mind Elixir 5.15.1).
 * Firefox's vertical drift and the fallback-font estimates are known limitations: they are
 * bounded here, and a compatibility report lists them instead of calling them regressions.
 */

export const ARIAL_FIXTURES = ["single", "three", "topDown", "wide", "deep", "large"] as const;
export const OTHER_FIXTURES = ["rich", "features", "unicode", "hostile"] as const;
/** Every fixture the browser layout test and `npm run test:compat` measure. */
export const MEASURED_FIXTURES = [...ARIAL_FIXTURES, ...OTHER_FIXTURES];

export interface Deviation {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The same bounds as `tests/browser/layout.spec.ts`. */
export function withinTolerance(name: string, browser: string, d: Deviation): boolean {
  const arial = (ARIAL_FIXTURES as readonly string[]).includes(name);
  if (browser === "firefox") {
    // Horizontal layout matches. Firefox's taller lines move rows down; that y is not a failure.
    // Topics in these fixtures have at most two lines, so the height bound is 1.5 px per line.
    return Math.max(d.x, d.width) <= (arial ? 0.3 : 30) && d.height <= (arial ? 3.5 : 8);
  }
  if (arial) return Math.max(d.x, d.y, d.width, d.height) <= (name === "deep" ? 0.3 : 0.1);
  // Emoji, CJK and other scripts: estimated advances. Linux Noto made a CJK caption 27.7 px wider.
  return Math.max(d.x, d.width) <= 30 && Math.max(d.y, d.height) <= 15;
}

export const KNOWN_LIMITATIONS = [
  "Firefox sets line-height: normal for 16 px Arial at 19.5 px; Chromium and WebKit at 18. Vertical drift is recorded and is not a failure. Widths still have to match.",
  "Emoji, CJK, Hebrew and Arabic use estimated widths of the browser's fallback fonts. The bounds are 30 px horizontally and 15 px vertically on Chromium and WebKit.",
  "Captions are measured left to right. Mind Elixir lets the browser reorder Arabic and Hebrew; this renderer does not shape those scripts.",
  "svg2pdf.js ignores textLength. Latin-1 is covered by jsPDF's standard fonts; other scripts need a font registered with addFont.",
  "Compact gaps follow data.compact (and an instance's compact when the data omits it). A stylesheet that overrides a live editor is applied only by the plugin, which reads the container's variables.",
  "An intentionally transparent background stays transparent. The official raster exporter replaces one; this SVG does not.",
] as const;
