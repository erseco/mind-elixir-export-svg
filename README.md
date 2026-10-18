# mind-elixir-export-svg

Export [Mind Elixir](https://github.com/SSShooter/mind-elixir-core) mind maps as standalone
SVG that looks like the editor: real vector shapes, real `<text>`, the editor's own layout, and
nothing else needed to display it.

```ts
import { renderSvg } from "@erseco/mind-elixir-export-svg";

const { svg, width, height, warnings } = await renderSvg(mind);
```

- **Native SVG only.** Rects, paths, `<text>`/`<tspan>` and, for pictures already in the map,
  `<image>`. No `foreignObject`, no screenshot, no stylesheet, no script, no web fonts, no
  network.
- **The editor's geometry.** Positions, sizes, line breaks, branch curves, arrows and summaries
  are read from the map the browser laid out, so the SVG matches what the author saw. The
  editor's zoom and pan do not change the result.
- **Read-only.** Exporting does not change the map, its zoom, selection, folding or history, and
  leaves nothing in the document.
- **Safe with hostile maps.** Captions stay text, links and images are allow-listed, sizes are
  limited, and failures are typed errors or explicit warnings, never a silently incomplete SVG.

It needs a browser: the geometry comes from the browser's layout of the live map. Importing the
package anywhere (Node, Bun, a worker) is safe; only the export functions use the DOM.

## Why not the alternatives

|                             | PNG screenshot          | Mermaid + Pele       | This package                         |
| --------------------------- | ----------------------- | -------------------- | ------------------------------------ |
| Vector shapes               | No                      | Yes                  | Yes                                  |
| Selectable, searchable text | No                      | Yes                  | Yes                                  |
| Mind Elixir's own layout    | A picture of it         | No, Mermaid's layout | Yes                                  |
| Per-node styles and colours | Captured                | Bold and italic only | Yes                                  |
| Arrows, summaries, tags     | Captured                | Not exported         | Yes                                  |
| Browser-free generation     | Depends on the renderer | Yes                  | No (see [Limitations](#limitations)) |
| Offline viewing             | Yes                     | Yes                  | Yes                                  |
| Scales for print            | No                      | Yes                  | Yes                                  |

Mind Elixir's own `exportSvg()` is deprecated: it puts every caption in a `foreignObject` (which
SVG-to-PDF tools such as svg2pdf.js cannot draw), writes CSS values such as `width="auto"`
into attributes, inserts captions as HTML (`innerHTML`), and leaves out the labels of arrows and
summaries ([#230](https://github.com/SSShooter/mind-elixir-core/issues/230),
[#359](https://github.com/SSShooter/mind-elixir-core/issues/359)).
[@erseco/mind-elixir-export-mermaid](https://github.com/erseco/mind-elixir-export-mermaid)
keeps a map's structure as Mermaid code, which is lighter but drawn in Mermaid's own layout.

## Install

Not published to npm yet. Once it is:

```sh
npm install @erseco/mind-elixir-export-svg
```

`mind-elixir` 5.15.1 or later 5.x is a peer dependency; the package has no dependencies of its
own.

## Use

```ts
import { renderSvg, exportSvg, downloadSvg } from "@erseco/mind-elixir-export-svg";

// The SVG document and what it measures
const result = await renderSvg(mind, { padding: 24, title: "Photosynthesis" });
result.svg; // '<svg xmlns="http://www.w3.org/2000/svg" width="1483.72" height="250" ...'
result.viewBox; // "56 81 1483.72 250"
result.warnings; // [{ code: "IMAGE_NOT_EMBEDDED", message: "...", nodeId: "a1" }]

// As a Blob (image/svg+xml;charset=utf-8), or as a download
const blob = await exportSvg(mind);
await downloadSvg(mind, "photosynthesis.svg");
```

As a Mind Elixir plugin, it adds `mind.exportVectorSvg()` (Mind Elixir's deprecated `exportSvg`
is left alone):

```ts
import { createSvgExportPlugin, type WithVectorSvgExport } from "@erseco/mind-elixir-export-svg";

mind.install(createSvgExportPlugin({ background: "transparent" }));
const { svg } = await (mind as WithVectorSvgExport<typeof mind>).exportVectorSvg();
```

### Options

| Option         | Default         |                                                                                                                               |
| -------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `padding`      | `24`            | Space around the map, in px.                                                                                                  |
| `background`   | `"theme"`       | The map's background colour; `"transparent"`; or `#hex`, `rgb()`, `rgba()`.                                                   |
| `title`        | root topic      | The SVG's accessible name (`<title>`).                                                                                        |
| `description`  | none            | Its accessible description (`<desc>`).                                                                                        |
| `idPrefix`     | `"mindmap-svg"` | Prefix of the ids in the SVG; give each map on a page its own.                                                                |
| `waitForFonts` | `true`          | Wait for web fonts before measuring text.                                                                                     |
| `fontTimeout`  | `3000`          | How long to wait for them, in ms.                                                                                             |
| `textLength`   | `true`          | Write each line's measured width as `textLength`, so viewers with other font metrics fit it.                                  |
| `links`        | `"preserve"`    | Node links become SVG links (http, https and mailto only); `"text"` keeps only their text.                                    |
| `embedImages`  | `true`          | Embed the map's images.                                                                                                       |
| `resolveImage` | none            | `(url, { signal }) => Blob \| dataURL \| null` for images that are not `data:` or `blob:` URLs.                               |
| `strict`       | `false`         | Throw instead of warning when something cannot be exported faithfully.                                                        |
| `signal`       | none            | An `AbortSignal` to cancel the export.                                                                                        |
| `limits`       | see below       | `maxNodes` (10,000), `maxTextLength` (1,000,000), `maxImages` (200), `maxImageBytes` (5 MiB), `maxOutputLength` (50,000,000). |

### Errors and warnings

Failures throw `SvgExportError` with a `code`: `NOT_INITIALIZED`, `INVALID_OPTIONS`,
`INVALID_GEOMETRY`, `LIMIT_EXCEEDED`, `ABORTED`, or, in strict mode, the code of the warning
that would have been reported. Warnings are `{ code, message, nodeId? }`:

| Code                 | When                                                                                            |
| -------------------- | ----------------------------------------------------------------------------------------------- |
| `FONT_UNAVAILABLE`   | A web font was still loading after `fontTimeout`, or failed to load.                            |
| `IMAGE_NOT_EMBEDDED` | An image was left out: remote without a resolver, not a raster image, too large, or not loaded. |
| `UNSUPPORTED_HTML`   | Custom HTML, inline SVG, `<iframe>`, `<video>`… inside a node.                                  |
| `UNSUPPORTED_STYLE`  | Background images, box shadows, borders that differ per side, colours it cannot convert.        |
| `UNSAFE_LINK`        | A link that is not http, https or mailto; its text is kept.                                     |
| `INVALID_GEOMETRY`   | A path of the map with invalid data was left out.                                               |

## What is exported

Everything Mind Elixir draws in the map: topics with their background, border, radius, padding
and text styles (font, size, weight, style, colour, letter spacing, the decorations the editor
displays); the root; branch lines; tags; icons; node links (the 🔗); images; the collapsed-branch
indicator; arrows, with their heads, dashes, colours, widths and labels; summaries with their
brackets and labels; and the theme's background. Editor UI is not: selection outlines, toolbars,
context menus, drag previews, the editing box and arrow handles. Folded branches are exported as
the editor shows them, folded.

Text keeps the editor's exact line breaks: every line becomes a `<tspan>` placed where the
browser drew it, on its baseline (see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)). Unicode is
kept as written, including combining marks, emoji sequences and right-to-left scripts.

## Limitations

- **A browser is required to export.** Positions, line breaks and text widths come from the
  browser's layout. An export made in the author's browser (when a map is saved, for example) is
  a static file anyone can display; there is no browser-free renderer yet (see
  [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#portable-renderer)).
- **Fonts are referenced, not embedded.** The SVG names the editor's font stack. A viewer with
  other fonts draws other glyphs; `textLength` keeps every line at its measured width so nothing
  overflows, but emoji and complex scripts depend on the viewer's fonts.
- **Custom HTML** (`dangerouslySetInnerHTML`, rich markdown) is exported as its boxes, text and
  images, with a warning; anything else in it (inline SVG, iframes, media) is left out.
- **CSS beyond Mind Elixir's own styling** (gradients, background images, shadows, borders that
  differ per side) is reported, not reproduced.
- **What the editor does not display is not exported.** Mind Elixir 5.15.1 does not draw
  underline or strike-through set on a node's style (the decoration does not reach the text,
  which is an inline block), so neither does the SVG.
- WebKit lays text out slightly differently at different device pixel ratios; an export follows
  the editor it was made in. Measured differences are in [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md).

## Security

Map data is treated as hostile: captions are escaped text, never markup; links are limited to
http, https and mailto; images are embedded only from `data:`/`blob:` URLs or your resolver,
and only after their bytes are checked to be PNG, JPEG, GIF, WebP or AVIF (an SVG is never
embedded); CSS values are converted, never copied; and every number is checked to be finite. See
[SECURITY.md](SECURITY.md).

## Offline use and embedding

The SVG is self-contained: no requests, no fonts, no scripts. It can be inlined, referenced from
`<img>`, saved as a file next to a page, or used as a `data:` URL. For eLearning packages
(SCORM, EPUB, LMS) see [docs/EXELEARNING.md](docs/EXELEARNING.md), which also shows how
eXeLearning can use it.

## Performance

Measured in Chromium 156 with `npm run bench` (median of 7 exports, fonts loaded):

| Map                 | SVG       | SVG gzip | Export  | PNG (modern-screenshot) | PNG export |
| ------------------- | --------- | -------- | ------- | ----------------------- | ---------- |
| 3 nodes             | 1,958 B   | 649 B    | 0.3 ms  | 19,046 B                | 7.9 ms     |
| 16 nodes (13 shown) | 8,029 B   | 1,638 B  | 0.9 ms  | 94,735 B                | 24.5 ms    |
| 311 nodes           | 157,440 B | 7,985 B  | 12.2 ms | 1,393,514 B             | 355.5 ms   |

Embedded images and long labels make SVGs larger; the full figures, with Mermaid, Pele and the
deprecated exporter, are in [docs/benchmarks.json](docs/benchmarks.json) and
[docs/COMPATIBILITY.md](docs/COMPATIBILITY.md).

## Development

```sh
npm ci
npx playwright install chromium firefox webkit
npm run check        # format, types, unit tests (100% coverage of the DOM-free code), build
npm run test:e2e     # browser tests in Chromium, Firefox and WebKit
npm run test:package # pack, install in an empty project, import and type-check it
npm run bench        # docs/benchmarks.json
npm run demo         # http://127.0.0.1:5173: the editor next to its export
```

See [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md). Releases follow the sibling
package's process: a GitHub Release publishes the tested tarball to npm with provenance.

## License

MIT. Mind Elixir's expand icon, inlined for collapsed branches, is from Mind Elixir (MIT,
© 2019 DjZhou).
