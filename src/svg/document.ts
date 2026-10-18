import type { Color } from "../css.js";
import { SvgExportError } from "../errors.js";
import {
  inflate,
  isFiniteBox,
  roundedRectPath,
  transformAttribute,
  uniformRadii,
  union,
  type Box,
} from "../geometry.js";
import {
  LAYERS,
  shapeBounds,
  type BoxShape,
  type ImageShape,
  type PathShape,
  type Shape,
  type Stroke,
  type TextRun,
  type TextShape,
} from "../scene.js";
import { element, escapeXml, num, type Attributes } from "./xml.js";

export interface DocumentOptions {
  padding: number;
  /** `null` for a transparent background. */
  background: Color | null;
  title: string;
  description: string;
  idPrefix: string;
  maxOutputLength: number;
  /** Write each run's measured width as `textLength`, so viewers with other font metrics fit it. */
  textLength: boolean;
}

export interface SvgDocument {
  svg: string;
  width: number;
  height: number;
  viewBox: string;
}

const SVG_NS = "http://www.w3.org/2000/svg";

function paint(color: Color | undefined, prefix: "fill" | "stroke"): Attributes {
  if (!color || color.alpha === 0) return { [prefix]: "none" };
  return { [prefix]: color.hex, [`${prefix}-opacity`]: color.alpha < 1 ? color.alpha : undefined };
}

function strokeAttributes(stroke: Stroke | undefined): Attributes {
  if (!stroke || stroke.width <= 0 || stroke.color.alpha === 0) return { stroke: undefined };
  return {
    ...paint(stroke.color, "stroke"),
    "stroke-width": stroke.width,
    "stroke-dasharray": stroke.dash?.length ? stroke.dash.map(num).join(" ") : undefined,
    "stroke-linecap": stroke.linecap,
    "stroke-linejoin": stroke.linejoin,
  };
}

const opacity = (value: number) => (value < 1 ? Math.max(0, value) : undefined);

function boxElement(box: Box, radii: BoxShape["radii"], attrs: Attributes): string {
  if (uniformRadii(radii)) {
    const [r] = radii;
    return element("rect", {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      rx: r.x > 0 ? r.x : undefined,
      ry: r.y > 0 && r.y !== r.x ? r.y : undefined,
      ...attrs,
    });
  }
  return element("path", { d: roundedRectPath(box, radii), ...attrs });
}

function renderBox(shape: BoxShape): string {
  const { box, radii, border } = shape;
  const hasFill = !!shape.fill && shape.fill.alpha > 0;
  const hasBorder = !!border && border.width > 0 && border.color.alpha > 0;
  if (!hasFill && !hasBorder) return "";
  const parts: string[] = [];
  // A CSS border is inside the box: its stroke is centred half a width in
  const inset = (w: number): [Box, BoxShape["radii"]] => [
    { x: box.x + w / 2, y: box.y + w / 2, width: Math.max(0, box.width - w), height: Math.max(0, box.height - w) },
    radii.map((r) => ({ x: Math.max(0, r.x - w / 2), y: Math.max(0, r.y - w / 2) })) as BoxShape["radii"],
  ];
  if (hasBorder && border.color.alpha === 1 && (!hasFill || (shape.fill as Color).alpha === 1)) {
    // An opaque border covers the background under it, so one element draws both
    const [b, r] = inset(border.width);
    parts.push(boxElement(b, r, { ...paint(shape.fill, "fill"), ...strokeAttributes(border) }));
  } else {
    if (hasFill) parts.push(boxElement(box, radii, paint(shape.fill, "fill")));
    if (hasBorder) {
      const [b, r] = inset(border.width);
      parts.push(boxElement(b, r, { fill: "none", ...strokeAttributes(border) }));
    }
  }
  const o = opacity(shape.opacity);
  return o === undefined ? parts.join("") : element("g", { opacity: o }, parts.join(""));
}

function renderPath(shape: PathShape): string {
  return element("path", {
    d: shape.d,
    transform: transformAttribute(shape.transform),
    ...paint(shape.fill, "fill"),
    ...strokeAttributes(shape.stroke),
    opacity: opacity(shape.opacity),
  });
}

// Initial values of the text attributes `runAttributes` leaves out at their default
const INITIAL: Record<string, string> = {
  "font-weight": "400",
  "font-style": "normal",
  "fill-opacity": "1",
  "text-decoration": "none",
  "letter-spacing": "0",
};

function runAttributes(run: TextRun): Attributes {
  return {
    "font-family": run.fontFamily,
    "font-size": run.fontSize,
    "font-weight": run.fontWeight === "400" ? undefined : run.fontWeight,
    "font-style": run.fontStyle === "normal" ? undefined : run.fontStyle,
    ...paint(run.fill, "fill"),
    "text-decoration": run.decoration.length ? run.decoration.join(" ") : undefined,
    "letter-spacing": run.letterSpacing ? run.letterSpacing : undefined,
  };
}

