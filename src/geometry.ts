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

/** The bounding box of `box` after `matrix`. */
export function transformBox(box: Box, [a, b, c, d, e, f]: Matrix): Box {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [x, y] of [
    [box.x, box.y],
    [box.x + box.width, box.y],
    [box.x, box.y + box.height],
    [box.x + box.width, box.y + box.height],
  ] as const) {
    xs.push(a * x + c * y + e);
    ys.push(b * x + d * y + f);
  }
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/** `m1` then `m2`: the matrix that applies `m1` first. */
export function multiply(m2: Matrix, m1: Matrix): Matrix {
  const [a2, b2, c2, d2, e2, f2] = m2;
  const [a1, b1, c1, d1, e1, f1] = m1;
  return [
    a2 * a1 + c2 * b1,
    b2 * a1 + d2 * b1,
    a2 * c1 + c2 * d1,
    b2 * c1 + d2 * d1,
    a2 * e1 + c2 * f1 + e2,
    b2 * e1 + d2 * f1 + f2,
  ];
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

const NUMBER = /^-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?(?:px)?$/i;

function length(value: string | null): number | null {
  if (value === null || value.trim() === "") return 0;
  const v = value.trim();
  return NUMBER.test(v) ? parseFloat(v) : null;
}

/**
 * Path data for an SVG geometry element (`line`, `polyline`, `polygon`, `rect`, `circle`,
 * `ellipse`) from its attributes. Returns `null` for other elements, and for lengths that are
 * not plain numbers (percentages and units depend on a viewport the export does not have).
 */
export function geometryPath(tag: string, attr: (name: string) => string | null): string | null {
  const n = (...names: string[]) => names.map((name) => length(attr(name)));
  switch (tag) {
    case "line": {
      const [x1, y1, x2, y2] = n("x1", "y1", "x2", "y2");
      if ([x1, y1, x2, y2].some((v) => v === null)) return null;
      return `M${num(x1 as number)} ${num(y1 as number)}L${num(x2 as number)} ${num(y2 as number)}`;
    }
    case "polyline":
    case "polygon": {
      const values = (attr("points") ?? "")
        .trim()
        .split(/[\s,]+/)
        .filter(Boolean);
      if (values.length < 4 || values.length % 2 || values.some((v) => !NUMBER.test(v))) return null;
      const points = [];
      for (let i = 0; i < values.length; i += 2)
        points.push(`${num(parseFloat(values[i] as string))} ${num(parseFloat(values[i + 1] as string))}`);
      return `M${points.join("L")}${tag === "polygon" ? "Z" : ""}`;
    }
    case "rect": {
      const [x, y, w, h, rx, ry] = n("x", "y", "width", "height", "rx", "ry");
      if ([x, y, w, h, rx, ry].some((v) => v === null) || (w as number) <= 0 || (h as number) <= 0) return null;
      // rx alone sets ry, and the other way round, as in SVG
      const rxv = attr("rx") === null ? (ry as number) : (rx as number);
      const ryv = attr("ry") === null ? (rx as number) : (ry as number);
      const r = { x: Math.min(rxv, (w as number) / 2), y: Math.min(ryv, (h as number) / 2) };
      return roundedRectPath({ x: x as number, y: y as number, width: w as number, height: h as number }, [r, r, r, r]);
    }
    case "circle":
    case "ellipse": {
      const [cx, cy, r, rx0, ry0] = n("cx", "cy", "r", "rx", "ry");
      if ([cx, cy, r, rx0, ry0].some((v) => v === null)) return null;
      const rx = tag === "circle" ? (r as number) : (rx0 as number);
      const ry = tag === "circle" ? (r as number) : (ry0 as number);
      if (rx <= 0 || ry <= 0) return null;
      const [x, y] = [cx as number, cy as number];
      return `M${num(x - rx)} ${num(y)}A${num(rx)} ${num(ry)} 0 1 0 ${num(x + rx)} ${num(y)}A${num(rx)} ${num(ry)} 0 1 0 ${num(x - rx)} ${num(y)}Z`;
    }
    default:
      return null;
  }
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
