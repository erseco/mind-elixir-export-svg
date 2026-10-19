# Using it in eXeLearning

[eXeLearning](https://github.com/exelearning/exelearning) edits mind maps with Mind Elixir in its
TinyMCE plugin `exemindmap` ([#2557](https://github.com/exelearning/exelearning/pull/2557)). The
editor (`editor/src/editor.ts`) runs in a TinyMCE dialog. Its look is a Mind Elixir `theme`, and
it shows underline and strike-through with one CSS rule, so the SVG is made by the plugin from
the live editor with `textDecoration` on. When the author saves, the dialog inserts it as an
image, next to the map's JSON, which keeps it editable:

```ts
import { DEFAULT_FONT_FAMILY, createSvgExportPlugin, toDataUrl } from "@erseco/mind-elixir-export-svg";

const mind = new MindElixir({ el: "#map", theme: EXE_THEME /* … */ });
mind.install(createSvgExportPlugin({ textDecoration: true }));
// The editor uses the font the SVG is laid out for, so both look the same
mind.container.style.fontFamily = DEFAULT_FONT_FAMILY;

async function save() {
  // Reads the theme the editor shows, so the image looks like the editor
  const { svg, width, height } = await mind.exportVectorSvg({ title });
  parent.postMessage(
    { mceAction: "exeMindmapSaved", svg: toDataUrl(svg), width, height, code: serializeStoredCode(mind.getData()) },
    location.origin,
  );
}
```

```css
/* Mind Elixir does not show a topic's text-decoration on its caption; this rule does */
.map-container me-tpc > .text {
  text-decoration: inherit;
}
```

TinyMCE stores the `data:` image as a project asset, as any pasted image. The editor's Navigator
shows the same SVG, made with `padding: 0`, as an overview of the map.

```html
<div class="exe-mind-map">
  <figure class="exe-figure exe-image position-center">
    <img src="asset://…" width="…" height="…" alt="Title" />
    <figcaption class="figcaption">
      <span class="title"><em>Title</em></span>
    </figcaption>
  </figure>
  <p class="exe-mindmap-code">{"nodeData": …}</p>
</div>
```

An `<img>` works in every export (HTML5, SCORM, EPUB, LMS, offline, print) with no script, no
CSP change and no sanitizer stripping it, and its `alt` names it. The SVG needs only the JSON, so
a server or CLI export can also render a map that was never saved this way (Bun, no browser):

```ts
const { svg } = await renderSvg(JSON.parse(decodeHtmlEntities(storedCode)), { title });
```

Legacy mindmaps JSON goes through eXeLearning's converter (`storedMindmap.ts`) first; this
package reads Mind Elixir data only.
