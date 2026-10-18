import { parseColor, type Color } from "./css.js";
import type { MapData, MapNode } from "./data.js";
import type { Box } from "./geometry.js";
import type { Side } from "./connectors.js";
import type { ResolvedTheme } from "./theme.js";
import type { Font, TextMeasurer } from "./text/measure.js";
import { wrapText } from "./text/wrap.js";

/**
 * Lays a map out as Mind Elixir 5.15.1's stylesheet does (src/index.css), from the data and the
 * font metrics alone: topic boxes from their text, then the tree. The numbers below are that
 * stylesheet's (paddings, margins, gaps and font sizes).
 */

export type Kind = "root" | "main" | "sub";

/** A run of text on a baseline, relative to its topic's top-left corner. */
export interface PlacedText {
  text: string;
  x: number;
  y: number;
  width: number;
  font: Font;
  color: Color | null;
}

/** What a topic contains, positioned relative to its top-left corner. */
export interface TopicContent {
  width: number;
  height: number;
  font: Font;
  padding: [number, number];
  border: number;
  borderColor: Color | null;
  radius: number;
  background: Color | null;
  color: Color | null;
  text: PlacedText[];
  link: PlacedText | undefined;
  icons: PlacedText[];
  tags: { box: Box; background: Color; text: PlacedText }[];
  image: Box | undefined;
}

export interface PlacedNode {
  node: MapNode;
  kind: Kind;
  side: Side;
  /** The topic (me-tpc) border box. */
  topic: Box;
  /** me-parent's padding box: what sub-branches attach to and the expander is placed in. */
  parent: Box;
  /** me-wrapper: the node and its drawn children, which summaries bracket. */
  wrapper: Box;
  content: TopicContent;
  branchColor: string;
  /** Parent of this node in the drawing, undefined for the root. */
  up: PlacedNode | undefined;
  /** Children that are drawn (none when folded). */
  children: PlacedNode[];
}

export interface Layout {
  nodes: PlacedNode[];
  byId: Map<string, PlacedNode>;
  root: PlacedNode;
  /** Main nodes in document order (left side first), as Mind Elixir colours them. */
  mains: PlacedNode[];
  /** me-nodes' size, which the main branch curvature depends on. */
  width: number;
  height: number;
}

interface Metrics {
  ascent: number;
  descent: number;
  lineHeight: number;
}

const CONTAINER_FONT = 16; // .map-container font-size
const ROOT_FONT = 25;
const TAG_FONT = 12;

function fontOf(node: MapNode, kind: Kind): Font {
  const size = parseFloat(node.style.fontSize ?? "");
  const weight = node.style.fontWeight === "bold" ? 700 : Number(node.style.fontWeight) || 400;
  return {
    size: Number.isFinite(size) && size > 0 ? size : kind === "root" ? ROOT_FONT : CONTAINER_FONT,
    weight: weight >= 1 && weight <= 1000 ? weight : 400,
    style: node.style.fontStyle === "italic" || node.style.fontStyle === "oblique" ? "italic" : "normal",
  };
}

/**
 * `line-height: normal`: the font's ascent, descent and line gap, the gap split evenly. Browsers
 * (Chromium's Blink in particular) round each of the three to whole pixels: a 16px Arial line is
 * 14 + 3 + 1 = 18px, not 18.4px, which adds up over a large map.
 */
function normal(size: number, m: TextMeasurer): Metrics {
  const ascent = Math.round(m.vertical.ascent * size);
  const descent = Math.round(m.vertical.descent * size);
  const gap = Math.round(m.vertical.lineGap * size);
  return { ascent: ascent + gap / 2, descent: descent + gap / 2, lineHeight: ascent + descent + gap };
}

/** A fixed line height (`line-height: 1.3em`): the leading is split evenly. */
function fixed(size: number, lineHeight: number, m: TextMeasurer): Metrics {
  const { ascent, descent } = m.vertical;
  const half = (lineHeight - (ascent + descent) * size) / 2;
  return { ascent: ascent * size + half, descent: descent * size + half, lineHeight };
}

/**
 * Browsers keep layout sizes in fixed point (Blink and WebKit: 1/64 px) and round a text's
 * width up to it when sizing a box to its content; over a deep map that adds up to pixels.
 */
const layoutUnit = (width: number) => Math.ceil(width * 64 - 1e-6) / 64;

interface Atom {
  width: number;
  marginLeft: number;
  marginRight: number;
  ascent: number;
  descent: number;
  place(x: number, baseline: number): void;
}

