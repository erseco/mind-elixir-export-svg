import { SvgExportError } from "./errors.js";
import { THEME, type Theme } from "./theme.js";
import type { SvgExportLimits } from "./types.js";

/** A node as the layout uses it: checked, with defaults filled in. */
export interface MapNode {
  id: string;
  topic: string;
  style: NodeStyle;
  children: MapNode[];
  /** False when the node is folded (its children are not drawn). */
  expanded: boolean;
  /** 0 left, 1 right: the side of a main node in a both-sides map. */
  direction: 0 | 1 | undefined;
  branchColor: string | undefined;
  tags: { text: string; background: string | undefined; color: string | undefined }[];
  icons: string[];
  hyperLink: string | undefined;
  image: { url: string; width: number; height: number; fit: "fill" | "contain" | "cover" } | undefined;
  /** The node is custom HTML (`dangerouslySetInnerHTML`), which is not laid out. */
  html: boolean;
}

export interface NodeStyle {
  fontSize?: string | undefined;
  fontWeight?: string | undefined;
  fontStyle?: string | undefined;
  color?: string | undefined;
  background?: string | undefined;
}

export interface MapArrow {
  id: string;
  label: string;
  from: string;
  to: string;
  delta1: { x: number; y: number } | undefined;
  delta2: { x: number; y: number } | undefined;
  bidirectional: boolean;
  style: {
    stroke?: string | undefined;
    strokeWidth?: number;
    strokeDasharray?: string | undefined;
    opacity?: number;
    labelColor?: string | undefined;
  };
}

export interface MapSummary {
  id: string;
  label: string;
  parent: string;
  start: number;
  end: number;
  style: { stroke?: string | undefined; labelColor?: string | undefined };
}

