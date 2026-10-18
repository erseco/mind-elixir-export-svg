# Compatibility

Measured on 2026-10-18 on macOS 26.4 (Apple Silicon), Node 26.12, Playwright 1.64.1, Mind Elixir
5.15.1. `npm run compare-layout`, `npm run test:e2e` and `npm run bench` reproduce it.

## Runtimes

The renderer needs no DOM, canvas or network: it runs in Node 20+, Bun, Deno, workers and
browsers, and gives byte-identical SVG in each (tested: Node and Chromium, Firefox and WebKit
produce the same string for the same map). It needs `Intl.Segmenter` (Node 16+, Chromium 87+,
Safari 14.1+, Firefox 125+). `downloadSvg` needs a browser.

## Mind Elixir

The layout model follows **Mind Elixir 5.15.1** (its stylesheet, `layout.ts`, `linkDiv.ts`,
`generateBranch.ts`, `arrow.ts`, `summary.ts`). Data from any 5.x version can be rendered; a
version that changes those files may lay maps out differently from what is drawn here. Mind
Elixir 6 is in pre-release and has not been compared.

## Layout against Mind Elixir

Every topic of the test maps, laid out from the data, against where Mind Elixir draws it with
`.map-container { font-family: Arial }`: the largest difference in px
([layout-deviation.json](layout-deviation.json)).

| Map (topics)                            | Chromium 156 x / y / w / h | WebKit 27.2               | Firefox 157                 |
| --------------------------------------- | -------------------------- | ------------------------- | --------------------------- |
| three (3)                               | 0.03 / 0 / 0.03 / 0        | 0.03 / 0 / 0.03 / 0       | 0.06 / 0.35 / 0.04 / 1.52   |
| topDown (7)                             | 0.02 / 0 / 0.02 / 0        | the same                  | 0.02 / 2.33 / 0.01 / 1.52   |
| wide (7, wrapped captions)              | 0.02 / 0 / 0.02 / 0        | the same                  | 0.01 / 15.17 / 0.01 / 3.03  |
| deep (27 levels)                        | 0.27 / 0 / 0.02 / 0        | the same                  | 0.06 / 0.35 / 0.01 / 1.52   |
| large (311)                             | 0.02 / 0 / 0.02 / 0        | the same                  | 0.07 / 210.82 / 0.04 / 1.52 |
| rich (13: accents, emoji, CJK)          | 4.52 / 4 / 4.5 / 8         | 4.73 / 4.22 / 4.72 / 8    | 3.63 / 11.82 / 3.59 / 6     |
| features (6: link, icons, tags, image)  | 6.02 / 1.06 / 6.02 / 2.11  | 3.02 / 0.87 / 3.02 / 1.75 | 1.38 / 2.27 / 1.36 / 1.52   |
| unicode (8: CJK, Hebrew, Arabic, emoji) | 0.03 / 14 / 10.47 / 8      | 0.03 / 14 / 10.47 / 8     | 0 / 14.07 / 10.43 / 5       |

Why the differences:

- **Firefox** sets `line-height: normal` for 16 px Arial at 19.5 px, Chromium and WebKit at 18
  (they round ascent, descent and line gap to whole pixels). Each line is 1.5 px taller, and the
  difference adds up down a column (211 px at the bottom of 311 nodes). Widths match.
- **Emoji, CJK and other scripts** are drawn by the system's fallback fonts (here Apple Color
  Emoji, PingFang, Arial Hebrew), whose widths are estimated and whose lines are taller (an emoji
  line is 26 px in Chromium on macOS, 18 in the model). Other systems have other fallback fonts.
- **deep**: Chromium and WebKit round each caption's width to 1/64 px slightly differently from
  the model; 0.01 px per level.

## Visual comparison

The SVG from Node, drawn on its own as an `<img>`, against a screenshot of the editor (Arial),
with pixelmatch (threshold 0.1). Text is masked (HTML text is hinted and snapped to pixels, SVG
text is not, so glyph edges always differ); "shapes" is what is left: boxes, borders, lines,
arrows, brackets, icons and images. Share of differing pixels, shapes / whole image:

