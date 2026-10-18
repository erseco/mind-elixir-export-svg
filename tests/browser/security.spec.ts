import { expect, test, type Page } from "@playwright/test";
import { PNG_DATA_URL, type Fixture } from "./fixtures.js";
import { assertValidSvg, editorState, exportMap, openMap } from "./support.js";

/** Map data is hostile input: images, links and sizes are checked, and nothing is fetched. */

const PNG_BASE64 = PNG_DATA_URL.split(",")[1]!;
const SVG_AS_PNG = `data:image/png;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script></svg>').toString("base64")}`;

const withImage = (url: string): Fixture => ({
  direction: 1,
  data: {
    nodeData: {
      id: "r",
      topic: "Root",
      children: [{ id: "i", topic: "Picture", image: { url, width: 40, height: 30 } }],
    },
  },
});

/** Records every request the page makes; blocks any that would leave it. */
async function recordRequests(page: Page): Promise<string[]> {
  const requests: string[] = [];
  page.on("request", (r) => {
    if (!r.url().startsWith("data:")) requests.push(r.url());
  });
  await page.route(/^https?:/, (route) => route.abort());
  return requests;
}

test("embeds data: images after checking their bytes", async ({ page }) => {
  await openMap(page, withImage(PNG_DATA_URL));
  const result = await exportMap(page);
  const image = assertValidSvg(result).getElementsByTagName("image")[0];
  expect(image?.getAttribute("href")).toBe(`data:image/png;base64,${PNG_BASE64}`);
  expect(["width", "height", "preserveAspectRatio"].map((a) => image?.getAttribute(a))).toEqual([
    "40",
    "30",
    "xMidYMid slice",
  ]);
  expect(result.warnings).toEqual([]);
});

test("refuses an SVG disguised as a PNG", async ({ page }) => {
  await openMap(page, withImage(SVG_AS_PNG));
  const result = await exportMap(page);
  expect(assertValidSvg(result).getElementsByTagName("image").length).toBe(0);
  expect(result.warnings).toEqual([expect.objectContaining({ code: "IMAGE_NOT_EMBEDDED", nodeId: "i" })]);
  expect(result.svg).not.toContain("alert");
});

test("does not fetch remote images; a resolver can supply them", async ({ page }) => {
  const requests = await recordRequests(page);
  await openMap(page, withImage("https://images.test/photo.png"));
  // The editor's own <img> tries (and fails) to load it: wait for that to settle first
  await page.waitForFunction(() => (document.querySelector("me-tpc img") as HTMLImageElement).complete);
  const before = requests.length;
  const result = await exportMap(page);
  // The export itself makes no request
  expect(requests.length).toBe(before);
  expect(assertValidSvg(result).getElementsByTagName("image").length).toBe(0);
  expect(result.warnings.map((w) => w.code)).toEqual(["IMAGE_NOT_EMBEDDED"]);

  const resolved = await page.evaluate(async (b64) => {
    const seen: string[] = [];
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const r = await (window as any).harness.renderSvg((window as any).__mind, {
      resolveImage: (url: string, { signal }: { signal?: AbortSignal }) => {
        seen.push(`${url} ${signal === undefined}`);
        return new Blob([bytes], { type: "image/png" });
      },
    });
    return { seen, svg: r.svg, warnings: r.warnings };
  }, PNG_BASE64);
  expect(resolved.seen).toEqual(["https://images.test/photo.png true"]);
  expect(resolved.svg).toContain(`data:image/png;base64,${PNG_BASE64}`);
  expect(resolved.warnings).toEqual([]);
  expect(requests.length).toBe(before);
});

