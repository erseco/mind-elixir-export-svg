import type { Box } from "./geometry.js";

/**
 * Connector geometry, adapted from Mind Elixir 5.15.1 (src/utils/generateBranch.ts,
 * src/arrow.ts, src/summary.ts; MIT, (c) 2019 DjZhou), so lines, arrows and brackets have the
 * shapes the editor draws for the same boxes.
 */

export type Side = "lhs" | "rhs" | "down";

/** Orthogonal connector with rounded corners (top-down layout). */
export function roundedVertical(x1: number, y1: number, x2: number, y2: number, radius = 8): string {
  if (x1 === x2) return `M ${x1} ${y1} V ${y2}`;
  const midY = (y1 + y2) / 2;
  const dir = x2 > x1 ? 1 : -1;
  const r = Math.min(radius, Math.abs(x2 - x1) / 2, Math.abs(midY - y1), Math.abs(y2 - midY));
  return `M ${x1} ${y1} V ${midY - r} Q ${x1} ${midY} ${x1 + dir * r} ${midY} H ${x2 - dir * r} Q ${x2} ${midY} ${x2} ${midY + r} V ${y2}`;
}

/** From the root (`p`) to a main topic (`c`). */
export function mainBranch(p: Box, c: Box, side: Side, containerHeight: number): string {
  if (side === "down") return roundedVertical(p.x + p.width / 2, p.y + p.height, c.x + c.width / 2, c.y);
  let x1 = p.x + p.width / 2;
  const y1 = p.y + p.height / 2;
  const x2 = side === "lhs" ? c.x + c.width : c.x;
  const y2 = c.y + c.height / 2;
  const pct = Math.abs(y2 - y1) / containerHeight;
  const offset = (1 - pct) * 0.25 * (p.width / 2);
  x1 = side === "lhs" ? x1 - p.width / 10 - offset : x1 + p.width / 10 + offset;
  return `M ${x1} ${y1} Q ${x1} ${y2} ${x2} ${y2}`;
}

/** From a parent's box (`p`, its me-parent) to a child's (`c`). */
export function subBranch(p: Box, c: Box, side: Side, isFirst: boolean, gap: number): string {
  if (side === "down") return roundedVertical(p.x + p.width / 2, p.y + p.height, c.x + c.width / 2, c.y);
  const y1 = isFirst ? p.y + p.height / 2 : p.y + p.height;
  const y2 = c.y + c.height;
  const offset = (Math.abs(y1 - y2) / 300) * gap;
  if (side === "lhs") {
    const xMid = p.x;
    return `M ${xMid + gap} ${y1} C ${xMid} ${y1} ${xMid + offset} ${y2} ${xMid - gap} ${y2} H ${c.x + gap}`;
  }
  const xMid = p.x + p.width;
  return `M ${xMid - gap} ${y1} C ${xMid} ${y1} ${xMid - offset} ${y2} ${xMid + gap} ${y2} H ${c.x + c.width - gap}`;
}

/** Control-point offsets Mind Elixir picks for an arrow that has none stored. */
export function defaultDeltas(from: Box, to: Box, fromSide: Side | undefined) {
  const dx = to.x + to.width / 2 - (from.x + from.width / 2);
  const dy = to.y + to.height / 2 - (from.y + from.height / 2);
  const distance = Math.sqrt(dx * dx + dy * dy);
  const base = Math.max(50, Math.min(200, distance * 0.3));
  let delta1: { x: number; y: number };
  let delta2: { x: number; y: number };
  if (distance < 150) {
    const xMul = fromSide ? (fromSide === "lhs" ? -1 : 1) : dx > 0 ? -1 : 1;
    delta1 = { x: 200 * xMul, y: 0 };
    delta2 = { x: 200 * xMul, y: 0 };
  } else if (Math.abs(dx) > Math.abs(dy) * 1.5) {
    const fromEdge = dx > 0 ? from.width / 2 : -from.width / 2;
    const toEdge = dx > 0 ? -to.width / 2 : to.width / 2;
    delta1 = { x: fromEdge + (dx > 0 ? base : -base), y: 0 };
    delta2 = { x: toEdge + (dx > 0 ? -base : base), y: 0 };
  } else if (Math.abs(dy) > Math.abs(dx) * 1.5) {
    const fromEdge = dy > 0 ? from.height / 2 : -from.height / 2;
    const toEdge = dy > 0 ? -to.height / 2 : to.height / 2;
    delta1 = { x: 0, y: fromEdge + (dy > 0 ? base : -base) };
    delta2 = { x: 0, y: toEdge + (dy > 0 ? -base : base) };
  } else {
    const angle = Math.atan2(dy, dx);
    const ox = base * 0.7 * (dx > 0 ? 1 : -1);
    const oy = base * 0.7 * (dy > 0 ? 1 : -1);
    delta1 = { x: (from.width / 2) * Math.cos(angle) + ox, y: (from.height / 2) * Math.sin(angle) + oy };
    delta2 = { x: -(to.width / 2) * Math.cos(angle) - ox, y: -(to.height / 2) * Math.sin(angle) - oy };
  }
  const round = (d: { x: number; y: number }) => ({ x: Math.round(d.x), y: Math.round(d.y) });
  return { delta1: round(delta1), delta2: round(delta2) };
}

