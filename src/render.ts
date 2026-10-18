import { arrowGeometry, defaultDeltas, mainBranch, subBranch, summaryGeometry, type Side } from "./connectors.js";
import { parseColor, type Color, type Radii } from "./css.js";
import { readMap, type MapData } from "./data.js";
import { SvgExportError, throwIfAborted } from "./errors.js";
import { pathBounds as bounds, type Box, type Matrix } from "./geometry.js";
import { embedImage } from "./images.js";
import { layoutMap, type Layout, type PlacedNode, type PlacedText } from "./layout.js";
import { resolveOptions, type ResolvedOptions } from "./options.js";
import type { Layer, Shape, TextRun } from "./scene.js";
import { safeLink } from "./security.js";
import { renderDocument } from "./svg/document.js";
import { num } from "./svg/xml.js";
import { resolveTheme, type ResolvedTheme } from "./theme.js";
import type { MindElixirInput, SvgExportOptions, SvgExportResult, SvgExportWarning } from "./types.js";

type Warn = (code: SvgExportWarning["code"], message: string, nodeId: string) => void;

// Mind Elixir's "expand" icon (src/icons/add-circle.svg, MIT, (c) 2019 DjZhou), drawn on folded
// nodes, as paths in its 1024-unit square
const EXPANDER_CIRCLE =
  "M512 74.67C270.93 74.67 74.67 270.93 74.67 512S270.93 949.33 512 949.33 949.33 753.07 949.33 512 753.07 74.67 512 74.67z";
const EXPANDER_PLUS =
  "M682.67 480h-138.67V341.33c0-17.07-14.93-32-32-32s-32 14.93-32 32v138.67H341.33c-17.07 0-32 14.93-32 32s14.93 32 32 32h138.67V682.67c0 17.07 14.93 32 32 32s32-14.93 32-32v-138.67H682.67c17.07 0 32-14.93 32-32s-14.93-32-32-32z";
const BLACK: Color = { hex: "#000000", alpha: 1 };
const WHITE: Color = { hex: "#ffffff", alpha: 1 };
const ARROW = { hex: "#e37d74", alpha: 1 }; // rgb(227, 125, 116)
const ARROW_LABEL = { hex: "#eb5f52", alpha: 1 }; // rgb(235, 95, 82)

/** Writes the numbers of generated path data with two decimals. */
const path = (d: string) => d.replace(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi, (n) => num(parseFloat(n)));
const radii = (r: number): Radii => [
  { x: r, y: r },
  { x: r, y: r },
  { x: r, y: r },
  { x: r, y: r },
];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function run(t: PlacedText, at: Box, options: ResolvedOptions, fallback: Color): TextRun {
  return {
    text: t.text,
    x: at.x + t.x,
    y: at.y + t.y,
    width: t.width,
    fontFamily: options.fontFamily,
    fontSize: t.font.size,
    fontWeight: String(t.font.weight),
    fontStyle: t.font.style,
    fill: t.color ?? fallback,
    decoration: [],
    letterSpacing: 0,
    direction: "ltr",
  };
}

function textShape(layer: Layer, runs: TextRun[], href?: string): Shape {
  const xs = runs.map((r) => r.x);
  const top = Math.min(...runs.map((r) => r.y - r.fontSize));
  const bottom = Math.max(...runs.map((r) => r.y + r.fontSize * 0.25));
  const right = Math.max(...runs.map((r) => r.x + r.width));
  return {
    kind: "text",
    layer,
    runs,
    bounds: { x: Math.min(...xs), y: top, width: right - Math.min(...xs), height: bottom - top },
    opacity: 1,
    href,
  };
}

