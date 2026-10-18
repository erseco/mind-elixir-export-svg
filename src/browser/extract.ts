import { clampRadii, parseColor, parseCornerRadius, parsePx, type Color, type Radii } from "../css.js";
import { SvgExportError, throwIfAborted } from "../errors.js";
import { geometryPath, inflate, multiply, transformBox, type Box, type Matrix } from "../geometry.js";
import type { ResolvedOptions } from "../options.js";
import type { BoxShape, Layer, PathShape, Shape, Stroke } from "../scene.js";
import { safeLink, safePathData } from "../security.js";
import { layoutLines, type Segment } from "../text/lines.js";
import type { MindElixirLike, SvgExportWarningCode } from "../types.js";
import { createFrame, type Frame } from "./frame.js";
import { embedImage } from "./images.js";
import { StyleCache, measureText } from "./text.js";

export type Warn = (code: SvgExportWarningCode, message: string, nodeId?: string) => void;

export interface Extracted {
  shapes: Shape[];
  fonts: Set<string>;
  families: Set<string>;
  rootText: string;
}

/** Editor-only elements: editing box, drag previews, selection area, arrow handles. */
const EDITOR_UI = "#input-box, .insert-preview, .selection-area, .circle, .linkcontroller, me-epd.minus";
/** The map's own SVG layers and where they are painted. */
const SVG_LAYERS: Record<string, Layer> = {
  lines: "branches",
  subLines: "branches",
  summary: "summaries",
  topiclinks: "arrows",
};
/** Content an SVG of native shapes and text cannot represent. */
const UNSUPPORTED = new Set([
  "iframe",
  "video",
  "audio",
  "canvas",
  "object",
  "embed",
  "input",
  "textarea",
  "select",
  "math",
  "svg",
]);
const GEOMETRY = "path, line, polyline, polygon, rect, circle, ellipse";

// Mind Elixir's "expand" icon (src/icons/add-circle.svg, MIT, (c) 2019 DjZhou), drawn on
// collapsed nodes as a CSS background image. Inlined as paths in its 1024-unit square.
const EXPANDER_CIRCLE =
  "M512 74.67C270.93 74.67 74.67 270.93 74.67 512S270.93 949.33 512 949.33 949.33 753.07 949.33 512 753.07 74.67 512 74.67z";
const EXPANDER_PLUS =
  "M682.67 480h-138.67V341.33c0-17.07-14.93-32-32-32s-32 14.93-32 32v138.67H341.33c-17.07 0-32 14.93-32 32s14.93 32 32 32h138.67V682.67c0 17.07 14.93 32 32 32s32-14.93 32-32v-138.67H682.67c17.07 0 32-14.93 32-32s-14.93-32-32-32z";
const BLACK: Color = { hex: "#000000", alpha: 1 };
const WHITE: Color = { hex: "#ffffff", alpha: 1 };

function nodeIdOf(el: Element): string | undefined {
  const id = el.closest("me-tpc")?.getAttribute("data-nodeid");
  return id?.startsWith("me") ? id.slice(2) : (id ?? undefined);
}

function radiiOf(cs: CSSStyleDeclaration, box: Box): Radii {
  const corner = (v: string) => parseCornerRadius(v, box.width, box.height);
  return clampRadii(
    [
      corner(cs.borderTopLeftRadius),
      corner(cs.borderTopRightRadius),
      corner(cs.borderBottomRightRadius),
      corner(cs.borderBottomLeftRadius),
    ],
    box.width,
    box.height,
  );
}

function dashOf(value: string): number[] | undefined {
  if (!value || value === "none") return undefined;
  const parts = value.split(/[\s,]+/).filter(Boolean);
  if (!parts.every((p) => /^\d*\.?\d+(px)?$/.test(p))) return undefined;
  const dash = parts.map((p) => parseFloat(p));
  return dash.some((v) => v > 0) ? dash : undefined;
}

/** The border of a box, when all four sides are the same. */
function borderOf(cs: CSSStyleDeclaration, warn: () => void): Stroke | undefined {
  const sides = (["Top", "Right", "Bottom", "Left"] as const).map((side) => ({
    width: parsePx(cs.getPropertyValue(`border-${side.toLowerCase()}-width`)),
    style: cs.getPropertyValue(`border-${side.toLowerCase()}-style`),
    color: cs.getPropertyValue(`border-${side.toLowerCase()}-color`),
  }));
  const visible = sides.filter((s) => s.width > 0 && s.style !== "none" && s.style !== "hidden");
  if (!visible.length) return undefined;
  const [first] = visible as [(typeof visible)[number]];
  if (
    visible.length !== 4 ||
    visible.some((s) => s.width !== first.width || s.style !== first.style || s.color !== first.color)
  ) {
    warn();
  }
  const color = parseColor(first.color);
  if (!color || color.alpha === 0) return undefined;
  const w = first.width;
  const dash = first.style === "dashed" ? [w * 3, w * 3] : first.style === "dotted" ? [w, w] : undefined;
  return { color, width: w, dash, linecap: first.style === "dotted" ? "round" : undefined };
}