/** Where the line from a box's centre towards `ctrl` leaves the box. */
function exitPoint(box: Box, ctrl: { x: number; y: number }) {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const dx = ctrl.x - cx;
  const dy = ctrl.y - cy;
  const len = Math.hypot(dx, dy);
  if (len === 0 || (box.width === 0 && box.height === 0)) return { x: cx, y: cy };
  const ux = dx / len;
  const uy = dy / len;
  const t = Math.min(box.width / 2 / Math.abs(ux), box.height / 2 / Math.abs(uy));
  return { x: cx + ux * t, y: cy + uy * t };
}

function head(px: number, py: number, x: number, y: number): string {
  const angle = (Math.atan2(y - py, x - px) * 180) / Math.PI;
  const wing = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    return `${x + Math.cos(rad) * 12} ${y + Math.sin(rad) * 12}`;
  };
  return `M ${wing(angle + 180 - 30)} L ${x} ${y} L ${wing(angle + 180 + 30)}`;
}

/** An arrow between two topics: its curve, heads, and the middle of the curve for the label. */
export function arrowGeometry(
  from: Box,
  to: Box,
  delta1: { x: number; y: number },
  delta2: { x: number; y: number },
  bidirectional: boolean,
) {
  const c1 = { x: from.x + from.width / 2 + delta1.x, y: from.y + from.height / 2 + delta1.y };
  const c2 = { x: to.x + to.width / 2 + delta2.x, y: to.y + to.height / 2 + delta2.y };
  const p1 = exitPoint(from, c1);
  const p4 = exitPoint(to, c2);
  return {
    line: `M ${p1.x} ${p1.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${p4.x} ${p4.y}`,
    heads: [head(c2.x, c2.y, p4.x, p4.y), ...(bidirectional ? [head(c1.x, c1.y, p1.x, p1.y)] : [])],
    middle: {
      x: p1.x / 8 + (c1.x * 3) / 8 + (c2.x * 3) / 8 + p4.x / 8,
      y: p1.y / 8 + (c1.y * 3) / 8 + (c2.y * 3) / 8 + p4.y / 8,
    },
  };
}

/**
 * A summary bracket over sibling wrappers `boxes` (in order), on `side`; `nested` is false when
 * the summarized nodes are main nodes. Returns the path and where its label is anchored.
 */
export function summaryGeometry(boxes: Box[], side: Side, nested: boolean) {
  const first = boxes[0] as Box;
  const last = boxes[boxes.length - 1] as Box;
  const inset = boxes.length === 1 ? 10 : 20;
  const left = Math.min(...boxes.map((b) => b.x));
  const right = Math.max(...boxes.map((b) => b.x + b.width));
  const maxBottom = Math.max(...boxes.map((b) => b.y + b.height));
  if (side === "down") {
    const y = maxBottom + 10;
    const startLeft = first.x + inset;
    const endRight = last.x + last.width - inset;
    const mid = (startLeft + endRight) / 2;
    return {
      path: `M ${startLeft} ${y - 10} c 0 5 5 10 10 10 L ${endRight - 10} ${y} c 5 0 10 -5 10 -10 M ${mid} ${y} v 10`,
      label: { x: mid, y: y + 20, anchor: "middle" as const },
    };
  }
  const offset = nested ? 10 : 0;
  const top = first.y + inset + offset;
  const bottom = last.y + last.height - inset + offset;
  const md = (top + bottom) / 2;
  if (side === "lhs") {
    return {
      path: `M ${left + 10} ${top} c -5 0 -10 5 -10 10 L ${left} ${bottom - 10} c 0 5 5 10 10 10 M ${left} ${md} h -10`,
      label: { x: left - 20, y: md, anchor: "end" as const },
    };
  }
  return {
    path: `M ${right - 10} ${top} c 5 0 10 5 10 10 L ${right} ${bottom - 10} c 0 5 -5 10 -10 10 M ${right} ${md} h 10`,
    label: { x: right + 20, y: md, anchor: "start" as const },
  };
}
