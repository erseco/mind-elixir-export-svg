# Architecture

The exporter reads the map the browser laid out and writes what it finds as native SVG. It does
not lay anything out itself: the browser already did, and any second layout engine would draw a
different map.

```
renderSvg(mind)
  resolveOptions                      src/options.ts      validate, defaults (pure)
  waitForFonts                        src/browser/fonts.ts
  extractScene                        src/browser/extract.ts
    createFrame                       src/browser/frame.ts   screen → layout coordinates
    walk me-nodes (iterative)         boxes, SVG layers, images, text nodes
    measureText                       src/browser/text.ts    Range rects per word/grapheme
    layoutLines                       src/text/lines.ts      lines, runs, baselines (pure)
    embedImage                        src/browser/images.ts  data:/blob:/resolver → checked raster
  renderDocument(scene)               src/svg/document.ts    scene → SVG string (pure)
```

Everything outside `src/browser` is pure and unit-tested to 100% coverage; `src/browser` is
tested in Chromium, Firefox and WebKit against real Mind Elixir maps.

## The coordinate model

Mind Elixir places every element of a map inside `me-nodes` (`mind.nodes`): topics, the main
branch lines (`svg.lines`), the lines of each subtree (`svg.subLines`, one per `me-wrapper`),
arrows (`svg.topiclinks`), summaries (`svg.summary`) and the labels of both
(`div.label-container > div.svg-label`). Zoom and pan are a CSS transform on its parent,
`.map-canvas`.

CSS transforms do not change layout. So the export's coordinate system is `me-nodes`' layout
space: CSS pixels from its top-left corner, before any transform. Every element is measured with
`getBoundingClientRect()` and mapped back:

```
local = (rect.left - nodesRect.left) / scaleX,  (rect.top - nodesRect.top) / scaleY
```

where the scale is the product of the `transform` and `scale` of `me-nodes` and its ancestors
(rotation and skew are refused). If the drawn size of `me-nodes` disagrees with its laid-out size
by more than 2% (CSS `zoom`, a scaled iframe), the measured ratio is used instead. Nothing in the
editor is changed to measure it: `mind.scaleVal` is never touched.

SVG layers are copied with their own path data. An `svg.lines`-type element has no `viewBox`, so
its user space is CSS pixels from its own box: its origin is measured like any element, and each
path is written with `translate(origin) × getCTM()`. Bounds come from `getBBox()` (which includes
curve extrema, not just end points) under the same transform, plus the stroke's reach: half its
width, or twice it for miter joins (arrowheads), at the default miter limit.

The result is the same at any editor zoom (to 0.025 px after rounding, tested at 0.9, 0.984375,
1.25, 1.5, 1.75 and 2 with a pan) and at any device pixel ratio in Chromium and Firefox (within a
pixel; WebKit's own layout changes with the ratio, see COMPATIBILITY.md).

## Painting order

The SVG paints five groups in Mind Elixir's stacking order: `branches` (lines, subLines), `nodes`
(topics, tags, icons, images, the collapsed-branch icon), `summaries` (z-index 20), `arrows`
(z-index 20) and `labels` (z-index 21). Within a group, document order.

Editor UI is skipped by selector (`#input-box`, drag previews, the selection area, arrow handles,
the hover-only collapse icon), and anything not displayed (`display: none`, `visibility: hidden`,
zero opacity) with its subtree. Selection outlines are CSS outlines, which are never exported.
Transparent strokes, which Mind Elixir uses as 15 px hit zones around arrows, draw nothing and are
dropped.

## Boxes

Each displayed HTML element with a background or a border becomes a box: the border box, the
computed `background-color`, the border when all four sides agree (otherwise the top side, with
a warning), and the four corner radii, clamped as CSS does. A CSS border is inside the box, so
the stroke is inset by half its width. An opaque border is drawn by the same element as the
background; a translucent one separately, so the background shows through it as in CSS. Uniform
radii become `<rect rx ry>`, others a path.

## Text

Text is where Mind Elixir's own SVG export failed: native `<text>` does not wrap, so it put
captions in `foreignObject`. This exporter does not wrap text either: the browser already did,
and the exporter reads the result.

1. **Segments.** Each text node is split into words with `Intl.Segmenter` (graphemes where a
   word spans more than one rect: a word broken across lines, or bidi reordering). Each segment
   gets its box from `Range.getClientRects()`.
2. **Lines.** Segments are grouped into lines by vertical overlap (more than half the smaller
   height), which is exactly how the browser broke them. Line breaks and blank space at the ends
   of a line draw nothing and are dropped.
3. **Runs.** A line splits into runs where the computed style (font, size, weight, style, colour,
   decorations, letter spacing) or the direction changes. Each run is a `<tspan>` with its own
   `x` (or a separate right-to-left `<text>`, positioned at its right edge with
   `direction="rtl"`), so nothing depends on the viewer's text layout but the glyphs.
4. **Baselines.** Range rects are the font's content area: `ascent + descent` tall (WebKit adds
   a fraction, split evenly). With the primary font's `fontBoundingBoxAscent`/`Descent` from a
   canvas, the baseline is `top + (height − ascent − descent) / 2 + ascent`. Glyphs from fallback
   fonts (emoji, CJK) can have taller boxes, so a line's baseline is the median over its
   primary-font segments, and only lines with none use the others (in Firefox such a line can be
   1 px off). Measured against probes on every line of the test maps: within 0.5 px in Chromium
   and WebKit, 1.5 px in Firefox.