function strokeOf(cs: CSSStyleDeclaration): Stroke | undefined {
  const color = parseColor(cs.stroke);
  const width = parsePx(cs.strokeWidth) || parseFloat(cs.strokeWidth);
  if (!color || color.alpha === 0 || !(width > 0)) return undefined;
  const opacity = parseFloat(cs.strokeOpacity);
  const linecap = cs.strokeLinecap as Stroke["linecap"];
  const linejoin = cs.strokeLinejoin as Stroke["linejoin"];
  return {
    color: { ...color, alpha: color.alpha * (Number.isFinite(opacity) ? opacity : 1) },
    width,
    dash: dashOf(cs.strokeDasharray),
    linecap: linecap === "butt" ? undefined : linecap,
    linejoin: linejoin === "miter" ? undefined : linejoin,
  };
}

function fillOf(cs: CSSStyleDeclaration): Color | undefined {
  const color = parseColor(cs.fill);
  if (!color || color.alpha === 0) return undefined;
  const opacity = parseFloat(cs.fillOpacity);
  return { ...color, alpha: color.alpha * (Number.isFinite(opacity) ? opacity : 1) };
}

function blockOf(el: Element, stop: Element): Element {
  for (let e: Element | null = el; e && e !== stop; e = e.parentElement) {
    const display = getComputedStyle(e).display;
    if (display !== "inline" && display !== "contents") return e;
  }
  return el;
}

interface Item {
  /** An element, or a text node visited in document order between its siblings. */
  node: Element | Text;
  layer: Layer;
  opacity: number;
  href: string | undefined;
}

