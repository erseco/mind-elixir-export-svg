/**
 * What is coupled to one Mind Elixir release.
 *
 * The SVG writer (`src/svg`), validation (`src/data.ts`, `src/security.ts`) and the font tables
 * (`src/text`) do not follow a Mind Elixir version. Geometry does. Mind Elixir publishes no
 * geometry API: `layoutSSR` only assigns sides and emits HTML, so the lengths below are copied
 * from 5.15.1's stylesheet. The other copies are named here so a later release is a short list:
 *
 * - this file — lengths from `src/index.css`, and the compact gaps from `changeTheme`
 * - `src/theme.ts` — built-in themes and `changeTheme`'s merge (`type`, then `cssVar`, then compact)
 * - `src/layout.ts` — the rest of that stylesheet (inline flow, shrink-to-fit, vertical-align)
 * - `src/connectors.ts` — `generateBranch.ts`, `arrow.ts`, `summary.ts`
 * - `src/render.ts` — the expand icon and the default arrow colours
 *
 * Check a candidate with `npm run test:compat -- --mind-elixir-version <version>`. Bump
 * `SUPPORTED_MIND_ELIXIR_VERSION` only after that report is clean and the baseline is re-recorded.
 * A passing report does not by itself make a version supported.
 */

/** The Mind Elixir release this layout was measured against. */
export const SUPPORTED_MIND_ELIXIR_VERSION = "5.15.1";

/**
 * Lengths from Mind Elixir 5.15.1 `src/index.css`. Pixels, except `maxWidthEm`, `linkMarginEm`
 * and the two line heights, which are ems of the topic's font.
 */
export const LAYOUT = Object.freeze({
  containerFont: 16,
  rootFont: 25,
  tagFont: 12,
  rootPaddingY: 10,
  rootPaddingX: 30,
  rootBorder: 2,
  mainPaddingY: 8,
  mainPaddingX: 25,
  mainBorder: 2,
  subDownPaddingY: 6,
  subDownPaddingX: 12,
  subDownBorder: 1,
  subDownRadius: 6,
  subRadius: 3,
  maxWidthEm: 35,
  imageGap: 8,
  linkMarginEm: 0.3,
  iconGap: 5,
  iconLineHeight: 1.3,
  tagLineHeight: 1.3,
  tagPadY: 2,
  tagPadX: 4,
  /** `.tags span { margin: 2px 4px 0 0 }`. */
  tagMarginTop: 2,
  tagMarginRight: 4,
  mainMargin: 10,
  /** `me-parent` padding-top and padding-bottom for a sub node (not top-down). */
  subPadY: 6,
  /** `me-root` margin-top and margin-bottom. */
  rootMarginY: 45,
});

/**
 * `changeTheme` writes these after the theme's own variables when the map is compact, so they
 * win over a theme that also sets the gaps.
 */
export const COMPACT_GAPS: Readonly<Record<string, string>> = Object.freeze({
  "--node-gap-x": "15px",
  "--node-gap-y": "2px",
  "--main-gap-x": "30px",
  "--main-gap-y": "6px",
});
