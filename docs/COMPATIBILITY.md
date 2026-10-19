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
`generateBranch.ts`, `arrow.ts`, `summary.ts`, `const.ts`, `changeTheme`). That version is
`SUPPORTED_MIND_ELIXIR_VERSION`. Data from any 5.x version can be rendered; a version that
changes those files may lay maps out differently from what is drawn here. Mind Elixir 6 is in
pre-release. A compat report says whether a given release still matches; it does not promote
that release to supported.

### Checking another version

```sh
npm run test:compat -- --mind-elixir-version 5.15.1
npm run test:compat -- --mind-elixir-version latest
npm run test:compat -- --mind-elixir-version next
npm run test:compat -- --mind-elixir-version 5.15.1 --visual
```

`latest` is the newest stable release (a version with no hyphen). npm's `latest` dist-tag may
point at a prerelease; this command uses the newest stable version instead, and the report says
so. `next`, `beta` and any other dist-tag are that tag. Any other argument is one npm version.

The command installs that package under `.scratch/compat` and does not change
`package-lock.json`. It measures the fixtures in `tests/tolerances.ts` (left, right, both sides,
top-down, deep, wide, large, wrapping, Unicode, tags, images, arrows, summaries, collapsed
branches, hostile input) in Chromium, Firefox and WebKit. Topics are `me-tpc` or `.me-tpc`. A
run that finds none fails: an empty measurement is not a match. It also scales the `three` map
to 0.5 and 1.25, inside Mind Elixir's default scale range, divides the viewport boxes by
`scaleVal`, and reports movement in that layout space.
`--visual` runs the Chromium visual spec as well. `--advisory` writes the report and exits 0
even when a stable version is outside the tolerances.

Reports are `artifacts/compat/<version>.json` and `.md`: the Mind Elixir version, this package's
version and commit, Node and the browsers, passed and failed cases, the largest deviations, zoom,
drift against `docs/layout-deviation.json`, and the known limitations below. They are not
baseline files. `npm run compare-layout` is what writes `docs/layout-deviation.json`, and only
for the Mind Elixir version in `package.json`.

| Status         | When                                                                                                                                           |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `supported`    | The installed version is 5.15.1, geometry is inside the tolerances, and `--visual` did not fail. A visual failure on 5.15.1 is `incompatible`. |
| `experimental` | A newer release that still fits, or any prerelease (including one that does not fit).                                                          |
| `incompatible` | A stable release outside the geometry tolerances. The process exits 1 unless `--advisory` was passed.                                          |

A passing subset does not make a version supported. Drift against the recorded macOS baseline is
listed and does not by itself fail the run: CI uses Linux fonts, and the tolerances already
cover that.

Checked on 2026-10-19. `latest` resolves to 5.15.1, because npm's `latest` tag is
`6.0.0-next.4`. `6.0.0-next.11` (`next`) is experimental: 28 of 30 geometry cases passed.
Chromium and WebKit place the top-down fixture 20 px lower (y 20, recorded 0). Firefox shows
that same 20 px on top of its line-height drift (y 22.33, recorded 2.33); Firefox `y` is not a
failure. Side layouts on that prerelease still match. The supported baseline stays 5.15.1.

GitHub Actions (`.github/workflows/compat.yml`) runs the stable check every Monday at 06:15 UTC
and on `workflow_dispatch` (`mind_elixir_version`, default `latest`). The `next` prerelease is a
separate advisory job. Reports are uploaded as artifacts. The workflow has `contents: read`.

### Adapting the renderer

When a report shows a real layout change:

1. Read the failing fixture and browser in the report.
2. Diff that Mind Elixir's `src/index.css`, `generateBranch.ts`, `arrow.ts`, `summary.ts`,
   `const.ts` and `changeTheme` against 5.15.1. The copies in this repo are named in
   `src/profile.ts`.
3. Change the matching length, the theme merge, or the connector formula. Add a unit test.
4. Run `npm run compare-layout` and `npm run test:e2e` against the version you intend to support.
5. Re-record `tests/unit/reference.json` and `docs/layout-deviation.json` only then, and record
   the new measurements in this file before changing a tolerance.
6. Set `SUPPORTED_MIND_ELIXIR_VERSION` only after a clean compat report for that version.

### Known limitations

These are bounded in `tests/tolerances.ts` and listed in every compat report. They are not new
regressions:

- Firefox's `line-height: normal` for 16 px Arial is 19.5 px; Chromium and WebKit use 18. The
  vertical drift is recorded. Widths still have to match. Firefox `y` is not a failure.
- Emoji, CJK, Hebrew and Arabic use estimated widths (emoji 1.2 em, CJK 1 em, Hangul 0.865 em,
  Arabic 0.32 em, anything else 0.556 em). Chromium and WebKit allow 30 px horizontally and 15 px
  vertically on those fixtures.
- Captions are measured left to right. This renderer does not shape Arabic or Hebrew. Setting
  SVG `direction="rtl"` without moving `x` would place the text in the wrong box.
- `svg2pdf.js` ignores `textLength`. jsPDF's standard fonts cover Latin-1.
- Compact gaps follow `data.compact`, or an instance's `compact` when the data omits it.
- A stylesheet override on a live editor is applied only by the plugin.
- An intentionally transparent background stays transparent.

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