/** A label of an arrow or summary: one line, 16px, line-height 1.2, padding --topic-padding. */
function label(
  text: string,
  x: number,
  y: number,
  anchor: "start" | "middle" | "end",
  color: Color,
  background: Color | null,
  theme: ResolvedTheme,
  options: ResolvedOptions,
): Shape[] {
  const content = text.replace(/\s+/g, " ").trim();
  if (!content) return [];
  const font = { size: 16, weight: 400, style: "normal" as const };
  const width = options.measure.width(content, font);
  const pad = theme.topicPadding;
  const w = width + 2 * pad;
  const h = 1.2 * 16 + 2 * pad;
  const left = anchor === "middle" ? x - w / 2 : anchor === "end" ? x - w : x;
  const top = y - h / 2;
  const { ascent, descent } = options.measure.vertical;
  const baseline = top + pad + (1.2 * 16 - (ascent + descent) * 16) / 2 + ascent * 16;
  const shapes: Shape[] = [];
  if (background && background.alpha > 0) {
    shapes.push({
      kind: "box",
      layer: "labels",
      box: { x: left, y: top, width: w, height: h },
      radii: radii(3),
      fill: background,
      opacity: 1,
    });
  }
  shapes.push(
    textShape("labels", [
      run(
        { text: content, x: left + pad, y: baseline, width, font, color },
        { x: 0, y: 0, width: 0, height: 0 },
        options,
        color,
      ),
    ]),
  );
  return shapes;
}

