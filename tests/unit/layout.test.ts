import { describe, expect, it } from "vitest";
import { readMap } from "../../src/data.js";
import { layoutMap, layoutTopic } from "../../src/layout.js";
import { DEFAULT_LIMITS } from "../../src/options.js";
import { arialMeasurer } from "../../src/text/measure.js";
import { DARK_THEME, THEME, resolveTheme } from "../../src/theme.js";
import { FIXTURES, type FixtureName } from "../fixtures.js";
import reference from "./reference.json" with { type: "json" };

const theme = resolveTheme(THEME);
const lay = (data: object, direction?: number) => {
  const map = readMap({ ...data, ...(direction === undefined ? {} : { direction }) }, DEFAULT_LIMITS);
  return layoutMap(map, theme, arialMeasurer);
};

describe("layoutMap against Mind Elixir in Chromium", () => {
  // tests/unit/reference.json: what Mind Elixir 5.15.1 draws in Chromium with Arial
  // (scripts/record-reference.mjs). Text in Arial, so the layout should match it closely.
  // Recorded values have two decimals. Chromium rounds each text's width to 1/64 px its own way
  // (about 0.01 px per topic here), which adds up along the 27 levels of `deep`
  const tolerance = (name: string) => (name === "deep" ? 0.3 : 0.06);
  for (const [name, boxes] of Object.entries(reference.fixtures)) {
    it(`${name}: every topic where Mind Elixir puts it`, () => {
      const fixture = FIXTURES[name as FixtureName];
      const layout = lay(fixture.data, fixture.direction ?? 2);
      let worst = 0;
      for (const [id, [x, y, w, h]] of Object.entries(boxes as Record<string, number[]>)) {
        const t = layout.byId.get(id)?.topic;
        expect(t, id).toBeDefined();
        worst = Math.max(
          worst,
          Math.abs(t!.x - x!),
          Math.abs(t!.y - y!),
          Math.abs(t!.width - w!),
          Math.abs(t!.height - h!),
        );
      }
      expect(worst).toBeLessThanOrEqual(tolerance(name));
      expect(layout.nodes.length).toBe(Object.keys(boxes).length);
    });
  }
});

