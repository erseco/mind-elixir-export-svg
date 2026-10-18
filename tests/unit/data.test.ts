import { describe, expect, it } from "vitest";
import { readMap } from "../../src/data.js";
import { DEFAULT_LIMITS } from "../../src/options.js";
import { DARK_THEME, THEME, resolveTheme } from "../../src/theme.js";

const read = (data: unknown, limits = {}) => readMap(data, { ...DEFAULT_LIMITS, ...limits });
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as { code: string }).code;
  }
  return "ok";
};

describe("readMap", () => {
  it("reads nodes with their fields and defaults", () => {
    const map = read({
      nodeData: {
        id: "r",
        topic: "Root",
        children: [
          {
            id: "a",
            topic: "A",
            direction: 0,
            expanded: false,
            branchColor: "#123456",
            style: { color: "red", fontSize: 20, fontWeight: "bold", other: "x" },
            tags: [
              "t",
              { text: "styled", style: { backgroundColor: "#000", color: "#fff" } },
              { text: "bg", style: { background: "#111" } },
              { text: "plain" },
              { nope: 1 },
              3,
            ],
            icons: ["😀", 5],
            hyperLink: "https://x.test",
            image: { url: "data:x", width: 40, height: 30, fit: "contain" },
            children: [{ topic: "deep" }],
          },
          {
            topic: "html",
            dangerouslySetInnerHTML: "<b>x</b>",
            image: { url: "u", width: 0, height: 4 },
            direction: 7,
          },
        ],
      },
    });
    const [a, html] = map.root.children;
    expect(map.nodes).toBe(4);
    expect(a).toMatchObject({
      id: "a",
      direction: 0,
      expanded: false,
      branchColor: "#123456",
      style: { color: "red", fontSize: "20", fontWeight: "bold" },
      tags: [
        { text: "t", background: undefined, color: undefined },
        { text: "styled", background: "#000", color: "#fff" },
        { text: "bg", background: "#111", color: undefined },
        { text: "plain", background: undefined, color: undefined },
      ],
      icons: ["😀"],
      hyperLink: "https://x.test",
      image: { url: "data:x", width: 40, height: 30, fit: "contain" },
    });
    // Nodes without an id are numbered in the order they are read: siblings before children
    expect(html).toMatchObject({ html: true, image: undefined, direction: undefined, id: "3" });
    expect(a?.children[0]).toMatchObject({ id: "4", topic: "deep", expanded: true, image: undefined, html: false });
    expect(map).toMatchObject({ arrows: [], summaries: [], direction: 2, theme: THEME });
  });

  it("reads an instance: its data, theme and direction", () => {
    const instance = { getData: () => ({ nodeData: { topic: "x" } }), theme: DARK_THEME, direction: 1 };
    expect(readMap(instance, DEFAULT_LIMITS)).toMatchObject({ direction: 1, theme: { palette: DARK_THEME.palette } });
    // Options win over the instance, the data's own direction and theme over defaults
    expect(readMap(instance, DEFAULT_LIMITS, THEME, 3)).toMatchObject({
      direction: 3,
      theme: { palette: THEME.palette },
    });
    expect(
      read({
        nodeData: { topic: "x" },
        direction: 0,
        theme: { palette: ["#fff", 1], cssVar: { "--color": "#000", bad: 2 } },
      }),
    ).toMatchObject({
      direction: 0,
      theme: { palette: ["#fff"], cssVar: { "--color": "#000" } },
    });
    expect(read({ nodeData: { topic: "x" }, theme: { palette: "x" }, direction: 9 })).toMatchObject({
      direction: 2,
      theme: THEME,
    });
  });

  it("reads arrows and summaries, dropping what is malformed", () => {
    const map = read({
      nodeData: { topic: "x" },
      arrows: [
        {
          id: "a1",
          label: "L",
          from: "a",
          to: "b",
          delta1: { x: 1, y: 2 },
          delta2: { x: "1" },
          bidirectional: true,
          style: { stroke: "red", strokeWidth: "3", strokeDasharray: "4,4", opacity: "0.5", labelColor: "blue" },
        },
        { from: "a", to: "b", style: { strokeWidth: -1, opacity: "x" } },
        { from: "a" },
        "x",
      ],
      summaries: [
        { id: "s", label: "S", parent: "p", start: 0, end: 1, style: { stroke: "red", labelColor: "blue" } },
        { parent: "p", start: 1, end: 1 },
        { parent: "p", start: 2, end: 1 },
        { parent: "p", start: 0.5, end: 1 },
        { parent: "p", start: -1, end: 1 },
        { start: 0, end: 1 },
      ],
    });
    expect(map.arrows).toEqual([
      {
        id: "a1",
        label: "L",
        from: "a",
        to: "b",
        delta1: { x: 1, y: 2 },
        delta2: undefined,
        bidirectional: true,
        style: { stroke: "red", strokeWidth: 3, strokeDasharray: "4,4", opacity: 0.5, labelColor: "blue" },
      },
      {
        id: "a-b",
        label: "",
        from: "a",
        to: "b",
        delta1: undefined,
        delta2: undefined,
        bidirectional: false,
        style: {},
      },
    ]);
    expect(map.summaries).toEqual([
      { id: "s", label: "S", parent: "p", start: 0, end: 1, style: { stroke: "red", labelColor: "blue" } },
      { id: "p", label: "", parent: "p", start: 1, end: 1, style: {} },
    ]);
  });

  it("refuses what is not a map", () => {
    for (const bad of [
      null,
      3,
      "x",
      {},
      { nodeData: 1 },
      { nodeData: {} },
      { nodeData: { topic: 1 } },
      { nodeData: { topic: "x", children: [1] } },
    ]) {
      expect(code(() => read(bad))).toBe("INVALID_DATA");
    }
  });

  it("enforces the limits, iteratively", () => {
    const wide = { nodeData: { topic: "r", children: Array.from({ length: 10 }, () => ({ topic: "x" })) } };
    expect(code(() => read(wide, { maxNodes: 5 }))).toBe("LIMIT_EXCEEDED");
    expect(code(() => read({ nodeData: { topic: "x".repeat(20) } }, { maxTextLength: 10 }))).toBe("LIMIT_EXCEEDED");
    const pictures = {
      nodeData: { topic: "r", children: [1, 2].map(() => ({ topic: "i", image: { url: "u", width: 1, height: 1 } })) },
    };
    expect(code(() => read(pictures, { maxImages: 1 }))).toBe("LIMIT_EXCEEDED");
    let deep: Record<string, unknown> = { topic: "leaf" };
    for (let i = 0; i < 50_000; i++) deep = { topic: "n", children: [deep] };
    expect(code(() => read({ nodeData: deep }, { maxNodes: 100_000 }))).toBe("LIMIT_EXCEEDED");
    expect(code(() => read({ nodeData: deep }, { maxNodes: 100_000, maxDepth: 60_000 }))).toBe("ok");
  });
});