function renderText(shape: TextShape, textLength: boolean): string {
  // The width each run was measured at, so that renderers with other metrics (another font,
  // WebKit's rounded advances at 1×) space it to the same width instead of overflowing
  const fit = (run: TextRun): Attributes =>
    textLength && run.width > 0 ? { textLength: run.width, lengthAdjust: "spacing" } : {};
  const out: string[] = [];
  // Left-to-right runs share one <text>; each right-to-left run is its own <text>, so that its
  // `direction` makes `start` its right edge, where it is positioned
  const ltr = shape.runs.filter((r) => r.direction === "ltr");
  const rtl = shape.runs.filter((r) => r.direction === "rtl");
  if (ltr.length) {
    const base = runAttributes(ltr[0] as TextRun);
    const tspans = ltr.map((run) => {
      const own = runAttributes(run);
      const diff: Attributes = {};
      // A run that differs from the first one overrides it, writing the initial value back
      for (const [k, v] of Object.entries(own)) if (base[k] !== v) diff[k] = v ?? INITIAL[k];
      return element("tspan", { x: run.x, y: run.y, ...fit(run), ...diff }, escapeXml(run.text));
    });
    out.push(element("text", { "xml:space": "preserve", ...base }, tspans.join("")));
  }
  for (const run of rtl) {
    out.push(
      element(
        "text",
        {
          "xml:space": "preserve",
          x: run.x,
          y: run.y,
          ...fit(run),
          direction: "rtl",
          "text-anchor": "start",
          ...runAttributes(run),
        },
        escapeXml(run.text),
      ),
    );
  }
  let svg = out.join("");
  const o = opacity(shape.opacity);
  if (o !== undefined) svg = element("g", { opacity: o }, svg);
  return shape.href ? element("a", { href: shape.href }, svg) : svg;
}

function renderImage(shape: ImageShape, clipId: () => string, defs: string[]): string {
  const { box } = shape;
  let clip: string | undefined;
  if (shape.radii && shape.radii.some((r) => r.x > 0 && r.y > 0)) {
    const id = clipId();
    defs.push(element("clipPath", { id }, element("path", { d: roundedRectPath(box, shape.radii) })));
    clip = `url(#${id})`;
  }
  return element("image", {
    href: shape.href,
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    preserveAspectRatio: shape.fit === "none" ? "none" : `xMidYMid ${shape.fit}`,
    "clip-path": clip,
    opacity: opacity(shape.opacity),
  });
}

/** Serializes a scene as a standalone SVG document. */
export function renderDocument(shapes: readonly Shape[], options: DocumentOptions): SvgDocument {
  const bounds = union(shapes.map(shapeBounds));
  if (!bounds || !isFiniteBox(bounds) || bounds.width === 0 || bounds.height === 0) {
    throw new SvgExportError("INVALID_GEOMETRY", "The map has no visible content to export");
  }
  const frame = inflate(bounds, options.padding);
  const viewBox = [frame.x, frame.y, frame.width, frame.height].map(num).join(" ");
  const width = Number(num(frame.width));
  const height = Number(num(frame.height));

  const defs: string[] = [];
  let clips = 0;
  const clipId = () => `${options.idPrefix}-clip-${++clips}`;
  const layers = LAYERS.map((layer) => {
    const content = shapes
      .filter((s) => s.layer === layer)
      .map((s) => {
        switch (s.kind) {
          case "box":
            return renderBox(s);
          case "path":
            return renderPath(s);
          case "text":
            return renderText(s, options.textLength);
          case "image":
            return renderImage(s, clipId, defs);
        }
      })
      .join("");
    return content ? element("g", { class: `mindmap-${layer}` }, content) : "";
  }).join("");

  const titleId = `${options.idPrefix}-title`;
  const descId = `${options.idPrefix}-desc`;
  const head =
    element("title", { id: titleId }, escapeXml(options.title)) +
    (options.description ? element("desc", { id: descId }, escapeXml(options.description)) : "");
  const background =
    options.background && options.background.alpha > 0
      ? element("rect", {
          x: frame.x,
          y: frame.y,
          width: frame.width,
          height: frame.height,
          ...paint(options.background, "fill"),
        })
      : "";
  const svg = element(
    "svg",
    {
      xmlns: SVG_NS,
      width,
      height,
      viewBox,
      role: "img",
      "aria-labelledby": titleId,
      "aria-describedby": options.description ? descId : undefined,
    },
    head + (defs.length ? element("defs", {}, defs.join("")) : "") + background + layers,
  );
  if (svg.length > options.maxOutputLength) {
    throw new SvgExportError("LIMIT_EXCEEDED", `The SVG would be longer than ${options.maxOutputLength} characters`);
  }
  return { svg, width, height, viewBox };
}
