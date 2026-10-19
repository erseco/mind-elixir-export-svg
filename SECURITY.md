# Security

## Supported versions

Only the latest release receives fixes. The package is pre-1.0, so a fix ships as a new patch or
minor version.

## Reporting

Please report vulnerabilities privately through
[GitHub Security Advisories](https://github.com/erseco/mind-elixir-export-svg/security/advisories/new)
("Report a vulnerability"). Do not open public issues for them. Include the version, the map data
(or the smallest part of it) that triggers the problem, the options, and the browser.

## Threat model

The renderer reads Mind Elixir data and writes an SVG document. Map data is hostile: maps are
often written by other people and imported (captions, styles, links, images, custom HTML), and
may be rendered on a server. The SVG is then shown to other people, inline in pages, in `<img>`,
in packages and PDFs.

| Threat                                                                                  | Mitigation                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A caption that closes an element or adds markup (`</text><script>…`, `<foreignObject>`) | Captions are JSON strings. Custom HTML is not copied. Every string is written through one escaping function (`&`, `<`, `>`, `"`, `'`). Tests parse the output as XML and check its element tree, not substrings.                                                                                                                                 |
| Characters XML cannot hold (C0 controls, U+FFFE/FFFF, lone surrogates)                  | Removed, or replaced with U+FFFD, so the document always parses.                                                                                                                                                                                                                                                                                 |
| Text that changes meaning in replacements (`$$`, `$&`, `$'`)                            | Every replacement uses a function. Tested.                                                                                                                                                                                                                                                                                                       |
| Script and event handlers                                                               | The SVG never contains `script`, `style`, `foreignObject`, `use`, event attributes or animation. Attribute names are checked against a pattern. Custom HTML in a node is never copied: only its boxes, text and images are exported, and scripts in it never run.                                                                                |
| Links (`javascript:`, `data:`, `file:`)                                                 | Only `http:`, `https:` and `mailto:` become `<a href>`; anything else keeps its text and is reported (`UNSAFE_LINK`). `links: "text"` drops all links.                                                                                                                                                                                           |
| Images that are not images (SVG with script, HTML) labelled as PNG                      | Image bytes are sniffed and re-encoded with the type they really have; only PNG, JPEG, GIF, WebP and AVIF are embedded, never SVG.                                                                                                                                                                                                               |
| Network access or tracking through images, fonts or CSS                                 | The export makes no request. `data:` URLs are decoded, `blob:` URLs read locally, anything else only through the caller's `resolveImage`. No CSS is copied (computed values are converted to presentation attributes), so `url()` in styles cannot reach the SVG; no fonts are embedded or referenced by URL. Tested with every request blocked. |
| Values that break rendering (`NaN`, `Infinity`, `auto`, units)                          | Every number is checked to be finite and written as a plain number; geometry that is not finite fails with `INVALID_GEOMETRY`. Path data is checked to contain only path commands and numbers.                                                                                                                                                   |
| Resource exhaustion (huge maps, long captions, many or large images, huge output)       | `limits`: nodes, characters of text, images, bytes per image (checked before an image is read), and output length; beyond them the export fails with `LIMIT_EXCEEDED`. The data walk is iterative, so depth cannot overflow the stack. Exports can be cancelled with an `AbortSignal`.                                                           |
| Ids that collide with the page when inlined                                             | Ids are `${idPrefix}-…`, the prefix is validated, and only clip paths and the title use them.                                                                                                                                                                                                                                                    |
| Changing the editor                                                                     | `renderSvg` does not touch the editor. The plugin reads allow-listed computed CSS variables and does not add, move or style elements. `downloadSvg` creates a temporary anchor to start the download. Zoom, selection and history stay as they were. Tested by comparing the editor's state before and after.                                    |

## Using the output

- The SVG is safe to display, but if you insert it into a page as markup, treat it like any
  content: prefer `<img src>` or a file, and keep your own sanitizer if your platform has one.
- `resolveImage` runs your code with URLs taken from the map: fetch only what your application
  trusts, and pass the `signal` on.
- Fonts are named, not embedded: a viewer may draw text with another font.

## Supply chain

- No runtime dependencies. Development dependencies are pinned and updated through Dependabot.
  The font metrics are generated from a pinned font package (`scripts/generate-metrics.mjs`).
- Releases are published from GitHub Actions with npm Trusted Publishing and provenance, after
  the same checks as CI, from the tarball the package test installed.
