# Using it in eXeLearning

[eXeLearning](https://github.com/exelearning/exelearning) edits mind maps with Mind Elixir inside
its TinyMCE plugin `exemindmap`
([#2557](https://github.com/exelearning/exelearning/pull/2557)). On save, the editor
(`editor/src/editor.ts`) gives the plugin dialog the map's JSON (`mindmapCode`, the editable
source) and a view of it: a PNG drawn with modern-screenshot (`mindmapImgToSave`,
`mindmapImgSize`) or Mermaid code (`mindmapDiagram`). This package can replace that view with an
SVG that looks like the editor. Nothing below changes eXeLearning; it is how a change there could
look.

## The model

```
Mind Elixir JSON  ──  editable source (.exe-mindmap-code), unchanged
       │
       └──  SVG, made in the author's browser when the map is saved
              │
              └── HTML5, SCORM, EPUB, LMS, offline, print: a static file, no Mind Elixir
```

The JSON stays the source of truth and the SVG is derived: regenerated on every save, never
edited. Exports (including server and CLI exports) reuse the saved SVG, so no browser is needed
to publish. Legacy maps (mindmaps JSON with a PNG) and maps saved as PNG or Mermaid keep working:
the stored JSON is all the editor needs to reopen any of them, and the SVG appears the next time
the map is saved.

## Saving an SVG instead of a PNG

In `editor/src/editor.ts`, the PNG render (`renderMap`, `trimCanvas` and modern-screenshot) is
replaced by `renderSvg`:

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
    padding: 20,
    background: "#ffffff",
    title: data.nodeData.topic,
    // Unique per map, in case several SVGs are ever inlined in one page
    idPrefix: `mindmap-${data.nodeData.id}`,
  });
  if (warnings.length) console.warn("Mind map export:", warnings);
  current?.pluginDialog?.setData({
    mindmapImgToSave: `data:image/svg+xml;base64,${base64(svg)}`,
    mindmapImgSize: `${Math.round(width)}x${Math.round(height)}`,
    mindmapCode: serializeStoredCode(data, previousMeta),
  });
  // … the rest of save() as it is
}
```

The plugin then inserts it as it inserts the PNG today (`<figure>`, `<img width height alt>`,
the caption, `.exe-mindmap-code`). Before relying on it, check that eXeLearning's asset handling
turns an `image/svg+xml` `data:` URL into a stored asset as it does for PNG; if it does not, the
plugin can insert the SVG through the same asset upload the image dialog uses. modern-screenshot
and `@erseco/mind-elixir-export-mermaid` are then no longer needed by the editor.

Images inside maps: eXeLearning shows assets in the editor through its own URLs. Pass a resolver
so the SVG embeds them instead of leaving them out:

```ts
await renderSvg(mind, {
  resolveImage: async (url, { signal }) => (await fetch(url, { signal })).blob(),
});
```

(Only for URLs the application trusts; the exporter checks that the bytes are a raster image.)

## Embedding: the options

|                                           | `<img src="map.svg">` (an asset)     | Inline `<svg>` in the page     | `data:` URL       |
| ----------------------------------------- | ------------------------------------ | ------------------------------ | ----------------- |
| Self-contained package                    | Yes, one more file                   | Yes                            | Yes               |
| Text searchable and selectable by readers | No (it is an image)                  | Yes                            | No                |
| Survives HTML sanitizers (LMS, EPUB)      | Yes                                  | Often stripped or altered      | Sometimes blocked |
| Content Security Policy                   | `img-src 'self'`                     | Nothing extra                  | `img-src data:`   |
| Ids clash with other maps                 | No                                   | Unless `idPrefix` differs      | No                |
| Accessible name                           | The `<img alt>` (the plugin's title) | `<title>` + the figure caption | The `<img alt>`   |

**Recommendation:** store the SVG as an asset and reference it from `<img>`, as the PNG is now:
it is the most robust across SCORM players, LMSs and EPUB readers, needs no CSP change, and keeps
the alternative text where eXeLearning already puts it. Serve it as `image/svg+xml` (EPUB and
most servers do; some LMS file servers need the MIME type configured). Inline SVG is better for
search and text selection but is more often altered by sanitizers.

For print and PDF the SVG is vector and scales without loss; see COMPATIBILITY.md for svg2pdf.js
and resvg.

## Fonts in published content

The SVG names the editor's font stack (Mind Elixir's default is the system UI font). A reader on
another system sees the same layout drawn with that system's UI font; `textLength` keeps each
line at its measured width, so nothing overflows its node. Emoji and scripts the reader's fonts
lack are the reader's fonts' business, as in HTML. To pin the look, give the editor a font
eXeLearning ships with its exports (for example through the theme) and the SVG will name it.

## A PNG when SVG is not an option

If a consumer cannot display SVG, rasterize the SVG (not the editor): draw it in an `<img>`, then
on a canvas.

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

This is not part of the package: it is optional and needs a canvas.

## Tested against eXeLearning's maps

eXeLearning's mind map tests use three legacy maps: a rich 16-node one (accents, emoji, CJK,
quotes, `&`, `<clima>`, sizes, bold, italic, underline, strike-through, colours, a folded
branch, both sides, five levels, a long label), a 3-node one and a 311-node one. That fixture is
AGPL-licensed and is not copied here; `tests/browser/fixtures.ts` has original maps with the
same features (`rich`, `three`, `large`), which every browser test exports.