export interface MapData {
  root: MapNode;
  arrows: MapArrow[];
  summaries: MapSummary[];
  /** 0 left, 1 right, 2 both sides, 3 top-down. */
  direction: 0 | 1 | 2 | 3;
  theme: Theme;
  nodes: number;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const str = (v: unknown) => (typeof v === "string" ? v : undefined);
const finite = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

function invalid(message: string): never {
  throw new SvgExportError("INVALID_DATA", message);
}

function point(v: unknown): { x: number; y: number } | undefined {
  if (!isObject(v)) return undefined;
  const x = finite(v.x);
  const y = finite(v.y);
  return x === undefined || y === undefined ? undefined : { x, y };
}

function style(v: unknown): NodeStyle {
  if (!isObject(v)) return {};
  const out: NodeStyle = {};
  for (const key of ["fontSize", "fontWeight", "fontStyle", "color", "background"] as const) {
    const value = str(v[key]) ?? (typeof v[key] === "number" ? String(v[key]) : undefined);
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/** Reads Mind Elixir data (`mind.getData()`), or a Mind Elixir instance, without trusting it. */
export function readMap(input: unknown, limits: SvgExportLimits, theme?: Theme, direction?: number): MapData {
  let data: unknown = input;
  let instanceTheme: unknown;
  let instanceDirection: unknown;
  if (isObject(input) && typeof input.getData === "function") {
    data = (input.getData as () => unknown)();
    instanceTheme = input.theme;
    instanceDirection = input.direction;
  }
  if (!isObject(data) || !isObject(data.nodeData)) invalid("Expected Mind Elixir data ({ nodeData }) or an instance");

  let count = 0;
  let textLength = 0;
  let images = 0;
  const read = (raw: Record<string, unknown>): MapNode => {
    if (typeof raw.topic !== "string") invalid("Every node needs a string topic");
    if (++count > limits.maxNodes) {
      throw new SvgExportError("LIMIT_EXCEEDED", `The map has more than ${limits.maxNodes} nodes`);
    }
    textLength += raw.topic.length;
    if (textLength > limits.maxTextLength) {
      throw new SvgExportError("LIMIT_EXCEEDED", `The map has more than ${limits.maxTextLength} characters of text`);
    }
    const image = isObject(raw.image) ? raw.image : undefined;
    const imageUrl = str(image?.url);
    const imageWidth = finite(image?.width);
    const imageHeight = finite(image?.height);
    const hasImage = !!imageUrl && !!imageWidth && !!imageHeight && imageWidth > 0 && imageHeight > 0;
    if (hasImage && ++images > limits.maxImages) {
      throw new SvgExportError("LIMIT_EXCEEDED", `The map has more than ${limits.maxImages} images`);
    }
    const fit = str(image?.fit);
    return {
      id: str(raw.id) ?? String(count),
      topic: raw.topic,
      style: style(raw.style),
      children: [],
      expanded: raw.expanded !== false,
      direction: raw.direction === 0 || raw.direction === 1 ? raw.direction : undefined,
      branchColor: str(raw.branchColor),
      tags: (Array.isArray(raw.tags) ? raw.tags : [])
        .map((t) =>
          typeof t === "string"
            ? { text: t, background: undefined, color: undefined }
            : isObject(t) && typeof t.text === "string"
              ? {
                  text: t.text,
                  background: str(isObject(t.style) ? (t.style.backgroundColor ?? t.style.background) : undefined),
                  color: str(isObject(t.style) ? t.style.color : undefined),
                }
              : null,
        )
        .filter((t): t is MapNode["tags"][number] => t !== null),
      icons: (Array.isArray(raw.icons) ? raw.icons : []).filter((i): i is string => typeof i === "string"),
      hyperLink: str(raw.hyperLink) || undefined,
      image: hasImage
        ? {
            url: imageUrl,
            width: imageWidth,
            height: imageHeight,
            fit: fit === "fill" || fit === "contain" ? fit : "cover",
          }
        : undefined,
      html: typeof raw.dangerouslySetInnerHTML === "string" && raw.dangerouslySetInnerHTML !== "",
    };
  };

  // Iterative, so a deep map cannot overflow the stack
  const root = read(data.nodeData);
  const stack: { raw: Record<string, unknown>; node: MapNode; depth: number }[] = [
    { raw: data.nodeData, node: root, depth: 0 },
  ];
  while (stack.length) {
    const { raw, node, depth } = stack.pop()!;
    if (!Array.isArray(raw.children)) continue;
    if (depth + 1 > limits.maxDepth) {
      throw new SvgExportError("LIMIT_EXCEEDED", `The map is deeper than ${limits.maxDepth} levels`);
    }
    for (const child of raw.children) {
      if (!isObject(child)) invalid("Every child must be a node");
      const c = read(child);
      node.children.push(c);
      stack.push({ raw: child, node: c, depth: depth + 1 });
    }
  }

  const arrows = (Array.isArray(data.arrows) ? data.arrows : []).filter(isObject).flatMap((a): MapArrow[] => {
    const from = str(a.from);
    const to = str(a.to);
    if (!from || !to) return [];
    const s = isObject(a.style) ? a.style : {};
    const width = finite(s.strokeWidth) ?? (typeof s.strokeWidth === "string" ? parseFloat(s.strokeWidth) : undefined);
    const opacity = finite(s.opacity) ?? (typeof s.opacity === "string" ? parseFloat(s.opacity) : undefined);
    return [
      {
        id: str(a.id) ?? `${from}-${to}`,
        label: str(a.label) ?? "",
        from,
        to,
        delta1: point(a.delta1),
        delta2: point(a.delta2),
        bidirectional: a.bidirectional === true,
        style: {
          ...(str(s.stroke) ? { stroke: str(s.stroke) } : {}),
          ...(width !== undefined && Number.isFinite(width) && width > 0 ? { strokeWidth: width } : {}),
          ...(str(s.strokeDasharray) ? { strokeDasharray: str(s.strokeDasharray) } : {}),
          ...(opacity !== undefined && Number.isFinite(opacity) ? { opacity } : {}),
          ...(str(s.labelColor) ? { labelColor: str(s.labelColor) } : {}),
        },
      },
    ];
  });

  const summaries = (Array.isArray(data.summaries) ? data.summaries : [])
    .filter(isObject)
    .flatMap((s): MapSummary[] => {
      const parent = str(s.parent);
      const start = finite(s.start);
      const end = finite(s.end);
      if (
        !parent ||
        start === undefined ||
        end === undefined ||
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        start < 0 ||
        end < start
      ) {
        return [];
      }
      const st = isObject(s.style) ? s.style : {};
      return [
        {
          id: str(s.id) ?? parent,
          label: str(s.label) ?? "",
          parent,
          start,
          end,
          style: {
            ...(str(st.stroke) ? { stroke: str(st.stroke) } : {}),
            ...(str(st.labelColor) ? { labelColor: str(st.labelColor) } : {}),
          },
        },
      ];
    });

  const dir = direction ?? (typeof data.direction === "number" ? data.direction : undefined) ?? instanceDirection;
  const pickedTheme =
    theme ?? (isObject(data.theme) ? data.theme : undefined) ?? (isObject(instanceTheme) ? instanceTheme : undefined);
  const validTheme =
    isObject(pickedTheme) && Array.isArray(pickedTheme.palette) && isObject(pickedTheme.cssVar)
      ? {
          palette: pickedTheme.palette.filter((p): p is string => typeof p === "string"),
          cssVar: Object.fromEntries(
            Object.entries(pickedTheme.cssVar).filter((e): e is [string, string] => typeof e[1] === "string"),
          ),
        }
      : THEME;
  return {
    root,
    arrows,
    summaries,
    direction: dir === 0 || dir === 1 || dir === 3 ? dir : 2,
    theme: validTheme,
    nodes: count,
  };
}