describe("layoutMap", () => {
  it("puts main nodes on the side they ask for, alternating the others (left first)", () => {
    const layout = lay({
      nodeData: {
        id: "r",
        topic: "R",
        children: ["a", "b", "c", "d"].map((id, i) => ({ id, topic: id, direction: i === 2 ? 1 : undefined })),
      },
    });
    expect(layout.mains.map((m) => [m.node.id, m.side])).toEqual([
      ["a", "lhs"],
      ["d", "lhs"],
      ["b", "rhs"],
      ["c", "rhs"],
    ]);
    // Left nodes are left of the root, right ones right of it
    for (const m of layout.mains)
      expect(m.side === "lhs" ? m.topic.x < layout.root.topic.x : m.topic.x > layout.root.topic.x).toBe(true);
    // Colours follow that order through the palette
    expect(layout.mains.map((m) => m.branchColor)).toEqual(THEME.palette.slice(0, 4));
    // Children stay in data order; `mains` is the left-then-right DOM order
    expect(layout.root.children.map((m) => m.node.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("lays everything out on one side for left and right maps", () => {
    const data = {
      nodeData: {
        topic: "R",
        children: [
          { topic: "a", direction: 1 },
          { topic: "b", direction: 0 },
        ],
      },
    };
    expect(lay(data, 0).mains.every((m) => m.side === "lhs")).toBe(true);
    expect(lay(data, 1).mains.every((m) => m.side === "rhs")).toBe(true);
  });

  it("does not lay out folded children, and keeps branch colours down the tree", () => {
    const layout = lay({
      nodeData: {
        topic: "R",
        children: [
          {
            id: "m",
            topic: "M",
            branchColor: "#010203",
            children: [
              { id: "c", topic: "C", children: [{ id: "g", topic: "G", branchColor: "#aaaaaa" }] },
              { id: "f", topic: "F", expanded: false, children: [{ id: "x", topic: "X" }] },
            ],
          },
        ],
      },
    });
    expect(layout.byId.has("x")).toBe(false);
    expect(layout.byId.get("c")?.branchColor).toBe("#010203");
    expect(layout.byId.get("g")?.branchColor).toBe("#aaaaaa");
    expect(layout.byId.get("f")?.children).toEqual([]);
  });

  it("handles a map with no children and a deep one without recursion", () => {
    expect(lay({ nodeData: { topic: "alone" } }).nodes.length).toBe(1);
    let deep: Record<string, unknown> = { topic: "leaf" };
    for (let i = 0; i < 900; i++) deep = { topic: "n", children: [deep] };
    const layout = lay({ nodeData: { topic: "R", children: [deep] } }, 1);
    expect(layout.nodes.length).toBe(902);
  });

  it("uses Mind Elixir's compact gaps, which win over the theme", () => {
    const data = { nodeData: { topic: "Root", children: [{ topic: "Child" }] } };
    const placed = (compact: boolean) => {
      const map = readMap({ ...data, compact }, DEFAULT_LIMITS);
      return layoutMap(map, resolveTheme(map.theme, map.compact), arialMeasurer);
    };
    expect(placed(true).width).toBeLessThan(placed(false).width);
    const overridden = resolveTheme({ palette: ["#000"], cssVar: { "--node-gap-x": "40px" } }, true);
    expect(overridden).toMatchObject({ nodeGapX: 15, nodeGapY: 2, mainGapX: 30, mainGapY: 6 });
    expect(resolveTheme({ type: "dark", palette: [], cssVar: {} }).palette).toEqual([...DARK_THEME.palette]);
  });
});

describe("layoutTopic", () => {
  const topic = (node: object, kind: "root" | "main" | "sub" = "sub", down = false) => {
    const map = readMap({ nodeData: { topic: "x", ...node } }, DEFAULT_LIMITS);
    return layoutTopic(map.root, kind, down, theme, arialMeasurer);
  };

  it("sizes topics as Mind Elixir's stylesheet does", () => {
    // Measured in Chromium with Arial: a sub topic is 3 + 18 + 3 px tall
    expect(topic({ topic: "Idea" }).height).toBe(24);
    expect(topic({ topic: "Idea" }, "main").height).toBe(38);
    expect(topic({ topic: "Idea" }, "root").height).toBe(53);
    expect(topic({ topic: "Idea" }, "sub", true)).toMatchObject({ height: 32, border: 1, radius: 6 });
    // An empty topic keeps one line
    expect(topic({ topic: "" }).height).toBe(24);
  });

  it("wraps at 35em and then takes all of it", () => {
    const t = topic({ topic: "palabra ".repeat(30) });
    expect(t.width).toBe(560);
    expect(t.text.length).toBeGreaterThan(1);
  });

  it("places image, text, link, icons and tags", () => {
    const t = topic({
      topic: "Text",
      hyperLink: "https://x",
      icons: ["😀", "📌"],
      tags: ["one", { text: "two", style: { color: "red" } }],
      image: { url: "u", width: 40, height: 30 },
      style: { fontWeight: "bold", fontStyle: "italic", fontSize: "20px", color: "#123456", background: "transparent" },
    });
    expect(t.image).toEqual({ x: 3, y: 3, width: 40, height: 30 });
    expect(t.text[0]).toMatchObject({
      text: "Text",
      font: { size: 20, weight: 700, style: "italic" },
      color: { hex: "#123456", alpha: 1 },
    });
    expect(t.link!.x).toBeGreaterThan(t.text[0]!.x + t.text[0]!.width);
    expect(t.icons.map((i) => i.text)).toEqual(["😀", "📌"]);
    expect(t.icons[1]!.x).toBeGreaterThan(t.icons[0]!.x);
    expect(t.tags.map((g) => g.text.text)).toEqual(["one", "two"]);
    // Tags are 12px but keep the topic's weight and style
    expect(t.tags[0]!.text.font).toEqual({ size: 12, weight: 700, style: "italic" });
    expect(t.tags[1]!.text.color).toEqual({ hex: "#ff0000", alpha: 1 });
    expect(t.background).toEqual({ hex: "#000000", alpha: 0 });
    // Image above the text row, tags below it
    expect(t.text[0]!.y).toBeGreaterThan(33);
    expect(t.tags[0]!.box.y).toBeGreaterThan(t.text[0]!.y);
  });

  it("falls back on unknown styles, and draws custom HTML without its content", () => {
    const t = topic({
      topic: "T",
      style: { fontSize: "big", fontWeight: "9999", color: "nope", background: "url(x)" },
    });
    expect(t.font).toEqual({ size: 16, weight: 400, style: "normal" });
    expect(t.color).toEqual(theme.color);
    expect(t.background).toBeNull();
    expect(topic({ topic: "hidden", dangerouslySetInnerHTML: "<b>x</b>" }).text).toEqual([]);
  });

  it("uses the theme's main border width", () => {
    const custom = resolveTheme({ palette: ["#000"], cssVar: { "--main-border": "4px solid #000" } });
    const map = readMap({ nodeData: { topic: "x" } }, DEFAULT_LIMITS);
    expect(layoutTopic(map.root, "main", false, custom, arialMeasurer).border).toBe(4);
  });
});