/** Reads the map's geometry and styles into a scene. Never modifies the document. */
export async function extractScene(mind: MindElixirLike, options: ResolvedOptions, warn: Warn): Promise<Extracted> {
  const { nodes } = mind;
  const { signal, limits } = options;
  const frame = createFrame(nodes);
  const styles = new StyleCache(nodes);
  const shapes: (Shape | null)[] = [];
  const texts = new Map<
    string,
    { index: number; layer: Layer; opacity: number; href: string | undefined; segments: Segment[] }
  >();
  const blockKeys = new Map<Element, number>();
  const images: { index: number; el: HTMLImageElement; layer: Layer; opacity: number }[] = [];
  let textLength = 0;

  const topics = nodes.querySelectorAll("me-tpc").length;
  if (topics > limits.maxNodes) {
    throw new SvgExportError("LIMIT_EXCEEDED", `The map has ${topics} nodes; the limit is ${limits.maxNodes}`);
  }

  const stack: Item[] = [];
  const push = (children: NodeListOf<ChildNode>, parent: Omit<Item, "node">) => {
    for (let i = children.length - 1; i >= 0; i--) {
      const child = children[i] as ChildNode;
      if (child.nodeType === Node.ELEMENT_NODE || (child.nodeType === Node.TEXT_NODE && (child as Text).data)) {
        stack.push({ node: child as Element | Text, ...parent });
      }
    }
  };
  for (let i = nodes.children.length - 1; i >= 0; i--) {
    const el = nodes.children[i] as Element;
    const layer: Layer = el.classList.contains("label-container") ? "labels" : "nodes";
    stack.push({ node: el, layer, opacity: 1, href: undefined });
  }

  const addText = (node: Text, item: Item) => {
    const el = node.parentElement as Element;
    textLength += node.data.length;
    if (textLength > limits.maxTextLength) {
      throw new SvgExportError("LIMIT_EXCEEDED", `The map has more than ${limits.maxTextLength} characters of text`);
    }
    const style = styles.get(el);
    if (!style) {
      warn("UNSUPPORTED_STYLE", "Text in a colour that cannot be converted was left out", nodeIdOf(el));
      return;
    }
    const block = blockOf(el, nodes);
    let blockKey = blockKeys.get(block);
    if (blockKey === undefined) blockKeys.set(block, (blockKey = blockKeys.size));
    // One text shape per block and link, so a link's text can be wrapped in <a>
    const key = `${blockKey}\u0000${item.href ?? ""}`;
    let group = texts.get(key);
    if (!group) {
      group = { index: shapes.length, layer: item.layer, opacity: item.opacity, href: item.href, segments: [] };
      texts.set(key, group);
      shapes.push(null);
    }
    const direction = getComputedStyle(block).direction === "rtl" ? "rtl" : "ltr";
    group.segments.push(...measureText(node, style, direction, frame));
  };

  let visited = 0;
  while (stack.length) {
    const item = stack.pop() as Item;
    if (++visited % 500 === 0) throwIfAborted(signal);
    if (item.node.nodeType === Node.TEXT_NODE) {
      addText(item.node as Text, item);
      continue;
    }
    const el = item.node as Element;
    if (el.matches(EDITOR_UI)) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.visibility === "collapse") continue;
    const own = parseFloat(cs.opacity);
    const opacity = item.opacity * (Number.isFinite(own) ? own : 1);
    if (opacity <= 0) continue;
    const tag = el.localName;

    if (el instanceof SVGSVGElement) {
      const layer = Object.entries(SVG_LAYERS).find(([cls]) => el.classList.contains(cls))?.[1];
      if (layer) copySvg(el, layer, opacity, frame, shapes, warn);
      else warn("UNSUPPORTED_HTML", "Inline SVG inside a node is not exported", nodeIdOf(el));
      continue;
    }
    if (UNSUPPORTED.has(tag)) {
      warn("UNSUPPORTED_HTML", `<${tag}> content is not exported`, nodeIdOf(el));
      continue;
    }
    if ((el as { nodeObj?: { dangerouslySetInnerHTML?: unknown } }).nodeObj?.dangerouslySetInnerHTML) {
      warn("UNSUPPORTED_HTML", "Custom HTML is exported as its boxes, text and images only", nodeIdOf(el));
    }

    const rect = el.getBoundingClientRect();
    const box = frame.toLocal(rect);

    if (tag === "me-epd") {
      // Collapsed branch: Mind Elixir's expand icon, centred and contained in the element
      const size = Math.min(box.width, box.height);
      const s = size / 1024;
      const m: Matrix = [s, 0, 0, s, box.x + (box.width - size) / 2, box.y + (box.height - size) / 2];
      const bounds = { ...box };
      shapes.push(
        {
          kind: "path",
          layer: "nodes",
          d: EXPANDER_CIRCLE,
          transform: m,
          fill: WHITE,
          stroke: { color: BLACK, width: 54 },
          opacity,
          bounds,
        },
        { kind: "path", layer: "nodes", d: EXPANDER_PLUS, transform: m, fill: BLACK, opacity, bounds },
      );
      continue;
    }

    if (box.width > 0 && box.height > 0) {
      const fill = parseColor(cs.backgroundColor) ?? undefined;
      const border = borderOf(cs, () =>
        warn("UNSUPPORTED_STYLE", "Borders that differ per side use the top border", nodeIdOf(el)),
      );
      if (cs.backgroundImage && cs.backgroundImage !== "none") {
        warn("UNSUPPORTED_STYLE", "Background images and gradients are not exported", nodeIdOf(el));
      }
      if (cs.boxShadow && cs.boxShadow !== "none")
        warn("UNSUPPORTED_STYLE", "Box shadows are not exported", nodeIdOf(el));
      if ((fill && fill.alpha > 0) || border) {
        const shape: BoxShape = { kind: "box", layer: item.layer, box, radii: radiiOf(cs, box), fill, border, opacity };
        shapes.push(shape);
      }
    }

    if (el instanceof HTMLImageElement) {
      if (images.length >= limits.maxImages) {
        throw new SvgExportError("LIMIT_EXCEEDED", `The map has more than ${limits.maxImages} images`);
      }
      images.push({ index: shapes.length, el, layer: item.layer, opacity });
      shapes.push(null);
      continue;
    }

    let href = item.href;
    if (el instanceof HTMLAnchorElement && el.hasAttribute("href") && options.links === "preserve") {
      const link = safeLink(el.href);
      if (link) href = link;
      else warn("UNSAFE_LINK", "A link that is not http, https or mailto was exported as text only", nodeIdOf(el));
    }

    push(el.childNodes, { layer: item.layer, opacity, href });
  }

  for (const group of texts.values()) {
    const { runs, bounds } = layoutLines(group.segments);
    if (bounds && runs.length) {
      shapes[group.index] = {
        kind: "text",
        layer: group.layer,
        runs,
        bounds,
        opacity: group.opacity,
        href: group.href,
      };
    }
  }

  for (const image of images) {
    throwIfAborted(signal);
    const nodeId = nodeIdOf(image.el);
    if (!options.embedImages) {
      warn("IMAGE_NOT_EMBEDDED", "Images are not embedded (embedImages: false)", nodeId);
      continue;
    }
    // An image that failed to load shows as broken (Firefox still reports the previous image
    // as currentSrc). Only a resolver, for sources the browser cannot load, can supply it then
    const broken = image.el.complete && image.el.naturalWidth === 0;
    const src = broken ? image.el.src : image.el.currentSrc || image.el.src;
    if (broken && (/^(data|blob):/i.test(src) || !options.resolveImage)) {
      warn("IMAGE_NOT_EMBEDDED", "An image was left out: the editor could not load it", nodeId);
      continue;
    }
    const result = await embedImage(src, options);
    if ("reason" in result) {
      warn("IMAGE_NOT_EMBEDDED", `An image was left out: ${result.reason}`, nodeId);
      continue;
    }
    const cs = getComputedStyle(image.el);
    const outer = frame.toLocal(image.el.getBoundingClientRect());
    const inset = (side: string) =>
      (parsePx(cs.getPropertyValue(`border-${side}-width`)) || 0) +
      (parsePx(cs.getPropertyValue(`padding-${side}`)) || 0);
    const box = {
      x: outer.x + inset("left"),
      y: outer.y + inset("top"),
      width: Math.max(0, outer.width - inset("left") - inset("right")),
      height: Math.max(0, outer.height - inset("top") - inset("bottom")),
    };
    const fit = cs.objectFit === "cover" ? "slice" : cs.objectFit === "fill" ? "none" : "meet";
    if (cs.objectFit === "none" || cs.objectFit === "scale-down") {
      warn("UNSUPPORTED_STYLE", `object-fit: ${cs.objectFit} is exported as contain`, nodeId);
    }
    shapes[image.index] = {
      kind: "image",
      layer: image.layer,
      box,
      href: result.url,
      fit,
      radii: radiiOf(cs, box),
      opacity: image.opacity,
    };
  }

  const root = nodes.querySelector("me-root me-tpc");
  return {
    shapes: shapes.filter((s): s is Shape => s !== null),
    fonts: styles.fonts,
    families: styles.families,
    rootText: (root?.textContent ?? "").replace(/\s+/g, " ").trim(),
  };
}