test("checks what a resolver returns", async ({ page }) => {
  await openMap(page, withImage("asset://photo"));
  const results = await page.evaluate(async (svgAsPng) => {
    const run = (resolveImage: unknown) =>
      (window as any).harness
        .renderSvg((window as any).__mind, { resolveImage })
        .then((r: any) => r.warnings.map((w: any) => w.message));
    return {
      nothing: await run(() => null),
      svg: await run(() => svgAsPng),
      text: await run(() => "not a data url"),
      object: await run(() => ({})),
      throws: await run(() => {
        throw new Error("offline");
      }),
      big: await run(() => new Blob([new Uint8Array(6 * 1024 * 1024)])),
    };
  }, SVG_AS_PNG);
  expect(results.nothing[0]).toMatch(/returned nothing/);
  expect(results.svg[0]).toMatch(/not PNG, JPEG, GIF, WebP or AVIF/);
  expect(results.text[0]).toMatch(/Blob or a base64 data: URL/);
  expect(results.object[0]).toMatch(/Blob or a base64 data: URL/);
  expect(results.throws[0]).toMatch(/resolveImage failed \(offline\)/);
  expect(results.big[0]).toMatch(/larger than/);
});

test("reads blob: images locally, and can leave images out", async ({ page, browserName }) => {
  await openMap(page, withImage(PNG_DATA_URL));
  const out = await page.evaluate(async (b64) => {
    const { renderSvg } = (window as any).harness;
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
    const mind = (window as any).__mind;
    const img = mind.nodes.querySelector("me-tpc img") as HTMLImageElement;
    img.src = url;
    await img.decode();
    const embedded = await renderSvg(mind);
    const omitted = await renderSvg(mind, { embedImages: false });
    // Revoked while still displayed: Chromium and WebKit can no longer read it, Firefox can
    URL.revokeObjectURL(url);
    const revoked = await renderSvg(mind);
    // An image the editor fails to load is shown broken, so it is not exported. Firefox keeps
    // showing the previous image instead (naturalWidth and currentSrc stay), and exports that
    const failed = new Promise((resolve) => (img.onerror = resolve));
    img.src = `${url.slice(0, url.lastIndexOf("/") + 1)}00000000-0000-4000-8000-000000000000`;
    await failed;
    const broken = await renderSvg(mind);
    return {
      embedded: embedded.svg.includes(`base64,${b64}`),
      omitted: omitted.warnings[0]?.message,
      revoked: revoked.svg.includes(`base64,${b64}`) ? "embedded" : revoked.warnings[0]?.message,
      broken: broken.svg.includes(`base64,${b64}`) ? "embedded" : broken.warnings[0]?.message,
    };
  }, PNG_BASE64);
  expect(out.embedded).toBe(true);
  expect(out.omitted).toMatch(/embedImages: false/);
  expect(out.revoked).toMatch(/^embedded$|blob: URL could not be read/);
  expect(out.broken).toMatch(browserName === "firefox" ? /^embedded$/ : /the editor could not load it/);
});

test("keeps only http, https and mailto links", async ({ page }) => {
  await openMap(page, "hostile");
  const result = await exportMap(page);
  const doc = assertValidSvg(result);
  expect(doc.getElementsByTagName("a").length).toBe(0);
  expect(result.warnings).toEqual([expect.objectContaining({ code: "UNSAFE_LINK" })]);
  expect(result.svg).not.toContain("javascript:");
});

test("strict mode refuses what it would otherwise warn about", async ({ page }) => {
  await openMap(page, withImage("https://images.test/photo.png"));
  const code = await page.evaluate(() =>
    (window as any).harness
      .renderSvg((window as any).__mind, { strict: true })
      .catch((e: any) => `${e.name}:${e.code}`),
  );
  expect(code).toBe("SvgExportError:IMAGE_NOT_EMBEDDED");
});

test("custom HTML: boxes, text and images only, with a warning; scripts never run", async ({ page }) => {
  const html =
    '<b>Bold</b> <i>it</i><script>window.__ran = true</script><iframe src="https://x.test"></iframe><svg><circle r="5"/></svg>';
  await recordRequests(page);
  await openMap(page, {
    direction: 1,
    data: { nodeData: { id: "r", topic: "Root", children: [{ id: "h", topic: "", dangerouslySetInnerHTML: html }] } },
  });
  const result = await exportMap(page);
  const doc = assertValidSvg(result);
  expect([...doc.getElementsByTagName("tspan")].map((t) => t.textContent).join("")).toContain("Bold it");
  expect(new Set(result.warnings.map((w) => w.code))).toEqual(new Set(["UNSUPPORTED_HTML"]));
  expect(await page.evaluate(() => (window as any).__ran)).toBeUndefined();
});

