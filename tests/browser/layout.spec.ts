import { expect, test } from "@playwright/test";
import { readMap } from "../../src/data.js";
import { layoutMap } from "../../src/layout.js";
import { DEFAULT_LIMITS } from "../../src/options.js";
import { arialMeasurer } from "../../src/text/measure.js";
import { resolveTheme } from "../../src/theme.js";
import { MEASURED_FIXTURES, withinTolerance } from "../tolerances.js";
import { dataOf, editorTopics, openMap } from "./support.js";

/**
 * Where the renderer puts each topic, from the data alone, against where Mind Elixir 5.15.1
 * draws it in each browser (Arial). Text in Arial is reproduced exactly in Chromium and WebKit;
 * Firefox sets `line-height: normal` taller (19.5 px for 16 px Arial, not 18), and emoji or CJK
 * use the system's fallback fonts, so those are bounded, not exact. Measured values are in
 * docs/COMPATIBILITY.md.
 */

for (const name of MEASURED_FIXTURES) {
  test(`${name}: topics where Mind Elixir draws them`, async ({ page, browserName }) => {
    await openMap(page, name);
    const editor = await editorTopics(page);
    const map = readMap(dataOf(name), DEFAULT_LIMITS);
    const layout = layoutMap(map, resolveTheme(map.theme, map.compact), arialMeasurer);
    const d = { x: 0, y: 0, width: 0, height: 0 };
    for (const e of editor) {
      const t = layout.byId.get(e.id)?.topic;
      expect(t, `${e.text} is laid out`).toBeDefined();
      for (const k of ["x", "y", "width", "height"] as const) d[k] = Math.max(d[k], Math.abs(t![k] - e[k]));
    }
    expect(layout.nodes.length).toBe(editor.length);
    test.info().annotations.push({
      type: "deviation",
      description: `${name}: ${JSON.stringify(Object.fromEntries(Object.entries(d).map(([k, v]) => [k, +v.toFixed(2)])))}`,
    });
    expect(withinTolerance(name, browserName, d), JSON.stringify(d)).toBe(true);
  });
}
