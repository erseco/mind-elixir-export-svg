# Compatibility

Everything here was measured on 2026-10-18 on macOS 26.4 (Apple Silicon) with Node 26.12,
Playwright 1.64.1 and Mind Elixir 5.15.1. Run `npm run test:e2e` and `npm run bench` to
reproduce it.

## Mind Elixir

Tested with **5.15.1** (the version eXeLearning uses). The peer dependency is `>=5.15.1 <6`. The
exporter relies on Mind Elixir's DOM, not on private APIs: `mind.nodes` (`me-nodes`) and
`mind.container`, the element names `me-tpc`, `me-epd`, `me-root`, and the classes `lines`,
`subLines`, `topiclinks`, `summary` and `label-container`. Mind Elixir 6 (in pre-release) is not
tested; a change of that DOM would need a new release.

## Browsers (exporting)

|                                                     | Chromium 156 | Firefox 157                          | WebKit 27.2            |
| --------------------------------------------------- | ------------ | ------------------------------------ | ---------------------- |
| Browser tests (`npm run test:e2e`)                  | all pass     | all pass (one test does not apply\*) | all pass               |
| Same SVG at editor zoom 0.9–2 and panned            | ≤ 0.025 px   | ≤ 0.025 px                           | ≤ 0.025 px             |
| Same SVG at device pixel ratio 1.25, 1.75, 0.984375 | ≤ 1 px       | ≤ 1 px\*                             | follows the editor\*\* |
| Topic boxes vs the editor                           | ≤ 0.02 px    | ≤ 0.02 px                            | ≤ 0.02 px              |
| Line starts vs the editor                           | < 0.5 px     | < 0.5 px                             | < 0.5 px               |
| Baselines vs the editor                             | ≤ 0.5 px     | ≤ 1.5 px\*\*\*                       | ≤ 0.5 px               |

\* Firefox does not emulate device pixel ratios below 1.
\*\* WebKit's own layout changes with the device pixel ratio (topic widths moved by 1–2 px
between 1×, 1.25× and 0.984375×), so an export made at one ratio differs from one made at another
by up to 6 px; at each ratio it matches the editor exactly.
\*\*\* A line made only of fallback glyphs (an emoji) is drawn in a taller box, so its baseline
can be 1 px off.

### Visual comparison

Each map is drawn by the editor and, separately, by the browser from the exported SVG alone (an
`<img>` with no stylesheet), and the two screenshots are compared with pixelmatch (threshold
0.1). HTML text is hinted and snapped to the pixel grid while SVG text is not, so glyph edges
always differ slightly; the strict comparison masks text (whose position is checked
geometrically, above) and compares everything else. Share of differing pixels:

| Map                                                  | Chromium: shapes / whole image | Firefox         | WebKit (2×)     |
| ---------------------------------------------------- | ------------------------------ | --------------- | --------------- |
| three                                                | 0.000% / 1.432%                | 0.231% / 0.791% | 0.003% / 0.013% |
| rich                                                 | 0.022% / 0.988%                | 0.015% / 0.323% | 0.014% / 0.222% |
| features (tags, icons, link, image, arrows, summary) | 0.032% / 0.713%                | 0.071% / 0.736% | 0.017% / 0.208% |
| unicode                                              | 0.009% / 0.626%                | 0.015% / 0.399% | 0.260% / 0.360% |
| topDown                                              | 0.111% / 0.418%                | 0.104% / 0.214% | 0.001% / 0.003% |

The tests require less than 0.5% for shapes and 5% for the whole image.

### Text width across renderers

A viewer can lay text out with other advances than the browser that exported it: another font,
or WebKit at 1×, which rounds advances (a 30-character line was 15 px wider than in the editor at
2×). The default `textLength` fits every line into its measured width. With it, each line drawn
from the SVG alone (in a separate page at 1×) ends within 1.5 px of the editor's; WebKit reports
character positions of joined Arabic and Hebrew glyphs and of emoji sequences up to 3 px apart,
although it draws them in place.

## Other renderers

| Tool                                | Result                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **resvg 2.6.2** (`@resvg/resvg-js`) | Renders every test map at its size. Geometry, colours, arrows, summaries and images are exact; text keeps its width (`textLength`). resvg does not know `-apple-system`/`system-ui` and has no colour emoji support for Apple's font, so with Mind Elixir's default font stack it picks a fallback without bold or italic, and draws emoji as missing glyphs. Configure its fonts (`font.fontFiles`, `defaultFontFamily`) for print-quality output. |
| **svg2pdf.js 2.8.1 + jsPDF 4.2.1**  | Converts to a vector PDF: text as PDF text (`BT…Tj…ET`), lines as paths, and the only raster is the map's own image. jsPDF's standard fonts only cover Latin-1, so non-Latin text (CJK, Arabic, emoji) needs a font registered with jsPDF (`addFont`); `textLength` is ignored.                                                                                                                                                                     |
| Inkscape, librsvg                   | Not tested. The SVG uses only elements and attributes from SVG 1.1 (plus `href` without `xlink:`, which SVG 2 viewers read).                                                                                                                                                                                                                                                                                                                        |

### What the SVG uses, and what it avoids

Uses: `svg`, `title`, `desc`, `defs`, `clipPath`, `g`, `rect`, `path`, `text`, `tspan`, `image`
(raster `data:` URLs only), `a`; presentation attributes; `xml:space="preserve"`; `textLength`
with `lengthAdjust="spacing"`; `direction="rtl"`.

Avoids, following svg2pdf.js's list of unsupported features
([#82](https://github.com/yWorks/svg2pdf.js/issues/82)): `foreignObject`, CSS (`<style>`,
`style=`), filters, masks, patterns, gradients, `use`, `textPath`, text strokes, transforms
inside `clipPath`, units other than px, scripts, animation, and any external reference.

## Node, Bun, workers

The package can be imported anywhere: nothing runs when it is loaded. Exporting needs a DOM with
layout (a browser); without one `renderSvg` rejects with `NOT_INITIALIZED`. jsdom and similar
DOM emulations do not lay text out, so they cannot produce correct geometry and are not
supported. `npm run test:package` imports the published package in Node to check this.

## Benchmarks

`npm run bench` writes [benchmarks.json](benchmarks.json). Chromium 156, median of 7 runs:

| Map                       | This SVG  | gzip    | Export  | modern-screenshot PNG | Export   | Mermaid source | Pele SVG of it | `mind.exportSvg()` (deprecated) |
| ------------------------- | --------- | ------- | ------- | --------------------- | -------- | -------------- | -------------- | ------------------------------- |
| three (3 nodes)           | 1,958 B   | 649 B   | 0.3 ms  | 19,046 B              | 7.9 ms   | 84 B           | 2,002 B        | 3,178 B, 3 `foreignObject`      |
| rich (16 nodes, 13 shown) | 8,029 B   | 1,638 B | 0.9 ms  | 94,735 B              | 24.5 ms  | 516 B          | 6,826 B        | 12,292 B, 13 `foreignObject`    |
| large (311 nodes)         | 157,440 B | 7,985 B | 12.2 ms | 1,393,514 B           | 355.5 ms | 8,884 B        | 128,543 B      | 277,062 B, 311 `foreignObject`  |

All 3, 13 and 311 shown topics are in each SVG as text. The Mermaid and Pele figures are smaller
because Mermaid keeps only the hierarchy and text: no colours, sizes, layout, arrows, summaries,
tags or images. A map with photos is dominated by the photos in any format.