/** Turns a laid-out map into shapes. */
async function draw(
  map: MapData,
  layout: Layout,
  theme: ResolvedTheme,
  options: ResolvedOptions,
  warn: Warn,
): Promise<Shape[]> {
  const shapes: (Shape | Promise<Shape | null>)[] = [];
  const stroke = (color: string, width: number, fallback: Color | null) => ({
    color: parseColor(color) ?? fallback ?? BLACK,
    width,
  });

  // Branches: from the root to main nodes (3px), then within each main branch (2px)
  for (const main of layout.mains) {
    const d = path(mainBranch(layout.root.topic, main.topic, main.side, layout.height));
    shapes.push({
      kind: "path",
      layer: "branches",
      d,
      transform: IDENTITY,
      stroke: stroke(main.branchColor, 3, theme.color),
      opacity: 1,
      bounds: bounds(d, 2),
    });
  }
  for (const p of layout.nodes) {
    if (p.kind === "root") continue;
    for (const c of p.children) {
      const d = path(subBranch(p.parent, c.parent, p.side, p.kind === "main", theme.nodeGapX));
      shapes.push({
        kind: "path",
        layer: "branches",
        d,
        transform: IDENTITY,
        stroke: stroke(c.branchColor, 2, theme.color),
        opacity: 1,
        bounds: bounds(d, 2),
      });
    }
  }

  for (const p of layout.nodes) {
    const c = p.content;
    const id = p.node.id;
    if (p.node.html)
      warn(
        "UNSUPPORTED_HTML",
        "Custom HTML (dangerouslySetInnerHTML) is not laid out; the node is drawn without it",
        id,
      );
    for (const [key, value] of [
      ["color", p.node.style.color],
      ["background", p.node.style.background],
    ] as const) {
      if (value && !parseColor(value))
        warn("UNSUPPORTED_STYLE", `A ${key} that is not a colour (${value.slice(0, 40)}) uses the theme's`, id);
    }
    const borderColor = p.kind === "main" ? (parseColor(p.branchColor) ?? theme.mainColor) : c.borderColor;
    shapes.push({
      kind: "box",
      layer: "nodes",
      box: p.topic,
      radii: radii(c.radius),
      fill: c.background ?? undefined,
      border: c.border > 0 && borderColor ? { color: borderColor, width: c.border } : undefined,
      opacity: 1,
    });
    if (c.image && p.node.image) {
      const box = { x: p.topic.x + c.image.x, y: p.topic.y + c.image.y, width: c.image.width, height: c.image.height };
      const { url, fit } = p.node.image;
      shapes.push(
        (async (): Promise<Shape | null> => {
          if (!options.embedImages) {
            warn("IMAGE_NOT_EMBEDDED", "Images are not embedded (embedImages: false)", id);
            return null;
          }
          const result = await embedImage(url, options);
          if ("reason" in result) {
            warn("IMAGE_NOT_EMBEDDED", `An image was left out: ${result.reason}`, id);
            return null;
          }
          return {
            kind: "image",
            layer: "nodes",
            box,
            href: result.url,
            fit: fit === "cover" ? "slice" : fit === "contain" ? "meet" : "none",
            opacity: 1,
          };
        })(),
      );
    }
    const fallback = theme.color ?? BLACK;
    if (c.text.length)
      shapes.push(
        textShape(
          "nodes",
          c.text.map((t) => run(t, p.topic, options, fallback)),
        ),
      );
    if (c.link && p.node.hyperLink) {
      let href: string | undefined;
      if (options.links === "preserve") {
        href = safeLink(p.node.hyperLink) ?? undefined;
        if (!href) warn("UNSAFE_LINK", "A link that is not http, https or mailto was exported as text only", id);
      }
      shapes.push(textShape("nodes", [run(c.link, p.topic, options, fallback)], href));
    }
    if (c.icons.length)
      shapes.push(
        textShape(
          "nodes",
          c.icons.map((t) => run(t, p.topic, options, fallback)),
        ),
      );
    for (const tag of c.tags) {
      shapes.push({
        kind: "box",
        layer: "nodes",
        box: { ...tag.box, x: p.topic.x + tag.box.x, y: p.topic.y + tag.box.y },
        radii: radii(3),
        fill: tag.background,
        opacity: 1,
      });
      shapes.push(textShape("nodes", [run(tag.text, p.topic, options, fallback)]));
    }
    if (p.kind !== "root" && p.node.children.length && !p.node.expanded) shapes.push(...expander(p));
  }

  // Summaries
  for (const s of map.summaries) {
    const parent = layout.byId.get(s.parent);
    const children = parent?.children.slice(s.start, s.end + 1) ?? [];
    if (!parent || children.length !== s.end - s.start + 1) continue;
    const side: Side = parent.kind === "root" ? (children[0] as PlacedNode).side : parent.side;
    const g = summaryGeometry(
      children.map((c) => c.wrapper),
      side,
      parent.kind !== "root",
    );
    const d = path(g.path);
    const color = (s.style.stroke ? parseColor(s.style.stroke) : null) ?? theme.color ?? BLACK;
    shapes.push({
      kind: "path",
      layer: "summaries",
      d,
      transform: IDENTITY,
      stroke: { color, width: 2 },
      opacity: 1,
      bounds: bounds(d, 12),
    });
    const labelColor = (s.style.labelColor ? parseColor(s.style.labelColor) : null) ?? theme.color ?? BLACK;
    shapes.push(...label(s.label, g.label.x, g.label.y, g.label.anchor, labelColor, null, theme, options));
  }

  // Arrows, with their labels on a translucent background
  for (const a of map.arrows) {
    const from = layout.byId.get(a.from);
    const to = layout.byId.get(a.to);
    if (!from || !to) continue;
    const defaults =
      !a.delta1 || !a.delta2
        ? defaultDeltas(from.topic, to.topic, from.kind === "root" ? undefined : from.side)
        : undefined;
    const g = arrowGeometry(
      from.topic,
      to.topic,
      a.delta1 ?? defaults!.delta1,
      a.delta2 ?? defaults!.delta2,
      a.bidirectional,
    );
    const color = (a.style.stroke ? parseColor(a.style.stroke) : null) ?? ARROW;
    const width = a.style.strokeWidth ?? 2;
    const opacity = a.style.opacity ?? 1;
    const dash = (a.style.strokeDasharray ?? "8,2").split(/[\s,]+/).map(Number);
    const line = path(g.line);
    shapes.push({
      kind: "path",
      layer: "arrows",
      d: line,
      transform: IDENTITY,
      stroke: { color, width, dash: dash.every((v) => Number.isFinite(v) && v >= 0) ? dash : undefined },
      opacity,
      bounds: bounds(line, width * 2),
    });
    for (const h of g.heads) {
      const d = path(h);
      shapes.push({
        kind: "path",
        layer: "arrows",
        d,
        transform: IDENTITY,
        stroke: { color, width },
        opacity,
        bounds: bounds(d, width * 2),
      });
    }
    const labelColor = (a.style.labelColor ? parseColor(a.style.labelColor) : null) ?? ARROW_LABEL;
    shapes.push(...label(a.label, g.middle.x, g.middle.y, "middle", labelColor, theme.labelBackground, theme, options));
  }

  const resolved = await Promise.all(shapes);
  return resolved.filter((s): s is Shape => s !== null);
}

