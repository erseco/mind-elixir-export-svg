// Used by scripts/compare-layout.mjs: the layout of some data, as topic boxes by id.
import { readMap } from "../src/data.js";
import { layoutMap } from "../src/layout.js";
import { DEFAULT_LIMITS } from "../src/options.js";
import { arialMeasurer } from "../src/text/measure.js";
import { resolveTheme } from "../src/theme.js";

export function layout(data: object) {
  const map = readMap(data, DEFAULT_LIMITS);
  const placed = layoutMap(map, resolveTheme(map.theme), arialMeasurer);
  return Object.fromEntries([...placed.byId].map(([id, p]) => [id, p.topic]));
}