5. **Widths.** Each run carries the width it was drawn at, written as `textLength` with
   `lengthAdjust="spacing"`. A viewer with other metrics (another font; WebKit's rounded advances
   at 1×, where a 30-character line measured 15 px wider) then fits the run into the same space
   instead of overflowing the node. Renderers that do not support it (svg2pdf.js) ignore it.

Decorations follow CSS propagation: an element's `text-decoration-line` applies to its inline
descendants, but not into atomic inline boxes (`inline-block`…). Mind Elixir 5.15.1 sets node
styles on `me-tpc` while the caption is in `span.text`, an inline block, so a node style's
underline is not drawn by the editor, and the export follows the editor.

Fonts: before measuring, the exporter waits for `document.fonts.ready` (up to `fontTimeout`),
then reports fonts `document.fonts.check()` rejects and `FontFace`s of the used families whose
loading failed (WebKit's `check()` accepts those). Text measured before a font loads would be
measured with a fallback, so a timeout is a warning, and an error in strict mode.

## Images

`<img>` elements in topics become `<image>` with the content box, `object-fit` (cover → `slice`,
contain → `meet`, fill → `none`) and rounded corners as a `clipPath`. Sources: `data:` URLs are
decoded; `blob:` URLs are read with `fetch` (local); everything else goes to `resolveImage`, or
is left out. The bytes are then sniffed and re-encoded with the type they actually are: only PNG,
JPEG, GIF, WebP and AVIF are embedded, never SVG (which could carry script). An image the editor
failed to load is shown broken, so it is not exported unless a resolver supplies it.

## The document

`renderDocument` writes `<svg xmlns width height viewBox role="img" aria-labelledby>` with
`<title>`, an optional `<desc>`, `<defs>` (clip paths only), a background rect and the five
groups. All strings go through one escaping function (which also drops characters XML cannot
hold and replaces lone surrogates), all numbers through one formatter (two decimals, refusing
non-finite values), and attribute names are checked. There is no XML declaration or DOCTYPE, no
`style`, no `class` other than the five group names, and no external reference: the only `href`
values are checked links and embedded raster `data:` URLs. Ids are `${idPrefix}-…`, unique within
the document.

## Portable renderer

A renderer from Mind Elixir JSON alone (Node, Bun, workers) is not implemented. It would need its
own layout and text measurement, and could not claim to match the editor, which is the point of
this package. The pieces it would reuse are already separate: `renderDocument` turns a scene
into SVG without the DOM, and `layoutLines` builds runs from measured segments. What it would
add:

- a `TextMeasurer` (`width(text, font)`), from a canvas where there is one, or from font metric
  tables with a documented error (as Pele does with Arial advances);
- a port of Mind Elixir's layout (`src/utils/layout-ssr.ts` exists upstream, which lays out
  without the DOM) to produce boxes and branch paths;
- its own entry point (`renderSvgFromData`), with its own warnings, documented as an
  approximation.

Until then, the intended use is to export in the browser when a map is saved and store the SVG.
