# Architecture

The renderer lays a Mind Elixir map out from its data, as Pele does for Mermaid: font metrics
tables give text widths, a model of Mind Elixir's stylesheet gives boxes and positions, and Mind
Elixir's own connector formulas give the lines. There is one way to calculate, with no DOM and no
canvas, so the result is the same wherever it runs.

```
renderSvg(input)                          src/render.ts
  resolveOptions                          src/options.ts     validation, defaults
  readMap                                 src/data.ts        untrusted data → checked tree (iterative)
  resolveTheme                            src/theme.ts       Mind Elixir theme variables
  layoutMap                               src/layout.ts      topics, then the tree
    layoutTopic                                              a topic's content and size
    wrapText                              src/text/wrap.ts   pre-wrap line breaking
    arialMeasurer                         src/text/measure.ts + metrics.ts (generated)
  draw                                    src/render.ts      layout → scene
    mainBranch, subBranch, arrowGeometry, summaryGeometry    src/connectors.ts
    embedImage                            src/images.ts      checked raster data: URLs
  renderDocument(scene)                   src/svg/document.ts scene → SVG string
```

Everything is unit-tested in Node to 100% coverage. The browser tests use real Mind Elixir as the
reference the layout is measured against.

## Text metrics

`scripts/generate-metrics.mjs` reads Arimo (metric-compatible with Arial: same advance widths)
from `@fontsource/arimo` and writes `src/text/metrics.ts`: advance widths of 2,357 code points
per weight (Latin, Latin Extended, Greek, Cyrillic, Hebrew, Vietnamese), in thousandths of an em,
the font's vertical metrics, and its kerning pairs (100 regular, 97 bold). The measurer:

- segments text into graphemes (`Intl.Segmenter`);
- adds each code point's advance, plus the kerning between consecutive ones (browsers kern by
  default: Arial's "11" is 1.18 px narrower at 16 px, which moves everything after it);
- uses the bold table from weight 600;
- for what Arial lacks: an accented letter is as wide as its decomposition (NFD), combining
  marks and format characters are zero, and emoji (1.2 em), CJK (1 em), Hangul (0.865 em),
  Arabic (0.32 em) and anything else (0.556 em) are estimates measured from browsers' fallback
  fonts next to Arial.

Another font: pass `measureText` (`width(text, font)` and `vertical`).

## The layout model

`src/layout.ts` reproduces Mind Elixir 5.15.1's `index.css` for its DOM
(`me-nodes > me-main / me-root > me-wrapper > me-parent > me-tpc`, `me-children`):

- **Topics** (`me-tpc`, border-box, `max-width: 35em`, `white-space: pre-wrap`). Root: 25 px,
  padding 10/30, 2 px border; main: padding 8/25, 2 px border in the branch colour; sub: padding
  `--topic-padding`; top-down subs: padding 6/12, 1 px border. Contents in order: the image
  (block, `margin-bottom: 8px`), a line of inline boxes (the caption's `span.text` inline block,
  the link 🔗 with `margin-left: 0.3em`, the icons with `margin-left: 5px` and `line-height:
1.3em`) and the tags (12 px, padding 2/4, margins), flowed and baseline-aligned like CSS inline
  formatting.
- **Shrink-to-fit**: a box is as wide as its content's max-content, at most the space available;
  a caption that wraps takes all of it.
- **Line heights**: `line-height: normal` is the font's ascent + descent + line gap, each rounded
  to whole pixels as Blink and WebKit do (16 px Arial: 14 + 3 + 1 = 18 px). Text widths are
  rounded up to 1/64 px, their layout unit.
- **The tree**: `me-parent` (main: margin 10; sub: padding 6/`--node-gap-x`, margin-top
  `--node-gap-y`) and `me-children` are inline blocks with `vertical-align: middle` in one line
  box with the wrapper's strut, so their midpoints sit half an x-height above its baseline. On
  the left side (`direction: rtl`) children come first and are aligned right. Main wrappers
  stack with `--main-gap-y` margins that collapse, in columns `--main-gap-x` wide, and the
  columns and the root (`margin: 45px 0`) are centred by `me-nodes`' flexbox, inside
  `--map-padding`.
- **Top-down** (`me-nodes.down`): flex columns and rows, with the gaps swapped, as its rules say.
- **Sides**: main nodes without a `direction` alternate, left first, as Mind Elixir assigns them;
  the palette is applied in DOM order (left side first).

Positions come out in `me-nodes`' coordinates, the ones Mind Elixir's `getOffsetLT` measures,
so the connector formulas apply unchanged. Both passes are iterative.

## Connectors

`src/connectors.ts` adapts Mind Elixir's `generateBranch.ts` (main branches: a quadratic curve
from near the root's centre, its curvature depending on the map's height; sub-branches: a cubic
curve from the parent's `me-parent` box; top-down: an orthogonal connector with rounded
corners), `arrow.ts` (default control points by distance and direction, exit points on the
topics' borders, 12 px heads at ±30°, the label at the curve's midpoint) and `summary.ts`
(brackets over the summarized wrappers, the label beside them). Labels are boxes 16 px, line
height 1.2, padding `--topic-padding`, anchored as `calculatePrecisePosition` does.

## The document

`renderDocument` writes `<svg xmlns width height viewBox role="img" aria-labelledby>` with
`<title>`, optional `<desc>`, `<defs>` (clip paths only), a background, and five groups in Mind
Elixir's stacking order: branches, nodes, summaries, arrows, labels. Every string goes through
one escaping function (which also drops characters XML cannot hold and replaces lone
surrogates), every number through one formatter (two decimals, refusing non-finite values).
Each line of text is a `<tspan>` at its computed position, with `textLength` set to its computed
width. There is no `style`, `script`, `foreignObject`, `use` or external reference.

## What it does not do

- It does not lay out custom HTML (`dangerouslySetInnerHTML`): that needs a browser.
- It does not read a live editor's DOM. An editor with custom CSS (other fonts, paddings) is
  reproduced only if the same values are given (`theme`, `measureText`).
- Fallback fonts for emoji and CJK differ by system, and Firefox's line heights differ from
  Chromium's and WebKit's: those maps are close, not exact (COMPATIBILITY.md).