/**
 * Inline formatting: atoms flow left to right on baseline-aligned lines `available` wide, a
 * line holding at least one atom. Each line also holds the strut (the box's own font).
 * Returns the height used, the widest line and the max-content width.
 */
function flow(
  atoms: Atom[],
  available: number,
  strut: Metrics,
  top: number,
  left: number,
): { height: number; width: number; maxContent: number } {
  let y = top;
  let widest = 0;
  let line: Atom[] = [];
  let lineWidth = 0;
  const flush = () => {
    const ascent = Math.max(strut.ascent, ...line.map((a) => a.ascent));
    const descent = Math.max(strut.descent, ...line.map((a) => a.descent));
    let x = left;
    for (const a of line) {
      x += a.marginLeft;
      a.place(x, y + ascent);
      x += a.width + a.marginRight;
    }
    widest = Math.max(widest, lineWidth);
    y += ascent + descent;
    line = [];
    lineWidth = 0;
  };
  for (const atom of atoms) {
    const w = atom.marginLeft + atom.width + atom.marginRight;
    if (line.length && lineWidth + w > available) flush();
    line.push(atom);
    lineWidth += w;
  }
  if (line.length) flush();
  // max-content: every atom on one line, which is what shrink-to-fit sizes a box to
  const maxContent = atoms.reduce((sum, a) => sum + a.marginLeft + a.width + a.marginRight, 0);
  return { height: y - top, width: widest, maxContent };
}