describe("resolveTheme", () => {
  it("parses the default theme", () => {
    expect(resolveTheme(THEME)).toMatchObject({
      nodeGapX: 30,
      nodeGapY: 10,
      mainGapX: 65,
      mainGapY: 45,
      rootRadius: 30,
      mainRadius: 20,
      topicPadding: 3,
      mapPadding: { top: 50, right: 80, bottom: 50, left: 80 },
      rootBackground: { hex: "#4c4f69", alpha: 1 },
      rootBorder: { hex: "#000000", alpha: 0 },
      mainBorder: null,
      background: { hex: "#f6f6f6", alpha: 1 },
    });
  });

  it("falls back to the default theme, and reads custom borders and paddings", () => {
    const t = resolveTheme({
      palette: [],
      cssVar: {
        "--node-gap-x": "bad",
        "--map-padding": "10px",
        "--main-border": "3px dashed #ff0000",
        "--color": "nope",
      },
    });
    expect(t.palette).toEqual(THEME.palette);
    expect(t.nodeGapX).toBe(30);
    expect(t.mapPadding).toEqual({ top: 10, right: 10, bottom: 10, left: 10 });
    expect(t.mainBorder).toEqual({ width: 3, color: { hex: "#ff0000", alpha: 1 } });
    expect(t.color).toBeNull();
    expect(resolveTheme({ palette: ["#000"], cssVar: { "--main-border": "solid" } }).mainBorder).toEqual({
      width: 2,
      color: null,
    });
    expect(resolveTheme({ palette: ["#000"], cssVar: { "--map-padding": "1px 2px 3px 4px" } }).mapPadding).toEqual({
      top: 1,
      right: 2,
      bottom: 3,
      left: 4,
    });
  });
});