test("resource limits stop the export", async ({ page }) => {
  await openMap(page, "large");
  const codes = await page.evaluate(async () => {
    const run = (limits: object) =>
      (window as any).harness.renderSvg((window as any).__mind, { limits }).then(
        () => "ok",
        (e: any) => `${e.code}: ${e.message}`,
      );
    return {
      nodes: await run({ maxNodes: 100 }),
      text: await run({ maxTextLength: 500 }),
      output: await run({ maxOutputLength: 10_000 }),
      fine: await run({ maxNodes: 311 }),
    };
  });
  expect(codes.nodes).toBe("LIMIT_EXCEEDED: The map has 311 nodes; the limit is 100");
  expect(codes.text).toMatch(/^LIMIT_EXCEEDED: The map has more than 500 characters/);
  expect(codes.output).toMatch(/^LIMIT_EXCEEDED: The SVG would be longer than 10000/);
  expect(codes.fine).toBe("ok");
  await openMap(page, withImage(PNG_DATA_URL));
  expect(
    await page.evaluate(() =>
      (window as any).harness.renderSvg((window as any).__mind, { limits: { maxImages: 0 } }).catch((e: any) => e.code),
    ),
  ).toBe("LIMIT_EXCEEDED");
});

test("can be cancelled, before and during the export, leaving the editor as it was", async ({ page }) => {
  await openMap(page, "large");
  const before = await editorState(page);
  const codes = await page.evaluate(async () => {
    const { renderSvg } = (window as any).harness;
    const mind = (window as any).__mind;
    const early = new AbortController();
    early.abort();
    const a = await renderSvg(mind, { signal: early.signal }).catch((e: any) => e.code);
    // Aborted while waiting for fonts
    const late = new AbortController();
    const fonts = document.fonts;
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { status: "loading", ready: new Promise(() => {}), check: () => true, forEach() {} },
    });
    const pending = renderSvg(mind, { signal: late.signal, fontTimeout: 60_000 }).catch((e: any) => e.code);
    late.abort();
    const b = await pending;
    Object.defineProperty(document, "fonts", { configurable: true, value: fonts });
    return [a, b];
  });
  expect(codes).toEqual(["ABORTED", "ABORTED"]);
  expect(await editorState(page)).toEqual(before);
});

test("refuses what is not an initialized, attached map", async ({ page }) => {
  await openMap(page, "three");
  const codes = await page.evaluate(async () => {
    const { renderSvg } = (window as any).harness;
    const run = (m: unknown, o?: unknown) =>
      renderSvg(m, o).then(
        () => "ok",
        (e: any) => e.code,
      );
    const detached = { nodes: document.createElement("me-nodes") };
    const empty = document.createElement("div");
    document.body.append(empty);
    const result = [
      await run(null),
      await run({}),
      await run({ nodes: "x" }),
      await run(detached),
      await run({ nodes: empty }),
      await run((window as any).__mind, { padding: -1 }),
    ];
    empty.remove();
    return result;
  });
  expect(codes).toEqual([
    "NOT_INITIALIZED",
    "NOT_INITIALIZED",
    "NOT_INITIALIZED",
    "NOT_INITIALIZED",
    "INVALID_GEOMETRY",
    "INVALID_OPTIONS",
  ]);
});

test("offline: the export makes no request of any kind", async ({ page }) => {
  const requests = await recordRequests(page);
  await openMap(page, "features");
  const before = requests.length;
  for (const name of ["rich", "unicode", "features"] as const) {
    await openMap(page, name);
    await exportMap(page);
  }
  expect(requests.length).toBe(before);
  expect(requests).toEqual([]);
});