| Map      | Chromium        | WebKit (2×)     | Firefox         |
| -------- | --------------- | --------------- | --------------- |
| three    | 0.017% / 0.685% | 0.035% / 0.135% | 1.799% / 2.224% |
| topDown  | 0.038% / 0.106% | 0.042% / 0.071% | 1.533% / 2.027% |
| wide     | 0.000% / 0.336% | 0.002% / 0.024% | 5.525% / 9.718% |
| deep     | 0.011% / 0.440% | 0.007% / 0.029% | 3.052% / 4.167% |
| rich     | 1.648% / 3.069% | 2.100% / 3.255% | 3.517% / 5.788% |
| features | 1.878% / 3.617% | 1.344% / 2.525% | 2.784% / 4.548% |
| unicode  | 2.747% / 3.919% | 3.477% / 4.512% | 4.164% / 5.782% |

The tests require shapes under 0.5% and the whole image under 5% for the Arial maps in Chromium
and WebKit, and the whole image under 12% elsewhere.

## Other renderers

| Tool                                | Result                                                                                                                                                                                                   |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **resvg 2.6.2** (`@resvg/resvg-js`) | Renders every test map at its size; geometry, colours, arrows, brackets and images exact; text in Arial (or Liberation Sans, Arimo) where installed. Emoji need a colour emoji font resvg supports.      |
| **svg2pdf.js 2.8.1 + jsPDF 4.2.1**  | A vector PDF: text as PDF text, lines as paths, the only raster the map's own image. jsPDF's standard fonts cover Latin-1; other scripts need a font registered with `addFont`. `textLength` is ignored. |
| Inkscape, librsvg                   | Not tested. The SVG uses only SVG 1.1 elements and attributes (plus `href` without `xlink:`).                                                                                                            |

The SVG uses `svg`, `title`, `desc`, `defs`, `clipPath`, `g`, `rect`, `path`, `text`, `tspan`,
`image` (raster `data:` URLs) and `a`; presentation attributes; `xml:space="preserve"`;
`textLength` with `lengthAdjust="spacing"`. It avoids what svg2pdf.js lists as unsupported
([#82](https://github.com/yWorks/svg2pdf.js/issues/82)): `foreignObject`, CSS, filters, masks,
patterns, gradients, `use`, `textPath`, text strokes, transforms inside `clipPath`, units other
than px, scripts, animation and external references.

## Benchmarks

`npm run bench` ([benchmarks.json](benchmarks.json)): this SVG rendered in Node; the PNG made by
modern-screenshot from the editor in Chromium; the Mermaid source from
@erseco/mind-elixir-export-mermaid and Pele's SVG of it; Mind Elixir's deprecated
`exportSvg()`. Median of 7.

| Map                 | SVG                | gzip             | Render | PNG                   | Render   | Mermaid          | Pele SVG           | `exportSvg()`                           |
| ------------------- | ------------------ | ---------------- | ------ | --------------------- | -------- | ---------------- | ------------------ | --------------------------------------- |
| three (3 nodes)     | 1,500 B (1.5 kB)   | 563 B            | 0.2 ms | 19,046 B (19 kB)      | 8.0 ms   | 84 B             | 2,002 B (2.0 kB)   | 3,178 B (3.2 kB), 3 `foreignObject`     |
| rich (16, 13 shown) | 6,023 B (6.0 kB)   | 1,501 B (1.5 kB) | 0.4 ms | 94,735 B (95 kB)      | 24.4 ms  | 516 B            | 6,826 B (6.8 kB)   | 12,292 B (12 kB), 13 `foreignObject`    |
| large (311)         | 109,911 B (110 kB) | 6,569 B (6.6 kB) | 5.8 ms | 1,393,514 B (1.39 MB) | 349.7 ms | 8,884 B (8.9 kB) | 128,543 B (129 kB) | 277,062 B (277 kB), 311 `foreignObject` |

Mermaid keeps only the hierarchy and text; images in a map dominate any format's size.