/** Sizes a topic and positions what it contains, as me-tpc lays it out. */
export function layoutTopic(
  node: MapNode,
  kind: Kind,
  down: boolean,
  theme: ResolvedTheme,
  m: TextMeasurer,
): TopicContent {
  const font = fontOf(node, kind);
  const fs = font.size;
  const style = {
    root: {
      padding: [10, 30] as [number, number],
      border: 2,
      radius: theme.rootRadius,
      background: theme.rootBackground,
      color: theme.rootColor,
      borderColor: theme.rootBorder,
    },
    main: {
      padding: [8, 25] as [number, number],
      border: theme.mainBorder?.width ?? 2,
      radius: theme.mainRadius,
      background: theme.mainBackground,
      color: theme.mainColor,
      borderColor: null,
    },
    sub: down
      ? {
          padding: [6, 12] as [number, number],
          border: 1,
          radius: 6,
          background: theme.mainBackground,
          color: theme.color,
          borderColor: theme.mainColor,
        }
      : {
          padding: [theme.topicPadding, theme.topicPadding] as [number, number],
          border: 0,
          radius: 3,
          background: null,
          color: theme.color,
          borderColor: null,
        },
  }[kind];
  const color = (node.style.color ? parseColor(node.style.color) : null) ?? style.color;
  const background = node.style.background ? (parseColor(node.style.background) ?? style.background) : style.background;
  const [padY, padX] = style.padding;
  const maxWidth = 35 * fs; // me-tpc max-width: 35em (border-box)
  const available = Math.max(0, maxWidth - 2 * padX - 2 * style.border);
  const strut = normal(fs, m);
  const left = style.border + padX;
  let y = style.border + padY;
  let contentWidth = 0;
  const out: TopicContent = {
    width: 0,
    height: 0,
    font,
    padding: style.padding,
    border: style.border,
    borderColor: style.borderColor,
    radius: style.radius,
    background,
    color,
    text: [],
    link: undefined,
    icons: [],
    tags: [],
    image: undefined,
  };

  // img { display: block; margin-bottom: 8px }
  if (node.image) {
    out.image = { x: left, y, width: node.image.width, height: node.image.height };
    y += node.image.height + 8;
    contentWidth = node.image.width;
  }

  const atoms: Atom[] = [];
  // span.text: an inline block holding the caption's lines
  const lines = node.html ? [] : wrapText(node.topic, font, available, m);
  const textLines = lines.length === 1 && lines[0]?.text === "" ? [] : lines;
  // Shrink-to-fit: an inline block is as wide as its longest unbroken paragraph, at most the
  // space available (so a wrapped caption takes all of it)
  const paragraphs = node.html ? [] : node.topic.replace(/\r\n?/g, "\n").split("\n");
  const textMaxContent = Math.max(0, ...paragraphs.map((p) => m.width(p.replace(/\t/g, " ").trimEnd(), font)));
  if (textLines.length) {
    atoms.push({
      width: Math.min(available, layoutUnit(textMaxContent)),
      marginLeft: 0,
      marginRight: 0,
      ascent: (textLines.length - 1) * strut.lineHeight + strut.ascent,
      descent: strut.descent,
      place(x, baseline) {
        textLines.forEach((l, i) => {
          out.text.push({
            text: l.text,
            x,
            y: baseline - (textLines.length - 1 - i) * strut.lineHeight,
            width: l.width,
            font,
            color,
          });
        });
      },
    });
  }
  // a.hyper-link: inline "🔗", margin-left: 0.3em
  if (node.hyperLink) {
    const width = m.width("🔗", font);
    atoms.push({
      width,
      marginLeft: 0.3 * fs,
      marginRight: 0,
      ascent: strut.ascent,
      descent: strut.descent,
      place(x, baseline) {
        out.link = { text: "🔗", x, y: baseline, width, font, color };
      },
    });
  }
  // span.icons: inline-block, margin-left: 5px; its spans have line-height: 1.3em
  if (node.icons.length) {
    const icon = fixed(fs, 1.3 * fs, m);
    const widths = node.icons.map((i) => m.width(i, font));
    atoms.push({
      width: widths.reduce((a, b) => a + b, 0),
      marginLeft: 5,
      marginRight: 0,
      ascent: Math.max(strut.ascent, icon.ascent),
      descent: Math.max(strut.descent, icon.descent),
      place(x, baseline) {
        node.icons.forEach((text, i) => {
          out.icons.push({ text, x, y: baseline, width: widths[i] as number, font, color });
          x += widths[i] as number;
        });
      },
    });
  }
  const row = flow(atoms, available, strut, y, left);
  // An empty topic still has one line: the strut
  y += atoms.length ? row.height : strut.lineHeight;
  contentWidth = Math.max(contentWidth, Math.min(available, row.maxContent));

  // div.tags: a block of inline-block spans (12px, line-height 1.3em, padding 2px 4px,
  // margin-top 2px, margin-right 4px)
  if (node.tags.length) {
    // Tags are 12px but inherit the topic's weight and style
    const tagFont: Font = { size: TAG_FONT, weight: font.weight, style: font.style };
    const t = fixed(TAG_FONT, 1.3 * TAG_FONT, m);
    const tagAtoms: Atom[] = node.tags.map((tag) => {
      const textWidth = m.width(tag.text, tagFont);
      return {
        width: textWidth + 8,
        marginLeft: 0,
        marginRight: 4,
        ascent: 2 + 2 + t.ascent,
        descent: t.descent + 2,
        place(x, baseline) {
          const box = { x, y: baseline - t.ascent - 2, width: textWidth + 8, height: t.lineHeight + 4 };
          out.tags.push({
            box,
            background: (tag.background ? parseColor(tag.background) : null) ?? { hex: "#d6f0f8", alpha: 1 },
            text: {
              text: tag.text,
              x: x + 4,
              y: baseline,
              width: textWidth,
              font: tagFont,
              color: (tag.color ? parseColor(tag.color) : null) ?? { hex: "#276f86", alpha: 1 },
            },
          });
        },
      };
    });
    const tags = flow(tagAtoms, available, strut, y, left);
    y += tags.height;
    contentWidth = Math.max(contentWidth, Math.min(available, tags.maxContent));
  }

  out.width = Math.min(maxWidth, contentWidth + 2 * padX + 2 * style.border);
  out.height = y + padY + style.border;
  return out;
}

/**
 * Lays the whole map out: topic sizes bottom-up, then positions top-down, in me-nodes'
 * coordinates (as Mind Elixir's getOffsetLT measures them).
 */