/** Copies the visible geometry of one of the map's SVG layers into layout space. */
function copySvg(
  svg: SVGSVGElement,
  layer: Layer,
  opacity: number,
  frame: Frame,
  shapes: (Shape | null)[],
  warn: Warn,
): void {
  const origin = frame.toLocal(svg.getBoundingClientRect());
  const toLayout: Matrix = [1, 0, 0, 1, origin.x, origin.y];
  for (const el of svg.querySelectorAll<SVGGraphicsElement>(GEOMETRY)) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    let own = parseFloat(cs.opacity);
    for (let p: Element | null = el.parentElement; p && p !== svg; p = p.parentElement) {
      const v = parseFloat(getComputedStyle(p).opacity);
      own *= Number.isFinite(v) ? v : 1;
    }
    const effective = opacity * (Number.isFinite(own) ? own : 1);
    const stroke = strokeOf(cs);
    const fill = fillOf(cs);
    // Hit zones are transparent strokes: nothing to draw
    if (effective <= 0 || (!stroke && !fill)) continue;
    const tag = el.localName;
    const raw = tag === "path" ? (el.getAttribute("d") ?? "") : geometryPath(tag, (n) => el.getAttribute(n));
    if (raw === null || raw.trim() === "") continue;
    const d = safePathData(raw);
    if (!d) {
      warn("INVALID_GEOMETRY", `A <${tag}> with invalid geometry was left out`);
      continue;
    }
    const ctm = el.getCTM();
    const local: Matrix = ctm ? [ctm.a, ctm.b, ctm.c, ctm.d, ctm.e, ctm.f] : [1, 0, 0, 1, 0, 0];
    const transform = multiply(toLayout, local);
    let bbox: Box;
    try {
      const b = el.getBBox();
      bbox = { x: b.x, y: b.y, width: b.width, height: b.height };
    } catch {
      continue;
    }
    // Miter joins (arrowheads) reach up to twice the stroke width out at the default miter limit
    const reach = stroke ? (stroke.linejoin ? stroke.width / 2 : stroke.width * 2) : 0;
    const bounds = inflate(transformBox(bbox, transform), reach * Math.hypot(transform[0], transform[1]));
    const shape: PathShape = { kind: "path", layer, d, transform, stroke, fill, opacity: effective, bounds };
    shapes.push(shape);
  }
}