/** Mind Elixir's expand icon on a folded node, where me-epd puts it (18×18). */
function expander(p: PlacedNode): Shape[] {
  const box = p.parent;
  let x: number;
  let y: number;
  if (p.side === "down") {
    x = box.x + box.width / 2 - 9;
    y = box.y + box.height - 9;
  } else if (p.kind === "main") {
    y = box.y + box.height / 2 - 9;
    x = p.side === "lhs" ? box.x - 10 : box.x + box.width + 10 - 18;
  } else {
    y = box.y + box.height - 9;
    x = p.side === "lhs" ? box.x + 5 : box.x + box.width - 5 - 18;
  }
  const s = 18 / 1024;
  const transform: Matrix = [s, 0, 0, s, x, y];
  const bounds = { x, y, width: 18, height: 18 };
  // me-epd { opacity: 0.8 }
  return [
    {
      kind: "path",
      layer: "nodes",
      d: EXPANDER_CIRCLE,
      transform,
      fill: WHITE,
      stroke: { color: BLACK, width: 54 },
      opacity: 0.8,
      bounds,
    },
    { kind: "path", layer: "nodes", d: EXPANDER_PLUS, transform, fill: BLACK, opacity: 0.8, bounds },
  ];
}

/**
 * Renders a Mind Elixir map (its data, or an instance) as a standalone SVG, laid out as Mind
 * Elixir lays it out, from the data and font metrics alone: no browser or DOM is needed, and the
 * same map gives the same SVG everywhere.
 */
export async function renderSvg(input: MindElixirInput, options?: SvgExportOptions): Promise<SvgExportResult> {
  const opts = resolveOptions(options);
  throwIfAborted(opts.signal);
  const warnings: SvgExportWarning[] = [];
  const warn: Warn = (code, message, nodeId) => {
    if (opts.strict) throw new SvgExportError(code, message);
    warnings.push({ code, message, nodeId });
  };
  const map = readMap(input, opts.limits, opts.theme, opts.direction);
  const theme = resolveTheme(map.theme);
  const layout = layoutMap(map, theme, opts.measure);
  const shapes = await draw(map, layout, theme, opts, warn);
  throwIfAborted(opts.signal);
  const doc = renderDocument(shapes, {
    padding: opts.padding,
    background: opts.background === "theme" ? theme.background : opts.background,
    title: opts.title ?? (map.root.topic.replace(/\s+/g, " ").trim() || "Mind map"),
    description: opts.description,
    idPrefix: opts.idPrefix,
    maxOutputLength: opts.limits.maxOutputLength,
    textLength: opts.textLength,
  });
  return { ...doc, warnings };
}

/** `renderSvg` as an `image/svg+xml` Blob. */
export async function exportSvg(input: MindElixirInput, options?: SvgExportOptions): Promise<Blob> {
  const { svg } = await renderSvg(input, options);
  return new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
}

/** An SVG as a base64 `data:` URL, for an `<img src>` (UTF-8 safe, in Node and browsers). */
export function toDataUrl(svg: string): string {
  const bytes = new TextEncoder().encode(svg);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

/** Downloads the map as an SVG file (in a browser). Resolves with the export result. */
export async function downloadSvg(
  input: MindElixirInput,
  filename = "mindmap.svg",
  options?: SvgExportOptions,
): Promise<SvgExportResult> {
  const result = await renderSvg(input, options);
  const url = URL.createObjectURL(new Blob([result.svg], { type: "image/svg+xml;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_") || "mindmap.svg";
  link.style.display = "none";
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    // Revoked on the next task, after the download has started
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  return result;
}
