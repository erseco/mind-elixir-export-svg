import { expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { elements, parseSvg } from "../unit/helpers.js";
import type { SvgExportOptions, SvgExportResult } from "../../src/index.js";
import { FIXTURES, type Fixture, type FixtureName } from "./fixtures.js";

const HARNESS = readFileSync(new URL("./.harness/harness.js", import.meta.url), "utf8");
const CSS = readFileSync(new URL("./.harness/mind-elixir.css", import.meta.url), "utf8");

export interface MapSetup {
  width?: number;
  height?: number;
  /** "dark" uses Mind Elixir's dark theme, "custom" a theme with its own colours. */
  theme?: "dark" | "custom";
  scaleMax?: number;
  /** Renders `**bold**` and `*italic*` as inline HTML, through Mind Elixir's markdown option. */
  markdown?: boolean;
  /** Mind Elixir instances on the page; the export uses the first. */
  count?: number;
}

/** A page with a real, initialized Mind Elixir map of `fixture`, and no network. */
export async function openMap(page: Page, fixture: FixtureName | Fixture, setup: MapSetup = {}): Promise<void> {
  const f = typeof fixture === "string" ? FIXTURES[fixture] : fixture;
  const { width = 1600, height = 1000, count = 1 } = setup;
  const maps = Array.from(
    { length: count },
    (_, i) => `<div id="map${i}" style="width:${width}px;height:${height}px"></div>`,
  ).join("");
  await page.setContent(
    `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0">${maps}</body></html>`,
  );
  await page.addStyleTag({ content: CSS });
  await page.addScriptTag({ content: HARNESS });
  await page.evaluate(
    ({ f, setup, count }) => {
      const { MindElixir } = (window as any).harness;
      const theme =
        setup.theme === "dark"
          ? MindElixir.DARK_THEME
          : setup.theme === "custom"
            ? {
                ...MindElixir.THEME,
                name: "Custom",
                palette: ["#0b6e4f", "#c84c09", "#3a0ca3", "#d00000"],
                cssVar: {
                  ...MindElixir.THEME.cssVar,
                  "--bgcolor": "#fdf6e3",
                  "--main-color": "#073642",
                  "--main-bgcolor": "#eee8d5",
                  "--root-bgcolor": "#268bd2",
                  "--root-color": "#ffffff",
                },
              }
            : undefined;
      const markdown = setup.markdown
        ? (text: string) =>
            text
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
              .replace(/\*(.+?)\*/g, "<em>$1</em>")
        : undefined;
      const minds = [];
      for (let i = 0; i < count; i++) {
        const mind = new MindElixir({
          el: `#map${i}`,
          direction: f.direction ?? 2,
          ...(theme ? { theme } : {}),
          ...(markdown ? { markdown } : {}),
          ...(setup.scaleMax ? { scaleMax: setup.scaleMax } : {}),
          ...f.mind,
        });
        mind.init(structuredClone(f.data));
        minds.push(mind);
      }
      (window as any).__minds = minds;
      (window as any).__mind = minds[0];
    },
    { f, setup, count },
  );
}

/** Exports the first map on the page. Functions in options cannot cross into the page. */
export async function exportMap(page: Page, options: SvgExportOptions = {}): Promise<SvgExportResult> {
  return page.evaluate(
    (options) => (window as any).harness.renderSvg((window as any).__mind, options),
    options as never,
  );
}

/** What an export must not change. */
export async function editorState(page: Page) {
  return page.evaluate(() => {
    const mind = (window as any).__mind;
    return {
      data: JSON.stringify(mind.getData()),
      scale: mind.scaleVal,
      transform: getComputedStyle(mind.map).transform,
      selected: [...document.querySelectorAll(".selected")].map((e) => e.getAttribute("data-nodeid")),
      elements: document.getElementsByTagName("*").length,
      html: document.body.innerHTML.length,
      history: Array.isArray(mind.history) ? mind.history.length : null,
    };
  });
}

const ALLOWED = new Set([
  "svg",
  "title",
  "desc",
  "defs",
  "clipPath",
  "g",
  "rect",
  "path",
  "text",
  "tspan",
  "image",
  "a",
]);

/** Parses the SVG as XML and checks it is standalone, safe and geometrically valid. */
export function assertValidSvg(result: SvgExportResult) {
  const doc = parseSvg(result.svg);
  const root = doc.documentElement!;
  expect(root.localName).toBe("svg");
  expect(root.namespaceURI).toBe("http://www.w3.org/2000/svg");
  expect(Number.isFinite(result.width) && result.width > 0).toBe(true);
  expect(Number.isFinite(result.height) && result.height > 0).toBe(true);
  const viewBox = result.viewBox.split(" ").map(Number);
  expect(viewBox).toHaveLength(4);
  expect(viewBox.every(Number.isFinite)).toBe(true);
  const all = elements(doc);
  const ids = all.map((e) => e.getAttribute("id")).filter((id): id is string => !!id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const el of all) {
    expect(ALLOWED, `unexpected <${el.localName}>`).toContain(el.localName);
    for (const attr of [...el.attributes]) {
      expect(attr.name.toLowerCase().startsWith("on"), `event handler ${attr.name}`).toBe(false);
      expect(attr.value).not.toMatch(/NaN|Infinity|undefined|\bauto\b/);
      if (attr.name === "href") {
        if (el.localName === "image") expect(attr.value).toMatch(/^data:image\/(png|jpeg|gif|webp|avif);base64,/);
        else expect(attr.value).toMatch(/^(https?:|mailto:)/);
      }
      const ref = /url\(#([^)]+)\)/.exec(attr.value)?.[1];
      if (ref) expect(ids).toContain(ref);
    }
  }
  return doc;
}

/** The text of every line of the SVG, in document order. */
export function svgLines(result: SvgExportResult): string[] {
  const doc = parseSvg(result.svg);
  return elements(doc)
    .filter((e) => e.localName === "tspan" || (e.localName === "text" && !e.getElementsByTagName("tspan").length))
    .map((e) => e.textContent ?? "");
}

/**
 * Checks that every topic of the editor is drawn at the same place in the SVG: a rect with the
 * topic's box (inset by half its border width when the border is drawn), within `tolerance` px.
 */
export async function expectTopicBoxesMatch(page: Page, result: SvgExportResult, tolerance = 0.02) {
  const topics = await page.evaluate(() => {
    const mind = (window as any).__mind;
    const nodes = mind.nodes as HTMLElement;
    const o = nodes.getBoundingClientRect();
    const s = mind.scaleVal as number;
    return [...nodes.querySelectorAll("me-tpc")].map((t) => {
      const r = t.getBoundingClientRect();
      const cs = getComputedStyle(t);
      return {
        text: t.textContent,
        x: (r.left - o.left) / s,
        y: (r.top - o.top) / s,
        width: r.width / s,
        height: r.height / s,
        border: cs.borderTopColor.endsWith(", 0)") ? 0 : parseFloat(cs.borderTopWidth),
        // Child topics are text on their branch line: no box to draw
        drawn:
          !cs.backgroundColor.endsWith(", 0)") ||
          (!cs.borderTopColor.endsWith(", 0)") && parseFloat(cs.borderTopWidth) > 0),
      };
    });
  });
  const rects = [...parseSvg(result.svg).getElementsByTagName("rect")].map((r) => ({
    x: Number(r.getAttribute("x")),
    y: Number(r.getAttribute("y")),
    width: Number(r.getAttribute("width")),
    height: Number(r.getAttribute("height")),
  }));
  expect(topics.filter((t) => t.drawn).length).toBeGreaterThan(0);
  for (const t of topics.filter((t) => t.drawn)) {
    const i = t.border / 2;
    const found = rects.some(
      (r) =>
        Math.abs(r.x - (t.x + i)) <= tolerance &&
        Math.abs(r.y - (t.y + i)) <= tolerance &&
        Math.abs(r.width - (t.width - 2 * i)) <= tolerance &&
        Math.abs(r.height - (t.height - 2 * i)) <= tolerance,
    );
    expect(found, `topic "${t.text}" at ${t.x},${t.y} ${t.width}×${t.height}`).toBe(true);
  }
}