export function layoutMap(map: MapData, theme: ResolvedTheme, m: TextMeasurer): Layout {
  const down = map.direction === 3;
  const all: PlacedNode[] = [];
  const byId = new Map<string, PlacedNode>();
  const empty: Box = { x: 0, y: 0, width: 0, height: 0 };

  // Sides of the main nodes, as Mind Elixir assigns them (src/utils/layout.ts)
  let leftCount = 0;
  let rightCount = 0;
  const sideOf = (n: MapNode): Side => {
    if (down) return "down";
    if (map.direction === 0) return "lhs";
    if (map.direction === 1) return "rhs";
    if (n.direction === 0) return (leftCount++, "lhs");
    if (n.direction === 1) return (rightCount++, "rhs");
    return leftCount <= rightCount ? (leftCount++, "lhs") : (rightCount++, "rhs");
  };

  const make = (node: MapNode, kind: Kind, side: Side, up: PlacedNode | undefined): PlacedNode => {
    const p: PlacedNode = {
      node,
      kind,
      side,
      topic: { ...empty },
      parent: { ...empty },
      wrapper: { ...empty },
      content: layoutTopic(node, kind, down, theme, m),
      branchColor: "",
      up,
      children: [],
    };
    all.push(p);
    if (!byId.has(node.id)) byId.set(node.id, p);
    return p;
  };
  const root = make(map.root, "root", down ? "down" : "rhs", undefined);
  const mainSides = map.root.children.map(sideOf);
  // Main nodes are placed in the DOM left side first, then right
  const order = down
    ? map.root.children.map((_, i) => i)
    : [...mainSides.keys()].sort((a, b) => (mainSides[a] === mainSides[b] ? a - b : mainSides[a] === "lhs" ? -1 : 1));
  const mains = order.map((i) => make(map.root.children[i] as MapNode, "main", mainSides[i] as Side, root));
  root.children = map.root.children.map((_, i) => mains[order.indexOf(i)] as PlacedNode);
  mains.forEach(
    (main, i) => (main.branchColor = main.node.branchColor ?? (theme.palette[i % theme.palette.length] as string)),
  );

  // Descendants, iteratively
  const queue = [...mains];
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i] as PlacedNode;
    if (!p.node.expanded) continue;
    for (const child of p.node.children) {
      const c = make(child, "sub", p.side, p);
      c.branchColor = child.branchColor ?? p.branchColor;
      p.children.push(c);
      queue.push(c);
    }
  }

  // Sizes, children first. me-parent around the topic: main nodes have margin 10px, others
  // padding 6px gap-x and margin-top gap-y (top-down: padding 0 gap-y, no margin)
  const parentSize = (p: PlacedNode) => {
    const { width: w, height: h } = p.content;
    if (down)
      return { width: w + 2 * theme.nodeGapY, height: h, marginTop: 0, padX: theme.nodeGapY, padY: 0, margin: 0 };
    if (p.kind === "main") return { width: w, height: h, marginTop: 10, padX: 0, padY: 0, margin: 10 };
    return {
      width: w + 2 * theme.nodeGapX,
      height: h + 12,
      marginTop: theme.nodeGapY,
      padX: theme.nodeGapX,
      padY: 6,
      margin: 0,
    };
  };
  const size = new Map<
    PlacedNode,
    { w: number; h: number; parentY: number; childrenY: number; childrenW: number; childrenH: number }
  >();
  const wrapperStrut = normal(CONTAINER_FONT, m);
  const xHalf = (m.vertical.xHeight * CONTAINER_FONT) / 2;
  for (const p of [...all].reverse()) {
    if (p.kind === "root") continue;
    const ps = parentSize(p);
    const pw = ps.width + 2 * ps.margin;
    const ph = ps.height + ps.marginTop + (p.kind === "main" ? ps.margin : 0);
    const kids = p.children.map((c) => size.get(c) as { w: number; h: number });
    if (down) {
      const childrenW = kids.reduce((s, k) => s + k.w, 0);
      const childrenH = Math.max(0, ...kids.map((k) => k.h));
      const gap = kids.length ? theme.nodeGapX : 0;
      size.set(p, {
        w: Math.max(pw, childrenW),
        h: ph + gap + childrenH,
        parentY: 0,
        childrenY: ph + gap,
        childrenW,
        childrenH,
      });
      continue;
    }
    const childrenW = Math.max(0, ...kids.map((k) => k.w));
    const childrenH = kids.reduce((s, k) => s + k.h, 0);
    // me-parent and me-children are inline blocks with vertical-align: middle in one line box
    // with me-wrapper's strut: their midpoints sit half an x-height above the baseline
    const items = kids.length ? [ph, childrenH] : [ph];
    const top = Math.min(-wrapperStrut.ascent, ...items.map((h) => -xHalf - h / 2));
    const bottom = Math.max(wrapperStrut.descent, ...items.map((h) => -xHalf + h / 2));
    const at = (h: number) => -top - xHalf - h / 2;
    size.set(p, {
      w: pw + childrenW,
      h: bottom - top,
      parentY: at(ph),
      childrenY: kids.length ? at(childrenH) : 0,
      childrenW,
      childrenH,
    });
  }

  // Positions, parents first (iteratively: a deep map cannot overflow the stack)
  const pending: { p: PlacedNode; x: number; y: number }[] = [];
  const place = (p0: PlacedNode, x0: number, y0: number) => {
    pending.push({ p: p0, x: x0, y: y0 });
    while (pending.length) {
      const { p, x, y } = pending.pop() as { p: PlacedNode; x: number; y: number };
      const s = size.get(p) as NonNullable<ReturnType<typeof size.get>>;
      const ps = parentSize(p);
      const pw = ps.width + 2 * ps.margin;
      p.wrapper = { x, y, width: s.w, height: s.h };
      let parentX: number;
      let childrenX: number;
      if (down) {
        parentX = x + (s.w - pw) / 2;
        childrenX = x + (s.w - s.childrenW) / 2;
      } else if (p.side === "lhs") {
        // direction: rtl: children on the left, the node on the right
        childrenX = x;
        parentX = x + s.childrenW;
      } else {
        parentX = x;
        childrenX = x + pw;
      }
      const parentTop = y + s.parentY + ps.marginTop;
      p.parent = { x: parentX + ps.margin, y: parentTop, width: ps.width, height: ps.height };
      p.topic = { x: p.parent.x + ps.padX, y: parentTop + ps.padY, width: p.content.width, height: p.content.height };
      let cx = childrenX;
      let cy = y + s.childrenY;
      for (const c of p.children) {
        const cs = size.get(c) as { w: number; h: number };
        if (down) {
          pending.push({ p: c, x: cx, y: cy });
          cx += cs.w;
        } else {
          // In a right-to-left block the wrappers are aligned right
          pending.push({ p: c, x: p.side === "lhs" ? childrenX + s.childrenW - cs.w : cx, y: cy });
          cy += cs.h;
        }
      }
    }
  };

  const pad = theme.mapPadding;
  const rootW = root.content.width;
  const rootH = root.content.height + 90; // me-root { margin: 45px 0 }
  let width: number;
  let height: number;
  if (down) {
    // me-main.down: one row, wrappers with margin gap-x (top, bottom) and gap-y (sides)
    const rowW = mains.reduce((s, p) => s + (size.get(p) as { w: number }).w + 2 * theme.mainGapY, 0);
    const rowH = Math.max(0, ...mains.map((p) => (size.get(p) as { h: number }).h + 2 * theme.mainGapX));
    const contentW = Math.max(rootW, rowW);
    width = contentW + pad.left + pad.right;
    height = rootH + rowH + pad.top + pad.bottom;
    root.topic = { x: pad.left + (contentW - rootW) / 2, y: pad.top + 45, width: rootW, height: root.content.height };
    let x = pad.left + (contentW - rowW) / 2;
    for (const p of mains) {
      const s = size.get(p) as { w: number };
      place(p, x + theme.mainGapY, pad.top + rootH + theme.mainGapX);
      x += s.w + 2 * theme.mainGapY;
    }
  } else {
    const column = (side: Side) => {
      const ps = mains.filter((p) => p.side === side);
      const w = Math.max(0, ...ps.map((p) => (size.get(p) as { w: number }).w + 2 * theme.mainGapX));
      const h = ps.length
        ? ps.reduce((s, p) => s + (size.get(p) as { h: number }).h, 0) + theme.mainGapY * (ps.length + 1)
        : 0;
      return { ps, w, h };
    };
    const lhs = column("lhs");
    const rhs = column("rhs");
    const contentH = Math.max(lhs.h, rootH, rhs.h);
    width = lhs.w + rootW + rhs.w + pad.left + pad.right;
    height = contentH + pad.top + pad.bottom;
    const rootX = pad.left + lhs.w;
    root.topic = { x: rootX, y: pad.top + (contentH - rootH) / 2 + 45, width: rootW, height: root.content.height };
    for (const [col, x0] of [
      [lhs, pad.left],
      [rhs, rootX + rootW],
    ] as const) {
      let y = pad.top + (contentH - col.h) / 2 + theme.mainGapY;
      for (const p of col.ps) {
        const s = size.get(p) as { w: number; h: number };
        place(p, p.side === "lhs" ? x0 + col.w - theme.mainGapX - s.w : x0 + theme.mainGapX, y);
        y += s.h + theme.mainGapY;
      }
    }
  }
  root.parent = { ...root.topic };
  root.wrapper = { ...root.topic };
  return { nodes: all, byId, root, mains, width, height };
}
