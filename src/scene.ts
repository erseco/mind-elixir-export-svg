import type { Color, Radii } from "./css.js";
import type { Box, Matrix } from "./geometry.js";

/**
 * What the exporter draws, independent of how it was measured. The browser extractor builds a
 * scene from the live map; `renderDocument` turns a scene into SVG without touching the DOM.
 * All coordinates are CSS pixels in the map's layout space (the editor's zoom and pan removed).
 */

/** Stacking layers, painted in this order (Mind Elixir's z-index order). */
export const LAYERS = ["branches", "nodes", "summaries", "arrows", "labels"] as const;
export type Layer = (typeof LAYERS)[number];

export interface Stroke {
  color: Color;
  width: number;
  dash?: number[] | undefined;
  linecap?: "butt" | "round" | "square" | undefined;
  linejoin?: "miter" | "round" | "bevel" | undefined;
}

/** A CSS box: background and border, with per-corner radii. */
export interface BoxShape {
  kind: "box";
  layer: Layer;
  box: Box;
  radii: Radii;
  fill?: Color | undefined;
  /** Drawn inside the box, as a CSS border is. */
  border?: Stroke | undefined;
  opacity: number;
}

/** A path copied from the map's own SVG (branches, arrows, summaries). */
export interface PathShape {
  kind: "path";
  layer: Layer;
  d: string;
  transform: Matrix;
  stroke?: Stroke | undefined;
  fill?: Color | undefined;
  opacity: number;
  /** Bounds in layout space, stroke included. */
  bounds: Box;
}

export interface TextRun {
  text: string;
  /** Start of the run on the baseline: its left edge, or its right edge for `rtl`. */
  x: number;
  y: number;
  /** Width the browser drew the run in. */
  width: number;
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  fontStyle: "normal" | "italic" | "oblique";
  fill: Color;
  decoration: string[];
  letterSpacing: number;
  direction: "ltr" | "rtl";
}

/** The lines of one piece of text, as the browser laid them out. */
export interface TextShape {
  kind: "text";
  layer: Layer;
  runs: TextRun[];
  bounds: Box;
  opacity: number;
  /** A link target already checked by `safeLink`. */
  href?: string | undefined;
}

export interface ImageShape {
  kind: "image";
  layer: Layer;
  box: Box;
  /** A raster `data:` URL produced by `rasterDataUrl`. */
  href: string;
  /** `object-fit`: contain → meet, cover → slice, fill → none. */
  fit: "meet" | "slice" | "none";
  radii?: Radii | undefined;
  opacity: number;
}

export type Shape = BoxShape | PathShape | TextShape | ImageShape;

/** Bounds of a shape in layout space. */
export function shapeBounds(shape: Shape): Box {
  return shape.kind === "path" || shape.kind === "text" ? shape.bounds : shape.box;
}
