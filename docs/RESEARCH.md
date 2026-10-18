# Research notes

What was read before the renderer was written, and the requirement each finding became. State as
of 2026-10-18.

The first version read the geometry from a live editor's DOM. It was replaced, before any release,
by a renderer that computes the layout from the data with font metrics, as Pele does: one way to
calculate, with no browser, so exports made on a server match those made in the editor. The
findings below about Mind Elixir's DOM and CSS are what that layout model reproduces.

## Mind Elixir 5.15.1

Read at tag `v5.15.1` of [SSShooter/mind-elixir-core](https://github.com/SSShooter/mind-elixir-core)
(`main` is 6.0 pre-release; npm's `latest` tag points at `6.0.0-next.4`), and in the DOM of live
instances in Chromium, Firefox and WebKit.

- **DOM.** `mind.nodes` is `me-nodes`, inside `mind.map` (`.map-canvas`), inside
  `mind.container` (`.map-container`). `me-nodes` holds `me-main.lhs`/`.rhs` with
  `me-wrapper > me-parent > me-tpc` (and `me-epd`, the expander), `me-children`, and a
  `svg.subLines` per wrapper; `me-root > me-tpc`; `svg.lines`; `div.label-container` with a
  `div.svg-label` per arrow or summary label; `svg.topiclinks` (`mind.arrowSvg`) and
  `svg.summary` (`mind.summarySvg`). → Requirement: one walk of `me-nodes` reaches everything
  drawn.
- **Zoom.** `mind.scale()` sets a CSS transform on `.map-canvas` (`transform-origin` at the
  centre, `translate3d` for the pan). `scaleMin`/`scaleMax` default to 0.2/1.4. → Coordinates
  are taken in `me-nodes` layout space, which transforms do not change (ARCHITECTURE.md).
- **`src/plugin/exportImage.ts`**: the deprecated `exportSvg()`. It uses `getOffsetLT`
  (integer `offsetLeft`/`offsetTop` sums, which round), copies `.subLines`/`.lines`/`.topiclinks`
  /`.summary` as they are (hit-zone paths included), draws each topic's text as one `<text>` per
  `\n` line with `text.innerHTML = line` (so captions are parsed as markup) or a `foreignObject`,
  sets `width`/`height` from computed style (`auto` for inline elements), and ignores
  `.label-container`. → Every one of these is a test: hostile captions, no `auto`/`NaN`, no
  hit zones, arrow and summary labels present, sub-pixel positions.
- **`src/utils/svg.ts`**: arrows are a `<g>` of three visible paths (line, two heads; the second
  is empty unless bidirectional), each preceded by a transparent 15 px hit zone; labels are HTML
  divs positioned from `data-x`/`data-y`/`data-anchor`. → Transparent strokes are dropped; labels
  are exported as HTML boxes like topics.
- **`src/index.css`**: z-index 10 for `me-parent`, 20 for `.topiclinks`/`.summary`, 21 for
  `.label-container`; `me-tpc { white-space: pre-wrap; max-width: 35em }`; `me-tpc > .text {
display: inline-block }`; `.selected` is an `outline`; `me-epd` draws `add-circle.svg` as a
  background image, and `me-epd.minus` is only visible on hover. → Paint order; outlines are not
  exported; the expand icon is inlined as paths (MIT, credited); `.minus` is editor UI.
- **Decorations.** Node styles are set on `me-tpc` and the caption is `span.text`, an inline
  block; CSS does not propagate text decorations into atomic inline boxes, so Mind Elixir 5.15.1
  does not display a node style's `textDecoration` (verified visually). → The export follows the
  display, and README says so.
- **`src/utils/layout-ssr.ts`** lays a map out without the DOM: the starting point for a future
  portable renderer (ARCHITECTURE.md).
- **Plugins.** `mind.install(plugin)` calls `plugin(mind)`. → `createSvgExportPlugin()` adds
  `exportVectorSvg`, never overriding `exportSvg`.

### Issues

| Issue                                                                                                                                                                                                         | Finding                                                                                                        | Requirement                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| [#230](https://github.com/SSShooter/mind-elixir-core/issues/230) (closed)                                                                                                                                     | `foreignObject` breaks svg2pdf.js; the "no foreignObject" fallback did not wrap text and wrote `width="auto"`. | No `foreignObject`; lines from the browser's layout; every attribute a checked number. svg2pdf.js is tested. |
| [#359](https://github.com/SSShooter/mind-elixir-core/issues/359) (closed)                                                                                                                                     | Arrow and summary labels missing from `exportSvg()`: they are HTML outside the SVG.                            | Labels exported and tested by text.                                                                          |
| [#48](https://github.com/SSShooter/mind-elixir-core/issues/48) (closed)                                                                                                                                       | Exported positions misaligned.                                                                                 | One coordinate system; topic boxes compared with the editor to 0.02 px at several zoom levels.               |
| [#386](https://github.com/SSShooter/mind-elixir-core/issues/386) (open)                                                                                                                                       | The maintainer prefers exporters as separate packages.                                                         | A separate package and an optional plugin.                                                                   |
| [#285](https://github.com/SSShooter/mind-elixir-core/issues/285), [#241](https://github.com/SSShooter/mind-elixir-core/issues/241), [#223](https://github.com/SSShooter/mind-elixir-core/issues/223) (closed) | Exported images not the same as displayed; style problems; errors.                                             | Visual comparison with the editor in three browsers.                                                         |

## Pele 1.6.0

Read at [obsidianmd/pele](https://github.com/obsidianmd/pele) `458322a`: `src/text/measurer.ts`
(canvas measurement with an Arial-advance fallback), `src/svg/builder.ts` (escaping that drops
XML-illegal characters; numbers by hundredths), the mind map renderer and its security tests.

- Escape every string through one function that also drops characters XML cannot hold; write
  every number through one formatter. → `src/svg/xml.ts` (which also replaces lone surrogates).
- Measuring text without a browser needs metrics tables and is an approximation. → Not used for
  the browser export; noted for a portable renderer.
- [#3](https://github.com/obsidianmd/pele/issues/3) (edge crossings in flowcharts),
  [#8](https://github.com/obsidianmd/pele/issues/8) (Unicode refused in Sankey names) and
  [#14](https://github.com/obsidianmd/pele/issues/14) (diagrams scaled down until unreadable) are
  about other diagram types, not Pele's mind maps. Lessons applied: keep Unicode intact (tested
  with combining marks, ZWJ sequences, flags, RTL); never scale text down to fit (the SVG has the
  map's own size and a `viewBox`; the page decides how to show it). Edge crossings do not apply:
  the export keeps Mind Elixir's layout.

## eXeLearning

- [#2557](https://github.com/exelearning/exelearning/pull/2557) (open): Mind Elixir 5.15.1 editor
  in the `exemindmap` plugin; on save, the JSON (`mindmapCode`) plus a PNG
  (modern-screenshot 4.7.0, `mindmapImgToSave`/`mindmapImgSize`) or Mermaid code
  (`@erseco/mind-elixir-export-mermaid` 0.1.3, `mindmapDiagram`). → `docs/EXELEARNING.md`.
- [#2556](https://github.com/exelearning/exelearning/pull/2556) (open): Pele replaces Mermaid.js,
  so diagrams pre-render without a DOM. → This SVG does not need it: it is made in the browser
  and stored.
- [#2490](https://github.com/exelearning/exelearning/issues/2490) (open): at some display scales
  (0.984375, 1.75) Chromium measured Mermaid labels wrong and the cut label was saved. →
  Geometry comes from the editor's own layout, never re-wrapped; tested at editor zoom 0.9 to 2
  and device pixel ratios 0.984375, 1.25 and 1.75; `textLength` keeps labels inside their nodes
  in other renderers.
- [#2544](https://github.com/exelearning/exelearning/issues/2544) (open): server exports failed
  with `CSSStyleSheet is not defined`. → Importing the package touches no DOM global (checked in
  Node by `test:package`); exporting outside a browser fails with a typed error, never with a
  `ReferenceError`.
- [#2475](https://github.com/exelearning/exelearning/issues/2475) (open): `String.replace` with a
  string replacement turned `$$` into `$`. → Every replacement in the library uses a function;
  captions with `$$`, `$&`, `$'` are tested.

## SVG to PDF

[svg2pdf.js #15](https://github.com/yWorks/svg2pdf.js/issues/15) (no `foreignObject`, out of
scope) and [#82](https://github.com/yWorks/svg2pdf.js/issues/82) (unsupported: `textLength`,
`textPath`, masks, filters, transforms in `clipPath` on non-paths, units other than px, `use` with
external references, gradients on strokes). → The SVG avoids all of them except `textLength`,
which svg2pdf.js ignores; clip paths contain only paths; everything is in px.
