import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { renderSvg, type SvgExportOptions, type SvgExportResult } from "../../src/index.js";
import { FIXTURES, type Fixture, type FixtureName } from "../fixtures.js";

/**
 * The browser tests use real Mind Elixir as the reference: the renderer works from data alone,
 * and these tests measure how close its layout is to what Mind Elixir draws (with Arial, the
 * font the renderer has metrics for).
 */

const HARNESS = readFileSync(new URL("./.harness/harness.js", import.meta.url), "utf8");
const CSS = readFileSync(new URL("./.harness/mind-elixir.css", import.meta.url), "utf8");

export const fixture = (f: FixtureName | Fixture): Fixture => (typeof f === "string" ? FIXTURES[f] : f);

/** The data `renderSvg` gets for a fixture. */
export const dataOf = (f: FixtureName | Fixture) => {
  const x = fixture(f);
  return { ...(x.data as { nodeData: object }), direction: x.direction ?? 2 };
};

/** Renders a fixture in Node, as an application without a browser would. */
export const renderInNode = (f: FixtureName | Fixture, options?: SvgExportOptions): Promise<SvgExportResult> =>
  renderSvg(dataOf(f), options);

/** A page with real Mind Elixir showing `f` in Arial, and no network. */
export async function openMap(
  page: Page,
  f: FixtureName | Fixture,
  size = { width: 2400, height: 1600 },
): Promise<void> {
  const x = fixture(f);
  await page.setViewportSize(size);
  await page.setContent(
    `<!doctype html><meta charset="utf-8"><body style="margin:0"><div id="map" style="width:${size.width}px;height:${size.height}px"></div>`,
  );
  await page.addStyleTag({
    content: `${CSS} .map-container { font-family: Arial !important } .mind-elixir-toolbar { display: none !important }`,
  });
  await page.addScriptTag({ content: HARNESS });
  await page.evaluate((x) => {
    const { MindElixir } = (window as any).harness;
    const mind = new MindElixir({ el: "#map", direction: x.direction ?? 2 });
    mind.init(structuredClone(x.data));
    (window as any).__mind = mind;
  }, x);
}

export interface EditorTopic {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Every topic Mind Elixir drew, in me-nodes' coordinates (those of the renderer's layout). */
export async function editorTopics(page: Page): Promise<EditorTopic[]> {
  return page.evaluate(() => {
    const nodes = (window as any).__mind.nodes as HTMLElement;
    const o = nodes.getBoundingClientRect();
    return [...nodes.querySelectorAll("me-tpc")].map((t) => {
      const r = t.getBoundingClientRect();
      const id = (t as HTMLElement).dataset.nodeid!.slice(2);
      return { id, text: t.textContent ?? "", x: r.left - o.left, y: r.top - o.top, width: r.width, height: r.height };
    });
  });
}
