# Using it in eXeLearning

[eXeLearning](https://github.com/exelearning/exelearning) edits mind maps with Mind Elixir in its
TinyMCE plugin `exemindmap` ([#2557](https://github.com/exelearning/exelearning/pull/2557)). When
the author saves, the editor (`editor/src/editor.ts`) renders the map with this package and the
plugin inserts it as an image, next to the map's JSON, which keeps it editable:

```ts
import { DEFAULT_FONT_FAMILY, renderSvg, toDataUrl } from "@erseco/mind-elixir-export-svg";

// The editor uses the font the SVG is laid out for, so both look the same
mind.container.style.fontFamily = DEFAULT_FONT_FAMILY;

async function save() {
  const { svg, width, height } = await renderSvg(mind, { title: mind.nodeData.topic });
  dialog.setData({
    mindmapImgToSave: toDataUrl(svg), // TinyMCE stores it as an asset, as any pasted image
    mindmapImgSize: `${Math.round(width)}x${Math.round(height)}`,
    mindmapCode: serializeStoredCode(mind.getData()),
  });
}
```

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
