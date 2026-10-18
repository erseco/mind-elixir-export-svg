# Using it in eXeLearning

[eXeLearning](https://github.com/exelearning/exelearning) edits mind maps with Mind Elixir in its
TinyMCE plugin `exemindmap` ([#2557](https://github.com/exelearning/exelearning/pull/2557)). On
save, the editor (`editor/src/editor.ts`) gives the plugin the map's JSON (`mindmapCode`, the
editable source) and a view of it: a PNG made with modern-screenshot (`mindmapImgToSave`,
`mindmapImgSize`) or Mermaid code (`mindmapDiagram`). This package replaces both views with one
SVG that looks like the editor. Nothing here changes eXeLearning; it is how a change there could
look.

## The model

```
Mind Elixir JSON  ──  editable source (.exe-mindmap-code), unchanged
       │
       └── renderSvg(json)  ── in the editor on save, or on the server when exporting
              │
              └── HTML5, SCORM, EPUB, LMS, offline, print: a static SVG, no Mind Elixir
```

The JSON stays the source of truth; the SVG is derived from it. Because the SVG needs only the
JSON, it can be made in the editor when the map is saved and also on the server: an export can
render maps that were never saved with this version (legacy mindmaps maps converted on the fly,
maps stored as PNG or Mermaid) without a browser.

## Saving the SVG

In `editor/src/editor.ts`, the PNG (`renderMap`, `trimCanvas`, modern-screenshot) and the
Mermaid code (`contentDiagram`) give way to `renderSvg`:

```ts
import { renderSvg } from "@erseco/mind-elixir-export-svg";

/** UTF-8 safe base64, for a data: URL. */
function base64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Hands the map to the plugin dialog and closes the editor. */
async function save(): Promise<void> {
  const current = host();
  const data = mind.getData();
  const { svg, width, height, warnings } = await renderSvg(mind, {
    title: data.nodeData.topic,
    // Unique per map, in case several SVGs are ever inlined in one page
    idPrefix: `mindmap-${data.nodeData.id}`,
  });
  if (warnings.length) console.warn("Mind map SVG:", warnings);
  current?.pluginDialog?.setData({
    mindmapImgToSave: `data:image/svg+xml;base64,${base64(svg)}`,
    mindmapImgSize: `${Math.round(width)}x${Math.round(height)}`,
    mindmapCode: serializeStoredCode(data, previousMeta),
  });
  // … the rest of save() as it is
}
```

and the editor's map uses the font the SVG is laid out for, so both look the same:

```css
.map-container {
  font-family: Arial, Helvetica, "Liberation Sans", Arimo, sans-serif;
}
```

The plugin inserts the SVG as it inserts the PNG today (`<figure>`, `<img width height alt>`, the
caption, `.exe-mindmap-code`); the PNG/SVG choice in the dialog is no longer needed. Before
relying on it, check that eXeLearning's asset handling turns an `image/svg+xml` `data:` URL into
a stored asset as it does for PNG. modern-screenshot and `@erseco/mind-elixir-export-mermaid`
are then no longer needed by the editor.

Images inside maps: Mind Elixir shows them through the URLs in the map's data; pass a resolver
for URLs that are not `data:` URLs, so the SVG embeds them:

```ts
await renderSvg(mind, { resolveImage: async (url, { signal }) => (await fetch(url, { signal })).blob() });
```

(Only for URLs the application trusts; the renderer checks that the bytes are a raster image.)

## On the server

Server and CLI exports (Bun) can render any stored map, with the same result as the editor:

```ts
import { renderSvg } from "@erseco/mind-elixir-export-svg";

const data = JSON.parse(decodeHtmlEntities(storedCode)); // the .exe-mindmap-code JSON
const { svg } = await renderSvg(data, { title: caption });
```

Legacy mindmaps JSON goes through eXeLearning's existing converter (`storedMindmap.ts`) first;
this package reads Mind Elixir data only.

## Embedding: the options

|                                           | `<img src="map.svg">` (an asset) | Inline `<svg>`                   | `data:` URL       |
| ----------------------------------------- | -------------------------------- | -------------------------------- | ----------------- |
| Self-contained package                    | Yes, one more file               | Yes                              | Yes               |
| Text searchable and selectable by readers | No (it is an image)              | Yes                              | No                |
| Survives HTML sanitizers (LMS, EPUB)      | Yes                              | Often stripped or altered        | Sometimes blocked |
| Content Security Policy                   | `img-src 'self'`                 | Nothing extra                    | `img-src data:`   |
| Ids clash with other maps                 | No                               | Unless `idPrefix` differs        | No                |
| Accessible name                           | The `<img alt>`                  | `<title>` and the figure caption | The `<img alt>`   |

**Recommendation:** store it as an asset and reference it from `<img>`, as the PNG is now: the
most robust across SCORM players, LMSs and EPUB readers, no CSP change, and the alternative text
stays where eXeLearning puts it. Serve it as `image/svg+xml` (some LMS file servers need the MIME
type configured). It prints and converts to PDF as vectors (COMPATIBILITY.md).

## Fonts in published content

The SVG names Arial and its metric-compatible equivalents (Helvetica, Liberation Sans, Arimo),
which every desktop system has one of, and `textLength` keeps each line at its computed width
when a reader's font differs. Emoji and scripts Arial lacks are drawn by the reader's fonts.

## A PNG when SVG is not an option

Rasterize the SVG, not the editor: draw it in an `<img>`, then on a canvas. This is not part of
the package; it needs a browser.

```ts
async function svgToPng(svg: string, width: number, height: number, scale = 2): Promise<Blob> {
  const img = new Image();
  img.src = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(height * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"),
    );
  } finally {
    URL.revokeObjectURL(img.src);
  }
}
```

## Tested against eXeLearning's maps

eXeLearning's mind map tests use three legacy maps: a rich 16-node one (accents, emoji, CJK,
quotes, `&`, `<clima>`, sizes, styles, colours, a folded branch, both sides, five levels, a long
label), a 3-node one and a 311-node one. That fixture is AGPL-licensed and is not copied here;
`tests/fixtures.ts` has original maps with the same features (`rich`, `three`, `large`).
