import type { Radii } from "./css.js";
import { num } from "./svg/xml.js";

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** `[a, b, c, d, e, f]`, as in SVG `matrix()`. */
export type Matrix = [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

export function isFiniteBox(box: Box): boolean {
  return [box.x, box.y, box.width, box.height].every(Number.isFinite) && box.width >= 0 && box.height >= 0;
}

/** The smallest box containing all of `boxes`, or `null` for none. */
export function union(boxes: Iterable<Box>): Box | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of boxes) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  return minX === Infinity ? null : { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function inflate(box: Box, by: number): Box {
  return { x: box.x - by, y: box.y - by, width: box.width + 2 * by, height: box.height + 2 * by };
}

export function isIdentity(m: Matrix): boolean {
  return m.every((v, i) => Math.abs(v - (IDENTITY[i] as number)) < 1e-9);
}

/** An SVG `transform` value, or `undefined` for the identity. */
export function transformAttribute(m: Matrix): string | undefined {
  if (isIdentity(m)) return undefined;
  const [a, b, c, d, e, f] = m;
  if (a === 1 && b === 0 && c === 0 && d === 1) return `translate(${num(e)} ${num(f)})`;
  // Matrix coefficients keep more precision than coordinates
  const fine = (v: number) => {
    if (!Number.isFinite(v)) throw new RangeError(`Not a finite number: ${v}`);
    return String(Math.round(v * 1e6) / 1e6);
  };
  return `matrix(${fine(a)} ${fine(b)} ${fine(c)} ${fine(d)} ${num(e)} ${num(f)})`;
}

/**
 * Bounds of path data: every point it passes through and every control point (a Bézier curve
 * lies inside the hull of its control points; an arc within its radii of its end points).
 * Grown by `extra` (half a stroke, an arrowhead's miter…).
 */
export function pathBounds(d: string, extra = 0): Box {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? [];
  const xs: number[] = [];
  const ys: number[] = [];
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let i = 0;
  let command = "M";
  const next = () => Number(tokens[i++]);
  const add = (px: number, py: number) => {
    xs.push(px);
    ys.push(py);
  };
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i] as string)) command = tokens[i++] as string;
    const rel = command === command.toLowerCase();
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;
    switch (command.toUpperCase()) {
      case "M":
      case "L":
      case "T":
        x = ox + next();
        y = oy + next();
        if (command.toUpperCase() === "M") {
          [startX, startY] = [x, y];
          // Further pairs after a move are lines
          command = rel ? "l" : "L";
        }
        break;
      case "H":
        x = ox + next();
        break;
      case "V":
        y = oy + next();
        break;
      case "C":
        add(ox + next(), oy + next());
        add(ox + next(), oy + next());
        x = ox + next();
        y = oy + next();
        break;
      case "S":
      case "Q":
        add(ox + next(), oy + next());
        x = ox + next();
        y = oy + next();
        break;
      case "A": {
        const rx = Math.abs(next());
        const ry = Math.abs(next());
        i += 3;
        add(x - rx, y - ry);
        add(x + rx, y + ry);
        x = ox + next();
        y = oy + next();
        add(x - rx, y - ry);
        add(x + rx, y + ry);
        break;
      }
      case "Z":
        [x, y] = [startX, startY];
        break;
      default:
        i++;
    }
    add(x, y);
  }
  if (!xs.length) return { x: 0, y: 0, width: 0, height: 0 };
  const minX = Math.min(...xs) - extra;
  const minY = Math.min(...ys) - extra;
  return { x: minX, y: minY, width: Math.max(...xs) + extra - minX, height: Math.max(...ys) + extra - minY };
}

/** True when every corner has the same radius. */
export function uniformRadii(radii: Radii): boolean {
  const [first] = radii;
  return radii.every((r) => r.x === first.x && r.y === first.y);
}

/** A rounded rectangle with per-corner radii, as path data. */
export function roundedRectPath(box: Box, radii: Radii): string {
  const { x, y, width: w, height: h } = box;
  // A corner with either radius 0 is square, as in CSS
  const [tl, tr, br, bl] = radii.map((r) => (r.x > 0 && r.y > 0 ? r : { x: 0, y: 0 })) as Radii;
  const arc = (r: { x: number; y: number }, ex: number, ey: number) =>
    r.x > 0 ? `A${num(r.x)} ${num(r.y)} 0 0 1 ${num(ex)} ${num(ey)}` : `L${num(ex)} ${num(ey)}`;
  return [
    `M${num(x + tl.x)} ${num(y)}`,
    `H${num(x + w - tr.x)}`,
    arc(tr, x + w, y + tr.y),
    `V${num(y + h - br.y)}`,
    arc(br, x + w - br.x, y + h),
    `H${num(x + bl.x)}`,
    arc(bl, x, y + h - bl.y),
    `V${num(y + tl.y)}`,
    arc(tl, x + tl.x, y),
    "Z",
  ].join("");
}
