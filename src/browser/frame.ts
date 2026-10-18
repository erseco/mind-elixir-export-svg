import { SvgExportError } from "../errors.js";
import type { Box } from "../geometry.js";

/**
 * Maps screen geometry (`getBoundingClientRect`) to the map's layout space: CSS pixels relative
 * to `me-nodes`, before the editor's zoom and pan. CSS transforms do not change layout, so this
 * is the same at any zoom level, and nothing in the editor has to change to measure it.
 */
export interface Frame {
  origin: { left: number; top: number };
  scaleX: number;
  scaleY: number;
  toLocal(rect: { left: number; top: number; width: number; height: number }): Box;
}

function transformScale(style: CSSStyleDeclaration): [number, number] {
  let sx = 1;
  let sy = 1;
  const t = style.transform;
  if (t && t !== "none") {
    const m = new DOMMatrix(t);
    if (Math.abs(m.b) > 1e-6 || Math.abs(m.c) > 1e-6) {
      throw new SvgExportError(
        "INVALID_GEOMETRY",
        "The map is rotated or skewed; only scaling and moving are supported",
      );
    }
    sx *= Math.abs(m.a);
    sy *= Math.abs(m.d);
  }
  // The individual `scale` property applies on top of `transform`
  const s = style.scale;
  if (s && s !== "none") {
    const [x, y = x] = s.split(/\s+/).map(Number);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      sx *= Math.abs(x as number);
      sy *= Math.abs(y as number);
    }
  }
  return [sx, sy];
}

export function createFrame(nodes: HTMLElement): Frame {
  let scaleX = 1;
  let scaleY = 1;
  for (let el: Element | null = nodes; el; el = el.parentElement) {
    const [sx, sy] = transformScale(getComputedStyle(el));
    scaleX *= sx;
    scaleY *= sy;
  }
  const rect = nodes.getBoundingClientRect();
  // Anything else that scales (CSS `zoom`, a scaled iframe…) shows up as a mismatch between
  // the drawn and the laid-out size: trust what was drawn then
  if (nodes.offsetWidth > 50 && rect.width > 0) {
    const measured = rect.width / nodes.offsetWidth;
    if (Math.abs(measured - scaleX) / measured > 0.02) {
      scaleY *= measured / scaleX;
      scaleX = measured;
    }
  }
  if (!(scaleX > 0) || !(scaleY > 0) || !Number.isFinite(scaleX) || !Number.isFinite(scaleY)) {
    throw new SvgExportError("INVALID_GEOMETRY", "The map has no size; is it displayed?");
  }
  const origin = { left: rect.left, top: rect.top };
  return {
    origin,
    scaleX,
    scaleY,
    toLocal: (r) => ({
      x: (r.left - origin.left) / scaleX,
      y: (r.top - origin.top) / scaleY,
      width: r.width / scaleX,
      height: r.height / scaleY,
    }),
  };
}
